// Where signing in lands. It starts with what needs this person and shows only
// what applies to them, so someone with no makerspace is not asked to join one
// first. Every source fails quietly: a section the rules refuse simply isn't there.

import { useEffect, useState } from 'react';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useSession } from '../session';
import { listMembershipsVisibleTo, listSpaceIndex, myInvitations, type WithId } from '../db';
import { STAFF_ROLES, type Membership } from '../model';
import { getSpaceMetrics, listListingSubmissions, reportingYear } from '../spaceData';
import { spaceById } from '../../data';
import { PageLink, SignIn, stewardRegionIds } from './shared';
import { MembershipCard } from './Join';
import { api, type EventDoc, type EventStats } from '../../events/model';
import type { MakerDoc } from '../../makers/model';
import { profileScore, profileSteps } from '../../../functions/src/makerLogic';

interface Task { key: string; text: string; page: string; params?: Record<string, string> }
interface MyTicket { id: string; event_id: string; status: string; tier_name: string }
type EventRow = WithId<EventDoc> & { stats: EventStats | null };

const TICKET_WORDS: Record<string, string> = {
  confirmed: "You're in", pending_payment: 'Payment not finished', waitlisted: "You're on the waitlist",
  offered: 'A place is waiting for you', cancelled: 'Cancelled', expired: 'Lapsed', refunded: 'Refunded',
};

/** Only a path on this site, so a crafted link cannot send someone elsewhere after sign-in. */
const safeNext = (raw: string | null) => (raw && /^\/(?![/\\])/.test(raw) ? raw : null);
const quiet = async <T,>(p: Promise<T>, fallback: T): Promise<T> => { try { return await p; } catch { return fallback; } };

