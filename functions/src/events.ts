// Event registration and sponsorship: the one part of the network where the
// write path has to run on a server, because money is involved and the buyer
// has no account. Rules forbid clients from creating or settling registrations
// (firestore.rules); every function here is the only way those rows change.
// The decisions are in eventLogic.ts. Spec: docs/EVENTS.md.
//
//   eventRegister     a ticket request → a confirmed row, a waitlist row, or a Stripe Checkout
//   eventManage       the attendee's emailed link: see, edit opt-ins, pay, cancel, who's coming
//   eventInterest     "tell me when tickets open", before they do
//   eventSponsor      a sponsor's form → an inquiry, or a Stripe Checkout
//   eventStripeWebhook Stripe's word on what was paid, expired or refunded
//   eventRegistrationChanged / eventSponsorChanged / eventChanged
//                     public counts, per-space counts, and email

import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore, type Transaction } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { onRequest, type Request } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { POSTMARK_FROM_EMAIL, POSTMARK_SERVER_TOKEN, SITE } from './postmark';
import { meetingIcs } from './ics';
import { linkAttendance } from './makers';
import {
  type Answers, type CodeDoc, type Consents, type EventDoc, type RegRow, type RegStatus,
  CONSENT_KEYS, SPACE_ID, canSelfRefund, canTransfer, cleanAnswers, cleanConsents, cleanPerson, decideTicket, evaluatePayment, evaluateRefund,
  holdsSeat, keyIsLive, publicStats, returnOrigin, verifyStripeSignature,
} from './eventLogic';

// MakeHaven is the fiduciary for Maker Bonanza, so the money lands in its
// account. A restricted key, not the account's full secret key: see
// docs/EVENTS.md §Connecting Stripe.
const STRIPE_KEY = defineSecret('STRIPE_KEY_MAKEHAVEN');
const STRIPE_WEBHOOK_SECRET = defineSecret('STRIPE_WEBHOOK_SECRET_MAKEHAVEN');

const isEmulator = process.env.FUNCTIONS_EMULATOR === 'true';
/** Tests point this at a stand-in. Honoured only in the emulator, so a stray
 *  environment variable can never redirect live card traffic. */
const STRIPE_API = (isEmulator && process.env.STRIPE_API_BASE) || 'https://api.stripe.com';

/** Stripe's minimum session life is 30 minutes; the seat is held a minute longer. */
const HOLD_MS = 31 * 60_000;
const REGION = 'us-central1';

const db = () => getFirestore();
const nowIso = () => new Date().toISOString();
const sha = (s: string) => createHash('sha256').update(s).digest('hex');

export const registrationId = (eventId: string, email: string) => sha(`${eventId}|${email}`).slice(0, 32);

const eventRef = (id: string) => db().doc(`events/${id}`);
const regsOf = (eventId: string) => db().collection('event_registrations').where('event_id', '==', eventId);
/** Touched by every seat-changing transaction, so two of them serialize even
 *  though Firestore transactions don't lock a query's absent rows. */
const lockRef = (eventId: string) => db().doc(`event_locks/${eventId}`);
const secretRef = (regId: string) => db().doc(`event_registration_secrets/${regId}`);

interface RegDoc extends RegRow {
  event_id: string; region_id: string | null; name: string; email: string; tier_name: string;
  amount_paid_cents: number; amount_refunded_cents: number; paid_at: string | null;
  answers: Answers; home_space_id: string | null; referred_by: string | null; consents: Consents;
  terms_version: string; terms_accepted_at: string; payment_issue: string | null;
  attended: boolean | null; checked_in_at: string | null; offered_at: string | null;
  resend_requested_at: string | null; created_at: string; updated_at: string;
}

// ---------- small helpers ----------

class Refused extends Error { constructor(public http: number, public code: string, msg: string) { super(msg); } }

/** Wraps a browser-facing endpoint: same-origin POST, JSON, friendly refusals,
 *  and a real 500 for anything unexpected. */
function endpoint(secrets: ReturnType<typeof defineSecret>[], fn: (req: Request, body: Record<string, unknown>) => Promise<Record<string, unknown>>) {
  return onRequest({ secrets, region: REGION, invoker: 'public', maxInstances: 10 }, async (req, res) => {
    if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return; }
    try {
      const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
      res.json(await fn(req, body));
    } catch (e) {
      if (e instanceof Refused) { res.status(e.http).json({ code: e.code, error: e.message }); return; }
      logger.error('event endpoint failed', e);
      res.status(500).json({ code: 'error', error: 'Something went wrong on our side. Nothing was charged. Please try again.' });
    }
  });
}

/** Hosting passes the visitor's address in this header; the socket is Hosting's. */
const clientIp = (req: Request) => String(req.get('fastly-client-ip') || req.get('x-forwarded-for')?.split(',')[0] || req.ip || 'unknown').trim();

async function rateLimit(req: Request, bucket: string, perHour: number) {
  const ref = db().doc(`event_rate_limits/${sha(`${bucket}|${clientIp(req)}`)}`);
  const allowed = await db().runTransaction(async (tx) => {
    const d = (await tx.get(ref)).data() as { window: number; n: number } | undefined;
    const window = Math.floor(Date.now() / 3_600_000);
    const n = d?.window === window ? d.n : 0;
    if (n >= perHour) return false;
    tx.set(ref, { window, n: n + 1 });
    return true;
  });
  if (!allowed) throw new Refused(429, 'rate_limited', 'Too many attempts from this connection. Please try again in an hour.');
}

