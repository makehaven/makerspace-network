// The public face of an event: what it is, tickets, sponsors, and the page an
// attendee returns to from their email. No account is needed for any of this.
// Sign-in is asked for only afterwards, and only if someone wants to join the
// network; a maker should not need a login to buy a ticket.

import { useEffect, useState } from 'react';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { auth, db } from '../network/firebase';
import { SPACES } from '../data';
import SpacePicker from './SpacePicker';
import { Connections, FoodAndAccess, Introduction } from './Introduction';
import { meetingIcs } from '../../functions/src/ics';
import { href } from '../App';
import {
  type EventPartner, EMPTY_ANSWERS, NO_CONSENTS, api, money,
  type Answers, type ConsentKey, type Consents, type EventDoc, type EventStats, type MyRegistration,
} from './model';

const q = () => new URLSearchParams(window.location.search);
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const go = (url: string) => { window.location.assign(url); };

function useEvent(id: string) {
  const [event, setEvent] = useState<EventDoc | null | undefined>(undefined);
  const [stats, setStats] = useState<EventStats | null>(null);
  const [partners, setPartners] = useState<EventPartner[]>([]);
  useEffect(() => {
    let live = true;
    (async () => {
      // A signed-in steward may preview a draft, so wait for the session to restore first.
      await auth.authStateReady();
      const [e, s] = await Promise.all([
        getDoc(doc(db, 'events', id)).catch(() => null),
        getDoc(doc(db, 'event_stats', id)).catch(() => null),
      ]);
      if (!live) return;
      setEvent(e?.exists() ? (e.data() as EventDoc) : null);
      setStats(s?.exists() ? (s.data() as EventStats) : null);
      const p = await getDocs(query(collection(db, 'event_partners'), where('event_id', '==', id))).catch(() => null);
      if (live) setPartners((p?.docs ?? []).map((d) => d.data() as EventPartner).sort((a, b) => a.space_name.localeCompare(b.space_name)));
    })();
    return () => { live = false; };
  }, [id]);
  return { event, stats, partners };
}

export default function EventPage({ id }: { id: string }) {
  const { event, stats, partners } = useEvent(id);
  const params = q();
  const regId = params.get('r');
  const token = params.get('t');
  const view = params.get('view');

  useEffect(() => { if (event) document.title = `${event.title} — Makerspace Network`; }, [event]);

  if (event === undefined) return <div className="wrap" style={{ paddingTop: 40 }}><p>Loading…</p></div>;
  if (event === null) {
    return (
      <div className="wrap" style={{ paddingTop: 40 }}>
        <p>No event at this address.</p>
        {/* A draft looks like this to anyone not signed in as its steward, and sign-in is per host. */}
        <p className="muted">Organising this event? <a href={`https://makerspace.network/?page=home&next=${encodeURIComponent(window.location.pathname + window.location.search)}`}>Sign in on makerspace.network</a> and we'll bring you back.</p>
      </div>
    );
  }

  if (regId && token) return <Manage id={id} event={event} regId={regId} token={token} />;
  return (
    <>
      <Hero event={event} stats={stats} />
      <div className="wrap narrow event-body">
        {event.status === 'draft' && <p className="notice"><strong>Draft preview.</strong> Only stewards can see this page. The forms below show what people will see, but they will not submit until the event is announced or open.</p>}
        {event.status === 'cancelled' && <p className="notice">This event has been cancelled.</p>}
        {view === 'sponsor' ? <SponsorSection id={id} event={event} stats={stats} /> : <>
          <About event={event} stats={stats} />
          {(event.status === 'open' || event.status === 'draft') && <Register id={id} event={event} stats={stats} />}
          {event.status === 'announced' && <Interest id={id} />}
          {event.status === 'closed' && <p className="notice">Registration is closed.</p>}
          <Sponsors id={id} event={event} partners={partners} />
        </>}
      </div>
    </>
  );
}

