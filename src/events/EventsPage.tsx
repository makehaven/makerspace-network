import { useEffect, useState } from 'react';
import { SHOW_MAKERS_DIRECTORY } from '../features';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../network/firebase';
import { href } from '../App';
import { resolveRegion } from '../data';
import type { EventDoc } from './model';

type ListedEvent = EventDoc & { id: string };
async function loadEvents(): Promise<ListedEvent[]> {
  // Never list private drafts or closed setup tests, even for signed-in staff.
  const result = await getDocs(query(collection(db, 'events'), where('status', 'in', ['announced', 'open'])));
  return result.docs.map((d) => ({ ...d.data() as EventDoc, id: d.id }));
}

export default function EventsPage({ load = loadEvents }: { load?: () => Promise<ListedEvent[]> }) {
  const region = resolveRegion();
  const [events, setEvents] = useState<ListedEvent[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    document.title = 'Events — Makerspace Network';
    setFailed(false); setEvents(null);
    load().then((rows) => { if (active) setEvents(rows); }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [attempt, load]);
  const shown = events?.filter((e) => (!region || e.region_id === region.id)
    && (!e.ends_at || new Date(e.ends_at).getTime() >= Date.now()))
    .sort((a, b) => (a.starts_at ?? '9999').localeCompare(b.starts_at ?? '9999') || a.title.localeCompare(b.title));
  return <>
    <section className="hero"><div className="wrap narrow">
      <p className="eyebrow">{region ? `${region.name} · Events` : 'Events'}</p>
      <h1>Meet, make and learn together</h1>
      <p className="lede">Gatherings for makers and the people who run makerspaces. You don't need to belong to a space to explore.</p>
    </div></section>
    <div className="wrap narrow" style={{ paddingTop: 28, paddingBottom: 50 }}>
      {!events && !failed && <p role="status">Loading events…</p>}
      {failed && <div className="notice" role="alert"><h2>We couldn't load events</h2>
        <p>Check your connection and try again.</p><button className="btn" onClick={() => setAttempt((n) => n + 1)}>Retry</button></div>}
      {shown?.length === 0 && <div className="notice info">
        <h2>No upcoming events announced{region ? ' here' : ''} yet</h2>
        <p>Check back for new gatherings. In the meantime, find a nearby space or meet other makers.</p>
        <div className="btn-row"><a className="btn" href={href('directory')}>Find a space</a>{SHOW_MAKERS_DIRECTORY && <a className="btn ghost" href={href('makers')}>Meet makers</a>}</div>
      </div>}
      <div className="cards">{shown?.map((event) => <article className="card form-card" key={event.id}>
        <p className="eyebrow">{event.date_label}</p><h2>{event.title}</h2>
        <p>{event.tagline}</p><p className="muted">{event.location}</p>
        <p>{event.status === 'open' ? 'Registration open' : 'Registration not open yet'}</p>
        <a className="btn" href={href('event', { event: event.id })}>Explore {event.title}</a>
      </article>)}</div>
      <p style={{ marginTop: 24 }}>Already registered? <a href={href('home')}>Find your tickets in My network</a>.</p>
    </div>
  </>;
}
