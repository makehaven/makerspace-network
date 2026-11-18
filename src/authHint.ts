// Who is signed in, as a hint the header can read without loading Firebase.
//
// The public pages never load the Firebase SDK (src/network/firebase.ts), so the
// header cannot ask Firebase. Instead the apex writes a small first-party cookie
// whenever its sign-in state changes, scoped to makerspace.network so regional
// hosts such as connecticut.makerspace.network can read it too. It only labels
// the header; Firebase and the rules remain the authority for everything else.

import { useEffect, useState } from 'react';

const COOKIE = 'mn_who';
const PHOTO = 'mn_pic';
/** Only a Google account photo: the one image host the site's CSP allows for this. */
const PHOTO_OK = /^https:\/\/lh3\.googleusercontent\.com\/[A-Za-z0-9_\-/=.]+$/;
const EVENT = 'mn-auth';
const APEX = 'makerspace.network';

const host = () => window.location.hostname.toLowerCase();
const onNetworkDomain = () => host() === APEX || host().endsWith(`.${APEX}`);

/** Only the apex writes: sign-in lives there (App.tsx), and a regional host,
 *  where the same person is always signed out, must not erase the hint. */
export function writeAuthHint(label: string | null, photo?: string | null) {
  if (onNetworkDomain() && host() !== APEX) return;
  try {
    const attrs = `; Path=/; SameSite=Lax${window.location.protocol === 'https:' ? '; Secure' : ''}${onNetworkDomain() ? `; Domain=${APEX}` : ''}`;
    const keep = `; Max-Age=${60 * 60 * 24 * 30}${attrs}`;
    document.cookie = label ? `${COOKIE}=${encodeURIComponent(label.slice(0, 80))}${keep}` : `${COOKIE}=; Max-Age=0${attrs}`;
    document.cookie = label && photo && PHOTO_OK.test(photo) ? `${PHOTO}=${encodeURIComponent(photo)}${keep}` : `${PHOTO}=; Max-Age=0${attrs}`;
  } catch { /* cookies blocked: the header just offers Sign in */ }
  window.dispatchEvent(new Event(EVENT));
}

export function readAuthHint(): string | null {
  try {
    const m = document.cookie.match(/(?:^|;\s*)mn_who=([^;]*)/);
    return m && m[1] ? decodeURIComponent(m[1]) : null;
  } catch {
    return null;
  }
}

/** The signed-in person's Google photo, if they signed in with Google. */
export function readPhotoHint(): string | null {
  try {
    const m = document.cookie.match(/(?:^|;\s*)mn_pic=([^;]*)/);
    const url = m && m[1] ? decodeURIComponent(m[1]) : null;
    return url && PHOTO_OK.test(url) ? url : null;
  } catch {
    return null;
  }
}

/** The signed-in label and photo, kept current across tabs and hosts. */
export function useAuthHint(): string | null { return useHint().who; }
export function useHint(): { who: string | null; photo: string | null } {
  const read = () => ({ who: readAuthHint(), photo: readPhotoHint() });
  const [hint, setHint] = useState(read);
  useEffect(() => {
    const update = () => setHint(read());
    const onVisible = () => { if (document.visibilityState === 'visible') update(); };
    window.addEventListener(EVENT, update);
    window.addEventListener('focus', update);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener(EVENT, update);
      window.removeEventListener('focus', update);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
  return hint;
}