function EventBrand({ region }: { region: string | null }) {
  return region === 'us-ct' ? <a className="event-brand" href={href('directory', { region: 'us-ct' })}>
    <img src="/brand/connecticut-makerspace-network.png" alt="" width="88" height="88" />
    <span>Connecticut<br /><strong>Makerspace Network</strong></span>
  </a> : null;
}

function Hero({ event, stats }: { event: EventDoc; stats: EventStats | null }) {
  const low = stats && event.status === 'open' && stats.spots_left > 0 && stats.spots_left <= Math.max(10, event.capacity * 0.15);
  return (
    <section className="hero">
      <div className="wrap narrow">
        <EventBrand region={event.region_id} />
        <p className="eyebrow">{event.date_label}</p>
        <h1>{event.title}</h1>
        <p className="lede">{event.tagline}</p>
        <p className="muted" style={{ marginTop: 12 }}>
          {event.location}
          {event.hosts.some((h) => h.role === 'lead') && <> · Led by {event.hosts.filter((h) => h.role === 'lead').map((h) => h.name).join(' and ')}</>}
        </p>
        <div className="btn-row" style={{ marginTop: 16 }}>
          {(event.status === 'open' || event.status === 'draft') && <a className="btn" href="#register">Get a ticket</a>}
          {event.status === 'announced' && <a className="btn" href="#interest">Tell me when tickets open</a>}
          {low && <span className="pill flag">{stats!.spots_left} places left</span>}
        </div>
      </div>
    </section>
  );
}

function About({ event, stats }: { event: EventDoc; stats: EventStats | null }) {
  return (
    <section className="prose">
      {event.description.map((p) => <p key={p}>{p}</p>)}
      {event.tracks.length > 0 && <>
        <h2>Three threads through the day</h2>
        <ul>{event.tracks.map((t) => <li key={t.id}>{t.label}</li>)}</ul>
      </>}
      {event.includes.length > 0 && <>
        <h2>Your ticket includes</h2>
        <ul>{event.includes.map((t) => <li key={t}>{t}</li>)}</ul>
      </>}
      {!!stats?.spaces.length && <>
        <h2>Coming from</h2>
        <p>{stats.spaces.join(' · ')}</p>
      </>}
    </section>
  );
}

// ---------- the form's answers, shared with the attendee's own page ----------

function Check({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return <label className="check"><input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} /><span>{children}</span></label>;
}

/** Each box off until ticked, each about one specific thing. This is the
 *  promise the brief makes about follow-up and peer networking, and it is also
 *  how the network grows: every line below is someone choosing to be connected. */