async function loadEvent(id: unknown): Promise<EventDoc & { id: string }> {
  if (typeof id !== 'string' || !SPACE_ID.test(id)) throw new Refused(404, 'no_event', 'No such event.');
  const snap = await eventRef(id).get();
  if (!snap.exists || snap.get('status') === 'draft') throw new Refused(404, 'no_event', 'No such event.');
  return { id, ...(snap.data() as EventDoc) };
}

/** Accepts only organisations that exist, so a typed URL cannot put an
 *  arbitrary name on the page or in a space's counts. */
async function knownSpace(id: unknown): Promise<string | null> {
  if (typeof id !== 'string' || !SPACE_ID.test(id)) return null;
  return (await db().doc(`spaces_index/${id}`).get()).exists ? id : null;
}

const money = (cents: number) => `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`;

// ---------- Stripe ----------

async function stripe<T>(path: string, params: Record<string, string>, idempotencyKey?: string): Promise<T> {
  const res = await fetch(`${STRIPE_API}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${STRIPE_KEY.value()}`, 'Content-Type': 'application/x-www-form-urlencoded',
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
    },
    body: new URLSearchParams(params).toString(),
  });
  if (!res.ok) throw new Error(`stripe ${path} ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return await res.json() as T;
}

type Kind = 'registration' | 'sponsor';

/** Card only, deliberately: bank debits settle days later, and a seat should
 *  not be in doubt that long. Sponsors who want ACH or a cheque ask for an invoice. */
async function createCheckout(o: {
  kind: Kind; ref: string; eventId: string; name: string; description: string; amount_cents: number; email: string;
  descriptor: string; successUrl: string; cancelUrl: string; idempotencyKey: string; expiresAtMs: number;
}): Promise<{ id: string; url: string }> {
  // Stripe copies these onto the session and the payment, so a refund made in
  // the dashboard can find its way back, and Xero can see which event it was.
  const meta = { mn_kind: o.kind, mn_ref: o.ref, mn_event: o.eventId };
  const params: Record<string, string> = {
    mode: 'payment',
    'payment_method_types[0]': 'card',
    'line_items[0][quantity]': '1',
    'line_items[0][price_data][currency]': 'usd',
    'line_items[0][price_data][unit_amount]': String(o.amount_cents),
    'line_items[0][price_data][product_data][name]': o.name,
    ...(o.description ? { 'line_items[0][price_data][product_data][description]': o.description.slice(0, 300) } : {}),
    customer_email: o.email,
    client_reference_id: o.ref,
    success_url: o.successUrl,
    cancel_url: o.cancelUrl,
    expires_at: String(Math.floor(o.expiresAtMs / 1000)),
    ...(o.descriptor ? { 'payment_intent_data[statement_descriptor_suffix]': o.descriptor.slice(0, 22) } : {}),
  };
  for (const [k, v] of Object.entries(meta)) {
    params[`metadata[${k}]`] = v;
    params[`payment_intent_data[metadata][${k}]`] = v;
  }
  return stripe('/v1/checkout/sessions', params, o.idempotencyKey);
}

/** Best effort: a superseded session should not stay payable. If it fails and
 *  someone pays both, the webhook flags the second payment for a refund. */
async function expireSession(id: string | null) {
  if (!id) return;
  try { await stripe(`/v1/checkout/sessions/${id}/expire`, {}); }
  catch (e) { logger.warn('could not expire checkout session', { id, e: String(e) }); }
}

const manageUrl = (origin: string, eventId: string, regId: string, token: string) =>
  `${origin}/?page=event&event=${encodeURIComponent(eventId)}&r=${regId}&t=${token}`;

// ---------- register ----------

export const eventRegister = endpoint([STRIPE_KEY], async (req, body) => {
  // A form filled by a bot is told it worked and nothing happens.
  if (typeof body.website === 'string' && body.website) return { outcome: 'waitlisted' };
  await rateLimit(req, 'register', 30);

  const ev = await loadEvent(body.event_id);
  const person = cleanPerson(body);
  if ('error' in person) throw new Refused(400, 'bad_person', person.error);
  if (body.terms !== true) throw new Refused(400, 'terms', 'Please accept the event terms.');
  if (ev.min_age && body.age_ok !== true) throw new Refused(400, 'age', `This event is for people ${ev.min_age} and older.`);

  const answers = cleanAnswers(body.answers, ev.tracks.map((t) => t.id));
  answers.home_space_id = await knownSpace(answers.home_space_id);
  const referredBy = await knownSpace(body.ref);
  const consents = cleanConsents(body.consents);
  const codeRaw = typeof body.code === 'string' ? body.code.trim().toUpperCase().slice(0, 40) : '';
  const code = codeRaw || null;
  const tierId = typeof body.tier_id === 'string' ? body.tier_id : '';
  const origin = returnOrigin(req.get('origin'), isEmulator);
  const attempt = randomUUID();
  const now = Date.now();

  const REFUSALS: Record<string, string> = {
    closed: 'Registration is not open.',
    no_such_tier: 'Please choose a ticket.',
    needs_code: 'That ticket needs a code.',
    bad_code: 'That code is not one we recognise.',
    code_used_up: 'That code has been used as many times as it allows.',
    tier_sold_out: 'That ticket has sold out.',
    attestation_required: 'Please confirm the statement for that ticket.',
  };

  const result = await db().runTransaction(async (tx) => {
    await tx.get(lockRef(ev.id));
    const fresh = (await tx.get(eventRef(ev.id))).data() as EventDoc;
    const rowsSnap = await tx.get(regsOf(ev.id));
    // Find this person by address, not by id: a transferred ticket keeps its
    // original id, so the id derived from an address may belong to someone else.
    const existing = rowsSnap.docs.find((d) => d.get('email_lower') === person.email);
    const prior = existing?.data() as RegDoc | undefined;
    const hashed = registrationId(ev.id, person.email);
    const regId = existing?.id ?? (rowsSnap.docs.some((d) => d.id === hashed) ? randomBytes(16).toString('hex') : hashed);
    const regRef = db().doc(`event_registrations/${regId}`);

    // Someone already holding a place gets their link by email, never on screen,
    // so typing another person's address cannot open their registration or
    // change it. It does reveal that the address is registered; a page that
    // sells tickets has no good way not to.
    if (prior && (prior.status === 'confirmed' || prior.status === 'waitlisted' || prior.status === 'offered')) {
      tx.update(regRef, { resend_requested_at: new Date(now).toISOString() });
      return { kind: 'already' as const };
    }

    const others = rowsSnap.docs.filter((d) => d.id !== regId).map((d) => d.data() as RegRow);
    let codeDoc: CodeDoc | null = null;
    if (code) {
      const c = await tx.get(db().doc(`event_codes/${ev.id}~${code}`));
      codeDoc = c.exists ? (c.data() as CodeDoc) : null;
    }
    const d = decideTicket(fresh, others, { tier_id: tierId, code, attested: body.attested === true }, codeDoc, now);
    if (!d.ok) throw new Refused(409, d.code, REFUSALS[d.code]);

    const iso = new Date(now).toISOString();
    const doc: RegDoc = {
      event_id: ev.id, region_id: fresh.region_id, name: person.name, email: person.email, email_lower: person.email,
      tier_id: d.tier.id, tier_name: d.tier.name, price_cents: d.price_cents, code: d.code, status: d.status,
      hold_expires_at: d.status === 'pending_payment' ? new Date(now + HOLD_MS).toISOString() : null,
      stripe_session_id: null, stripe_payment_intent: null, amount_paid_cents: 0, amount_refunded_cents: 0, paid_at: null,
      answers, home_space_id: answers.home_space_id, referred_by: referredBy, consents,
      terms_version: fresh.terms_version, terms_accepted_at: iso, payment_issue: null,
      attended: null, checked_in_at: null, offered_at: null, resend_requested_at: null,
      created_at: prior?.created_at ?? iso, updated_at: iso,
    };
    tx.set(regRef, doc);
    tx.set(lockRef(ev.id), { touched_at: iso });
    const token = randomBytes(24).toString('hex');
    tx.set(secretRef(regId), { manage_token: token });
    return { kind: 'written' as const, regId, regRef, doc, token, priorSession: prior?.stripe_session_id ?? null, tierDescription: d.tier.description };
  });

  if (result.kind === 'already') return { outcome: 'already' };
  const { regId, regRef, doc, token, priorSession } = result;
  const manage = manageUrl(origin, ev.id, regId, token);
  if (doc.status !== 'pending_payment') return { outcome: doc.status, manage_url: manage };

  await expireSession(priorSession);
  try {
    const session = await createCheckout({
      kind: 'registration', ref: regId, eventId: ev.id, name: `${ev.title}: ${doc.tier_name}`, description: result.tierDescription,
      amount_cents: doc.price_cents, email: doc.email, descriptor: ev.statement_descriptor,
      successUrl: `${manage}&paid=1`, cancelUrl: manage, idempotencyKey: attempt, expiresAtMs: now + 30.5 * 60_000,
    });
    await regRef.update({ stripe_session_id: session.id });
    return { outcome: 'checkout', checkout_url: session.url, manage_url: manage };
  } catch (e) {
    // Stripe unreachable: give the seat straight back rather than holding it for half an hour.
    logger.error('checkout failed', e);
    await regRef.update({ status: 'expired', hold_expires_at: null, updated_at: nowIso() });
    throw new Refused(502, 'stripe', 'We could not reach the card processor. You have not been charged. Please try again in a moment.');
  }
});

// ---------- the attendee's own link ----------

async function authorised(body: Record<string, unknown>) {
  const regId = typeof body.r === 'string' && /^[a-f0-9]{32}$/.test(body.r) ? body.r : null;
  const token = typeof body.t === 'string' ? body.t : '';
  const refuse = new Refused(404, 'no_registration', 'This link is not valid. Check the most recent email we sent you.');
  if (!regId || !token) throw refuse;
  const secret = (await secretRef(regId).get()).get('manage_token') as string | undefined;
  if (!secret) throw refuse;
  const a = Buffer.from(sha(secret)); const b = Buffer.from(sha(token));
  if (!timingSafeEqual(a, b)) throw refuse;
  const ref = db().doc(`event_registrations/${regId}`);
  const snap = await ref.get();
  if (!snap.exists) throw refuse;
  return { regId, token, ref, reg: snap.data() as RegDoc };
}

const viewOf = (r: RegDoc, refundUntil: string | null = null) => ({
  event_id: r.event_id, name: r.name, email: r.email, status: r.status, tier_name: r.tier_name, price_cents: r.price_cents,
  answers: r.answers, consents: r.consents, amount_paid_cents: r.amount_paid_cents,
  can_pay: r.price_cents > 0 && ['pending_payment', 'offered', 'expired'].includes(r.status),
  can_accept_free: r.price_cents === 0 && r.status === 'offered',
  // A free ticket costs nothing to give back, and frees a seat for someone else.
  can_cancel: ['pending_payment', 'offered', 'waitlisted', 'expired'].includes(r.status) || (r.status === 'confirmed' && r.price_cents === 0),
  can_refund: canSelfRefund(r, refundUntil, Date.now()),
  can_transfer: r.status === 'confirmed',
  refund_until: refundUntil,
});

export const eventManage = endpoint([STRIPE_KEY], async (req, body) => {
  await rateLimit(req, 'manage', 200);
  const { regId, token, ref, reg } = await authorised(body);
  const action = body.action ?? 'view';

  const refundUntil = (await eventRef(reg.event_id).get()).get('refund_until') as string | null ?? null;
  if (action === 'view') return viewOf(reg, refundUntil);

  if (action === 'update') {
    const ev = (await eventRef(reg.event_id).get()).data() as EventDoc;
    const answers = cleanAnswers(body.answers, ev.tracks.map((t) => t.id));
    answers.home_space_id = await knownSpace(answers.home_space_id);
    const consents = cleanConsents(body.consents);
    const changed = CONSENT_KEYS.filter((k) => reg.consents[k] !== consents[k]);
    const iso = nowIso();
    const batch = db().batch();
    batch.update(ref, { answers, consents, home_space_id: answers.home_space_id, updated_at: iso });
    // One row per decision, the same shape of record Nexus keeps for consent
    // events: what changed, who decided, when. The person is the actor here.
    if (changed.length) {
      batch.create(db().collection('audit').doc(), {
        actor: `registration:${regId}`, action: 'event.consent_changed',
        details: { event_id: reg.event_id, changes: Object.fromEntries(changed.map((k) => [k, consents[k]])) }, created_at: iso,
      });
    }
    await batch.commit();
    return viewOf({ ...reg, answers, consents, home_space_id: answers.home_space_id }, refundUntil);
  }

  if (action === 'cancel') {
    if (!viewOf(reg).can_cancel) throw new Refused(409, 'paid', 'This ticket is paid for. Reply to your confirmation email and the organisers will sort out a refund.');
    await expireSession(reg.stripe_session_id);
    await ref.update({ status: 'cancelled', hold_expires_at: null, updated_at: nowIso() });
    return viewOf({ ...reg, status: 'cancelled' }, refundUntil);
  }

  // Self-service, so a refund request is never a job for an organiser. Stripe's
  // idempotency key makes a double click one refund. The webhook also arrives
  // and agrees; this write just means the person sees the result straight away.
  if (action === 'refund') {
    if (!canSelfRefund(reg, refundUntil, Date.now())) throw new Refused(409, 'no_refund', 'Refunds have closed for this ticket. You can still transfer it to someone else.');
    try {
      await stripe('/v1/refunds', { payment_intent: reg.stripe_payment_intent! }, `refund-${reg.stripe_payment_intent}`);
    } catch (e) {
      logger.error('refund failed', { regId, e: String(e) });
      throw new Refused(502, 'stripe', 'We could not reach the card processor. Nothing has changed. Please try again in a moment.');
    }
    const iso = nowIso();
    await ref.update({ status: 'refunded', amount_refunded_cents: reg.amount_paid_cents, updated_at: iso });
    await db().collection('audit').add({ actor: `registration:${regId}`, action: 'event.self_refund', details: { event_id: reg.event_id, cents: reg.amount_paid_cents }, created_at: iso });
    return viewOf({ ...reg, status: 'refunded' }, refundUntil);
  }

  // Hands the place to someone else. Answers and opt-ins are personal, so the new
  // holder starts blank; the old link stops working and the new one goes to them.
  if (action === 'transfer') {
    const to = cleanPerson(body);
    if ('error' in to) throw new Refused(400, 'bad_person', to.error);
    const ev = (await eventRef(reg.event_id).get()).data() as EventDoc;
    await db().runTransaction(async (tx) => {
      await tx.get(lockRef(reg.event_id));
      const fresh = (await tx.get(ref)).data() as RegDoc;
      const rows = await tx.get(regsOf(reg.event_id));
      const target = rows.docs.find((d) => d.id !== regId && d.get('email_lower') === to.email)?.data() as RegRow | undefined;
      if (fresh.status !== 'confirmed') throw new Refused(409, 'not_confirmed', 'Only a confirmed ticket can be transferred.');
      if (!canTransfer(fresh, target, Date.now())) throw new Refused(409, 'has_ticket', 'That person is already registered.');
      const iso = nowIso();
      tx.update(ref, {
        name: to.name, email: to.email, email_lower: to.email,
        answers: cleanAnswers({}, ev.tracks.map((t) => t.id)), home_space_id: null, consents: cleanConsents({}),
        resend_requested_at: iso, updated_at: iso,
      });
      tx.set(secretRef(regId), { manage_token: randomBytes(24).toString('hex') });
      tx.set(db().collection('audit').doc(), { actor: `registration:${regId}`, action: 'event.transfer', details: { event_id: reg.event_id }, created_at: iso });
    });
    return { transferred: true };
  }

  if (action === 'accept_free') {
    if (!viewOf(reg).can_accept_free) throw new Refused(409, 'not_offered', 'There is no place waiting on this registration.');
    await ref.update({ status: 'confirmed', updated_at: nowIso() });
    return viewOf({ ...reg, status: 'confirmed' }, refundUntil);
  }

  if (action === 'pay') {
    const origin = returnOrigin(req.get('origin'), isEmulator);
    const now = Date.now();
    const out = await db().runTransaction(async (tx: Transaction) => {
      await tx.get(lockRef(reg.event_id));
      const fresh = (await tx.get(ref)).data() as RegDoc;
      if (!viewOf(fresh).can_pay) throw new Refused(409, 'not_payable', 'Nothing is owed on this registration.');
      const ev = (await tx.get(eventRef(reg.event_id))).data() as EventDoc;
      if (ev.status === 'cancelled') throw new Refused(409, 'closed', 'This event has been cancelled.');
      const rows = (await tx.get(regsOf(reg.event_id))).docs.filter((d) => d.id !== regId).map((d) => d.data() as RegRow);
      if (fresh.status !== 'offered') {
        // Their hold lapsed; only take the money if there is still a seat to give.
        if (rows.filter((r) => holdsSeat(r, now)).length >= ev.capacity) throw new Refused(409, 'full', 'The event has filled since you started. Registering again will put you on the waitlist.');
        tx.update(ref, { status: 'pending_payment', hold_expires_at: new Date(now + HOLD_MS).toISOString(), updated_at: new Date(now).toISOString() });
      }
      tx.set(lockRef(reg.event_id), { touched_at: new Date(now).toISOString() });
      return { ev, priorSession: fresh.stripe_session_id };
    });
    await expireSession(out.priorSession);
    const manage = manageUrl(origin, reg.event_id, regId, token);
    const session = await createCheckout({
      kind: 'registration', ref: regId, eventId: reg.event_id, name: `${out.ev.title}: ${reg.tier_name}`, description: '',
      amount_cents: reg.price_cents, email: reg.email, descriptor: out.ev.statement_descriptor,
      successUrl: `${manage}&paid=1`, cancelUrl: manage, idempotencyKey: randomUUID(), expiresAtMs: now + 30.5 * 60_000,
    });
    await ref.update({ stripe_session_id: session.id });
    return { checkout_url: session.url };
  }

  if (action === 'attendees') {
    // Only for people actually coming, and only those who said yes.
    if (reg.status !== 'confirmed') throw new Refused(403, 'not_confirmed', 'The attendee list opens once your place is confirmed.');
    const [rows, names] = await Promise.all([
      regsOf(reg.event_id).where('status', '==', 'confirmed').where('consents.attendee_list', '==', true).get(),
      spaceNames(),
    ]);
    const regs = rows.docs.map((d) => d.data() as RegDoc);
    const profiles = await visibleProfiles(regs.map((r) => r.email));
    return {
      attendees: regs.map((r) => ({
        name: r.name, space: (r.home_space_id && names.get(r.home_space_id)) || r.answers.home_space_other || null,
        makes: r.answers.makes, offer_session: r.answers.offer_session, tracks: r.answers.tracks,
        email: r.consents.peer_contact ? r.email : null,
        profile: profiles.get(r.email) ?? null,
      })).sort((a, b) => a.name.localeCompare(b.name)),
    };
  }

  throw new Refused(400, 'bad_action', 'Unknown action.');
});

/** The profile summary of attendees who have one and have not hidden it, shown
 *  to fellow attendees whether or not those attendees have an account: being in
 *  the room is reason enough to see a "community" profile. */
async function visibleProfiles(emails: string[]) {
  const out = new Map<string, { id: string; headline: string; bio: string; cover_url: string | null; website: string | null }>();
  for (let i = 0; i < emails.length; i += 100) {
    const { users } = await getAuth().getUsers(emails.slice(i, i + 100).map((email) => ({ email })));
    const snaps = users.length ? await db().getAll(...users.map((u) => db().doc(`makers/${u.uid}`))) : [];
    snaps.forEach((s, j) => {
      const m = s.data();
      if (!m || m.review !== 'approved' || m.visibility === 'hidden') return;
      out.set(users[j].email!.toLowerCase(), { id: s.id, headline: m.headline, bio: m.bio, cover_url: m.cover_url ?? null, website: m.website ?? null });
    });
  }
  return out;
}

async function spaceNames() {
  const s = await db().collection('spaces_index').get();
  return new Map(s.docs.map((d) => [d.id, d.get('name') as string]));
}

// ---------- a signed-in person's own ticket ----------

/** Home shows a person their ticket by verified address; this swaps that same
 *  proof for the private link, which stays out of Firestore's readable fields. */
export const eventMine = endpoint([], async (req, body) => {
  await rateLimit(req, 'mine', 60);
  const token = (req.get('authorization') ?? '').replace(/^Bearer /, '');
  const who = await getAuth().verifyIdToken(token).catch(() => null);
  if (!who?.email || !who.email_verified) throw new Refused(401, 'not_signed_in', 'Please sign in again.');
  const eventId = typeof body.event_id === 'string' ? body.event_id : '';
  const rows = await regsOf(eventId).where('email_lower', '==', who.email.toLowerCase()).get();
  if (rows.empty) throw new Refused(404, 'no_registration', 'No ticket at this address.');
  const secret = (await secretRef(rows.docs[0].id).get()).get('manage_token') as string;
  return { manage_url: manageUrl(returnOrigin(req.get('origin'), isEmulator), eventId, rows.docs[0].id, secret) };
});

// ---------- interest list ----------

export const eventInterest = endpoint([], async (req, body) => {
  if (typeof body.website === 'string' && body.website) return { outcome: 'noted' };
  await rateLimit(req, 'interest', 30);
  const ev = await loadEvent(body.event_id);
  const person = cleanPerson(body);
  if ('error' in person) throw new Refused(400, 'bad_person', person.error);
  const iso = nowIso();
  await db().doc(`event_interest/${registrationId(ev.id, person.email)}`).set({
    event_id: ev.id, region_id: ev.region_id, name: person.name, email: person.email,
    home_space_id: await knownSpace(body.home_space_id), referred_by: await knownSpace(body.ref), created_at: iso,
  }, { merge: true });
  return { outcome: 'noted' };
});

// ---------- sponsors ----------

export const eventSponsor = endpoint([STRIPE_KEY], async (req, body) => {
  if (typeof body.website === 'string' && body.website) return { outcome: 'inquiry' };
  await rateLimit(req, 'sponsor', 15);
  const ev = await loadEvent(body.event_id);
  const person = cleanPerson(body);
  if ('error' in person) throw new Refused(400, 'bad_person', person.error);
  const org = typeof body.org_name === 'string' ? body.org_name.trim().slice(0, 160) : '';
  if (!org) throw new Refused(400, 'bad_org', 'Please give the organisation\'s name.');

  const tier = ev.sponsor_tiers.find((t) => t.id === body.tier_id) ?? null;
  if (tier?.slots != null) {
    const held = await db().collection('event_sponsors').where('event_id', '==', ev.id).where('tier_id', '==', tier.id)
      .where('status', 'in', ['committed', 'invoiced', 'paid']).get();
    if (held.size >= tier.slots) throw new Refused(409, 'tier_full', `${tier.name} is taken. Please choose another level, or write to us.`);
  }
  const wantsCard = body.pay === 'card' && !!tier;
  const iso = nowIso();
  const ref = db().collection('event_sponsors').doc();
  const url = typeof body.org_url === 'string' ? body.org_url.trim().slice(0, 300) : '';
  await ref.set({
    event_id: ev.id, region_id: ev.region_id, org_name: org, org_url: url, contact_name: person.name, contact_email: person.email,
    tier_id: tier?.id ?? null, tier_name: tier?.name ?? null, amount_cents: tier?.amount_cents ?? null,
    note: typeof body.note === 'string' ? body.note.trim().slice(0, 1000) : '',
    pay: wantsCard ? 'card' : 'invoice', status: wantsCard ? 'pending_payment' : 'inquiry',
    amount_paid_cents: 0, amount_refunded_cents: 0, stripe_session_id: null, stripe_payment_intent: null, paid_at: null,
    created_at: iso, updated_at: iso,
  });
  if (!wantsCard) return { outcome: 'inquiry' };

  const origin = returnOrigin(req.get('origin'), isEmulator);
  const back = `${origin}/?page=event&event=${encodeURIComponent(ev.id)}&view=sponsor`;
  const session = await createCheckout({
    kind: 'sponsor', ref: ref.id, eventId: ev.id, name: `${ev.title} sponsorship: ${tier!.name}`, description: org,
    amount_cents: tier!.amount_cents, email: person.email, descriptor: ev.statement_descriptor,
    successUrl: `${back}&thanks=1`, cancelUrl: back, idempotencyKey: randomUUID(), expiresAtMs: Date.now() + 23 * 3_600_000,
  });
  await ref.update({ stripe_session_id: session.id });
  return { outcome: 'checkout', checkout_url: session.url };
});

// ---------- Stripe's webhook ----------

interface StripeObject {
  id: string; metadata?: Record<string, string>; payment_intent?: string | null; payment_status?: string;
  amount_total?: number; currency?: string; amount?: number; amount_refunded?: number;
}

/** Returns normally only once the outcome is durable: a thrown error becomes a
 *  500 and Stripe redelivers. There is no rate limit here and no 200-on-failure,
 *  which is how a payment gets silently lost. */
async function settleRegistration(regId: string, s: StripeObject) {
  const ref = db().doc(`event_registrations/${regId}`);
  await db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) { logger.error('paid session has no registration', { regId, session: s.id }); return; }
    const r = snap.data() as RegDoc;
    await tx.get(lockRef(r.event_id));
    const outcome = evaluatePayment({
      id: s.id, payment_intent: s.payment_intent ?? '', payment_status: s.payment_status ?? '',
      amount_total: s.amount_total ?? NaN, currency: s.currency ?? '',
    }, r);
    const iso = nowIso();
    if (outcome.action === 'duplicate' || outcome.action === 'ignore') return;
    if (outcome.action === 'flag') { tx.update(ref, { payment_issue: outcome.issue, updated_at: iso }); return; }
    tx.update(ref, {
      status: 'confirmed', hold_expires_at: null, stripe_payment_intent: s.payment_intent, stripe_session_id: s.id,
      amount_paid_cents: s.amount_total, paid_at: iso, updated_at: iso,
      ...(outcome.action === 'credit_flagged' ? { payment_issue: outcome.issue } : {}),
    });
    tx.set(lockRef(r.event_id), { touched_at: iso });
  });
}

async function settleSponsor(id: string, s: StripeObject) {
  const ref = db().doc(`event_sponsors/${id}`);
  await db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) { logger.error('paid session has no sponsor', { id, session: s.id }); return; }
    const d = snap.data() as { amount_cents: number | null; stripe_payment_intent: string | null };
    if (d.stripe_payment_intent === s.payment_intent || s.payment_status !== 'paid') return;
    const short = (s.amount_total ?? 0) < (d.amount_cents ?? 0) || s.currency !== 'usd';
    tx.update(ref, {
      status: short ? 'needs_review' : 'paid', stripe_payment_intent: s.payment_intent,
      amount_paid_cents: s.amount_total ?? 0, paid_at: nowIso(), updated_at: nowIso(),
    });
  });
}

export const eventStripeWebhook = onRequest(
  { secrets: [STRIPE_KEY, STRIPE_WEBHOOK_SECRET], region: REGION, invoker: 'public' },
  async (req, res) => {
    if (req.method !== 'POST') { res.status(405).send('POST only'); return; }
    const raw = req.rawBody?.toString('utf8') ?? '';
    if (!verifyStripeSignature(raw, req.get('stripe-signature') ?? '', STRIPE_WEBHOOK_SECRET.value(), Date.now() / 1000)) {
      res.status(400).send('bad signature'); return;
    }
    const event = JSON.parse(raw) as { type: string; livemode: boolean; data: { object: StripeObject } };
    if (event.livemode !== keyIsLive(STRIPE_KEY.value())) { res.json({ ignored: 'mode mismatch' }); return; }

    // MakeHaven's account also takes store, lending and other payments. Anything
    // we did not create carries no mn_kind and is none of our business.
    const o = event.data.object;
    const kind = o.metadata?.mn_kind as Kind | undefined;
    const ref = o.metadata?.mn_ref;
    if (!kind || !ref) { res.json({ ignored: 'not ours' }); return; }

    try {
      if (event.type === 'checkout.session.completed') {
        if (kind === 'registration') await settleRegistration(ref, o);
        else await settleSponsor(ref, o);
      } else if (event.type === 'checkout.session.expired') {
        if (kind === 'registration') {
          const r = db().doc(`event_registrations/${ref}`);
          await db().runTransaction(async (tx) => {
            const d = (await tx.get(r)).data() as RegDoc | undefined;
            // Only the session this row is waiting on. A person who restarted has a newer one.
            if (d?.status === 'pending_payment' && d.stripe_session_id === o.id) tx.update(r, { status: 'expired', hold_expires_at: null, updated_at: nowIso() });
          });
        } else {
          const r = db().doc(`event_sponsors/${ref}`);
          const d = (await r.get()).data();
          // They showed interest even if they did not finish; a person should follow up.
          if (d?.status === 'pending_payment') await r.update({ status: 'inquiry', updated_at: nowIso() });
        }
      } else if (event.type === 'charge.refunded') {
        const out = evaluateRefund(o.amount_refunded ?? 0, o.amount ?? 0);
        const col = kind === 'registration' ? 'event_registrations' : 'event_sponsors';
        const refundedStatus: RegStatus | 'refunded' = 'refunded';
        await db().doc(`${col}/${ref}`).update({
          amount_refunded_cents: out.amount_refunded, ...(out.status ? { status: refundedStatus } : {}), updated_at: nowIso(),
        });
      }
      res.json({ received: true });
    } catch (e) {
      logger.error('webhook failed; Stripe will retry', { type: event.type, ref, e: String(e) });
      res.status(500).send('retry');
    }
  },
);

// ---------- counts: what the public and each space may see ----------

async function refreshStats(eventId: string) {
  const evSnap = await eventRef(eventId).get();
  if (!evSnap.exists) return;
  const ev = evSnap.data() as EventDoc;
  const [regs, sponsors, names] = await Promise.all([
    regsOf(eventId).get(),
    db().collection('event_sponsors').where('event_id', '==', eventId).where('status', 'in', ['committed', 'invoiced', 'paid']).get(),
    spaceNames(),
  ]);
  const rows = regs.docs.map((d) => d.data() as RegDoc);
  const byTier: Record<string, number> = {};
  for (const s of sponsors.docs) { const t = s.get('tier_id') as string | null; if (t) byTier[t] = (byTier[t] ?? 0) + 1; }
  const iso = nowIso();
  await db().doc(`event_stats/${eventId}`).set(publicStats(ev, rows, byTier, (id) => names.get(id) ?? null, Date.now(), iso));

  // What a space's own staff see. Counts are aggregate; a name and address only
  // for someone who ticked the box to share them with that space.
  const perSpace = new Map<string, { home: number; referred: number; people: { name: string; email: string }[] }>();
  const slot = (id: string) => { if (!perSpace.has(id)) perSpace.set(id, { home: 0, referred: 0, people: [] }); return perSpace.get(id)!; };
  for (const r of rows) {
    if (r.status !== 'confirmed') continue;
    if (r.referred_by) slot(r.referred_by).referred += 1;
    if (r.home_space_id) {
      const s = slot(r.home_space_id);
      s.home += 1;
      if (r.consents.space_share) s.people.push({ name: r.name, email: r.email });
    }
  }
  const batch = db().batch();
  const existing = await db().collection('event_space_stats').where('event_id', '==', eventId).get();
  for (const d of existing.docs) if (!perSpace.has(d.get('space_id'))) batch.delete(d.ref);
  for (const [spaceId, s] of perSpace) {
    batch.set(db().doc(`event_space_stats/${eventId}~${spaceId}`), { event_id: eventId, space_id: spaceId, region_id: ev.region_id, ...s, updated_at: iso });
  }
  await batch.commit();
}

// ---------- email ----------

export async function sendMail(to: string, subject: string, text: string, ics?: string) {
  const res = await fetch('https://api.postmarkapp.com/email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Postmark-Server-Token': POSTMARK_SERVER_TOKEN.value() },
    body: JSON.stringify({
      From: POSTMARK_FROM_EMAIL.value(), To: to, Subject: subject, TextBody: text, MessageStream: 'outbound',
      ...(ics ? { Attachments: [{ Name: 'event.ics', Content: Buffer.from(ics).toString('base64'), ContentType: 'text/calendar; method=PUBLISH' }] } : {}),
    }),
  });
  if (!res.ok) throw new Error(`postmark ${res.status}`);
}

const whenText = (ev: EventDoc) => ev.starts_at
  ? new Date(ev.starts_at).toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })
  : '';

function emailFor(r: RegDoc, ev: EventDoc & { id: string }, link: string): { subject: string; text: string; ics: boolean } | null {
  const hi = `Hi ${r.name.split(' ')[0]},`;
  const where = [whenText(ev), ev.location].filter(Boolean).join('\n');
  const foot = ['', `Your registration, opt-ins and who else is coming: ${link}`, '', 'Keep this link to yourself; it opens your registration.',
    '', `Show what you make: ${SITE}/?page=maker-edit`];
  switch (r.status) {
    case 'confirmed':
      return {
        subject: `You're in: ${ev.title}`, ics: !!ev.starts_at,
        text: [hi, '', `Your place at ${ev.title} is confirmed (${r.tier_name}${r.amount_paid_cents ? `, ${money(r.amount_paid_cents)} paid` : ''}).`, '', where, ...foot].join('\n'),
      };
    case 'waitlisted':
      return { subject: `You're on the waitlist: ${ev.title}`, ics: false, text: [hi, '', `${ev.title} is full right now, so you are on the waitlist. You have not been charged. If a place opens we will email you a link to take it.`, ...foot].join('\n') };
    case 'offered':
      return { subject: `A place opened up: ${ev.title}`, ics: false, text: [hi, '', `A place at ${ev.title} is yours if you want it. Use this link to ${r.price_cents ? `pay ${money(r.price_cents)} and ` : ''}confirm:`, '', link, '', 'If you cannot come, you can cancel from the same page and the place goes to the next person.'].join('\n') };
    case 'refunded':
      return { subject: `Your refund: ${ev.title}`, ics: false, text: [hi, '', `Your ticket for ${ev.title} has been refunded. It can take a few days to reach your card.`].join('\n') };
    default:
      return null;
  }
}

