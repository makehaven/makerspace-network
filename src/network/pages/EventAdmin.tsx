// The steward's side of an event: is it on budget, who is coming, who is
// sponsoring, and which of those people should become part of the network.
// Rules limit what this page can change: never a price paid or a settled status.

import { useEffect, useMemo, useState } from 'react';
import { collection, doc, getDoc, getDocs, query, setDoc, updateDoc, where, deleteDoc } from 'firebase/firestore';
import { setEventPartner } from '../db';
import { db } from '../firebase';
import { useSession } from '../session';
import { listSpaceIndex, type WithId } from '../db';
import type { SpaceIndex } from '../model';
import { PageLink, SignIn, csvEsc, download } from './shared';
import { REGIONS } from '../../data';
import { RELATIONSHIP_WORDS, money, type Answers, type Consents, type EventDoc } from '../../events/model';
import {
  fixedCosts, formatCosts, marginPerHead, net, parseCosts, perHeadCost, sponsorsToBreakEven, type FinanceInputs,
} from '../../../functions/src/eventFinance';
import seed from '../../../data/events/maker-bonanza-2027.json';

interface Reg {
  event_id: string; name: string; email: string; status: string; tier_id: string; tier_name: string; price_cents: number;
  amount_paid_cents: number; amount_refunded_cents: number; code: string | null; answers: Answers; home_space_id: string | null;
  referred_by: string | null; consents: Consents; payment_issue: string | null; mail_error?: string; attended: boolean | null;
  created_at: string; steward_note?: string;
}
interface Sponsor {
  org_name: string; org_url: string; contact_name: string; contact_email: string; tier_id: string | null; tier_name: string | null;
  amount_cents: number | null; amount_paid_cents: number; note: string; pay: string; status: string; created_at: string;
}
interface Interested { name: string; email: string; home_space_id: string | null; referred_by: string | null; created_at: string }
interface CodeRow { tier_id: string; max_uses: number; note: string }

const DEFAULT_FINANCE: FinanceInputs = { costs: [], fee_rate: 0.029, fee_fixed_cents: 30, max_loss_cents: null };
const relWord = (id: string) => RELATIONSHIP_WORDS.find(([k]) => k === id)?.[1] ?? id;
const isoNow = () => new Date().toISOString();

type Tab = 'overview' | 'people' | 'sponsors' | 'network' | 'settings';

