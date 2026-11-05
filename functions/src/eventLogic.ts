// Pure decisions for event registration and sponsorship: what a ticket costs,
// whether there is room, whether a payment settles a registration. No I/O, so
// every money-handling branch is tested in test/events.test.mjs without
// Firestore or Stripe. events.ts does the reading and writing.
//
// The one rule this file exists to keep: the browser never states a price, a
// status or a capacity. Trail Team's registration took `amountDue` from the
// client and the webhook then credited against that number; here the only
// amount a payment is compared with is one the server read from the event.

import { createHmac, timingSafeEqual } from 'node:crypto';

export interface TicketTier {
  id: string;
  name: string;
  description: string;
  price_cents: number;
  /** How many may be sold at this tier; null means only the event's capacity limits it. */
  limit: number | null;
  /** Hidden from the page and usable only with a code: sponsor seats, facilitators, staff. */
  requires_code: boolean;
  /** Person must confirm a statement to choose it (the scholarship tier). */
  attestation: string | null;
}

export interface SponsorTier {
  id: string;
  name: string;
  amount_cents: number;
  benefits: string[];
  /** How many may be sold; null means no limit. */
  slots: number | null;
}

export type EventStatus = 'draft' | 'announced' | 'open' | 'closed' | 'cancelled';

export interface EventDoc {
  title: string;
  status: EventStatus;
  region_id: string | null;
  capacity: number;
  min_age: number | null;
  asks_over_21: boolean;
  tiers: TicketTier[];
  sponsor_tiers: SponsorTier[];
  tracks: { id: string; label: string }[];
  terms_version: string;
  statement_descriptor: string;
  starts_at: string | null;
  ends_at: string | null;
  location: string;
  /** Until this moment an attendee can refund their own ticket; null means no self-service refunds. */
  refund_until: string | null;
  /** The organisation whose Stripe account takes the money. Only 'makehaven' is configured today. */
  payment_host: string;
  notify_email: string;
}

export type RegStatus = 'pending_payment' | 'confirmed' | 'waitlisted' | 'offered' | 'cancelled' | 'expired' | 'refunded';

export interface RegRow {
  status: RegStatus;
  tier_id: string;
  code: string | null;
  email_lower: string;
  hold_expires_at: string | null;
  price_cents: number;
  stripe_session_id: string | null;
  stripe_payment_intent: string | null;
}

// ---------- capacity ----------

/** A seat is taken by anyone confirmed, anyone offered a place, and anyone
 *  part-way through paying whose hold has not lapsed. Counted from the rows
 *  every time rather than from a counter, so it cannot drift. */
export function holdsSeat(r: Pick<RegRow, 'status' | 'hold_expires_at'>, nowMs: number): boolean {
  if (r.status === 'confirmed' || r.status === 'offered') return true;
  if (r.status !== 'pending_payment') return false;
  return !!r.hold_expires_at && Date.parse(r.hold_expires_at) > nowMs;
}

export const seatsTaken = (rows: Pick<RegRow, 'status' | 'hold_expires_at'>[], nowMs: number) =>
  rows.filter((r) => holdsSeat(r, nowMs)).length;

export const tierTaken = (rows: Pick<RegRow, 'status' | 'hold_expires_at' | 'tier_id'>[], tierId: string, nowMs: number) =>
  rows.filter((r) => r.tier_id === tierId && holdsSeat(r, nowMs)).length;

export type TicketDecision =
  | { ok: false; code: 'closed' | 'no_such_tier' | 'needs_code' | 'bad_code' | 'code_used_up' | 'tier_sold_out' | 'attestation_required' }
  | { ok: true; tier: TicketTier; status: 'pending_payment' | 'confirmed' | 'waitlisted'; price_cents: number; code: string | null };

export interface CodeDoc { tier_id: string; max_uses: number }

/** Decides what happens to one request for one ticket. */
export function decideTicket(
  ev: Pick<EventDoc, 'status' | 'capacity' | 'tiers'>,
  rows: Pick<RegRow, 'status' | 'hold_expires_at' | 'tier_id' | 'code'>[],
  req: { tier_id: string; code: string | null; attested: boolean },
  codeDoc: CodeDoc | null,
  nowMs: number,
): TicketDecision {
  if (ev.status !== 'open') return { ok: false, code: 'closed' };

  let tier = ev.tiers.find((t) => t.id === req.tier_id);
  let code: string | null = null;
  if (req.code) {
    // A code names its own tier, whichever tier the form happened to have selected.
    if (!codeDoc) return { ok: false, code: 'bad_code' };
    tier = ev.tiers.find((t) => t.id === codeDoc.tier_id);
    if (!tier) return { ok: false, code: 'bad_code' };
    const used = rows.filter((r) => r.code === req.code && holdsSeat(r, nowMs)).length;
    if (used >= codeDoc.max_uses) return { ok: false, code: 'code_used_up' };
    code = req.code;
  }
  if (!tier) return { ok: false, code: 'no_such_tier' };
  if (tier.requires_code && !code) return { ok: false, code: 'needs_code' };
  if (tier.attestation && !req.attested) return { ok: false, code: 'attestation_required' };
  if (tier.limit !== null && tierTaken(rows, tier.id, nowMs) >= tier.limit) return { ok: false, code: 'tier_sold_out' };

  if (seatsTaken(rows, nowMs) >= ev.capacity) {
    return { ok: true, tier, status: 'waitlisted', price_cents: tier.price_cents, code };
  }
  return { ok: true, tier, status: tier.price_cents === 0 ? 'confirmed' : 'pending_payment', price_cents: tier.price_cents, code };
}