export const eventRegistrationChanged = onDocumentWritten(
  { document: 'event_registrations/{id}', secrets: [POSTMARK_SERVER_TOKEN, POSTMARK_FROM_EMAIL], region: REGION },
  async (e) => {
    const before = e.data?.before.data() as RegDoc | undefined;
    const after = e.data?.after.data() as RegDoc | undefined;
    const eventId = after?.event_id ?? before?.event_id;
    if (!eventId) return;

    const statsMatter = !before || !after || before.status !== after.status || before.home_space_id !== after.home_space_id
      || before.referred_by !== after.referred_by || before.consents?.space_share !== after.consents?.space_share;
    if (statsMatter) await refreshStats(eventId);
    if (!after) return;

    // Being confirmed or checked in is what earns a profile its badge.
    if (after.status === 'confirmed' && (before?.status !== 'confirmed' || before?.attended !== after.attended || before?.email_lower !== after.email_lower)) {
      await linkAttendance(after.email, eventId, after.attended === true).catch((err) => logger.error('could not link attendance', { err: String(err) }));
    }

    const statusChanged = before?.status !== after.status;
    const resend = !!after.resend_requested_at && after.resend_requested_at !== before?.resend_requested_at;
    if (!statusChanged && !resend) return;

    const evSnap = await eventRef(eventId).get();
    if (!evSnap.exists) return;
    const ev = { id: eventId, ...(evSnap.data() as EventDoc) };
    const token = (await secretRef(e.params.id).get()).get('manage_token') as string | undefined;
    if (!token) return;
    const link = manageUrl(SITE, eventId, e.params.id, token);
    const mail = emailFor(after, ev, link);
    if (!mail) return;
    const ics = mail.ics && ev.starts_at ? meetingIcs({
      id: `${eventId}-${e.params.id}`, title: ev.title, agenda: '', location: ev.location, starts_at: ev.starts_at,
      duration_min: ev.ends_at ? Math.round((Date.parse(ev.ends_at) - Date.parse(ev.starts_at)) / 60_000) : 60,
      status: 'scheduled', updated_at: nowIso(), url: `${SITE}/?page=event&event=${eventId}`, link_text: 'Event page',
    }) : undefined;
    try {
      await sendMail(after.email, mail.subject, mail.text, ics);
    } catch (err) {
      // Not worth undoing a registration for. It shows on the admin page, and
      // the person saw their link on the confirmation screen anyway.
      logger.error('event mail failed', { id: e.params.id, err: String(err) });
      await e.data!.after.ref.update({ mail_error: String(err), mail_error_at: FieldValue.serverTimestamp() });
    }
  },
);

