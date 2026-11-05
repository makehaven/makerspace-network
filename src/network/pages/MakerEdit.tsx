// A maker's own profile, and the moderator's queue. Anyone signed in with a
// verified address may have a profile. Nothing here touches the roster.

import { useEffect, useRef, useState } from 'react';
import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, orderBy, query, setDoc, updateDoc } from 'firebase/firestore';
import { db, firebaseApp } from '../firebase';
import { useSession } from '../session';
import { SPACES } from '../../data';
import { PageLink, SignIn } from './shared';
import { US_STATES } from '../model';
import { DISCIPLINES, LOOKING_FOR, OPEN_TO, blankMaker, type MakerDoc, type Visibility, type WorkDoc } from '../../makers/model';
import { profileScore, profileSteps, safeWebUrl } from '../../../functions/src/makerLogic';

// Loaded only when someone touches a photo. These pages share a bundle with the
// steward and join pages, and a Storage problem must not be able to take those down.
let storageReady: Promise<{ mod: typeof import('firebase/storage'); storage: import('firebase/storage').FirebaseStorage }> | null = null;
const photos = () => {
  storageReady ??= import('firebase/storage').then((mod) => {
    const storage = mod.getStorage(firebaseApp);
    if (import.meta.env.VITE_USE_EMULATORS === '1') mod.connectStorageEmulator(storage, '127.0.0.1', 9399);
    return { mod, storage };
  });
  return storageReady;
};

const MAX_PHOTOS = 8;
const iso = () => new Date().toISOString();

/** Re-encoding drops everything but the pixels, including the location a phone
 *  writes into a photo, which matters for work photographed at home. */
async function prepareImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not read that image.'))), 'image/jpeg', 0.85));
}

function Toggles({ legend, hint, options, value, onChange }: { legend: string; hint?: string; options: { id: string; label: string }[]; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <fieldset className="event-fieldset">
      <legend>{legend}</legend>
      {hint && <p className="muted" style={{ margin: '0 0 6px' }}>{hint}</p>}
      <div className="checks">
        {options.map((o) => (
          <label key={o.id} className="check"><input type="checkbox" checked={value.includes(o.id)}
            onChange={(e) => onChange(e.target.checked ? [...value, o.id] : value.filter((x) => x !== o.id))} /><span>{o.label}</span></label>
        ))}
      </div>
    </fieldset>
  );
}

const VISIBILITY: { id: Visibility; label: string; hint: string }[] = [
  { id: 'public', label: 'Anyone', hint: 'Shown on the public Makers page and findable by search engines.' },
  { id: 'community', label: 'Other makers and people at events you attend', hint: 'People with a profile here, and fellow attendees of events you register for, if you list yourself for that event.' },
  { id: 'hidden', label: 'Only me', hint: 'A draft, or a break. Nobody else sees it.' },
];

