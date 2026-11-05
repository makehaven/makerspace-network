// The public face of an event: what it is, tickets, sponsors, and the page an
// attendee returns to from their email. No account is needed for any of this.
// Sign-in is asked for only afterwards, and only if someone wants to join the
// network; a maker should not need a login to buy a ticket.

import { useEffect, useMemo, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../network/firebase';
import { SPACES } from '../data';
import { href } from '../App';
import {
  EMPTY_ANSWERS, LOOKING_FOR_WORDS, NO_CONSENTS, RELATIONSHIP_WORDS, api, money,
  type Answers, type ConsentKey, type Consents, type EventDoc, type EventStats, type MyRegistration,
} from './model';

const q = () => new URLSearchParams(window.location.search);
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const go = (url: string) => { window.location.assign(url); };

function useEvent(id: string) {
  const [event, setEvent] = useState<EventDoc | null | undefined>(undefined);
  const [stats, setStats] = useState<EventStats | null>(null);
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
    })();
    return () => { live = false; };
  }, [id]);
  return { event, stats };
}

export default function EventPage({ id }: { id: string }) {
  const { event, stats } = useEvent(id);
  const params = q();
  const regId = params.get('r');
  const token = params.get('t');
  const view = params.get('view');

  useEffect(() => { if (event) document.title = `${event.title} — Makerspace Network`; }, [event]);

  if (event === undefined) return <div className="wrap" style={{ paddingTop: 40 }}><p>Loading…</p></div>;
  if (event === null) return <div className="wrap" style={{ paddingTop: 40 }}><p>No event at this address.</p></div>;

  if (regId && token) return <Manage id={id} event={event} regId={regId} token={token} />;
  return (
    <>
      <Hero event={event} stats={stats} />
      <div className="wrap narrow event-body">
        {event.status === 'draft' && <p className="notice"><strong>Draft.</strong> Only stewards can see this page. Nothing here is public yet, and neither tickets nor sponsorship can be taken.</p>}
        {event.status === 'cancelled' && <p className="notice">This event has been cancelled.</p>}
        {view === 'sponsor' ? <SponsorSection id={id} event={event} stats={stats} /> : <>
          <About event={event} stats={stats} />
          {event.status === 'open' && <Register id={id} event={event} stats={stats} />}
          {event.status === 'announced' && <Interest id={id} />}
          {event.status === 'closed' && <p className="notice">Registration is closed.</p>}
          <Sponsors id={id} event={event} />
        </>}
      </div>
    </>
  );
}