function OptIns({ a, c, set }: { a: Answers; c: Consents; set: (k: ConsentKey, v: boolean) => void }) {
  const space = a.home_space_id ? SPACES.find((s) => s.id === a.home_space_id)?.name : null;
  return (
    <fieldset className="event-fieldset">
      <legend>Staying in touch: your call on each</legend>
      <div className="checks single">
        <Check checked={c.attendee_list} onChange={(v) => { set('attendee_list', v); if (!v) set('peer_contact', false); }}>
          Show my name, space, maker introduction, event interests and session offer to other people coming to this event
        </Check>
        {c.attendee_list && (
          <Check checked={c.peer_contact} onChange={(v) => set('peer_contact', v)}>…and my email address, so they can reach me afterwards</Check>
        )}
        {space && <Check checked={c.space_share} onChange={(v) => set('space_share', v)}>Tell {space} I'm coming, and share my name and email with its staff</Check>}
        {a.looking_for_space && <Check checked={c.space_intro} onChange={(v) => set('space_intro', v)}>Introduce me to makerspaces near me</Check>}
        <Check checked={c.network} onChange={(v) => set('network', v)}>Keep me connected: invite me to make a maker profile and meet makers beyond this event</Check>
        <Check checked={c.followup} onChange={(v) => set('followup', v)}>Email me about future maker events from the organisers</Check>
      </div>
      <p className="muted" style={{ marginTop: 8 }}>
        You'll get logistics about this event either way. Sponsors never receive attendee contact details.
        You can change any of these later from the link in your email.
      </p>
    </fieldset>
  );
}

// ---------- registering ----------

export function Register({ id, event, stats }: { id: string; event: EventDoc; stats: EventStats | null }) {
  const params = q();
  const ref = params.get('ref');
  const initialCode = params.get('code') ?? '';
  const soldOut = new Set(stats?.tiers_sold_out ?? []);
  const tiers = event.tiers.filter((t) => !t.requires_code);
  const [tierId, setTierId] = useState(tiers.find((t) => !soldOut.has(t.id))?.id ?? '');
  const [showCode, setShowCode] = useState(!!initialCode);
  const [code, setCode] = useState(initialCode);
  const [attested, setAttested] = useState(false);
  // A signed-in visitor shouldn't have to retype what their account already knows.
  const [name, setName] = useState(auth.currentUser?.displayName ?? '');
  const [email, setEmail] = useState(auth.currentUser?.email ?? '');
  const [answers, setAnswers] = useState<Answers>(EMPTY_ANSWERS);
  const [terms, setTerms] = useState(false);
  const [ageOk, setAgeOk] = useState(false);
  const [trap, setTrap] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState({ name: '', email: '' });
  const [done, setDone] = useState<'already' | 'waitlisted' | null>(null);

  const tier = event.tiers.find((t) => t.id === tierId);
  const full = stats?.spots_left === 0;

  if (done === 'already') {
    return <section id="register" className="card form-card"><h2>Check your email</h2><p>If that address already has a place, we've just sent its link there, where you can see or change the registration.</p></section>;
  }
  if (done === 'waitlisted') {
    return <section id="register" className="card form-card"><h2>You're on the waitlist</h2><p>The event is full right now. You have not been charged. If a place opens we'll email you a link to take it.</p></section>;
  }

  return (
    <section id="register" className="card form-card event-form">
      <h2>{full ? 'Join the waitlist' : 'Get a ticket'}</h2>
      <p className="muted">A few details to reserve your place. You can introduce yourself to the network after registration.</p>
      {full && <p className="muted">The event is full. You won't be charged unless a place opens and you take it.</p>}
      <form onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true); setError(null);
        try {
          const out = await api<{ outcome: string; checkout_url?: string; manage_url?: string }>('register', {
            event_id: id, tier_id: tierId, code: showCode ? code : '', attested, name, email, answers, consents: NO_CONSENTS, ref,
            terms, age_ok: ageOk, website: trap,
          });
          if (out.outcome === 'checkout' && out.checkout_url) { go(out.checkout_url); return; }
          if (out.outcome === 'already') setDone('already');
          else if (out.manage_url) go(out.manage_url);
          else setDone('waitlisted');
        } catch (err) { setError(errText(err)); }
        setBusy(false);
      }}>
        <div className="radios">
          {tiers.map((t) => {
            const out = soldOut.has(t.id);
            return (
              <label key={t.id} className={`ticket-choice${tierId === t.id ? ' on' : ''}${out ? ' out' : ''}`}>
                <input type="radio" name="tier" disabled={out} checked={tierId === t.id} onChange={() => setTierId(t.id)} />
                <span>
                  <strong>{t.name}</strong> · {t.price_cents ? money(t.price_cents) : 'Free'}{out && <span className="muted"> · all taken</span>}
                  {t.description && <span className="muted ticket-desc">{t.description}</span>}
                </span>
              </label>
            );
          })}
        </div>
        {tier?.attestation && !showCode && <Check checked={attested} onChange={setAttested}>{tier.attestation}</Check>}
        {showCode
          ? <label className="field"><span>Invitation or discount code</span><input maxLength={40} value={code} onChange={(e) => setCode(e.target.value)} /></label>
          : <p><button type="button" className="linkish" onClick={() => setShowCode(true)}>I have a code</button></p>}

        <div>
          <label className="field"><span>Full name</span><input required maxLength={120} autoComplete="name" placeholder="First and last name" value={name} aria-invalid={!!fieldErrors.name} aria-describedby="registration-name-error" onInvalid={(e) => { const message = e.currentTarget.validationMessage; setFieldErrors((x) => ({ ...x, name: message })); }} onChange={(e) => { setName(e.target.value); setFieldErrors((x) => ({ ...x, name: '' })); }} /><small id="registration-name-error" className="error">{fieldErrors.name}</small></label>
          <label className="field"><span>Email address</span><input required type="email" maxLength={200} autoComplete="email" placeholder="you@example.com" value={email} aria-invalid={!!fieldErrors.email} aria-describedby="registration-email-error" onInvalid={(e) => { const message = e.currentTarget.validationMessage; setFieldErrors((x) => ({ ...x, email: message })); }} onChange={(e) => { setEmail(e.target.value); setFieldErrors((x) => ({ ...x, email: '' })); }} /><small id="registration-email-error" className="error">{fieldErrors.email}</small></label>
        </div>
        <label className="sr-only" aria-hidden="true">Leave this empty<input tabIndex={-1} autoComplete="off" value={trap} onChange={(e) => setTrap(e.target.value)} /></label>

        <FoodAndAccess event={event} answers={answers} set={(p) => setAnswers((x) => ({ ...x, ...p }))} />

        <details className="fold"><summary>Event terms</summary><p className="event-terms">{event.terms}</p></details>
        {!!event.min_age && <Check checked={ageOk} onChange={setAgeOk}>I'm {event.min_age} or older</Check>}
        <Check checked={terms} onChange={setTerms}>I agree to the event terms</Check>

        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn" disabled={busy || !terms || (!!event.min_age && !ageOk) || (!tierId && !showCode) || (!!tier?.attestation && !showCode && !attested)}>
          {busy ? 'One moment…' : full ? 'Join the waitlist' : !showCode && tier?.price_cents ? `Continue to payment · ${money(tier.price_cents)}` : 'Register'}
        </button>
        {!full && !!tier?.price_cents && <p className="muted" style={{ marginTop: 8 }}>Card payment is handled by Stripe. {event.hosts.find((h) => h.role === 'fiduciary')?.name ?? 'The host'} receives the payment and it appears under that name on your statement.</p>}
      </form>
    </section>
  );
}

