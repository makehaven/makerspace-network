import { useEffect, useState } from 'react';
import { SHOW_MAKERS_DIRECTORY } from '../features';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../network/firebase';
import { href } from '../App';
import { resolveRegion } from '../data';
import type { EventDoc } from './model';
import { openFeedback } from '../components/FeedbackButton';
import { loadCommunityEvents, topicLabel, TOPICS, type CommunityItem } from './community';

type ListedEvent = EventDoc & { id: string };
async function loadEvents(): Promise<ListedEvent[]> {
  // Never list private drafts or closed setup tests, even for signed-in staff.
  const result = await getDocs(query(collection(db, 'events'), where('status', 'in', ['announced', 'open'])));
  return result.docs.map((d) => ({ ...d.data() as EventDoc, id: d.id }));
}

export default function EventsPage({ load = loadEvents, loadCommunity = loadCommunityEvents }: { load?: () => Promise<ListedEvent[]>; loadCommunity?: () => Promise<CommunityItem[]> }) {
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
      <h1>Events</h1>
      <p className="lede">Network gatherings, and classes and open events at makerspaces around the state. Most are open to anyone.</p>
    </div></section>
    <div className="wrap narrow" style={{ paddingTop: 28, paddingBottom: 50 }}>
      {!events && !failed && <p role="status">Loading events…</p>}
      {failed && <div className="notice" role="alert"><h2>We couldn't load events</h2>
        <p>Check your connection and try again.</p><button className="btn" onClick={() => setAttempt((n) => n + 1)}>Retry</button></div>}
      {shown?.length === 0 && <p className="muted">No network gatherings announced{region ? ' here' : ''} right now.{SHOW_MAKERS_DIRECTORY && <> <a href={href('makers')}>Meet makers</a> in the meantime.</>}</p>}
      <div className="cards">{shown?.map((event) => <article className="card form-card" key={event.id}>
        <p className="eyebrow">{event.date_label}</p><h2>{event.title}</h2>
        <p>{event.tagline}</p><p className="muted">{event.location}</p>
        <p>{event.status === 'open' ? 'Registration open' : 'Registration not open yet'}</p>
        <a className="btn" href={href('event', { event: event.id })}>Explore {event.title}</a>
      </article>)}</div>
      {shown && shown.length > 0 && <p style={{ marginTop: 16 }}>Already registered? <a href={href('home')}>Find your tickets in My network</a>.</p>}
      {(!region || region.id === 'us-ct') && <CommunityEvents load={loadCommunity} />}
    </div>
  </>;
}

const DAY = 86_400_000;
const when = (iso: string, timeKnown: boolean) => {
  const d = new Date(iso);
  const day = d.toLocaleDateString('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric' });
  return timeKnown ? `${day} · ${d.toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' })}` : day;
};

/** Classes and events at Connecticut makerspaces and craft studios, by topic. */
function CommunityEvents({ load }: { load: () => Promise<CommunityItem[]> }) {
  const [items, setItems] = useState<CommunityItem[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [topic, setTopic] = useState('');
  const [all, setAll] = useState(false);
  useEffect(() => { load().then(setItems).catch(() => setFailed(true)); }, [load]);
  if (failed) return null; // Network events above still stand on their own.
  const now = Date.now();
  const upcoming = (items ?? []).filter((i) => new Date(i.start).getTime() >= now - 3 * 3_600_000).sort((a, b) => a.start.localeCompare(b.start));
  const counts = TOPICS.map(([id, label]) => [id, label, upcoming.filter((i) => i.categories.includes(id)).length] as const).filter(([, , n]) => n > 0);
  const inTopic = upcoming.filter((i) => !topic || i.categories.includes(topic));
  const soon = all ? inTopic : inTopic.filter((i) => new Date(i.start).getTime() < now + 45 * DAY);
  const hidden = inTopic.length - soon.length;
  return (
    <section className="community-events">
      <h2>At makerspaces and craft studios</h2>
      <p className="muted">Classes, workshops and open events, from each place's own calendar. Sign up on their site.</p>
      {!items && <p role="status">Loading classes and events…</p>}
      {items && <>
        <div className="tags topic-filter" role="group" aria-label="Filter by topic">
          <button type="button" className={`tag${topic === '' ? ' on' : ''}`} aria-pressed={topic === ''} onClick={() => setTopic('')}>All ({upcoming.length})</button>
          {counts.map(([id, label, n]) => (
            <button type="button" key={id} className={`tag${topic === id ? ' on' : ''}`} aria-pressed={topic === id} onClick={() => setTopic(id)}>{label} ({n})</button>
          ))}
        </div>
        <ul className="community-list">
          {soon.map((i) => (
            <li key={i.id}>
              <span className="when">{when(i.start, i.timeKnown)}</span>
              <span className="what">
                <a href={i.link} rel="noopener">{i.title}</a>
                <small>{i.orgName}
                  {i.audience === 'youth' && ' · for kids'}
                  {i.moreDates.length > 0 && ` · +${i.moreDates.length} more ${i.moreDates.length === 1 ? 'date' : 'dates'}`}
                  {i.registrationClosed && ' · registration closed'}
                  {!topic && i.categories[0] && ` · ${topicLabel(i.categories[0])}`}</small>
              </span>
            </li>
          ))}
        </ul>
        {soon.length === 0 && <p className="muted">Nothing in this topic in the next few weeks.</p>}
        {hidden > 0 && <button type="button" className="btn ghost" onClick={() => setAll(true)}>Show {hidden} later {hidden === 1 ? 'event' : 'events'}</button>}
        <p className="muted small-print">Run a makerspace with a public events calendar? <button type="button" className="linkish" onClick={() => openFeedback('Please list our public events calendar: ')}>Send us its link</button> and we'll add it.</p>
      </>}
    </section>
  );
}