export const eventSponsorChanged = onDocumentWritten(
  { document: 'event_sponsors/{id}', secrets: [POSTMARK_SERVER_TOKEN, POSTMARK_FROM_EMAIL], region: REGION },
  async (e) => {
    const before = e.data?.before.data();
    const after = e.data?.after.data();
    const eventId = (after?.event_id ?? before?.event_id) as string | undefined;
    if (!eventId || before?.status === after?.status) return;
    await refreshStats(eventId);
    if (!after || !['inquiry', 'paid', 'needs_review'].includes(after.status)) return;
    const ev = (await eventRef(eventId).get()).data() as EventDoc | undefined;
    if (!ev?.notify_email) return;
    try {
      await sendMail(ev.notify_email, `[${ev.title}] Sponsor ${after.status}: ${after.org_name}`, [
        `${after.org_name} (${after.tier_name ?? 'no level chosen'}${after.amount_cents ? `, ${money(after.amount_cents)}` : ''})`,
        `Contact: ${after.contact_name} <${after.contact_email}>`, `Status: ${after.status}`, ...(after.note ? ['', after.note] : []),
        '', `They are not listed publicly until you approve it: ${SITE}/?page=event-admin&event=${eventId}&tab=sponsors`,
      ].join('\n'));
    } catch (err) { logger.error('sponsor notice failed', { err: String(err) }); }
  },
);

export const eventChanged = onDocumentWritten({ document: 'events/{id}', region: REGION }, async (e) => {
  const before = e.data?.before.data() as EventDoc | undefined;
  const after = e.data?.after.data() as EventDoc | undefined;
  if (!after) return;
  if (!before || before.capacity !== after.capacity || JSON.stringify(before.tiers) !== JSON.stringify(after.tiers)) await refreshStats(e.params.id);
});