function Interest({ id }: { id: string }) {
  const params = q();
  const [name, setName] = useState(auth.currentUser?.displayName ?? '');
  const [email, setEmail] = useState(auth.currentUser?.email ?? '');
  const [space, setSpace] = useState<string | null>(null);
  const [other, setOther] = useState('');
  const [trap, setTrap] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (done) return <section id="interest" className="card form-card"><h2>Thanks</h2><p>We'll email you once when tickets open, and not otherwise.</p></section>;
  return (
    <section id="interest" className="card form-card event-form">
      <h2>Tell me when tickets open</h2>
      <p className="muted">One email, when registration opens. Nothing else unless you ask for it.</p>
      <form onSubmit={async (e) => {
        e.preventDefault(); setError(null);
        try { await api('interest', { event_id: id, name, email, home_space_id: space, home_space_other: space ? '' : other, ref: params.get('ref'), website: trap }); setDone(true); }
        catch (err) { setError(errText(err)); }
      }}>
        <div className="two">
          <label className="field"><span>Your name</span><input required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} /></label>
          <label className="field"><span>Email</span><input required type="email" maxLength={200} value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        </div>
        <SpacePicker value={space} other={other} onChange={(s, o) => { setSpace(s); setOther(o); }} />
        <label className="sr-only" aria-hidden="true">Leave this empty<input tabIndex={-1} autoComplete="off" value={trap} onChange={(e) => setTrap(e.target.value)} /></label>
        {error && <p className="error">{error}</p>}
        <button className="btn">Tell me</button>
      </form>
    </section>
  );
}

// ---------- sponsors ----------