export default function EventAdmin() {
  const s = useSession();
  const params = new URLSearchParams(window.location.search);
  const id = params.get('event') ?? seed.id;
  const [tab, setTab] = useState<Tab>((params.get('tab') as Tab) ?? 'overview');
  const [event, setEvent] = useState<EventDoc | null | undefined>(undefined);
  const [regs, setRegs] = useState<WithId<Reg>[]>([]);
  const [sponsors, setSponsors] = useState<WithId<Sponsor>[]>([]);
  const [interest, setInterest] = useState<WithId<Interested>[]>([]);
  const [finance, setFinance] = useState<FinanceInputs>(DEFAULT_FINANCE);
  const [orgs, setOrgs] = useState<WithId<SpaceIndex>[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      const e = await getDoc(doc(db, 'events', id));
      setEvent(e.exists() ? (e.data() as EventDoc) : null);
      if (!e.exists()) return;
      // The region filter is not redundant: the rules allow a steward only their
      // own region, and Firestore refuses a list it cannot prove stays inside that.
      const ofEvent = [where('event_id', '==', id), where('region_id', '==', (e.data() as EventDoc).region_id)];
      const [r, sp, i, f, o] = await Promise.all([
        getDocs(query(collection(db, 'event_registrations'), ...ofEvent)),
        getDocs(query(collection(db, 'event_sponsors'), ...ofEvent)),
        getDocs(query(collection(db, 'event_interest'), ...ofEvent)),
        getDoc(doc(db, 'event_finance', id)),
        listSpaceIndex(),
      ]);
      setRegs(r.docs.map((d) => ({ id: d.id, ...(d.data() as Reg) })));
      setSponsors(sp.docs.map((d) => ({ id: d.id, ...(d.data() as Sponsor) })));
      setInterest(i.docs.map((d) => ({ id: d.id, ...(d.data() as Interested) })));
      if (f.exists()) setFinance({ ...DEFAULT_FINANCE, ...(f.data() as Partial<FinanceInputs>) });
      setOrgs(o);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };
  const steward = !!s.stewardship && (s.stewardship.network_admin || s.stewardship.region_ids.length > 0);
  useEffect(() => { if (steward) void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [steward, id]);

  return (
    <div className="wrap" style={{ paddingTop: 30, paddingBottom: 50 }}>
      <p className="eyebrow"><PageLink page="steward">Steward tools</PageLink> · Event</p>
      <h1 style={{ fontSize: '1.9rem' }}>{event?.title ?? id}</h1>
      {s.status === 'loading' && <p>Loading…</p>}
      {s.status === 'signed_out' && <div className="narrow"><SignIn /></div>}
      {s.status === 'signed_in' && !steward && <p className="notice narrow">This page is for regional stewards and network admins.</p>}
      {error && <p className="error">{error}</p>}
      {steward && event === null && <CreateFromSeed id={id} onDone={load} />}
      {steward && event && (
        <>
          <p className="muted">
            <span className="pill">{event.status}</span>{' '}
            <PageLink page="event" params={{ event: id }}>See the public page</PageLink>
          </p>
          <div className="tabs">
            {(['overview', 'people', 'sponsors', 'network', 'settings'] as Tab[]).map((t) => (
              <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{t[0].toUpperCase() + t.slice(1)}</button>
            ))}
          </div>
          {tab === 'overview' && <Overview id={id} event={event} regs={regs} sponsors={sponsors} interest={interest} finance={finance} onSaved={setFinance} />}
          {tab === 'people' && <PeopleTab event={event} regs={regs} orgs={orgs} onChange={load} />}
          {tab === 'sponsors' && <SponsorsTab id={id} event={event} sponsors={sponsors} onChange={load} />}
          {tab === 'network' && <NetworkTab id={id} event={event} regs={regs} interest={interest} orgs={orgs} />}
          {tab === 'settings' && <SettingsTab id={id} event={event} onChange={load} />}
        </>
      )}
    </div>
  );
}

function CreateFromSeed({ id, onDone }: { id: string; onDone: () => Promise<void> }) {
  const [error, setError] = useState<string | null>(null);
  if (id !== seed.id) return <p className="notice narrow">No event called {id}.</p>;
  return (
    <div className="card form-card narrow">
      <h2>Not created yet</h2>
      <p>The repository holds a draft of this event at <code>data/events/{id}.json</code>. Creating it copies that into the database as a draft only stewards can see.</p>
      {seed.gaps.length > 0 && <>
        <h4>Still to settle before it goes public</h4>
        <ul>{seed.gaps.map((g) => <li key={g}>{g}</li>)}</ul>
      </>}
      {error && <p className="error">{error}</p>}
      <button className="btn" onClick={async () => {
        const { id: _id, sources: _s, gaps: _g, $comment: _c, ...data } = seed as typeof seed & { $comment?: string };
        try { await setDoc(doc(db, 'events', id), { ...data, updated_at: isoNow() }); await onDone(); }
        catch (e) { setError(e instanceof Error ? e.message : String(e)); }
      }}>Create the draft</button>
    </div>
  );
}

// ---------- overview: are we on budget ----------

function Overview({ id, event, regs, sponsors, interest, finance, onSaved }: {
  id: string; event: EventDoc; regs: WithId<Reg>[]; sponsors: WithId<Sponsor>[]; interest: WithId<Interested>[];
  finance: FinanceInputs; onSaved: (f: FinanceInputs) => void;
}) {
  const confirmed = regs.filter((r) => r.status === 'confirmed');
  const issues = regs.filter((r) => r.payment_issue || r.mail_error);
  const waitlist = regs.filter((r) => r.status === 'waitlisted').length;
  const ticketRevenue = confirmed.reduce((n, r) => n + r.amount_paid_cents - (r.amount_refunded_cents ?? 0), 0);
  const inHand = sponsors.filter((s) => s.status === 'paid').reduce((n, s) => n + (s.amount_paid_cents || s.amount_cents || 0), 0);
  const pledged = sponsors.filter((s) => ['committed', 'invoiced'].includes(s.status)).reduce((n, s) => n + (s.amount_cents ?? 0), 0);
  const general = event.tiers.find((t) => t.price_cents > 0)?.price_cents ?? 0;
  const paidNow = confirmed.filter((r) => r.amount_paid_cents > 0).map((r) => r.amount_paid_cents);
  const [text, setText] = useState(formatCosts(finance.costs));
  const [maxLoss, setMaxLoss] = useState(finance.max_loss_cents == null ? '' : String(finance.max_loss_cents / 100));
  const [feePct, setFeePct] = useState(String(Number((finance.fee_rate * 100).toFixed(2))));
  const [msg, setMsg] = useState('');
  useEffect(() => { setText(formatCosts(finance.costs)); setMaxLoss(finance.max_loss_cents == null ? '' : String(finance.max_loss_cents / 100)); setFeePct(String(Number((finance.fee_rate * 100).toFixed(2)))); }, [finance]);

  const scenario = (heads: number) => net(finance, { heads, ticket_cents: Array(heads).fill(general), sponsor_cents: inHand + pledged });
  const sold = net(finance, { heads: confirmed.length, ticket_cents: paidNow, sponsor_cents: inHand + pledged });
  const hasBudget = finance.costs.length > 0;
  const breach = (n: number) => finance.max_loss_cents != null && n < -finance.max_loss_cents;

  return (
    <>
      {issues.length > 0 && (
        <div className="notice"><h4>{issues.length} need a person</h4>
          <ul>{issues.map((r) => <li key={r.id}>{r.name} ({r.email}): {r.payment_issue ?? `email failed, ${r.mail_error}`}</li>)}</ul>
        </div>
      )}
      <div className="facts event-facts">
        <div className="fact"><strong>{confirmed.length}</strong> of {event.capacity} confirmed</div>
        <div className="fact"><strong>{waitlist}</strong> on the waitlist</div>
        <div className="fact"><strong>{interest.length}</strong> asked to hear when tickets open</div>
        <div className="fact"><strong>{money(ticketRevenue)}</strong> tickets</div>
        <div className="fact"><strong>{money(inHand)}</strong> sponsors paid</div>
        <div className="fact"><strong>{money(pledged)}</strong> sponsors pledged</div>
      </div>

      <div className="card form-card" style={{ marginTop: 16 }}>
        <h2>Budget</h2>
        <p className="muted">Private to stewards. One cost per line: <code>Lunch | 26 | head</code> for a cost per person, <code>Facilitators | 4000</code> for a fixed one. Lines with no number are ignored, so an unpriced item can stay as a reminder.</p>
        <textarea rows={9} style={{ width: '100%' }} value={text} onChange={(e) => setText(e.target.value)} />
        <div className="inline-fields">
          <label className="field"><span>Card fee, % <em>plus 30¢</em></span><input value={feePct} onChange={(e) => setFeePct(e.target.value)} /></label>
          <label className="field"><span>Most we can lose, $</span><input value={maxLoss} onChange={(e) => setMaxLoss(e.target.value)} /></label>
          <button className="btn ghost" onClick={async () => {
            const f: FinanceInputs = {
              ...finance, costs: parseCosts(text), fee_rate: (Number(feePct) || 0) / 100,
              max_loss_cents: maxLoss.trim() === '' ? null : Math.round(Number(maxLoss) * 100),
            };
            await setDoc(doc(db, 'event_finance', id), f);
            onSaved(f); setMsg('Saved');
          }}>Save</button>
          {msg && <span className="muted">{msg}</span>}
        </div>
        {hasBudget && general > 0 && (
          <>
            <p style={{ marginTop: 14 }}>
              Fixed costs {money(fixedCosts(finance))}; {money(perHeadCost(finance))} a person.
              Each {money(general)} ticket adds <strong>{money(marginPerHead(finance, general))}</strong> after food and fees,
              so {marginPerHead(finance, general) < 1500 ? 'filling more seats barely moves the total: sponsors carry this budget.' : 'ticket sales matter to the total.'}
            </p>
            <div className="scroll-x">
              <table className="data">
                <thead><tr><th>If this many come, paying {money(general)}</th><th>Net with sponsors so far</th><th>Sponsors needed to break even</th></tr></thead>
                <tbody>
                  {[confirmed.length, 80, 100, 150, 200].filter((n, i, a) => a.indexOf(n) === i && n > 0).sort((a, b) => a - b).map((n) => (
                    <tr key={n} className={breach(scenario(n)) ? 'warn-row' : ''}>
                      <td>{n}{n === confirmed.length ? ' (sold so far)' : ''}</td>
                      <td>{n === confirmed.length ? money(sold) : money(scenario(n))}{breach(n === confirmed.length ? sold : scenario(n)) ? ' — past the limit' : ''}</td>
                      <td>{money(sponsorsToBreakEven(finance, n, general))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </>
  );
}

// ---------- people: the roster, check-in, waitlist ----------

function PeopleTab({ event, regs, orgs, onChange }: { event: EventDoc; regs: WithId<Reg>[]; orgs: WithId<SpaceIndex>[]; onChange: () => Promise<void> }) {
  const [filter, setFilter] = useState('');
  const [status, setStatus] = useState('active');
  const names = useMemo(() => new Map(orgs.map((o) => [o.id, o.name])), [orgs]);
  const spaceOf = (r: Reg) => (r.home_space_id && names.get(r.home_space_id)) || r.answers.home_space_other || '';
  const shown = regs
    .filter((r) => status === 'all' || (status === 'active' ? ['confirmed', 'offered', 'pending_payment'].includes(r.status) : r.status === status))
    .filter((r) => !filter || `${r.name} ${r.email} ${spaceOf(r)}`.toLowerCase().includes(filter.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name));
  const taken = regs.filter((r) => r.status === 'confirmed' || r.status === 'offered').length;

  const csv = () => {
    const head = ['name', 'email', 'status', 'ticket', 'paid', 'space', 'town', 'relationship', 'tracks', 'makes', 'could_offer', 'dietary', 'access', 'over_21', 'referred_by', 'code',
      'ok_attendee_list', 'ok_peer_contact', 'ok_followup', 'ok_network', 'ok_space_share', 'ok_space_intro', 'looking_for_space', 'wants', 'organisation', 'excited_about', 'challenged_by', 'unconference_before', 'attended', 'registered'];
    const rows = regs.map((r) => [
      r.name, r.email, r.status, r.tier_name, (r.amount_paid_cents / 100).toFixed(2), spaceOf(r), r.answers.town, r.answers.relationship.join('; '),
      r.answers.tracks.join('; '), r.answers.makes, r.answers.offer_session, r.answers.dietary, r.answers.access_needs, r.answers.over_21 ?? '',
      r.referred_by ?? '', r.code ?? '', r.consents.attendee_list, r.consents.peer_contact, r.consents.followup, r.consents.network,
      r.consents.space_share, r.consents.space_intro, r.answers.looking_for_space, (r.answers.looking_for ?? []).join('; '), r.answers.organization ?? '', r.answers.excited ?? '', r.answers.challenged ?? '', r.answers.unconference_before ?? '', r.attended ?? '', r.created_at,
    ]);
    download(`${event.title.replace(/\W+/g, '-').toLowerCase()}-registrations.csv`, [head, ...rows].map((l) => l.map(csvEsc).join(',')).join('\n'));
  };

  return (
    <>
      <div className="inline-fields" style={{ marginBottom: 10 }}>
        <label className="field"><span>Find</span><input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Name, email or space" /></label>
        <label className="field"><span>Show</span>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="active">Coming or about to</option><option value="waitlisted">Waitlist</option>
            <option value="cancelled">Cancelled</option><option value="expired">Lapsed</option><option value="refunded">Refunded</option><option value="all">Everyone</option>
          </select></label>
        <button className="btn ghost" onClick={csv}>Download CSV</button>
      </div>
      <p className="muted">The CSV holds personal details and each person's opt-ins. Share it with co-hosts for logistics only, and honour the opt-in columns for anything else.</p>
      <div className="scroll-x">
        <table className="data">
          <thead><tr><th>Name</th><th>Space</th><th>Ticket</th><th>Status</th><th>At the door</th></tr></thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id} className={r.payment_issue ? 'warn-row' : ''}>
                <td><strong>{r.name}</strong><br /><span className="muted">{r.email}</span></td>
                <td>{spaceOf(r)}</td>
                <td>{r.tier_name}{r.amount_paid_cents ? ` · ${money(r.amount_paid_cents)}` : ''}</td>
                <td>{r.status}{r.status === 'waitlisted' && (
                  <> <button className="linkish" onClick={async () => {
                    if (taken >= event.capacity && !window.confirm('The event is at capacity. Offer anyway?')) return;
                    await updateDoc(doc(db, 'event_registrations', r.id), { status: 'offered', offered_at: isoNow(), updated_at: isoNow() });
                    await onChange();
                  }}>Offer a place</button></>
                )}</td>
                <td>{r.status === 'confirmed' && (
                  <label className="check"><input type="checkbox" checked={!!r.attended} onChange={async (e) => {
                    await updateDoc(doc(db, 'event_registrations', r.id), { attended: e.target.checked, checked_in_at: e.target.checked ? isoNow() : null, updated_at: isoNow() });
                    await onChange();
                  }} /> Here</label>
                )}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted" style={{ marginTop: 10 }}>Refunds are made in the Stripe dashboard; a full refund updates the row here and frees the seat on its own.</p>
    </>
  );
}

// ---------- sponsors ----------

const SPONSOR_STATUSES = ['inquiry', 'committed', 'invoiced', 'paid', 'declined', 'needs_review', 'pending_payment', 'refunded'];

function SponsorsTab({ id, event, sponsors, onChange }: { id: string; event: EventDoc; sponsors: WithId<Sponsor>[]; onChange: () => Promise<void> }) {
  const [codes, setCodes] = useState<WithId<CodeRow>[]>([]);
  const [code, setCode] = useState('');
  const [tierId, setTierId] = useState(event.tiers.find((t) => t.requires_code)?.id ?? '');
  const [uses, setUses] = useState('2');
  const [note, setNote] = useState('');
  const loadCodes = async () => {
    const found = await getDocs(query(collection(db, 'event_codes'), where('event_id', '==', id), where('region_id', '==', event.region_id)));
    setCodes(found.docs.map((d) => ({ id: d.id.split('~')[1], ...(d.data() as CodeRow) })));
  };
  useEffect(() => { void loadCodes(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id]);
  const listed = (name: string) => event.sponsors.some((s) => s.name === name);
  const setLogo = async (name: string, logo: string) => {
    await updateDoc(doc(db, 'events', id), { sponsors: event.sponsors.map((x) => (x.name === name ? { ...x, logo: logo.trim() || null } : x)), updated_at: isoNow() });
    await onChange();
  };
  const setListed = async (s: Sponsor, on: boolean) => {
    const next = on
      ? [...event.sponsors, { name: s.org_name, tier_id: s.tier_id, url: s.org_url || null, logo: null }]
      : event.sponsors.filter((x) => x.name !== s.org_name);
    await updateDoc(doc(db, 'events', id), { sponsors: next, updated_at: isoNow() });
    await onChange();
  };
  return (
    <>
      <p className="muted">
        Sponsors reach this list from <PageLink page="event" params={{ event: id, view: 'sponsor' }}>the sponsor page</PageLink>.
        Outreach and the relationship stay in the MakeHaven sponsorship pipeline; this holds what the event needs to know.
        No one appears publicly until you tick "listed".
      </p>
      <div className="scroll-x">
        <table className="data">
          <thead><tr><th>Organisation</th><th>Level</th><th>Status</th><th>Listed</th></tr></thead>
          <tbody>
            {sponsors.map((s) => (
              <tr key={s.id}>
                <td><strong>{s.org_name}</strong><br /><span className="muted">{s.contact_name} · <a href={`mailto:${s.contact_email}`}>{s.contact_email}</a></span>{s.note && <div>{s.note}</div>}</td>
                <td>{s.tier_name ?? '—'}{s.amount_cents ? ` · ${money(s.amount_cents)}` : ''}<br /><span className="muted">{s.pay}</span></td>
                <td><select value={s.status} onChange={async (e) => { await updateDoc(doc(db, 'event_sponsors', s.id), { status: e.target.value, updated_at: isoNow() }); await onChange(); }}>
                  {SPONSOR_STATUSES.map((x) => <option key={x}>{x}</option>)}
                </select></td>
                <td><input type="checkbox" checked={listed(s.org_name)} onChange={(e) => void setListed(s, e.target.checked)} aria-label={`List ${s.org_name} publicly`} />
                  {listed(s.org_name) && (
                    <label className="field"><span>Logo <em>a file in public/sponsors, like /sponsors/acme.png</em></span>
                      <input defaultValue={event.sponsors.find((x) => x.name === s.org_name)?.logo ?? ''} onBlur={(e) => void setLogo(s.org_name, e.target.value)} /></label>
                  )}</td>
              </tr>
            ))}
            {!sponsors.length && <tr><td colSpan={4} className="muted">None yet.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="card form-card" style={{ marginTop: 16 }}>
        <h2>Ticket codes</h2>
        <p className="muted">For sponsor seats, facilitators and anyone else who should not pay the listed price. A code selects a ticket; its price is that ticket's price. Send them <code>{event.public_url}?code=THECODE#register</code>.</p>
        <ul>{codes.map((c) => <li key={c.id}><code>{c.id}</code> · {event.tiers.find((t) => t.id === c.tier_id)?.name} · up to {c.max_uses}{c.note && ` · ${c.note}`} <button className="linkish" onClick={async () => { await deleteDoc(doc(db, 'event_codes', `${id}~${c.id}`)); await loadCodes(); }}>Remove</button></li>)}</ul>
        <form className="inline-fields" onSubmit={async (e) => {
          e.preventDefault();
          const c = code.trim().toUpperCase();
          if (!c) return;
          await setDoc(doc(db, 'event_codes', `${id}~${c}`), { event_id: id, region_id: event.region_id, tier_id: tierId, max_uses: Number(uses) || 1, note, created_at: isoNow() });
          setCode(''); setNote(''); await loadCodes();
        }}>
          <label className="field"><span>Code</span><input value={code} maxLength={40} onChange={(e) => setCode(e.target.value)} /></label>
          <label className="field"><span>Ticket</span><select value={tierId} onChange={(e) => setTierId(e.target.value)}>{event.tiers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
          <label className="field"><span>Uses</span><input value={uses} onChange={(e) => setUses(e.target.value)} /></label>
          <label className="field"><span>For</span><input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} /></label>
          <button className="btn ghost">Add</button>
        </form>
      </div>
    </>
  );
}

// ---------- network: what this event does for the network ----------

function NetworkTab({ id, event, regs, interest, orgs }: { id: string; event: EventDoc; regs: WithId<Reg>[]; interest: WithId<Interested>[]; orgs: WithId<SpaceIndex>[] }) {
  const coming = regs.filter((r) => r.status === 'confirmed' || r.status === 'waitlisted');
  const byId = useMemo(() => new Map(orgs.map((o) => [o.id, o])), [orgs]);
  const regionSpaces = orgs.filter((o) => (o.kind ?? 'makerspace') === 'makerspace' && o.region_id === event.region_id && !o.proposed).sort((a, b) => a.name.localeCompare(b.name));
  const [copied, setCopied] = useState(false);
  const s = useSession();
  const [partners, setPartners] = useState<Set<string>>(new Set());
  const loadPartners = async () => {
    const p = await getDocs(query(collection(db, 'event_partners'), where('event_id', '==', id)));
    setPartners(new Set(p.docs.map((d) => d.get('space_id') as string)));
  };
  useEffect(() => { void loadPartners(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id]);

  // The terms promise that anything beyond logistics is the person's choice, so
  // these lists name people only if they ticked "invite me". What the rest said
  // about a place is still useful, but it is followed up with the place itself.
  const leaderRows = coming.filter((r) => r.answers.relationship.includes('space_leader') && r.home_space_id && byId.get(r.home_space_id)?.claimed === false);
  const leadersUnclaimed = leaderRows.filter((r) => r.consents.network);
  const leaderSpacesOnly = [...new Set(leaderRows.filter((r) => !r.consents.network).map((r) => byId.get(r.home_space_id!)?.name ?? ''))];
  const notListedPlaces = [...new Set(coming.map((r) => r.answers.home_space_other).filter(Boolean))].sort();
  const looking = coming.filter((r) => r.consents.space_intro);
  const noOrg = coming.filter((r) => r.consents.network && !r.home_space_id);
  const invitable = coming.filter((r) => r.consents.network && r.home_space_id);
  const invitationCsv = invitable.map((r) => {
    const leader = r.answers.relationship.includes('space_leader');
    // Invited as a contact whatever they said: a form answer is a claim, and
    // editing a listing is decided by the claim flow, not by a checkbox.
    return [r.name, r.email, byId.get(r.home_space_id!)?.name ?? r.home_space_id, 'contact', leader ? 'staff' : ''].map(csvEsc).join(',');
  }).join('\n');

  const countFor = (id: string) => ({
    home: coming.filter((r) => r.home_space_id === id).length,
    referred: coming.filter((r) => r.referred_by === id).length,
    interested: interest.filter((i) => i.home_space_id === id || i.referred_by === id).length,
  });

  return (
    <>
      <p className="muted">Everything here is what someone said on a form, not a verified fact. It is a list of people to talk to, and nothing here changes the directory.</p>

      <div className="card form-card">
        <h2>Invite to the roster ({invitable.length})</h2>
        <p className="muted">People with a home space who ticked "invite me". Paste this into <PageLink page="steward" params={{ tab: 'invitations' }}>Invitations</PageLink>; they accept by signing in with that address. Accepting makes them verified on your say-so, and their connection to the space is only what they typed here, so look it over first.</p>
        {invitable.length > 0 && <>
          <textarea readOnly rows={4} style={{ width: '100%' }} value={invitationCsv} />
          <button className="btn ghost small" onClick={async () => { await navigator.clipboard.writeText(invitationCsv); setCopied(true); }}>{copied ? 'Copied' : 'Copy'}</button>
        </>}
        {noOrg.length > 0 && <>
          <h4 style={{ marginTop: 14 }}>Asked to stay connected, no home space ({noOrg.length})</h4>
          <p className="muted">Not for the roster. Send them to <code>makerspace.network/?page=maker-edit</code> to make a maker profile; their confirmation email already links there.</p>
          <p>{noOrg.map((r) => `${r.name} <${r.email}>`).join(', ')}</p>
        </>}
      </div>

      <PeopleList title="Say they run a space nobody has claimed" hint="The best phone call you can make: they can fix their own listing, and they asked to hear from the network." rows={leadersUnclaimed} note={(r) => byId.get(r.home_space_id!)?.name ?? ''} />
      {leaderSpacesOnly.length > 0 && (
        <div className="card form-card">
          <h2>Unclaimed spaces with someone coming ({leaderSpacesOnly.length})</h2>
          <p className="muted">Someone says they help run each of these but did not opt in to contact, so reach the space through its own public channels, and do not mention them.</p>
          <p>{leaderSpacesOnly.join(' · ')}</p>
        </div>
      )}
      <PeopleList title="Asked to be introduced to a makerspace" hint="New members for someone. They said yes to this." rows={looking} note={(r) => r.answers.town} />
      {notListedPlaces.length > 0 && (
        <div className="card form-card">
          <h2>Places not in the directory ({notListedPlaces.length})</h2>
          <p className="muted">As typed by attendees. Each is a lead to verify, not a listing: confirm it exists and record the source before adding a record.</p>
          <ul>{notListedPlaces.map((p) => <li key={p}>{p}</li>)}</ul>
        </div>
      )}

      <div className="card form-card">
        <h2>Spaces in {REGIONS.find((r) => r.id === event.region_id)?.name ?? 'this region'}</h2>
        <p className="muted">Give each space its link. People who arrive through it are counted for that space, and its staff see those counts on their Home page. Tick Partner only once a space has agreed to promote the event; it then appears on the public page. Staff who have signed in can also say yes themselves from Home.</p>
        <div className="scroll-x">
          <table className="data">
            <thead><tr><th>Partner</th><th>Space</th><th>Home space of</th><th>Came through its link</th><th>Interested</th><th>Link</th></tr></thead>
            <tbody>
              {regionSpaces.map((o) => {
                const c = countFor(o.id);
                return (
                  <tr key={o.id}>
                    <td><input type="checkbox" aria-label={`${o.name} agreed to be a partner`} checked={partners.has(o.id)} onChange={async (e) => { await setEventPartner(id, o.id, o.name, s.user!.uid, e.target.checked); await loadPartners(); }} /></td>
                    <td>{o.name}{o.claimed ? '' : <span className="muted"> · unclaimed</span>}</td>
                    <td>{c.home}</td><td>{c.referred}</td><td>{c.interested}</td>
                    <td><code>{event.public_url}?ref={o.id}</code></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {interest.length > 0 && (
        <div className="card form-card">
          <h2>Tell me when tickets open ({interest.length})</h2>
          <p className="muted">They agreed to one email about this. Not a newsletter list.</p>
          <button className="btn ghost small" onClick={() => download('interest.csv', ['name,email,space', ...interest.map((i) => [i.name, i.email, (i.home_space_id && byId.get(i.home_space_id)?.name) ?? ''].map(csvEsc).join(','))].join('\n'))}>Download CSV</button>
        </div>
      )}
    </>
  );
}

function PeopleList({ title, hint, rows, note }: { title: string; hint: string; rows: WithId<Reg>[]; note: (r: Reg) => string }) {
  if (!rows.length) return null;
  return (
    <div className="card form-card">
      <h2>{title} ({rows.length})</h2>
      <p className="muted">{hint}</p>
      <ul>{rows.map((r) => <li key={r.id}><strong>{r.name}</strong> · <a href={`mailto:${r.email}`}>{r.email}</a>{note(r) && <span className="muted"> · {note(r)}</span>}{r.answers.relationship.length > 0 && <div className="muted">{r.answers.relationship.map(relWord).join('; ')}</div>}</li>)}</ul>
    </div>
  );
}

// ---------- settings: the event record itself ----------

function SettingsTab({ id, event, onChange }: { id: string; event: EventDoc; onChange: () => Promise<void> }) {
  const { sponsors: _sponsors, updated_at: _u, ...editable } = event;
  const [text, setText] = useState(JSON.stringify(editable, null, 2));
  const [msg, setMsg] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const setStatus = async (status: EventDoc['status']) => {
    setProblem(null);
    try { await updateDoc(doc(db, 'events', id), { status, updated_at: isoNow() }); await onChange(); setText(JSON.stringify({ ...editable, status }, null, 2)); }
    catch (e) { setProblem(e instanceof Error ? e.message : String(e)); }
  };
  return (
    <>
      <div className="card form-card">
        <h2>Status: {event.status}</h2>
        <p className="muted">
          <strong>announced</strong>: the page is public by its address, with sponsorship and "tell me when tickets open".{' '}
          <strong>open</strong>: tickets on sale; refused until the terms are filled in.{' '}
          <strong>closed</strong>: page stays up, no more tickets.
        </p>
        <div className="btn-row">
          {(['draft', 'announced', 'open', 'closed', 'cancelled'] as const).map((st) => (
            <button key={st} className={`btn ${event.status === st ? '' : 'ghost'} small`} disabled={event.status === st} onClick={() => void setStatus(st)}>{st}</button>
          ))}
        </div>
      </div>
      <div className="card form-card">
        <h2>The event record</h2>
        <p className="muted">Everything on the public page, including prices and capacity. Raise <code>capacity</code> only once the extra room is secured; then offer places from the waitlist.</p>
        <textarea rows={24} style={{ width: '100%', fontFamily: 'monospace', fontSize: '0.85rem' }} value={text} onChange={(e) => { setText(e.target.value); setMsg(null); }} />
        {problem && <p className="error">{problem}</p>}
        <div className="btn-row">
          <button className="btn" onClick={async () => {
            setProblem(null);
            try {
              const next = JSON.parse(text) as Partial<EventDoc>;
              await setDoc(doc(db, 'events', id), { ...next, sponsors: event.sponsors, updated_at: isoNow() });
              await onChange(); setMsg('Saved');
            } catch (e) { setProblem(e instanceof Error ? e.message : String(e)); }
          }}>Save</button>
          {msg && <span className="muted">{msg}</span>}
        </div>
      </div>
    </>
  );
}