// ---------- payments ----------

export interface SessionFacts {
  id: string;
  payment_intent: string;
  payment_status: string;
  amount_total: number;
  currency: string;
}

export type PaymentOutcome =
  | { action: 'credit' }
  /** Paid after the hold lapsed or the row was cancelled: the money is real, so honour it and flag it. */
  | { action: 'credit_flagged'; issue: string }
  | { action: 'duplicate' }
  | { action: 'ignore'; reason: string }
  | { action: 'flag'; issue: string };

/** What a verified checkout.session.completed does to a registration. */
export function evaluatePayment(s: SessionFacts, r: Pick<RegRow, 'status' | 'price_cents' | 'stripe_payment_intent' | 'stripe_session_id'>): PaymentOutcome {
  if (r.stripe_payment_intent && r.stripe_payment_intent === s.payment_intent) return { action: 'duplicate' };
  if (s.payment_status !== 'paid') return { action: 'ignore', reason: `payment_status ${s.payment_status}` };
  if (s.currency !== 'usd') return { action: 'flag', issue: `paid in ${s.currency}` };
  if (!Number.isInteger(s.amount_total) || s.amount_total < r.price_cents) {
    return { action: 'flag', issue: `underpaid: ${s.amount_total} of ${r.price_cents} cents` };
  }
  if (r.status === 'confirmed' && r.stripe_payment_intent) {
    return { action: 'flag', issue: `second payment ${s.payment_intent}; refund one` };
  }
  if (r.status === 'refunded') return { action: 'flag', issue: `paid again after refund: ${s.payment_intent}` };
  if (r.status === 'cancelled' || r.status === 'expired') {
    return { action: 'credit_flagged', issue: `paid after the registration was ${r.status}; confirmed anyway, check capacity` };
  }
  return { action: 'credit' };
}

export type RefundOutcome = { status: 'refunded' | null; amount_refunded: number };

/** Stripe reports refunds cumulatively. Only a full refund releases the seat;
 *  a partial one (a scholarship adjustment, say) keeps the person registered. */
export function evaluateRefund(amountRefunded: number, amountCharged: number): RefundOutcome {
  return { status: amountRefunded >= amountCharged && amountCharged > 0 ? 'refunded' : null, amount_refunded: amountRefunded };
}

/** A person may undo their own paid ticket only until the catering count locks. */
export function canSelfRefund(r: Pick<RegRow, 'status' | 'stripe_payment_intent'> & { amount_paid_cents: number }, refundUntil: string | null, nowMs: number): boolean {
  return r.status === 'confirmed' && r.amount_paid_cents > 0 && !!r.stripe_payment_intent
    && !!refundUntil && nowMs < Date.parse(refundUntil);
}

/** A held place can be handed to someone else, but not to someone already holding one. */
export function canTransfer(r: Pick<RegRow, 'status'>, targetRow: Pick<RegRow, 'status' | 'hold_expires_at'> | undefined, nowMs: number): boolean {
  if (r.status !== 'confirmed') return false;
  return !targetRow || !(holdsSeat(targetRow, nowMs) || targetRow.status === 'waitlisted');
}

// ---------- Stripe webhook signature ----------
// Stripe's documented scheme, so the SDK is not needed for one header. Header
// is `t=<unix>,v1=<hex>[,v1=<hex>]`; each v1 is HMAC-SHA256(secret, `${t}.${body}`).

export const SIGNATURE_TOLERANCE_S = 5 * 60;