function Sponsors({ id, event, partners }: { id: string; event: EventDoc; partners: EventPartner[] }) {
  const show = event.status !== 'cancelled';
  return (
    <section className="event-sponsors">
      {partners.length > 0 && <>
        <h2>Partner makerspaces</h2>
        <p>{partners.map((p, i) => <span key={p.space_id}>{i > 0 && ' · '}<a href={href('space', { space: p.space_id })}>{p.space_name}</a></span>)}</p>
      </>}
      <p className="muted"><a href="https://makerspace.network/?page=home">Run a makerspace? Sign in to become a partner and promote this to your members.</a></p>
      {event.sponsors.length > 0 && <>
        <h2>Sponsors</h2>
        <ul className="sponsor-list">
          {event.sponsors.map((s) => (
            <li key={s.name} className="sponsor-item">
              {s.url ? <a href={s.url} rel="noopener">{s.logo ? <img src={s.logo} alt={s.name} /> : s.name}</a>
                     : s.logo ? <img src={s.logo} alt={s.name} /> : s.name}
              {s.note && <span className="muted"> {s.note}</span>}
            </li>
          ))}
        </ul>
      </>}
      {show && event.sponsor_tiers.length > 0 && (
        <p><a href={href('event', { event: id, view: 'sponsor' })}>Sponsor {event.title}</a></p>
      )}
    </section>
  );
}

function SponsorSection({ id, event, stats }: { id: string; event: EventDoc; stats: EventStats | null }) {
  const thanks = q().get('thanks') === '1';
  const full = new Set(stats?.sponsor_tiers_full ?? []);
  const [tierId, setTierId] = useState(q().get('level') ?? '');
  const [org, setOrg] = useState('');
  const [orgUrl, setOrgUrl] = useState('');
  const [name, setName] = useState(auth.currentUser?.displayName ?? '');
  const [email, setEmail] = useState(auth.currentUser?.email ?? '');
  const [note, setNote] = useState('');
  const [trap, setTrap] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const tier = event.sponsor_tiers.find((t) => t.id === tierId);

  const submit = async (pay: 'card' | 'invoice') => {
    setBusy(true); setError(null);
    try {
      const out = await api<{ outcome: string; checkout_url?: string }>('sponsor', {
        event_id: id, tier_id: tierId || null, org_name: org, org_url: orgUrl, name, email, note, pay, website: trap,
      });
      if (out.checkout_url) { go(out.checkout_url); return; }
      setSent(true);
    } catch (err) { setError(errText(err)); }
    setBusy(false);
  };

  if (thanks || sent) {
    return (
      <section className="card form-card">
        <h2>Thank you</h2>
        <p>{thanks ? 'Your payment went through, and a receipt is on its way from Stripe.' : "We have your note and we'll be in touch shortly."} We'll email you about your logo and how you'd like to be listed. Nothing goes on the page until you've seen it.</p>
        <p><a href={href('event', { event: id })}>Back to {event.title}</a></p>
      </section>
    );
  }

  return (
    <>
      <section className="prose">
        <h2>Sponsor {event.title}</h2>
        <p>{event.sponsor_pitch}</p>
      </section>
      <div className="sponsor-tiers">
        {event.sponsor_tiers.map((t) => {
          const out = full.has(t.id);
          return (
            <label key={t.id} className={`card sponsor-tier${tierId === t.id ? ' on' : ''}${out ? ' out' : ''}`}>
              <input type="radio" name="sponsor-tier" disabled={out} checked={tierId === t.id} onChange={() => setTierId(t.id)} />
              <h3>{t.name}</h3>
              <p className="sponsor-amount">{money(t.amount_cents)}{out && <span className="muted"> · taken</span>}</p>
              <ul>{t.benefits.map((b) => <li key={b}>{b}</li>)}</ul>
            </label>
          );
        })}
      </div>
      <section className="card form-card event-form">
        <form onSubmit={(e) => { e.preventDefault(); void submit('invoice'); }}>
          <div className="two">
            <label className="field"><span>Organisation</span><input required maxLength={160} value={org} onChange={(e) => setOrg(e.target.value)} /></label>
            <label className="field"><span>Website</span><input maxLength={300} value={orgUrl} onChange={(e) => setOrgUrl(e.target.value)} /></label>
            <label className="field"><span>Your name</span><input required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} /></label>
            <label className="field"><span>Email</span><input required type="email" maxLength={200} value={email} onChange={(e) => setEmail(e.target.value)} /></label>
          </div>
          <label className="field"><span>Anything we should know? In-kind support, a different amount, questions</span>
            <textarea rows={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} /></label>
          <label className="sr-only" aria-hidden="true">Leave this empty<input tabIndex={-1} autoComplete="off" value={trap} onChange={(e) => setTrap(e.target.value)} /></label>
          {error && <p className="error">{error}</p>}
          <div className="btn-row">
            <button className="btn" type="button" disabled={busy || !tier || !org || !name || !email} onClick={() => void submit('card')}>
              {tier ? `Pay ${money(tier.amount_cents)} by card` : 'Choose a level to pay by card'}
            </button>
            <button className="btn ghost" disabled={busy}>{tier ? 'Send me an invoice instead' : 'Talk to us first'}</button>
          </div>
        </form>
      </section>
      <p><a href={href('event', { event: id })}>Back to {event.title}</a></p>
    </>
  );
}