export default function Home() {
  const s = useSession();
  const next = safeNext(new URLSearchParams(window.location.search).get('next'));
  const uid = s.user?.uid;
  const email = s.user?.email?.toLowerCase() ?? null;
  const verifiedEmail = s.user?.emailVerified ? email : null;
  const steward = !!s.stewardship && (s.stewardship.network_admin || s.stewardship.region_ids.length > 0);

  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [maker, setMaker] = useState<MakerDoc | null>(null);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [tickets, setTickets] = useState<MyTicket[]>([]);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (s.status === 'signed_in' && next) window.location.replace(next); }, [s.status, next]);

  useEffect(() => {
    if (s.status !== 'signed_in' || !uid || next) return;
    (async () => {
      const staffAt = s.memberships.filter((m) => m.status === 'active' && STAFF_ROLES.includes(m.role));
      const adminAt = s.memberships.filter((m) => m.status === 'active' && m.role === 'space_admin').map((m) => m.space_id);
      const regionIds = stewardRegionIds(s.stewardship);

      const [index, makerSnap, invites, myRegs] = await Promise.all([
        quiet(listSpaceIndex(), []),
        quiet(getDoc(doc(db, 'makers', uid)), null),
        email ? quiet(myInvitations(email), []) : [],
        verifiedEmail ? quiet(getDocs(query(collection(db, 'event_registrations'), where('email_lower', '==', verifiedEmail))), null) : null,
      ]);
      const nameOf = new Map(index.map((x) => [x.id, x.name]));
      setNames(nameOf);
      const me = makerSnap?.exists() ? (makerSnap.data() as MakerDoc) : null;
      setMaker(me);
      const mine = (myRegs?.docs ?? []).map((d) => ({
        id: d.id, event_id: d.get('event_id') as string, status: d.get('status') as string, tier_name: d.get('tier_name') as string,
      }));
      setTickets(mine);

      // Events: anything announced or open, plus drafts in a region this person stewards.
      const queries = [
        quiet(getDocs(query(collection(db, 'events'), where('status', 'in', ['announced', 'open']))), null),
        ...regionIds.map((r) => quiet(getDocs(query(collection(db, 'events'), where('region_id', '==', r))), null)),
      ];
      const byId = new Map<string, EventDoc>();
      for (const snap of await Promise.all(queries)) for (const d of snap?.docs ?? []) byId.set(d.id, d.data() as EventDoc);
      setEvents(await Promise.all([...byId].map(async ([id, ev]) => {
        const st = await quiet(getDoc(doc(db, 'event_stats', id)), null);
        return { id, ...ev, stats: st?.exists() ? (st.data() as EventStats) : null };
      })));

      const list: Task[] = [];
      for (const i of invites) list.push({ key: `inv-${i.id}`, text: `${i.invited_by_name} invited you to join ${i.space_name}`, page: 'join', params: { invite: i.id } });
      for (const t of mine) {
        if (t.status === 'offered') list.push({ key: `offer-${t.id}`, text: 'A place opened up at an event you were waiting for', page: 'home' });
      }

      // Annual data each staffed space hasn't started for the last full year.
      const year = reportingYear();
      const unanswered = await Promise.all(staffAt.filter((m) => spaceById(m.space_id)).map(async (m) => {
        const got = await quiet(getSpaceMetrics(m.space_id, year), {} as object | null);
        return got ? null : m;
      }));
      for (const m of unanswered) {
        if (m) list.push({ key: `annual-${m.space_id}`, text: `Answer ${year} annual data for ${spaceById(m.space_id)?.name}`, page: 'space-data', params: { space: m.space_id, tab: 'annual' } });
      }

      // People waiting for someone with standing to confirm them.
      if (steward || adminAt.length) {
        const all = await quiet(listMembershipsVisibleTo({ uid, networkAdmin: !!s.stewardship?.network_admin, regionIds: s.stewardship?.region_ids ?? [], adminSpaceIds: adminAt }), [] as WithId<Membership>[]);
        const waiting = all.filter((m) => m.status === 'pending').length;
        if (waiting) list.push({ key: 'pending', text: `${waiting} ${waiting === 1 ? 'person is' : 'people are'} waiting for confirmation`, page: 'steward', params: { tab: 'people' } });
      }

      if (steward) {
        const [makers, listings] = await Promise.all([quiet(getDocs(collection(db, 'makers')), null), quiet(listListingSubmissions(), [])]);
        const profiles = (makers?.docs ?? []).filter((d) => d.get('review') === 'pending').length;
        const photos = (makers?.docs ?? []).reduce((n, d) => n + ((d.get('work_pending') as number | undefined) ?? 0), 0);
        if (profiles) list.push({ key: 'profiles', text: `${profiles} new maker ${profiles === 1 ? 'profile' : 'profiles'} to look over`, page: 'steward', params: { tab: 'makers' } });
        if (photos) list.push({ key: 'photos', text: `${photos} ${photos === 1 ? 'photo' : 'photos'} to review`, page: 'steward', params: { tab: 'makers' } });
        const subs = listings.filter((l) => l.status === 'submitted').length;
        if (subs) list.push({ key: 'listings', text: `${subs} listing ${subs === 1 ? 'submission' : 'submissions'} to merge`, page: 'steward', params: { tab: 'listings' } });
        for (const r of regionIds) {
          const sp = await quiet(getDocs(query(collection(db, 'event_sponsors'), where('region_id', '==', r), where('status', 'in', ['inquiry', 'needs_review']))), null);
          const n = sp?.size ?? 0;
          if (n) list.push({ key: `sponsors-${r}`, text: `${n} sponsor ${n === 1 ? 'inquiry' : 'inquiries'} to follow up`, page: 'event-admin', params: { event: sp!.docs[0].get('event_id') as string, tab: 'sponsors' } });
        }
      }
      setTasks(list);
    })().catch((e) => { setError(e instanceof Error ? e.message : String(e)); setTasks([]); });
    // Memberships and stewardship arrive with status, so status is the only trigger needed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.status, uid]);

  const openTicket = async (eventId: string) => {
    setError(null);
    try {
      const token = await s.user!.getIdToken();
      const out = await api<{ manage_url: string }>('mine', { event_id: eventId }, token);
      window.location.assign(out.manage_url);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };

  const first = (s.person?.name ?? s.user?.displayName ?? '').split(' ')[0];
  const spaceName = (m: Membership) => spaceById(m.space_id)?.name ?? names.get(m.space_id)
    ?? m.space_id.replace(/^(proposed|partner)-/, '').replace(/-/g, ' ');
  const nextStep = maker ? profileSteps(maker).find((x) => !x.done && x.key !== 'event') : null;

  if (s.status === 'signed_in' && next) return <div className="wrap" style={{ paddingTop: 40 }}><p>Taking you back…</p></div>;

  return (
    <div className="wrap narrow" style={{ paddingTop: 30, paddingBottom: 50 }}>
      {s.status === 'loading' && <p>Loading…</p>}
      {s.status === 'signed_out' && <>
        <h1 style={{ fontSize: '1.9rem' }}>Sign in</h1>
        <p className="muted">For makers and the people who run makerspaces: your tickets, your profile and your space, in one place.</p>
        <SignIn />
      </>}

      {s.status === 'signed_in' && <>
        <h1 style={{ fontSize: '1.9rem' }}>{first ? `Hi, ${first}` : 'Welcome'}</h1>
        {error && <p className="error">{error}</p>}

        {tasks && tasks.length > 0 && (
          <section className="notice info home-tasks">
            <h4>Needs you</h4>
            <ul>{tasks.map((t) => <li key={t.key}><PageLink page={t.page} params={t.params}>{t.text}</PageLink></li>)}</ul>
          </section>
        )}

        {events.map((ev) => {
          const t = tickets.find((x) => x.event_id === ev.id);
          return (
            <section key={ev.id} className="card form-card home-card">
              <h2>{ev.title}</h2>
              <p className="muted" style={{ margin: 0 }}>{ev.date_label}</p>
              {t && <p style={{ margin: '8px 0 0' }}><strong>{TICKET_WORDS[t.status] ?? t.status}</strong> · {t.tier_name}</p>}
              {steward && <p className="muted" style={{ margin: '8px 0 0' }}>{ev.status === 'draft' ? 'Draft, only stewards can see it' : `${ev.stats?.registered ?? 0} of ${ev.capacity} registered`}</p>}
              <div className="btn-row" style={{ marginTop: 10 }}>
                {t && <button className="btn" onClick={() => void openTicket(ev.id)}>Your ticket and who's coming</button>}
                {!t && <PageLink className="btn" page="event" params={{ event: ev.id }}>{ev.status === 'open' ? 'Get a ticket' : 'See the event'}</PageLink>}
                {steward && <PageLink className="btn ghost" page="event-admin" params={{ event: ev.id }}>Manage</PageLink>}
              </div>
            </section>
          );
        })}

        <section className="card form-card home-card">
          <h2>Your maker profile</h2>
          {maker ? <>
            <p className="muted" style={{ margin: 0 }}>{profileScore(maker)}% complete{nextStep ? `. Next: ${nextStep.prompt.toLowerCase()}.` : '.'}</p>
            <div className="meter"><span style={{ width: `${profileScore(maker)}%` }} /></div>
            <div className="btn-row">
              <PageLink className="btn ghost" page="maker-edit">Edit</PageLink>
              <PageLink className="btn ghost" page="maker" params={{ maker: uid! }}>See my page</PageLink>
            </div>
          </> : <>
            <p style={{ margin: 0 }}>Show what you make, with or without a makerspace, so people can find you to collaborate, learn or hire.</p>
            <div className="btn-row" style={{ marginTop: 10 }}><PageLink className="btn" page="maker-edit">Make your profile</PageLink></div>
          </>}
        </section>

        {s.memberships.map((m) => <MembershipCard key={m.id} m={m} spaceName={spaceName(m)} compact />)}

        <p className="muted home-foot">
          {s.user?.email}
          {' · '}<PageLink page="join">{s.memberships.length ? 'Your account, or connect another space' : 'Connect to a makerspace or organisation'}</PageLink>
          {steward && <> · <PageLink page="steward">Steward tools</PageLink></>}
          {' · '}<button type="button" className="linkish" onClick={() => void s.signOut()}>Sign out</button>
        </p>
      </>}
    </div>
  );
}
