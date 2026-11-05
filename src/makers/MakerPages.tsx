// Who is making what: the public directory of makers and one maker's page. Reads
// only what the rules allow this visitor, so a signed-out person sees public
// profiles, and a signed-in maker also sees those shared with the community.

import { useEffect, useMemo, useState } from 'react';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { auth, db } from '../network/firebase';
import { SPACES } from '../data';
import { href } from '../App';
import { profileScore } from '../../functions/src/makerLogic';
import { DISCIPLINES, LOOKING_FOR, OPEN_TO, wordFor, type MakerDoc, type WorkDoc } from './model';

const EDIT_URL = 'https://makerspace.network/?page=maker-edit';
const editLink = () => (window.location.hostname.endsWith('.makerspace.network') || window.location.hostname === 'makerspace.network' ? EDIT_URL : href('maker-edit'));

export default function MakerPages({ id }: { id?: string }) {
  return id ? <MakerProfile id={id} /> : <MakerDirectory />;
}

function MakerDirectory() {
  const [makers, setMakers] = useState<(MakerDoc & { id: string })[] | null>(null);
  const [discipline, setDiscipline] = useState('');
  const [openTo, setOpenTo] = useState('');
  const [text, setText] = useState('');

  useEffect(() => {
    document.title = 'Makers — Makerspace Network';
    (async () => {
      await auth.authStateReady();
      const pub = await getDocs(query(collection(db, 'makers'), where('visibility', '==', 'public'), where('review', '==', 'approved')));
      // Shared-with-the-community profiles only for someone who has a profile themselves; the rules refuse anyone else.
      const comm = await getDocs(query(collection(db, 'makers'), where('visibility', '==', 'community'), where('review', '==', 'approved'))).catch(() => null);
      setMakers([...pub.docs, ...(comm?.docs ?? [])].map((d) => ({ id: d.id, ...(d.data() as MakerDoc) })));
    })().catch(() => setMakers([]));
  }, []);

  const shown = useMemo(() => (makers ?? [])
    .filter((m) => !discipline || m.disciplines.includes(discipline))
    .filter((m) => !openTo || m.open_to.includes(openTo))
    .filter((m) => !text || `${m.display_name} ${m.headline} ${m.bio} ${m.town}`.toLowerCase().includes(text.toLowerCase()))
    // The fuller the profile, the higher it sits. That is the only reward for filling one in, and it is enough.
    .sort((a, b) => profileScore(b) - profileScore(a) || a.display_name.localeCompare(b.display_name)), [makers, discipline, openTo, text]);

  return (
    <>
      <section className="hero">
        <div className="wrap narrow">
          <p className="eyebrow">Makers</p>
          <h1>People making things</h1>
          <p className="lede">Artists, builders, tinkerers and founders, in a makerspace or in their own garage. Find someone to collaborate with, learn from or hire.</p>
          <div className="btn-row" style={{ marginTop: 14 }}><a className="btn" href={editLink()}>Add yourself</a></div>
        </div>
      </section>
      <div className="wrap" style={{ paddingTop: 24, paddingBottom: 50 }}>
        <div className="maker-filters">
          <label className="field"><span>Works in</span>
            <select value={discipline} onChange={(e) => setDiscipline(e.target.value)}>
              <option value="">Anything</option>{DISCIPLINES.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
            </select></label>
          <label className="field"><span>Open to</span>
            <select value={openTo} onChange={(e) => setOpenTo(e.target.value)}>
              <option value="">Anything</option>{OPEN_TO.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
            </select></label>
          <label className="field"><span>Search</span><input value={text} onChange={(e) => setText(e.target.value)} placeholder="Name, town, what they make" /></label>
        </div>
        {makers === null && <p style={{ marginTop: 20 }}>Loading…</p>}
        {makers !== null && !makers.length && <p className="notice info" style={{ marginTop: 20 }}>Nobody here yet. <a href={editLink()}>Be the first</a>.</p>}
        {makers !== null && makers.length > 0 && !shown.length && <p style={{ marginTop: 20 }}>Nobody matches that. Try fewer filters.</p>}
        <div className="maker-grid">
          {shown.map((m) => (
            <a key={m.id} className="card maker-card" href={href('maker', { maker: m.id })}>
              {m.cover_url ? <img src={m.cover_url} alt={`Work by ${m.display_name}`} loading="lazy" /> : <div className="no-work" />}
              <div className="body">
                <h3>{m.display_name}</h3>
                {m.headline && <p className="muted" style={{ margin: '3px 0 0' }}>{m.headline}</p>}
                {m.town && <p className="muted" style={{ margin: '3px 0 0', fontSize: '0.88rem' }}>{m.town}{m.state ? `, ${m.state}` : ''}</p>}
              </div>
            </a>
          ))}
        </div>
      </div>
    </>
  );
}

function MakerProfile({ id }: { id: string }) {
  const [maker, setMaker] = useState<MakerDoc | null | undefined>(undefined);
  const [work, setWork] = useState<(WorkDoc & { id: string })[]>([]);

  useEffect(() => {
    (async () => {
      await auth.authStateReady();
      const m = await getDoc(doc(db, 'makers', id));
      const data = m.data() as MakerDoc | undefined;
      setMaker(data ?? null);
      if (data) document.title = `${data.display_name} — Makers`;
      // Sorted here rather than in the query, which would need a composite index.
      const w = await getDocs(query(collection(db, 'makers', id, 'work'), where('status', '==', 'approved')));
      setWork(w.docs.map((d) => ({ id: d.id, ...(d.data() as WorkDoc) })).sort((a, b) => a.created_at.localeCompare(b.created_at)));
    })().catch(() => setMaker((x) => x ?? null));
  }, [id]);

  if (maker === undefined) return <div className="wrap" style={{ paddingTop: 40 }}><p>Loading…</p></div>;
  if (maker === null) {
    return (
      <div className="wrap narrow" style={{ paddingTop: 40 }}>
        <p>This profile isn't available. It may be shared only with other makers, in which case <a href={editLink()}>sign in and make your own</a> to see it.</p>
        <p><a href={href('makers')}>All makers</a></p>
      </div>
    );
  }

  const space = maker.home_space_id ? SPACES.find((s) => s.id === maker.home_space_id) : null;
  const attended = maker.events.filter((e) => e.attended);
  return (
    <>
      <section className="hero">
        <div className="wrap narrow">
          <p className="eyebrow"><a href={href('makers')}>Makers</a></p>
          <h1>{maker.display_name}</h1>
          {maker.headline && <p className="lede">{maker.headline}</p>}
          <p className="muted" style={{ marginTop: 10 }}>
            {[maker.town && `${maker.town}${maker.state ? `, ${maker.state}` : ''}`].filter(Boolean)}
            {space && <>{maker.town ? ' · ' : ''}Makes at <a href={href('space', { space: space.id })}>{space.name}</a></>}
          </p>
          <div className="tags" style={{ marginTop: 10 }}>
            {attended.map((e) => <span key={e.id} className="pill ok">Attended {e.title}</span>)}
          </div>
        </div>
      </section>
      <div className="wrap narrow event-body">
        {maker.bio && <section className="prose">{maker.bio.split('\n').filter(Boolean).map((p) => <p key={p}>{p}</p>)}</section>}
        {work.length > 0 && (
          <section className="maker-gallery">
            {work.map((w) => <figure key={w.id}><img src={w.url} alt={w.caption || `Work by ${maker.display_name}`} loading="lazy" />{w.caption && <figcaption>{w.caption}</figcaption>}</figure>)}
          </section>
        )}
        <section className="prose">
          {maker.disciplines.length > 0 && <><h3>Works in</h3><p>{maker.disciplines.map((d) => wordFor(DISCIPLINES, d)).join(' · ')}</p></>}
          {maker.open_to.length > 0 && <><h3>Open to</h3><p>{maker.open_to.map((d) => wordFor(OPEN_TO, d)).join(' · ')}</p></>}
          {maker.looking_for.length > 0 && <><h3>Looking for</h3><p>{maker.looking_for.map((d) => wordFor(LOOKING_FOR, d)).join(' · ')}</p></>}
          {(maker.website || maker.instagram || maker.contact_email) && <>
            <h3>Find them</h3>
            <ul>
              {/* nofollow: a link here should not be worth spamming for. */}
              {maker.website && <li><a href={maker.website} rel="noopener nofollow ugc">{maker.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}</a></li>}
              {maker.instagram && <li><a href={`https://instagram.com/${maker.instagram}`} rel="noopener nofollow ugc">@{maker.instagram}</a></li>}
              {maker.contact_email && <li><a href={`mailto:${maker.contact_email}`}>{maker.contact_email}</a></li>}
            </ul>
          </>}
        </section>
        <p className="muted"><a href={`mailto:info@makehaven.org?subject=${encodeURIComponent(`Report a maker profile: ${id}`)}`}>Report this profile</a></p>
      </div>
    </>
  );
}