function Hero({ event, stats }: { event: EventDoc; stats: EventStats | null }) {
  const low = stats && event.status === 'open' && stats.spots_left > 0 && stats.spots_left <= Math.max(10, event.capacity * 0.15);
  return (
    <section className="hero">
      <div className="wrap narrow">
        <p className="eyebrow">{event.date_label}</p>
        <h1>{event.title}</h1>
        <p className="lede">{event.tagline}</p>
        <p className="muted" style={{ marginTop: 12 }}>
          {event.location}
          {event.hosts.length > 0 && <> · Hosted by {event.hosts.filter((h) => h.role === 'host').map((h) => h.name).join(' and ')}</>}
        </p>
        <div className="btn-row" style={{ marginTop: 16 }}>
          {event.status === 'open' && <a className="btn" href="#register">Get a ticket</a>}
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

function SpacePicker({ value, other, onChange }: { value: string | null; other: string; onChange: (id: string | null, other: string) => void }) {
  const [mode, setMode] = useState(value ? 'listed' : other ? 'other' : 'none');
  const spaces = useMemo(() => [...SPACES].filter((s) => s.status !== 'closed').sort((a, b) => a.name.localeCompare(b.name)), []);
  const selected = mode === 'other' ? '__other' : mode === 'none' ? '' : value ?? '';
  return (
    <>
      <label className="field">
        <span>Your home makerspace, if you have one</span>
        <select value={selected} onChange={(e) => {
          const v = e.target.value;
          if (v === '__other') { setMode('other'); onChange(null, other); }
          else if (v === '') { setMode('none'); onChange(null, ''); }
          else { setMode('listed'); onChange(v, ''); }
        }}>
          <option value="">I don't have one</option>
          {spaces.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          <option value="__other">Somewhere not on this list</option>
        </select>
      </label>
      {mode === 'other' && (
        <label className="field"><span>What's it called, and where?</span>
          <input maxLength={120} value={other} onChange={(e) => onChange(null, e.target.value)} /></label>
      )}
    </>
  );
}

function AboutYou({ event, a, set }: { event: EventDoc; a: Answers; set: (patch: Partial<Answers>) => void }) {
  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  return (
    <>
      <fieldset className="event-fieldset">
        <legend>Which of these sound like you?</legend>
        <div className="checks">
          {RELATIONSHIP_WORDS.map(([id, words]) => (
            <Check key={id} checked={a.relationship.includes(id)} onChange={() => set({ relationship: toggle(a.relationship, id) })}>{words}</Check>
          ))}
        </div>
      </fieldset>
      <SpacePicker value={a.home_space_id} other={a.home_space_other} onChange={(home_space_id, home_space_other) => set({ home_space_id, home_space_other })} />
      {!a.home_space_id && !a.home_space_other && (
        <Check checked={a.looking_for_space} onChange={(v) => set({ looking_for_space: v })}>I'd like to find a makerspace near me</Check>
      )}
      <fieldset className="event-fieldset">
        <legend>What would help you most right now?</legend>
        <div className="checks">
          {LOOKING_FOR_WORDS.map(([id, words]) => (
            <Check key={id} checked={a.looking_for.includes(id)} onChange={() => set({ looking_for: toggle(a.looking_for, id) })}>{words}</Check>
          ))}
        </div>
      </fieldset>
      <label className="field"><span>Your town and state</span><input maxLength={80} value={a.town} onChange={(e) => set({ town: e.target.value })} /></label>
      <details className="fold">
        <summary>Help shape the day <span className="muted">(optional)</span></summary>
        <label className="field"><span>What do you make, or want to?</span>
          <textarea rows={2} maxLength={500} value={a.makes} onChange={(e) => set({ makes: e.target.value })} /></label>
        <label className="field"><span>An unconference runs on what people bring. Is there a session you could lead or a question you'd want to put to the room?</span>
          <textarea rows={2} maxLength={500} value={a.offer_session} onChange={(e) => set({ offer_session: e.target.value })} /></label>
        <fieldset className="event-fieldset">
          <legend>What are you most interested in?</legend>
          <div className="checks">
            {event.tracks.map((t) => <Check key={t.id} checked={a.tracks.includes(t.id)} onChange={() => set({ tracks: toggle(a.tracks, t.id) })}>{t.label}</Check>)}
          </div>
        </fieldset>
      </details>
      <details className="fold">
        <summary>Food and access <span className="muted">(optional)</span></summary>
        <label className="field"><span>Anything we should know for lunch?</span>
          <input maxLength={200} value={a.dietary} onChange={(e) => set({ dietary: e.target.value })} /></label>
        <label className="field"><span>Anything that would make the day more accessible for you?</span>
          <input maxLength={300} value={a.access_needs} onChange={(e) => set({ access_needs: e.target.value })} /></label>
        {event.asks_over_21 && (
          <Check checked={a.over_21 === true} onChange={(v) => set({ over_21: v })}>I'm 21 or older (for the evening social)</Check>
        )}
      </details>
    </>
  );
}

/** Each box off until ticked, each about one specific thing. This is the
 *  promise the brief makes about follow-up and peer networking, and it is also
 *  how the network grows: every line below is someone choosing to be connected. */
function OptIns({ a, c, set }: { a: Answers; c: Consents; set: (k: ConsentKey, v: boolean) => void }) {
  const space = a.home_space_id ? SPACES.find((s) => s.id === a.home_space_id)?.name : null;
  return (
    <fieldset className="event-fieldset">
      <legend>Staying in touch: your call on each</legend>
      <div className="checks">
        <Check checked={c.attendee_list} onChange={(v) => { set('attendee_list', v); if (!v) set('peer_contact', false); }}>
          Show my name, space and what I make to other people coming to this event
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

function Register({ id, event, stats }: { id: string; event: EventDoc; stats: EventStats | null }) {
  const params = q();
  const ref = params.get('ref');
  const initialCode = params.get('code') ?? '';
  const soldOut = new Set(stats?.tiers_sold_out ?? []);
  const tiers = event.tiers.filter((t) => !t.requires_code);
  const [tierId, setTierId] = useState(tiers.find((t) => !soldOut.has(t.id))?.id ?? '');
  const [showCode, setShowCode] = useState(!!initialCode);
  const [code, setCode] = useState(initialCode);
  const [attested, setAttested] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [answers, setAnswers] = useState<Answers>(EMPTY_ANSWERS);
  const [consents, setConsents] = useState<Consents>(NO_CONSENTS);
  const [terms, setTerms] = useState(false);
  const [ageOk, setAgeOk] = useState(false);
  const [trap, setTrap] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
      {full && <p className="muted">The event is full. You won't be charged unless a place opens and you take it.</p>}
      <form onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true); setError(null);
        try {
          const out = await api<{ outcome: string; checkout_url?: string; manage_url?: string }>('register', {
            event_id: id, tier_id: tierId, code: showCode ? code : '', attested, name, email, answers, consents, ref,
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
          ? <label className="field"><span>Code</span><input maxLength={40} value={code} onChange={(e) => setCode(e.target.value)} /></label>
          : <p><button type="button" className="linkish" onClick={() => setShowCode(true)}>I have a code</button></p>}

        <div className="two">
          <label className="field"><span>Your name</span><input required maxLength={120} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} /></label>
          <label className="field"><span>Email</span><input required type="email" maxLength={200} autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        </div>
        <label className="sr-only" aria-hidden="true">Leave this empty<input tabIndex={-1} autoComplete="off" value={trap} onChange={(e) => setTrap(e.target.value)} /></label>

        <AboutYou event={event} a={answers} set={(p) => setAnswers((x) => ({ ...x, ...p }))} />
        <OptIns a={answers} c={consents} set={(k, v) => setConsents((x) => ({ ...x, [k]: v }))} />

        <details className="fold"><summary>Event terms</summary><p className="event-terms">{event.terms}</p></details>
        {!!event.min_age && <Check checked={ageOk} onChange={setAgeOk}>I'm {event.min_age} or older</Check>}
        <Check checked={terms} onChange={setTerms}>I agree to the event terms</Check>

        {error && <p className="error">{error}</p>}
        <button className="btn" disabled={busy || !terms || (!!event.min_age && !ageOk) || (!tierId && !showCode)}>
          {busy ? 'One moment…' : full ? 'Join the waitlist' : !showCode && tier?.price_cents ? `Continue to pay ${money(tier.price_cents)}` : 'Register'}
        </button>
        {!full && !!tier?.price_cents && <p className="muted" style={{ marginTop: 8 }}>Card payment is handled by Stripe. {event.hosts.find((h) => h.role === 'fiduciary')?.name ?? 'The host'} receives the payment and it appears under that name on your statement.</p>}
      </form>
    </section>
  );
}

function Interest({ id }: { id: string }) {
  const params = q();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
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
        try { await api('interest', { event_id: id, name, email, home_space_id: space, ref: params.get('ref'), website: trap }); setDone(true); }
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

function Sponsors({ id, event }: { id: string; event: EventDoc }) {
  const show = event.status !== 'draft' && event.status !== 'cancelled';
  return (
    <section className="event-sponsors">
      {event.sponsors.length > 0 && <>
        <h2>Made possible by</h2>
        <ul className="sponsor-list">
          {event.sponsors.map((s) => (
            <li key={s.name}>
              {s.url ? <a href={s.url} rel="noopener">{s.logo ? <img src={s.logo} alt={s.name} /> : s.name}</a>
                     : s.logo ? <img src={s.logo} alt={s.name} /> : s.name}
            </li>
          ))}
        </ul>
      </>}
      {event.hosts.some((h) => h.role === 'venue') && (
        <p className="muted">Venue: {event.hosts.filter((h) => h.role === 'venue').map((h) => h.name).join(', ')}</p>
      )}
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
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
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

function Manage({ id, event, regId, token }: { id: string; event: EventDoc; regId: string; token: string }) {
  const [me, setMe] = useState<MyRegistration | null>(null);
  const [answers, setAnswers] = useState<Answers>(EMPTY_ANSWERS);
  const [consents, setConsents] = useState<Consents>(NO_CONSENTS);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [people, setPeople] = useState<{ name: string; space: string | null; makes: string; offer_session: string; email: string | null; profile: { id: string; headline: string; bio: string; cover_url: string | null; website: string | null } | null }[] | null>(null);
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
  const isLeader = me.answers.relationship.includes('space_leader');

  return (
    <>
      <section className="hero">
        <div className="wrap narrow">
          <p className="eyebrow">{event.date_label} · {event.location}</p>
          <h1>{event.title}</h1>
          <p className="lede">
            {justPaid && me.status === 'pending_payment' ? 'Thanks, your payment is on its way to us. This usually takes a few seconds…' : STATUS_WORDS[me.status] ?? me.status}
          </p>
          <p className="muted" style={{ marginTop: 10 }}>{me.name} · {me.tier_name}{me.amount_paid_cents ? ` · ${money(me.amount_paid_cents)} paid` : ''}</p>
          <div className="btn-row" style={{ marginTop: 14 }}>
            {me.can_pay && !(justPaid && me.status === 'pending_payment') && <button className="btn" disabled={busy} onClick={() => void pay()}>Pay {money(me.price_cents)} by card</button>}
            {me.can_accept_free && <button className="btn" disabled={busy} onClick={() => void act(async () => take(await call('accept_free')))}>Take the place</button>}
          </div>
        </div>
      </section>
      <div className="wrap narrow event-body">
        {error && <p className="error">{error}</p>}

        {me.status === 'confirmed' && (
          <section className="card form-card">
            <h2>What next</h2>
            <ul className="next-steps">
              {isLeader && (
                <li><strong>Running a space?</strong> Claim its listing so the network has it right, and so you can see who's coming from your community. <a href="https://makerspace.network/?page=join">Join and claim it</a>.</li>
              )}
              {me.answers.looking_for_space && (
                <li><strong>Looking for a makerspace?</strong> <a href={href('directory')}>See what's near you</a>; many offer tours.</li>
              )}
              <li><strong>Show what you make.</strong> A short profile and a photo or two of your work helps people find you, to collaborate or to learn from you. <a href="https://makerspace.network/?page=maker-edit">Make your maker profile</a>.</li>
              <li><strong>Know someone who should be there?</strong> Send them <a href={shareUrl}>{shareUrl.replace('https://', '')}</a>.</li>
            </ul>
          </section>
        )}

        <section className="card form-card event-form">
          <h2>Your answers and opt-ins</h2>
          <form onSubmit={(e) => { e.preventDefault(); void act(async () => { take(await call('update', { answers, consents })); setSaved(true); }); }}>
            <AboutYou event={event} a={answers} set={(p) => { setAnswers((x) => ({ ...x, ...p })); setSaved(false); }} />
            <OptIns a={answers} c={consents} set={(k, v) => { setConsents((x) => ({ ...x, [k]: v })); setSaved(false); }} />
            <button className="btn ghost" disabled={busy || saved}>{saved ? 'Saved' : 'Save'}</button>
          </form>
        </section>

        {me.status === 'confirmed' && (
          <section className="card form-card">
            <h2>Who else is coming</h2>
            <p className="muted">People who chose to be listed. Turn on the first opt-in above to appear here yourself.</p>
            {people === null
              ? <button className="btn ghost" disabled={busy} onClick={() => void act(async () => { const r = await api<{ attendees: NonNullable<typeof people> }>('manage', { r: regId, t: token, action: 'attendees' }); setPeople(r.attendees); })}>Show the list</button>
              : people.length === 0 ? <p>No one yet.</p> : (
                <ul className="attendee-list">
                  {people.map((p) => (
                    <li key={`${p.name}-${p.email ?? ''}`}>
                      <strong>{p.name}</strong>{p.space && <span className="muted"> · {p.space}</span>}
                      {p.email && <> · <a href={`mailto:${p.email}`}>{p.email}</a></>}
                      {p.profile?.cover_url && <img className="attendee-work" src={p.profile.cover_url} alt={`Work by ${p.name}`} />}
                      {p.profile?.headline && <div>{p.profile.headline}</div>}
                      {p.makes && <div>{p.makes}</div>}
                      {p.profile?.bio && <div className="muted">{p.profile.bio}</div>}
                      {p.profile?.website && <div><a href={p.profile.website} rel="noopener nofollow">{p.profile.website.replace(/^https?:\/\//, '')}</a></div>}
                      {p.offer_session && <div className="muted">Could offer: {p.offer_session}</div>}
                    </li>
                  ))}
                </ul>
              )}
          </section>
        )}

        {me.can_cancel && me.status !== 'cancelled' && (
          <p><button className="linkish" disabled={busy} onClick={() => void act(async () => take(await call('cancel')))}>Cancel this registration</button></p>
        )}
        {me.status === 'confirmed' && (
          <section className="card form-card">
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
        <p><a href={href('event', { event: id })}>Event page</a></p>
      </div>
    </>
  );
}