export function verifyStripeSignature(rawBody: string, header: string, secret: string, nowS: number): boolean {
  if (!rawBody || !header || !secret) return false;
  let t = NaN;
  const candidates: string[] = [];
  for (const part of header.split(',')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (k === 't') t = Number(v);
    if (k === 'v1') candidates.push(v);
  }
  if (!Number.isFinite(t) || Math.abs(nowS - t) > SIGNATURE_TOLERANCE_S || !candidates.length) return false;
  const want = Buffer.from(createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex'));
  return candidates.some((c) => {
    const got = Buffer.from(c);
    return got.length === want.length && timingSafeEqual(got, want);
  });
}

/** A test key must not settle a live registration, nor the reverse. */
export const keyIsLive = (key: string) => /^(sk|rk)_live_/.test(key);

// ---------- what a person sends ----------

export const RELATIONSHIPS = ['space_leader', 'space_member', 'independent_maker', 'entrepreneur', 'software_builder', 'student_faculty', 'partner', 'curious'] as const;
/** What would help most. Same vocabulary as a maker profile's "looking for". */
export const LOOKING_FOR = ['tool_access', 'collaborators', 'learning', 'customers', 'fabricators', 'cofounders_funding', 'teaching_opportunities', 'community'] as const;
export const CONSENT_KEYS = ['attendee_list', 'peer_contact', 'followup', 'network', 'space_share', 'space_intro'] as const;
export type ConsentKey = typeof CONSENT_KEYS[number];
export type Consents = Record<ConsentKey, boolean>;

export interface Answers {
  relationship: string[];
  home_space_id: string | null;
  home_space_other: string;
  looking_for_space: boolean;
  looking_for: string[];
  town: string;
  organization: string;
  unconference_before: boolean | null;
  excited: string;
  challenged: string;
  makes: string;
  offer_session: string;
  tracks: string[];
  dietary: string;
  access_needs: string;
  over_21: boolean | null;
}

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const emailOk = (e: string) => e.length <= 200 && EMAIL.test(e);
export const SPACE_ID = /^[a-z0-9-]{1,80}$/;

/** Every opt-in defaults to off: only a literal `true` counts. */
export function cleanConsents(v: unknown): Consents {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  return Object.fromEntries(CONSENT_KEYS.map((k) => [k, o[k] === true])) as Consents;
}

export function cleanAnswers(v: unknown, trackIds: string[]): Answers {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const list = (x: unknown) => (Array.isArray(x) ? x.filter((i): i is string => typeof i === 'string') : []);
  const homeId = str(o.home_space_id, 80);
  return {
    relationship: list(o.relationship).filter((r) => (RELATIONSHIPS as readonly string[]).includes(r)),
    home_space_id: SPACE_ID.test(homeId) ? homeId : null,
    home_space_other: str(o.home_space_other, 120),
    looking_for_space: o.looking_for_space === true,
    looking_for: list(o.looking_for).filter((x) => (LOOKING_FOR as readonly string[]).includes(x)),
    town: str(o.town, 80),
    organization: str(o.organization, 160),
    unconference_before: typeof o.unconference_before === 'boolean' ? o.unconference_before : null,
    excited: str(o.excited, 800),
    challenged: str(o.challenged, 800),
    makes: str(o.makes, 500),
    offer_session: str(o.offer_session, 500),
    tracks: list(o.tracks).filter((t) => trackIds.includes(t)),
    dietary: str(o.dietary, 200),
    access_needs: str(o.access_needs, 300),
    over_21: typeof o.over_21 === 'boolean' ? o.over_21 : null,
  };
}

export type PersonInput = { name: string; email: string };

export function cleanPerson(body: Record<string, unknown>): PersonInput | { error: string } {
  const name = str(body.name, 120);
  const email = str(body.email, 200).toLowerCase();
  if (!name) return { error: 'Please give your name.' };
  if (!emailOk(email)) return { error: 'That email address does not look right.' };
  return { name, email };
}

/** Only return to our own hosts, so a checkout cannot be used as an open redirect. */
export function returnOrigin(origin: string | undefined, allowLocal: boolean): string {
  const fallback = 'https://makerspace.network';
  if (!origin) return fallback;
  try {
    const u = new URL(origin);
    if (u.protocol === 'https:' && (u.hostname === 'makerspace.network' || u.hostname.endsWith('.makerspace.network'))) return u.origin;
    if (allowLocal && (u.hostname === 'localhost' || u.hostname === '127.0.0.1')) return u.origin;
  } catch { /* fall through */ }
  return fallback;
}

// ---------- what the public may see ----------

export interface PublicStats {
  registered: number;
  spots_left: number;
  spaces: string[];
  tiers_sold_out: string[];
  sponsor_tiers_full: string[];
  updated_at: string;
}

export function publicStats(
  ev: Pick<EventDoc, 'capacity' | 'tiers' | 'sponsor_tiers'>,
  rows: (Pick<RegRow, 'status' | 'hold_expires_at' | 'tier_id'> & { home_space_id: string | null })[],
  sponsorsByTier: Record<string, number>,
  spaceName: (id: string) => string | null,
  nowMs: number,
  nowIso: string,
): PublicStats {
  const confirmed = rows.filter((r) => r.status === 'confirmed');
  const names = new Set<string>();
  for (const r of confirmed) {
    const n = r.home_space_id ? spaceName(r.home_space_id) : null;
    if (n) names.add(n);
  }
  return {
    registered: confirmed.length,
    spots_left: Math.max(0, ev.capacity - seatsTaken(rows, nowMs)),
    spaces: [...names].sort(),
    tiers_sold_out: ev.tiers.filter((t) => t.limit !== null && tierTaken(rows, t.id, nowMs) >= t.limit).map((t) => t.id),
    sponsor_tiers_full: ev.sponsor_tiers.filter((t) => t.slots !== null && (sponsorsByTier[t.id] ?? 0) >= t.slots).map((t) => t.id),
    updated_at: nowIso,
  };
}