// ---------- the attendee's own page, from their emailed link ----------

const STATUS_WORDS: Record<string, string> = {
  confirmed: "You're in.", pending_payment: 'Your place is not confirmed until payment goes through.',
  waitlisted: "You're on the waitlist. You haven't been charged, and we'll email you if a place opens.",
  offered: 'A place has opened up for you.', cancelled: 'This registration is cancelled.',
  expired: 'This registration lapsed before payment finished.', refunded: 'This ticket has been refunded.',
};

export function Manage({ id, event, regId, token }: { id: string; event: EventDoc; regId: string; token: string }) {
  const [me, setMe] = useState<MyRegistration | null>(null);
  const [answers, setAnswers] = useState<Answers>(EMPTY_ANSWERS);
  const [consents, setConsents] = useState<Consents>(NO_CONSENTS);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [sharedOnly, setSharedOnly] = useState(false);
  const [busy, setBusy] = useState(false);
  const [people, setPeople] = useState<{ name: string; space: string | null; makes: string; offer_session: string; tracks: string[]; email: string | null; profile: { id: string; headline: string; bio: string; cover_url: string | null; website: string | null } | null }[] | null>(null);
  const [transferring, setTransferring] = useState(false);
  const [toName, setToName] = useState('');
  const [toEmail, setToEmail] = useState('');
  const [transferred, setTransferred] = useState(false);
  const justPaid = q().get('paid') === '1';

  const call = (action: string, extra: object = {}) => api<MyRegistration & { checkout_url?: string }>('manage', { r: regId, t: token, action, ...extra });
  const take = (r: MyRegistration) => { setMe(r); setAnswers(r.answers); setConsents(r.consents); };

  useEffect(() => {
    let live = true;
    let tries = 0;
    const load = async () => {
      try {
        const r = await call('view');
        if (!live) return;
        take(r);
        // The webhook usually lands within seconds of the return from Stripe.
        if (justPaid && r.status === 'pending_payment' && tries++ < 20) setTimeout(() => void load(), 1500);
      } catch (e) { if (live) setError(errText(e)); }
    };
    void load();
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (transferred) return <div className="wrap narrow" style={{ paddingTop: 40 }}><h1>Ticket transferred</h1><p>We've emailed {toEmail} their link. This page no longer opens the registration.</p></div>;
  if (error && !me) return <div className="wrap narrow" style={{ paddingTop: 40 }}><p className="error">{error}</p></div>;
  if (!me) return <div className="wrap" style={{ paddingTop: 40 }}><p>Loading…</p></div>;

  const act = async (f: () => Promise<void>) => { setBusy(true); setError(null); try { await f(); } catch (e) { setError(errText(e)); } setBusy(false); };
  const pay = () => act(async () => { const r = await call('pay'); if (r.checkout_url) go(r.checkout_url); });
  const space = me.answers.home_space_id ? SPACES.find((s) => s.id === me.answers.home_space_id) : null;
  const shareUrl = `${event.public_url}${space ? `?ref=${space.id}` : ''}`;
  const saveIntroduction = async () => {
    const r = await call('update', { answers, consents }); take(r); setSaved(true);
  };
  const sameInterest = (p: NonNullable<typeof people>[number]) =>
    !!(space && p.space === space.name) || p.tracks?.some((t) => me.answers.tracks.includes(t));
  const shownPeople = people?.filter((p) => !sharedOnly || sameInterest(p));
  const calendar = () => {
    if (!event.starts_at || !event.ends_at) return;
    const text = meetingIcs({ id, title: event.title, agenda: event.tagline, location: event.location,
      starts_at: event.starts_at, duration_min: (Date.parse(event.ends_at) - Date.parse(event.starts_at)) / 60000,
      status: 'scheduled', updated_at: event.updated_at, url: event.public_url, link_text: 'Event details' });
    const url = URL.createObjectURL(new Blob([text], { type: 'text/calendar;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = `${id}.ics`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <>
      <section className="hero">
        <div className="wrap narrow">
          <EventBrand region={event.region_id} />
          <p className="eyebrow">{event.date_label} · {event.location}</p>
          <h1>{event.title}</h1>
          <p className="lede">
            {justPaid && me.status === 'pending_payment' ? 'Thanks, your payment is on its way to us. This usually takes a few seconds…' : STATUS_WORDS[me.status] ?? me.status}
          </p>
          <p className="muted" style={{ marginTop: 10 }}>{me.name} · {me.tier_name}{me.amount_paid_cents ? ` · ${money(me.amount_paid_cents)} ${me.status === 'refunded' ? 'refunded' : 'paid'}` : ''}</p>
          {me.status === 'confirmed' && <p className="muted">Your ticket is confirmed. Your email has the link to return here.</p>}
          <div className="btn-row" style={{ marginTop: 14 }}>
            {me.status === 'confirmed' && event.starts_at && event.ends_at && <button className="btn" onClick={calendar}>Add to calendar</button>}
            <a className="btn ghost" href="#ticket-details" onClick={() => { const details = document.getElementById('ticket-details'); if (details instanceof HTMLDetailsElement) details.open = true; }}>Edit registration</a>
            {me.status === 'confirmed' && <a className="btn ghost" href="#ticket-actions">Refund or transfer</a>}
            {me.can_pay && !(justPaid && me.status === 'pending_payment') && <button className="btn" disabled={busy} onClick={() => void pay()}>Pay {money(me.price_cents)} by card</button>}
            {me.can_accept_free && <button className="btn" disabled={busy} onClick={() => void act(async () => take(await call('accept_free')))}>Take the place</button>}
          </div>
        </div>
      </section>
      <div className="wrap narrow event-body">
        {error && <p className="error">{error}</p>}

        {me.status === 'confirmed' && <Introduction event={event} answers={answers} consents={consents}
          set={(patch) => { setAnswers((a) => ({ ...a, ...patch })); setSaved(false); }} save={saveIntroduction}
          sharing={<OptIns a={answers} c={consents} set={(k, v) => { setConsents((c) => ({ ...c, [k]: v })); setSaved(false); }} />}>
          <Connections a={me.answers} event={event} regId={regId} />
        </Introduction>}

        <details id="ticket-details" className="card form-card event-form">
          <summary>Edit registration and sharing choices</summary>
          <p>{me.name} · {me.email}</p>
          <form onSubmit={(e) => { e.preventDefault(); void act(saveIntroduction); }}>
            <FoodAndAccess event={event} answers={answers} set={(p) => { setAnswers((x) => ({ ...x, ...p })); setSaved(false); }} />
            <OptIns a={answers} c={consents} set={(k, v) => { setConsents((x) => ({ ...x, [k]: v })); setSaved(false); }} />
            <button className="btn ghost" disabled={busy || saved}>{saved ? 'Saved' : 'Save changes'}</button>
            {saved && <p role="status">Changes saved.</p>}
          </form>
        </details>

        {me.status === 'confirmed' && (
          <section id="event-attendees" className="card form-card">
            <h2>Who else is coming</h2>
            <p className="muted">People who chose to be listed. You can choose to join the list in your sharing choices.</p>
            {people === null
              ? <button className="btn ghost" disabled={busy} onClick={() => void act(async () => { const r = await api<{ attendees: NonNullable<typeof people> }>('manage', { r: regId, t: token, action: 'attendees' }); setPeople(r.attendees); })}>Show the list</button>
              : people.length === 0 ? <p>No one has chosen to be listed yet. Come back closer to the event.</p> : (
                <>
                <Check checked={sharedOnly} onChange={setSharedOnly}>Show people with a shared space or event interest</Check>
                {shownPeople?.length === 0 && <p>No shared space or interest match yet. Turn off the filter to explore everyone who chose to be listed.</p>}
                <ul className="attendee-list">
                  {shownPeople?.map((p) => (
                    <li key={`${p.name}-${p.email ?? ''}`}>
                      <strong>{p.name}</strong>{p.space && <span className="muted"> · {p.space}</span>}
                      {p.email && <> · <a href={`mailto:${p.email}`}>{p.email}</a></>}
                      {p.profile?.cover_url && <img className="attendee-work" src={p.profile.cover_url} alt={`Work by ${p.name}`} />}
                      {p.profile?.headline && <div>{p.profile.headline}</div>}
                      {sameInterest(p) && <p className="muted">{space && p.space === space.name ? `Also from ${space.name}` : `Shared interest: ${event.tracks.filter((t) => me.answers.tracks.includes(t.id) && p.tracks?.includes(t.id)).map((t) => t.label).join(', ')}`}</p>}
                      {p.makes && <div>{p.makes}</div>}
                      {p.profile?.bio && <div className="muted">{p.profile.bio}</div>}
                      {p.profile?.website && <div><a href={p.profile.website} rel="noopener nofollow">{p.profile.website.replace(/^https?:\/\//, '')}</a></div>}
                      {p.offer_session && <div className="muted">Could offer: {p.offer_session}</div>}
                    </li>
                  ))}
                </ul>
                </>
              )}
          </section>
        )}

        {me.can_cancel && me.status !== 'cancelled' && (
          <p><button className="linkish" disabled={busy} onClick={() => void act(async () => take(await call('cancel')))}>Cancel this registration</button></p>
        )}
        {me.status === 'confirmed' && (
          <section id="ticket-actions" className="card form-card">
            <h2>Can't make it?</h2>
            {me.can_refund && <>
              <p>You can refund your ticket yourself until {new Date(me.refund_until!).toLocaleDateString('en-US', { timeZone: 'America/New_York', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' })}, when the catering count is set.</p>
              <p><button className="btn ghost" disabled={busy} onClick={() => {
                if (window.confirm(`Refund ${money(me.amount_paid_cents)} and give up your place?`)) void act(async () => take(await call('refund')));
              }}>Refund my ticket</button></p>
            </>}
            {!me.can_refund && me.amount_paid_cents > 0 && <p>Refunds have closed, but you can give your ticket to someone else.</p>}
            {!transferring
              ? <button className="linkish" onClick={() => setTransferring(true)}>Give my ticket to someone else</button>
              : (
                <form className="event-form" onSubmit={(e) => {
                  e.preventDefault();
                  void act(async () => { await api('manage', { r: regId, t: token, action: 'transfer', name: toName, email: toEmail }); setTransferred(true); });
                }}>
                  <div className="two">
                    <label className="field"><span>Their name</span><input required maxLength={120} value={toName} onChange={(e) => setToName(e.target.value)} /></label>
                    <label className="field"><span>Their email</span><input required type="email" maxLength={200} value={toEmail} onChange={(e) => setToEmail(e.target.value)} /></label>
                  </div>
                  <button className="btn ghost" disabled={busy}>Transfer my ticket</button>
                  <p className="muted">We'll email them a link, and this link will stop working.</p>
                </form>
              )}
          </section>
        )}
        {me.status === 'confirmed' && <details className="card form-card"><summary>Invite someone to join you</summary><p>Share the public event page:</p><a className="event-share" href={shareUrl}>{shareUrl.replace('https://', '')}</a></details>}
        <p><a href={href('event', { event: id })}>Event page</a></p>
      </div>
    </>
  );
}
