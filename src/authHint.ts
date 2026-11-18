// Who is signed in, as a hint the header can read without loading Firebase.
//
// The public pages never load the Firebase SDK (src/network/firebase.ts), so the
// header cannot ask Firebase. Instead the apex writes a small first-party cookie
// whenever its sign-in state changes, scoped to makerspace.network so regional
// hosts such as connecticut.makerspace.network can read it too. It only labels
// the header; Firebase and the rules remain the authority for everything else.

import { useEffect, useState } from 'react';

const COOKIE = 'mn_who';
const EVENT = 'mn-auth';
const APEX = 'makerspace.network';

const host = () => window.location.hostname.toLowerCase();
const onNetworkDomain = () => host() === APEX || host().endsWith(`.${APEX}`);

/** Only the apex writes: sign-in lives there (App.tsx), and a regional host,
 *  where the same person is always signed out, must not erase the hint. */
export function writeAuthHint(label: string | null) {
  if (onNetworkDomain() && host() !== APEX) return;
  try {
    const attrs = `; Path=/; SameSite=Lax${window.location.protocol === 'https:' ? '; Secure' : ''}${onNetworkDomain() ? `; Domain=${APEX}` : ''}`;
    document.cookie = label
      ? `${COOKIE}=${encodeURIComponent(label.slice(0, 80))}; Max-Age=${60 * 60 * 24 * 30}${attrs}`
      : `${COOKIE}=; Max-Age=0${attrs}`;
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

/** The signed-in label, kept current across tabs and hosts. */
export function useAuthHint(): string | null {
  const [who, setWho] = useState<string | null>(readAuthHint);
  useEffect(() => {
    const update = () => setWho(readAuthHint());
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
  return who;
}
