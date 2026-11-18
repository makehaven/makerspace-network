// Asked once, on My network, of someone with no makerspace on file. The answer
// is theirs to give: a ZIP only suggests nearby spaces, it never assigns one.

import { useState } from 'react';
import { doc, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useSession } from '../session';
import { PageLink } from './shared';
import { href } from '../../App';
import SpacePicker from '../../events/SpacePicker';
import Logo from '../../components/Logo';
import { openFeedback } from '../../components/FeedbackButton';
import { spacesNear } from '../../near';
import { institutionalAccess } from '../../data';
import { blankMaker, type MakerDoc } from '../../makers/model';

const DISMISSED = 'mn-connect-space-dismissed';
const dismissed = () => { try { return localStorage.getItem(DISMISSED) === '1'; } catch { return false; } };

/** Saves the chosen space on the person's maker profile, creating a hidden one if needed. */
export default function ConnectSpace({ maker, onSaved }: { maker: MakerDoc | null; onSaved: (m: MakerDoc) => void }) {
  const s = useSession();
  const save = async (space: string) => {
    const uid = s.user!.uid;
    const iso = new Date().toISOString();
    if (maker) {
      await updateDoc(doc(db, 'makers', uid), { home_space_id: space, updated_at: iso });
      onSaved({ ...maker, home_space_id: space, updated_at: iso });
    } else {
      // A profile nobody else can see yet, holding only the space. The person
      // fills in the rest, and chooses who sees it, when they want to.
      const name = s.person?.name || s.user?.displayName || (s.user?.email ?? '').split('@')[0] || 'Maker';
      const m: MakerDoc = { ...blankMaker(name, iso), home_space_id: space, visibility: 'hidden' };
      await setDoc(doc(db, 'makers', uid), m);
      onSaved(m);
    }
  };
  return <ConnectSpaceView save={save} />;
}

export function ConnectSpaceView({ save }: { save: (spaceId: string) => Promise<void> }) {
  const [hidden, setHidden] = useState(dismissed);
  const [mode, setMode] = useState<'' | 'member' | 'near'>('');
  const [space, setSpace] = useState<string | null>(null);
  const [other, setOther] = useState('');
  const [zip, setZip] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (hidden) return null;
  const near = /^\d{5}$/.test(zip) ? spacesNear(zip) : undefined;

  const saveMember = async () => {
    if (!space) { setError(other ? null : 'Choose your makerspace.'); if (other) openFeedback(`Please add my makerspace to the directory: ${other}`); return; }
    setBusy(true); setError(null);
    try { await save(space); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  return (
    <section className="card form-card home-card connect-space">
      <h2>Are you connected to a makerspace?</h2>
      {mode === '' && <div className="btn-row">
        <button className="btn" onClick={() => setMode('member')}>I'm a member</button>
        <PageLink className="btn ghost" page="join">I work at or help run one</PageLink>
        <button className="btn ghost" onClick={() => setMode('near')}>Not yet: show me spaces near me</button>
      </div>}

      {mode === 'member' && <>
        <SpacePicker label="Your makerspace" value={space} other={other} onChange={(id, o) => { setSpace(id); setOther(o); setError(null); }} />
        {other && !space && <p className="muted">We'll ask to add it to the directory. Once it's listed you can choose it here.</p>}
        {error && <p className="error">{error}</p>}
        <div className="btn-row">
          <button className="btn" disabled={busy} onClick={() => void saveMember()}>{other && !space ? 'Ask to add it' : 'Save'}</button>
          <button className="linkish" onClick={() => setMode('')}>Back</button>
        </div>
        <p className="muted">This goes on your maker profile, which stays private until you choose who can see it.</p>
      </>}

      {mode === 'near' && <>
        <label className="field" style={{ maxWidth: 220 }}><span>Your ZIP code</span>
          <input inputMode="numeric" autoComplete="postal-code" maxLength={5} value={zip} onChange={(e) => setZip(e.target.value.replace(/\D/g, ''))} /></label>
        {near === null && <p className="muted">We can only suggest spaces in Connecticut so far. <a href={href('directory')}>Browse the directory</a>.</p>}
        {near && <ul className="near-list">
          {near.map(({ space: sp, miles }) => (
            <li key={sp.id}><a href={href('space', { space: sp.id })}>
              <Logo space={sp} />
              <span><strong>{sp.name}</strong>
                <small>{sp.address?.locality ?? sp.address?.county} · about {Math.max(1, Math.round(miles))} mi{institutionalAccess(sp) ? ' · campus, students and staff' : ''}</small></span>
            </a></li>
          ))}
        </ul>}
        <div className="btn-row"><button className="linkish" onClick={() => setMode('')}>Back</button></div>
      </>}

      {mode === '' && <p style={{ marginTop: 8 }}><button className="linkish" onClick={() => { try { localStorage.setItem(DISMISSED, '1'); } catch { /* private window */ } setHidden(true); }}>Not now</button></p>}
    </section>
  );
}