export default function MakerEdit() {
  const s = useSession();
  const uid = s.user?.uid;
  const [m, setM] = useState<MakerDoc | null>(null);
  const [exists, setExists] = useState(false);
  const [work, setWork] = useState<(WorkDoc & { id: string })[]>([]);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [site, setSite] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const loadWork = async (u: string) => {
    const w = await getDocs(query(collection(db, 'makers', u, 'work'), orderBy('created_at')));
    setWork(w.docs.map((d) => ({ id: d.id, ...(d.data() as WorkDoc) })));
  };

  useEffect(() => {
    if (!uid) return;
    (async () => {
      const d = await getDoc(doc(db, 'makers', uid));
      if (d.exists()) {
        const data = d.data() as MakerDoc;
        setM(data); setExists(true); setSite(data.website ?? '');
        await loadWork(uid);
      } else {
        setM(blankMaker(s.person?.name ?? s.user?.displayName ?? '', iso()));
      }
    })().catch((e) => setError(String(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  const set = (patch: Partial<MakerDoc>) => { setM((x) => (x ? { ...x, ...patch } : x)); setSaved(false); };

  const save = async (): Promise<boolean> => {
    if (!m || !uid) return false;
    setBusy(true); setError(null);
    try {
      const website = site.trim() ? safeWebUrl(site) : null;
      if (site.trim() && !website) throw new Error("That website address doesn't look right.");
      const instagram = m.instagram?.trim().replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//, '').replace(/\/$/, '') || null;
      const next = { ...m, website, instagram, contact_email: m.contact_email?.trim() || null, updated_at: iso() };
      if (exists) {
        const { review: _r, events: _e, cover_url: _c, work_count: _w, work_pending: _p, created_at: _a, ...mine } = next;
        await updateDoc(doc(db, 'makers', uid), mine);
      } else {
        await setDoc(doc(db, 'makers', uid), next);
        setExists(true);
      }
      setM(next); setSaved(true); setBusy(false);
      return true;
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); setBusy(false); return false; }
  };

  const addPhoto = async (file: File) => {
    if (!uid) return;
    setBusy(true); setError(null);
    try {
      if (!exists && !(await save())) return;
      setBusy(true);
      const blob = await prepareImage(file);
      const path = `makers/${uid}/${crypto.randomUUID().replace(/-/g, '')}.jpg`;
      const { mod, storage } = await photos();
      const r = mod.ref(storage, path);
      await mod.uploadBytes(r, blob, { contentType: 'image/jpeg' });
      const url = await mod.getDownloadURL(r);
      await addDoc(collection(db, 'makers', uid, 'work'), { url, path, caption: '', status: 'pending', created_at: iso() });
      await loadWork(uid);
    } catch (e) { setError(`That photo didn't upload. ${e instanceof Error ? e.message : ''}`); }
    setBusy(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  const removePhoto = async (w: WorkDoc & { id: string }) => {
    if (!uid) return;
    const { mod, storage } = await photos();
    await mod.deleteObject(mod.ref(storage, w.path)).catch(() => undefined);
    await deleteDoc(doc(db, 'makers', uid, 'work', w.id));
    await loadWork(uid);
  };

  const needsVerify = s.status === 'signed_in' && s.user && !s.user.emailVerified;
  const approved = work.filter((w) => w.status === 'approved').length;
  const facts = m ? { ...m, work_count: Math.max(m.work_count, approved) || work.length } : null;
  const steps = facts ? profileSteps(facts).filter((x) => !x.done && x.key !== 'event') : [];

  return (
    <div className="wrap narrow" style={{ paddingTop: 30, paddingBottom: 50 }}>
      <p className="eyebrow"><PageLink page="makers">Makers</PageLink></p>
      <h1 style={{ fontSize: '1.9rem' }}>Your maker profile</h1>
      <p className="muted">You're a maker if you say you are. Show what you make so people can find you, to collaborate, to learn from you or to hire you.</p>

      {s.status === 'loading' && <p>Loading…</p>}
      {s.status === 'signed_out' && <SignIn why="No password. Use whichever email you registered for an event with, and your attendance will show on your profile." />}
      {needsVerify && <p className="notice">Your email address needs verifying before you can make a profile. Sign out and use the emailed link.</p>}

      {s.status === 'signed_in' && m && !needsVerify && (
        <>
          {exists && m.review === 'pending' && <p className="notice info">Thanks. A person takes a quick look at new profiles before others can see them. Anyone with an event ticket skips this.</p>}
          {m.review === 'hidden' && <p className="notice">A moderator has hidden this profile. Reply to any email from us, or write to info@makehaven.org, to talk about it.</p>}
          {facts && (
            <div className="card form-card">
              <h2>How complete it is: {profileScore(facts)}%</h2>
              <div className="meter"><span style={{ width: `${profileScore(facts)}%` }} /></div>
              <p className="muted" style={{ margin: 0 }}>Fuller profiles sit higher on the Makers page and earn more trust.</p>
              {steps.length > 0 && <ul style={{ margin: '8px 0 0' }}>{steps.slice(0, 3).map((x) => <li key={x.key}>{x.prompt}</li>)}</ul>}
            </div>
          )}

          <div className="card form-card event-form" style={{ marginTop: 16 }}>
            <h2>Your work</h2>
            <p className="muted">Up to {MAX_PHOTOS} photos of things you've made. A person looks at each photo before anyone else sees it. Location data is removed from them.</p>
            <div className="maker-gallery">
              {work.map((w) => (
                <figure key={w.id}>
                  <img src={w.url} alt={w.caption || 'Your work'} />
                  {w.status === 'pending' && <span className="pill flag">Waiting for a look</span>}
                  <input aria-label="Caption" placeholder="What is it?" maxLength={200} defaultValue={w.caption} style={{ width: '100%', marginTop: 4 }}
                         onBlur={(e) => { if (uid && e.target.value !== w.caption) void updateDoc(doc(db, 'makers', uid, 'work', w.id), { caption: e.target.value }); }} />
                  <button className="linkish" onClick={() => void removePhoto(w)}>Remove</button>
                </figure>
              ))}
            </div>
            {work.length < MAX_PHOTOS && (
              <input ref={fileRef} type="file" accept="image/*" disabled={busy} aria-label="Add a photo of your work"
                     onChange={(e) => { const f = e.target.files?.[0]; if (f) void addPhoto(f); }} />
            )}
          </div>

          <form className="card form-card event-form" style={{ marginTop: 16 }} onSubmit={(e) => { e.preventDefault(); void save(); }}>
            <h2>About you</h2>
            <label className="field"><span>Name</span><input required maxLength={120} value={m.display_name} onChange={(e) => set({ display_name: e.target.value })} /></label>
            <label className="field"><span>In a line <em>e.g. "Furniture maker and CNC tinkerer"</em></span><input maxLength={140} value={m.headline} onChange={(e) => set({ headline: e.target.value })} /></label>
            <label className="field"><span>Introduce yourself <em>what do you enjoy, and what do you bring?</em></span><textarea rows={5} maxLength={2000} value={m.bio} onChange={(e) => set({ bio: e.target.value })} /></label>
            <div className="two">
              <label className="field"><span>Town</span><input maxLength={80} value={m.town} onChange={(e) => set({ town: e.target.value })} /></label>
              <label className="field"><span>State</span>
                <select value={m.state} onChange={(e) => set({ state: e.target.value })}>
                  <option value="">—</option>{US_STATES.map(([c, n]) => <option key={c} value={c}>{n}</option>)}
                </select></label>
            </div>
            <label className="field"><span>Home makerspace <em>if you have one; you don't need one</em></span>
              <select value={m.home_space_id ?? ''} onChange={(e) => set({ home_space_id: e.target.value || null })}>
                <option value="">None</option>{[...SPACES].sort((a, b) => a.name.localeCompare(b.name)).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select></label>
            <Toggles legend="What do you work in?" options={DISCIPLINES} value={m.disciplines} onChange={(v) => set({ disciplines: v })} />
            <Toggles legend="What are you open to?" hint="Spaces look here when they need instructors." options={OPEN_TO} value={m.open_to} onChange={(v) => set({ open_to: v })} />
            <Toggles legend="What are you looking for?" options={LOOKING_FOR} value={m.looking_for} onChange={(v) => set({ looking_for: v })} />
            <div className="two">
              <label className="field"><span>Website</span><input maxLength={300} value={site} onChange={(e) => { setSite(e.target.value); setSaved(false); }} /></label>
              <label className="field"><span>Instagram</span><input maxLength={60} placeholder="username" value={m.instagram ?? ''} onChange={(e) => set({ instagram: e.target.value })} /></label>
            </div>
            <label className="field"><span>Contact email <em>optional, and visible to whoever can see this profile</em></span><input type="email" maxLength={200} value={m.contact_email ?? ''} onChange={(e) => set({ contact_email: e.target.value })} /></label>
            <fieldset className="event-fieldset">
              <legend>Who can see this?</legend>
              <div className="radios">
                {VISIBILITY.map((v) => (
                  <label key={v.id} className={`radio ${m.visibility === v.id ? 'on' : ''}`}>
                    <input type="radio" name="visibility" checked={m.visibility === v.id} onChange={() => set({ visibility: v.id })} />
                    <span><strong>{v.label}</strong><br /><span className="muted">{v.hint}</span></span>
                  </label>
                ))}
              </div>
            </fieldset>
            {error && <p className="error">{error}</p>}
            <div className="btn-row">
              <button className="btn" disabled={busy || saved}>{saved ? 'Saved' : exists ? 'Save' : 'Create my profile'}</button>
              {exists && uid && <PageLink className="btn ghost" page="maker" params={{ maker: uid }}>See my page</PageLink>}
            </div>
          </form>

          {exists && uid && (
            <p style={{ marginTop: 16 }}><button className="linkish" onClick={async () => {
              if (!window.confirm('Delete your profile and all your photos? This cannot be undone.')) return;
              for (const w of work) await removePhoto(w);
              await deleteDoc(doc(db, 'makers', uid));
              setExists(false); setWork([]); setM(blankMaker(m.display_name, iso())); setSite('');
            }}>Delete my profile</button></p>
          )}
        </>
      )}
    </div>
  );
}

// ---------- the moderator's queue, on the Steward page ----------

type Row = MakerDoc & { id: string; pendingWork: (WorkDoc & { id: string })[] };

export function MakersReviewTab() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = async () => {
    try {
      const all = await getDocs(collection(db, 'makers'));
      const out = await Promise.all(all.docs.map(async (d) => {
        const data = d.data() as MakerDoc;
        const w = await getDocs(collection(db, 'makers', d.id, 'work'));
        return { id: d.id, ...data, pendingWork: w.docs.map((x) => ({ id: x.id, ...(x.data() as WorkDoc) })).filter((x) => x.status === 'pending') };
      }));
      setRows(out.sort((a, b) => a.display_name.localeCompare(b.display_name)));
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };
  useEffect(() => { void load(); }, []);
  const setReview = async (id: string, review: MakerDoc['review']) => { await updateDoc(doc(db, 'makers', id), { review, updated_at: iso() }); await load(); };
  const setPhoto = async (makerId: string, workId: string, status: WorkDoc['status']) => { await updateDoc(doc(db, 'makers', makerId, 'work', workId), { status }); await load(); };

  if (error) return <p className="error">{error}</p>;
  if (!rows) return <p>Loading…</p>;
  const waiting = rows.filter((r) => r.review === 'pending' || r.pendingWork.length > 0);
  const others = rows.filter((r) => !waiting.includes(r));
  return (
    <>
      <h2 style={{ marginTop: 10 }}>Waiting for a look ({waiting.length})</h2>
      {!waiting.length && <p className="muted">Nothing waiting. New photos and profiles from people without a ticket land here, and you get an email.</p>}
      {waiting.map((r) => (
        <div key={r.id} className="card form-card" style={{ marginTop: 12 }}>
          <h3>{r.display_name}{r.headline && <span className="muted"> · {r.headline}</span>}</h3>
          {r.review === 'pending' && <>
            {r.bio && <p>{r.bio}</p>}
            {r.website && <p className="muted">{r.website}</p>}
            <div className="btn-row">
              <button className="btn small" onClick={() => void setReview(r.id, 'approved')}>Approve profile</button>
              <button className="btn ghost small" onClick={() => void setReview(r.id, 'hidden')}>Hide</button>
            </div>
          </>}
          {r.pendingWork.length > 0 && (
            <div className="maker-gallery">
              {r.pendingWork.map((w) => (
                <figure key={w.id}>
                  <img src={w.url} alt={w.caption || 'Waiting for review'} />
                  {w.caption && <figcaption>{w.caption}</figcaption>}
                  <div className="btn-row" style={{ marginTop: 6 }}>
                    <button className="btn small" onClick={() => void setPhoto(r.id, w.id, 'approved')}>Approve</button>
                    <button className="btn ghost small" onClick={() => void setPhoto(r.id, w.id, 'rejected')}>Reject</button>
                  </div>
                </figure>
              ))}
            </div>
          )}
        </div>
      ))}
      <h2 style={{ marginTop: 22 }}>All makers ({others.length})</h2>
      <div className="scroll-x">
        <table className="data">
          <thead><tr><th>Name</th><th>Town</th><th>Open to</th><th>Shown to</th><th>Status</th></tr></thead>
          <tbody>
            {others.map((r) => (
              <tr key={r.id}>
                <td><PageLink page="maker" params={{ maker: r.id }}>{r.display_name}</PageLink></td>
                <td>{r.town}</td>
                <td>{r.open_to.map((x) => OPEN_TO.find((o) => o.id === x)?.label ?? x).join('; ')}</td>
                <td>{r.visibility}</td>
                <td>{r.review}{r.review !== 'hidden'
                  ? <> <button className="linkish" onClick={() => void setReview(r.id, 'hidden')}>Hide</button></>
                  : <> <button className="linkish" onClick={() => void setReview(r.id, 'approved')}>Restore</button></>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
