// Registration, payment and sponsorship through the real Functions, against the
// Firestore emulator and a stand-in for Stripe's API. Webhooks are signed the
// way Stripe signs them. `npm run test:events:e2e`.

import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../functions/package.json', import.meta.url));
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');
initializeApp({ projectId: 'makerspace-net' });
const db = getFirestore();

const BASE = 'http://127.0.0.1:5101/makerspace-net/us-central1';
const WHSEC = 'whsec_test';
const EV = 'test-event';
const T = new Date().toISOString();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(f, ms = 15000) {
  for (let t = 0; t < ms; t += 250) { const v = await f(); if (v) return v; await sleep(250); }
  return f();
}

// ---------- a stand-in for Stripe ----------
let stripeCalls = [];
let stripeDown = false;
const mock = createServer((req, res) => {
  let b = '';
  req.on('data', (c) => { b += c; });
  req.on('end', () => {
    stripeCalls.push({ path: req.url, params: Object.fromEntries(new URLSearchParams(b)), key: req.headers.authorization, idem: req.headers['idempotency-key'], failed: stripeDown });
    if (stripeDown) { res.writeHead(500); res.end('down'); return; }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ id: `cs_${stripeCalls.length}`, url: `https://checkout.stripe.test/${stripeCalls.length}` }));
  });
});

const call = async (fn, body, headers = {}) => {
  const res = await fetch(`${BASE}/${fn}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://connecticut.makerspace.network', ...headers }, body: JSON.stringify(body) });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};
const webhook = async (type, object, { secret = WHSEC, livemode = false } = {}) => {
  const payload = JSON.stringify({ type, livemode, data: { object } });
  const t = Math.floor(Date.now() / 1000);
  const sig = createHmac('sha256', secret).update(`${t}.${payload}`).digest('hex');
  return fetch(`${BASE}/eventStripeWebhook`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'stripe-signature': `t=${t},v1=${sig}` }, body: payload });
};
const signup = (email, o = {}) => call('eventRegister', { event_id: EV, tier_id: 'general', name: 'Jo Maker', email, terms: true, age_ok: true, ...o });
const paidSession = (ref, o = {}) => ({
  id: 'cs_paid', payment_intent: `pi_${ref}`, payment_status: 'paid', amount_total: 5000, currency: 'usd',
  metadata: { mn_kind: 'registration', mn_ref: ref, mn_event: EV }, ...o,
});
const allRegs = async () => (await db.collection('event_registrations').where('event_id', '==', EV).get()).docs;
const regByEmail = async (email) => (await allRegs()).find((d) => d.get('email') === email);
const tokenOf = (regId) => db.doc(`event_registration_secrets/${regId}`).get().then((d) => d.get('manage_token'));

const baseEvent = (o = {}) => ({
  title: 'Test Bonanza', status: 'open', region_id: 'us-ct', capacity: 100, min_age: 18, asks_over_21: true,
  tiers: [
    { id: 'general', name: 'General', description: '', price_cents: 5000, limit: null, requires_code: false, attestation: null },
    { id: 'comp', name: 'Comp', description: '', price_cents: 0, limit: null, requires_code: true, attestation: null },
  ],
  sponsor_tiers: [{ id: 'presenting', name: 'Presenting', amount_cents: 250000, benefits: [], slots: 1 }],
  refund_until: new Date(Date.now() + 86_400_000).toISOString(), sponsors: [], tracks: [{ id: 'arts', label: 'Arts' }], terms: 'x', terms_version: 'v1', statement_descriptor: 'MAKER BONANZA',
  starts_at: null, ends_at: null, location: '770 Chapel', payment_host: 'makehaven', notify_email: 'steward@example.org', public_url: 'https://x', date_label: 'Soon', updated_at: T, ...o,
});

before(async () => {
  await new Promise((r) => mock.listen(5199, '127.0.0.1', r));
  await db.doc('spaces_index/spark').set({ name: 'Spark', kind: 'makerspace', region_id: 'us-ct', claimed: false });
});
after(async () => { mock.close(); });
beforeEach(async () => {
  stripeCalls = []; stripeDown = false;
  for (const c of ['makers', 'audit', 'events', 'event_registrations', 'event_registration_secrets', 'event_locks', 'event_rate_limits', 'event_sponsors', 'event_interest', 'event_codes', 'event_stats', 'event_space_stats']) {
    await db.recursiveDelete(db.collection(c));
  }
  await db.doc(`events/${EV}`).set(baseEvent());
});

test('the amount charged comes from the event, not from what the browser sent', async () => {
  const r = await signup('price@example.org', { price_cents: 1, amount_due: 1, tier: { price_cents: 1 } });
  assert.equal(r.body.outcome, 'checkout');
  assert.match(r.body.checkout_url, /checkout\.stripe\.test/);
  const made = stripeCalls.find((c) => c.path === '/v1/checkout/sessions');
  assert.equal(made.params['line_items[0][price_data][unit_amount]'], '5000');
  assert.equal(made.params['metadata[mn_kind]'], 'registration');
  assert.equal(made.params['payment_intent_data[metadata][mn_event]'], EV);
  assert.equal(made.params['payment_intent_data[statement_descriptor_suffix]'], 'MAKER BONANZA');
  assert.match(made.params.success_url, /^https:\/\/connecticut\.makerspace\.network\//);
  assert.ok(made.idem, 'creates sessions with an idempotency key');
  const row = (await regByEmail('price@example.org')).data();
  assert.equal(row.price_cents, 5000);
  assert.equal(row.status, 'pending_payment');
});

test('a browser saying it is paid changes nothing: only a signed webhook confirms', async () => {
  await signup('paid@example.org', { status: 'confirmed', paid: true, amount_paid_cents: 5000 });
  const d = await regByEmail('paid@example.org');
  assert.equal(d.get('status'), 'pending_payment');
  assert.equal(d.get('amount_paid_cents'), 0);
  const forged = await webhook('checkout.session.completed', paidSession(d.id), { secret: 'whsec_wrong' });
  assert.equal(forged.status, 400);
  assert.equal((await d.ref.get()).get('status'), 'pending_payment');
  const good = await webhook('checkout.session.completed', paidSession(d.id));
  assert.equal(good.status, 200);
  const row = (await d.ref.get()).data();
  assert.equal(row.status, 'confirmed');
  assert.equal(row.amount_paid_cents, 5000);
});

test('a redelivered webhook is a no-op; a second payment is flagged, not overwritten', async () => {
  await signup('twice@example.org');
  const d = await regByEmail('twice@example.org');
  await webhook('checkout.session.completed', paidSession(d.id));
  const first = (await d.ref.get()).data();
  await webhook('checkout.session.completed', paidSession(d.id));
  assert.equal((await d.ref.get()).get('paid_at'), first.paid_at);
  await webhook('checkout.session.completed', paidSession(d.id, { payment_intent: 'pi_other' }));
  const row = (await d.ref.get()).data();
  assert.equal(row.stripe_payment_intent, first.stripe_payment_intent);
  assert.match(row.payment_issue, /second payment/);
});

test('underpayment does not confirm', async () => {
  await signup('short@example.org');
  const d = await regByEmail('short@example.org');
  await webhook('checkout.session.completed', paidSession(d.id, { amount_total: 100 }));
  const row = (await d.ref.get()).data();
  assert.equal(row.status, 'pending_payment');
  assert.match(row.payment_issue, /underpaid/);
});

test("MakeHaven's other Stripe traffic is ignored, and a live event cannot settle a test key", async () => {
  const before = await allRegs();
  const r = await webhook('checkout.session.completed', { id: 'cs_store', payment_status: 'paid', metadata: { source_system: 'makerspace_material_store' } });
  assert.deepEqual(await r.json(), { ignored: 'not ours' });
  await signup('mode@example.org');
  const d = await regByEmail('mode@example.org');
  const live = await webhook('checkout.session.completed', paidSession(d.id), { livemode: true });
  assert.deepEqual(await live.json(), { ignored: 'mode mismatch' });
  assert.equal((await d.ref.get()).get('status'), 'pending_payment');
  assert.equal(before.length, 0);
});

test('five people racing for two seats: two hold seats, three wait, none is charged twice', async () => {
  await db.doc(`events/${EV}`).update({ capacity: 2 });
  const results = await Promise.all([1, 2, 3, 4, 5].map((i) => signup(`race${i}@example.org`)));
  const outcomes = results.map((r) => r.body.outcome).sort();
  assert.deepEqual(outcomes, ['checkout', 'checkout', 'waitlisted', 'waitlisted', 'waitlisted']);
  assert.equal(stripeCalls.filter((c) => c.path === '/v1/checkout/sessions').length, 2);
});

test('an expired checkout frees the seat for the next person', async () => {
  await db.doc(`events/${EV}`).update({ capacity: 1 });
  await signup('slow@example.org');
  assert.equal((await signup('next@example.org')).body.outcome, 'waitlisted');
  const d = await regByEmail('slow@example.org');
  await webhook('checkout.session.expired', { id: d.get('stripe_session_id'), metadata: { mn_kind: 'registration', mn_ref: d.id } });
  assert.equal((await d.ref.get()).get('status'), 'expired');
  assert.equal((await signup('third@example.org')).body.outcome, 'checkout');
});

test('expiry of a superseded session leaves the newer attempt alone', async () => {
  await signup('retry@example.org');
  const d = await regByEmail('retry@example.org');
  await webhook('checkout.session.expired', { id: 'cs_old_one', metadata: { mn_kind: 'registration', mn_ref: d.id } });
  assert.equal((await d.ref.get()).get('status'), 'pending_payment');
});

test('a Stripe outage gives the seat straight back', async () => {
  await db.doc(`events/${EV}`).update({ capacity: 1 });
  stripeDown = true;
  const r = await signup('outage@example.org');
  assert.equal(r.status, 502);
  stripeDown = false;
  assert.equal((await signup('after@example.org')).body.outcome, 'checkout');
});

test('a full refund in the dashboard frees the seat; a partial one does not', async () => {
  await signup('refund@example.org');
  const d = await regByEmail('refund@example.org');
  await webhook('checkout.session.completed', paidSession(d.id));
  const meta = { mn_kind: 'registration', mn_ref: d.id };
  await webhook('charge.refunded', { id: 'ch_1', amount: 5000, amount_refunded: 2500, metadata: meta });
  assert.equal((await d.ref.get()).get('status'), 'confirmed');
  assert.equal((await d.ref.get()).get('amount_refunded_cents'), 2500);
  await webhook('charge.refunded', { id: 'ch_1', amount: 5000, amount_refunded: 5000, metadata: meta });
  assert.equal((await d.ref.get()).get('status'), 'refunded');
});

test('registering twice neither duplicates nor overwrites, and shows no link on screen', async () => {
  await signup('dup@example.org', { name: 'Original' });
  const d = await regByEmail('dup@example.org');
  await webhook('checkout.session.completed', paidSession(d.id));
  const again = await signup('dup@example.org', { name: 'Attacker' });
  assert.deepEqual(again.body, { outcome: 'already' });
  assert.equal((await d.ref.get()).get('name'), 'Original');
  assert.equal((await allRegs()).length, 1);
});

test('terms and age are required; a closed or draft event sells nothing', async () => {
  assert.equal((await signup('t@example.org', { terms: false })).status, 400);
  assert.equal((await signup('a@example.org', { age_ok: false })).status, 400);
  assert.equal((await signup('bad-email', {})).status, 400);
  await db.doc(`events/${EV}`).update({ status: 'announced' });
  assert.equal((await signup('x@example.org')).body.code, 'closed');
  await db.doc(`events/${EV}`).update({ status: 'draft' });
  assert.equal((await signup('x@example.org')).status, 404);
  assert.equal((await allRegs()).length, 0);
});

test('a code confirms a free seat without Stripe, and stops at its limit', async () => {
  await db.doc(`event_codes/${EV}~SPONSOR`).set({ tier_id: 'comp', max_uses: 1, note: '', created_at: T });
  const r = await signup('comp@example.org', { code: 'sponsor' });
  assert.equal(r.body.outcome, 'confirmed');
  assert.equal(stripeCalls.length, 0);
  assert.equal((await signup('comp2@example.org', { code: 'SPONSOR' })).body.code, 'code_used_up');
  assert.equal((await signup('comp3@example.org', { code: 'GUESS' })).body.code, 'bad_code');
  assert.equal((await signup('comp4@example.org', { tier_id: 'comp' })).body.code, 'needs_code');
});

test('the emailed link: wrong token refused; right token edits opt-ins and records the decision', async () => {
  await signup('me@example.org', { consents: { followup: true } });
  const d = await regByEmail('me@example.org');
  const t = await tokenOf(d.id);
  assert.equal((await call('eventManage', { r: d.id, t: 'wrong' })).status, 404);
  assert.equal((await call('eventManage', { r: d.id })).status, 404);
  const view = await call('eventManage', { r: d.id, t });
  assert.equal(view.body.email, 'me@example.org');
  assert.equal(view.body.consents.followup, true);
  assert.equal(view.body.consents.network, false);
  const up = await call('eventManage', { r: d.id, t, action: 'update', answers: { town: 'Hamden' }, consents: { network: true } });
  assert.equal(up.body.consents.network, true);
  assert.equal(up.body.consents.followup, false);
  const log = await db.collection('audit').where('actor', '==', `registration:${d.id}`).get();
  assert.deepEqual(log.docs[0].get('details').changes, { followup: false, network: true });
});

test('paid tickets cannot self-cancel; unpaid ones can, and release the seat', async () => {
  await db.doc(`events/${EV}`).update({ capacity: 1 });
  await signup('c@example.org');
  const d = await regByEmail('c@example.org');
  const t = await tokenOf(d.id);
  const cancelled = await call('eventManage', { r: d.id, t, action: 'cancel' });
  assert.equal(cancelled.body.status, 'cancelled');
  assert.equal((await signup('c2@example.org')).body.outcome, 'checkout');
  const d2 = await regByEmail('c2@example.org');
  await webhook('checkout.session.completed', paidSession(d2.id));
  const refused = await call('eventManage', { r: d2.id, t: await tokenOf(d2.id), action: 'cancel' });
  assert.equal(refused.status, 409);
});

test('a waitlisted person offered a place pays through their link, and the offer holds the seat', async () => {
  await db.doc(`events/${EV}`).update({ capacity: 1 });
  await signup('first@example.org');
  await signup('wait@example.org');
  const w = await regByEmail('wait@example.org');
  assert.equal(w.get('status'), 'waitlisted');
  const t = await tokenOf(w.id);
  assert.equal((await call('eventManage', { r: w.id, t })).body.can_pay, false, 'not payable until offered');
  await w.ref.update({ status: 'offered', offered_at: T });
  const pay = await call('eventManage', { r: w.id, t, action: 'pay' });
  assert.match(pay.body.checkout_url, /checkout\.stripe\.test/);
  assert.equal(stripeCalls.at(-1).params['line_items[0][price_data][unit_amount]'], '5000');
  await webhook('checkout.session.completed', paidSession(w.id));
  assert.equal((await w.ref.get()).get('status'), 'confirmed');
});

test('a lapsed registration pays again only if a seat is still free', async () => {
  await db.doc(`events/${EV}`).update({ capacity: 1 });
  await signup('lapse@example.org');
  const d = await regByEmail('lapse@example.org');
  const t = await tokenOf(d.id);
  await d.ref.update({ status: 'expired', hold_expires_at: null });
  await signup('took@example.org');
  const refused = await call('eventManage', { r: d.id, t, action: 'pay' });
  assert.equal(refused.body.code, 'full');
});

test('who is coming: confirmed people only, and only those who said yes', async () => {
  await signup('yes@example.org', { name: 'Listed', consents: { attendee_list: true, peer_contact: true } });
  await signup('quiet@example.org', { name: 'Quiet', consents: { attendee_list: true } });
  await signup('no@example.org', { name: 'Private' });
  await signup('unpaid@example.org', { name: 'Unpaid', consents: { attendee_list: true } });
  for (const e of ['yes@example.org', 'quiet@example.org', 'no@example.org']) {
    await webhook('checkout.session.completed', paidSession((await regByEmail(e)).id));
  }
  const me = await regByEmail('no@example.org');
  const out = await call('eventManage', { r: me.id, t: await tokenOf(me.id), action: 'attendees' });
  assert.deepEqual(out.body.attendees.map((a) => [a.name, a.email]), [['Listed', 'yes@example.org'], ['Quiet', null]]);
  const un = await regByEmail('unpaid@example.org');
  assert.equal((await call('eventManage', { r: un.id, t: await tokenOf(un.id), action: 'attendees' })).status, 403);
});

test('counts reach the public page and the space, with names only for those who opted in', async () => {
  await signup('s1@example.org', { name: 'Shares', answers: { home_space_id: 'spark' }, consents: { space_share: true } });
  await signup('s2@example.org', { name: 'Keeps Quiet', answers: { home_space_id: 'spark' }, ref: 'spark' });
  await signup('s3@example.org', { name: 'Unknown', answers: { home_space_id: 'made-up-space' }, ref: 'made-up-space' });
  for (const e of ['s1@example.org', 's2@example.org', 's3@example.org']) {
    await webhook('checkout.session.completed', paidSession((await regByEmail(e)).id));
  }
  const stats = await waitFor(async () => { const s = await db.doc(`event_stats/${EV}`).get(); return s.get('registered') === 3 ? s.data() : null; });
  assert.deepEqual(stats.spaces, ['Spark']);
  assert.ok(!JSON.stringify(stats).includes('@'), 'the public document holds no addresses');
  const space = await waitFor(async () => { const s = await db.doc(`event_space_stats/${EV}~spark`).get(); return s.get('home') === 2 ? s.data() : null; });
  assert.equal(space.referred, 1);
  assert.deepEqual(space.people, [{ name: 'Shares', email: 's1@example.org' }]);
  assert.equal((await regByEmail('s3@example.org')).get('home_space_id'), null, 'an unknown space id is dropped');
});

test('a sponsor paying by card is settled by the webhook and not listed until a steward says so', async () => {
  const r = await call('eventSponsor', { event_id: EV, tier_id: 'presenting', org_name: 'Acme', name: 'Sam', email: 'sam@acme.example', pay: 'card', amount_cents: 1 });
  assert.equal(r.body.outcome, 'checkout');
  assert.equal(stripeCalls.at(-1).params['line_items[0][price_data][unit_amount]'], '250000');
  const s = (await db.collection('event_sponsors').get()).docs[0];
  assert.equal(s.get('status'), 'pending_payment');
  await webhook('checkout.session.completed', { id: 'cs_s', payment_intent: 'pi_s', payment_status: 'paid', amount_total: 250000, currency: 'usd', metadata: { mn_kind: 'sponsor', mn_ref: s.id } });
  assert.equal((await s.ref.get()).get('status'), 'paid');
  assert.deepEqual((await db.doc(`events/${EV}`).get()).get('sponsors'), []);
  const full = await call('eventSponsor', { event_id: EV, tier_id: 'presenting', org_name: 'Late', name: 'L', email: 'l@late.example', pay: 'invoice' });
  assert.equal(full.body.code, 'tier_full');
});

test('a sponsor can ask for an invoice before tickets go on sale, without Stripe', async () => {
  await db.doc(`events/${EV}`).update({ status: 'announced' });
  const r = await call('eventSponsor', { event_id: EV, org_name: 'Maybe Inc', name: 'M', email: 'm@maybe.example', pay: 'invoice', note: 'In-kind?' });
  assert.equal(r.body.outcome, 'inquiry');
  assert.equal(stripeCalls.length, 0);
  assert.equal((await db.collection('event_sponsors').get()).docs[0].get('status'), 'inquiry');
});

test('interest is recorded once per address and only for a real event', async () => {
  await db.doc(`events/${EV}`).update({ status: 'announced' });
  for (let i = 0; i < 2; i++) assert.equal((await call('eventInterest', { event_id: EV, name: 'I', email: 'i@example.org', home_space_id: 'spark' })).body.outcome, 'noted');
  assert.equal((await db.collection('event_interest').get()).size, 1);
  assert.equal((await call('eventInterest', { event_id: 'nope', name: 'I', email: 'i@example.org' })).status, 404);
});

test('a form filled by a bot is thanked and dropped', async () => {
  const r = await signup('bot@example.org', { website: 'https://spam.example' });
  assert.equal(r.status, 200);
  assert.equal((await allRegs()).length, 0);
});

test('attempts past the hourly limit are refused, and the webhook is never limited', async () => {
  const ip = { 'fastly-client-ip': '203.0.113.9' };
  for (let i = 0; i < 30; i++) await call('eventRegister', { event_id: 'nope' }, ip);
  assert.equal((await call('eventRegister', { event_id: 'nope' }, ip)).status, 429);
  await signup('fine@example.org');
  const d = await regByEmail('fine@example.org');
  assert.equal((await webhook('checkout.session.completed', paidSession(d.id))).status, 200);
});

// ---------- refund and transfer ----------
const confirm = async (email, o) => {
  await signup(email, o);
  const d = await regByEmail(email);
  await webhook('checkout.session.completed', paidSession(d.id));
  return d;
};

test('an attendee refunds their own ticket through Stripe, once, and the seat is freed', async () => {
  await db.doc(`events/${EV}`).update({ capacity: 1 });
  const d = await confirm('back@example.org');
  const t = await tokenOf(d.id);
  assert.equal((await call('eventManage', { r: d.id, t })).body.can_refund, true);
  const out = await call('eventManage', { r: d.id, t, action: 'refund' });
  assert.equal(out.body.status, 'refunded');
  const made = stripeCalls.filter((c) => c.path === '/v1/refunds');
  assert.equal(made.length, 1);
  assert.equal(made[0].params.payment_intent, `pi_${d.id}`);
  assert.equal(made[0].idem, `refund-pi_${d.id}`);
  assert.equal((await d.ref.get()).get('amount_refunded_cents'), 5000);
  assert.equal((await call('eventManage', { r: d.id, t, action: 'refund' })).status, 409, 'not twice');
  assert.equal((await signup('next@example.org')).body.outcome, 'checkout');
});

test('refunds stop after the deadline, a stranger cannot trigger one, and a Stripe failure changes nothing', async () => {
  const d = await confirm('late@example.org');
  const t = await tokenOf(d.id);
  assert.equal((await call('eventManage', { r: d.id, t: 'wrong', action: 'refund' })).status, 404);
  stripeDown = true;
  assert.equal((await call('eventManage', { r: d.id, t, action: 'refund' })).status, 502);
  stripeDown = false;
  assert.equal((await d.ref.get()).get('status'), 'confirmed');
  await db.doc(`events/${EV}`).update({ refund_until: new Date(Date.now() - 1000).toISOString() });
  const v = await call('eventManage', { r: d.id, t });
  assert.equal(v.body.can_refund, false);
  assert.equal((await call('eventManage', { r: d.id, t, action: 'refund' })).body.code, 'no_refund');
  assert.equal(stripeCalls.filter((c) => c.path === '/v1/refunds' && !c.failed).length, 0, 'no refund ever succeeded');
});

test('a transfer hands over the place, wipes the opt-ins and kills the old link', async () => {
  const d = await confirm('old@example.org', { name: 'Old Holder', consents: { network: true }, answers: { town: 'Hamden' } });
  const t = await tokenOf(d.id);
  const out = await call('eventManage', { r: d.id, t, action: 'transfer', name: 'New Holder', email: 'New@Example.org' });
  assert.deepEqual(out.body, { transferred: true });
  const row = (await d.ref.get()).data();
  assert.equal(row.email, 'new@example.org');
  assert.equal(row.status, 'confirmed');
  assert.equal(row.consents.network, false);
  assert.equal(row.answers.town, '');
  assert.equal(row.amount_paid_cents, 5000, 'the payment stays with the ticket');
  assert.equal((await call('eventManage', { r: d.id, t })).status, 404, 'the old link is dead');
  assert.equal((await call('eventManage', { r: d.id, t: await tokenOf(d.id) })).body.email, 'new@example.org');
});

test('after a transfer both people can act normally, and the seller can buy again', async () => {
  const d = await confirm('seller@example.org');
  await call('eventManage', { r: d.id, t: await tokenOf(d.id), action: 'transfer', name: 'Buyer', email: 'buyer@example.org' });
  assert.deepEqual((await signup('buyer@example.org')).body, { outcome: 'already' });
  const again = await signup('seller@example.org');
  assert.equal(again.body.outcome, 'checkout');
  const rows = await allRegs();
  assert.equal(rows.length, 2);
  assert.equal(rows.filter((r) => r.get('email') === 'seller@example.org').length, 1);
  assert.notEqual((await regByEmail('seller@example.org')).id, d.id, 'a new row, not the transferred one');
});

test('a ticket cannot be transferred to someone who already has a place', async () => {
  const a = await confirm('a@example.org');
  await confirm('b@example.org');
  const r = await call('eventManage', { r: a.id, t: await tokenOf(a.id), action: 'transfer', name: 'B', email: 'b@example.org' });
  assert.equal(r.body.code, 'has_ticket');
  assert.equal((await a.ref.get()).get('email'), 'a@example.org');
});

// ---------- makers ----------
const makerDoc = (o = {}) => ({
  display_name: 'Riley', headline: 'Welder', bio: '', town: '', state: 'CT', home_space_id: null, disciplines: [], open_to: [], looking_for: [],
  website: null, instagram: null, contact_email: null, visibility: 'community', review: 'pending', events: [], cover_url: null, work_count: 0, work_pending: 0,
  created_at: T, updated_at: T, ...o,
});
const account = async (email, verified = true) => {
  await getAuth().getUserByEmail(email).then((u) => getAuth().deleteUser(u.uid)).catch(() => undefined);
  return (await getAuth().createUser({ email, emailVerified: verified })).uid;
};

test('someone with a ticket who makes a profile skips review and has the event on it', async () => {
  await confirm('ticket@example.org');
  const uid = await account('ticket@example.org');
  await db.doc(`makers/${uid}`).set(makerDoc());
  const m = await waitFor(async () => { const s = await db.doc(`makers/${uid}`).get(); return s.get('review') === 'approved' ? s.data() : null; });
  assert.deepEqual(m.events, [{ id: EV, title: 'Test Bonanza', attended: false }]);
});

test('someone with no ticket waits for a person', async () => {
  const uid = await account('noticket@example.org');
  await db.doc(`makers/${uid}`).set(makerDoc());
  await sleep(2500);
  assert.equal((await db.doc(`makers/${uid}`).get()).get('review'), 'pending');
});

test('buying a ticket after making a profile approves it, and check-in earns the badge', async () => {
  const uid = await account('later@example.org');
  await db.doc(`makers/${uid}`).set(makerDoc());
  await sleep(1500);
  const d = await confirm('later@example.org');
  await waitFor(async () => (await db.doc(`makers/${uid}`).get()).get('review') === 'approved');
  assert.equal((await db.doc(`makers/${uid}`).get()).get('events')[0].attended, false);
  await d.ref.update({ attended: true, checked_in_at: T });
  const m = await waitFor(async () => { const s = await db.doc(`makers/${uid}`).get(); return s.get('events')[0].attended ? s.data() : null; });
  assert.equal(m.events[0].attended, true);
});

test('a moderator\'s hide survives buying a ticket; an unverified address earns nothing', async () => {
  const uid = await account('hidden@example.org');
  await db.doc(`makers/${uid}`).set(makerDoc({ review: 'hidden' }));
  await confirm('hidden@example.org');
  await sleep(2500);
  assert.equal((await db.doc(`makers/${uid}`).get()).get('review'), 'hidden');
  const nov = await account('claimed@example.org', false);
  await db.doc(`makers/${nov}`).set(makerDoc());
  await confirm('claimed@example.org');
  await sleep(2500);
  const m = await db.doc(`makers/${nov}`).get();
  assert.equal(m.get('review'), 'pending', 'typing someone else\'s address on a ticket earns no standing');
  assert.deepEqual(m.get('events'), []);
});

test('approving a photo sets the cover and count; rejecting or deleting it clears them', async () => {
  const uid = await account('photos@example.org');
  await db.doc(`makers/${uid}`).set(makerDoc({ review: 'approved' }));
  const w = db.collection(`makers/${uid}/work`);
  const a = await w.add({ url: 'https://firebasestorage.googleapis.com/a', path: `makers/${uid}/a.jpg`, caption: '', status: 'pending', created_at: T });
  await waitFor(async () => (await db.doc(`makers/${uid}`).get()).get('work_pending') === 1);
  assert.equal((await db.doc(`makers/${uid}`).get()).get('cover_url'), null, 'unreviewed work is not the cover');
  await a.update({ status: 'approved' });
  await waitFor(async () => (await db.doc(`makers/${uid}`).get()).get('work_count') === 1);
  const m = (await db.doc(`makers/${uid}`).get()).data();
  assert.equal(m.cover_url, 'https://firebasestorage.googleapis.com/a');
  assert.equal(m.work_pending, 0);
  await a.update({ status: 'rejected' });
  await waitFor(async () => (await db.doc(`makers/${uid}`).get()).get('work_count') === 0);
  assert.equal((await db.doc(`makers/${uid}`).get()).get('cover_url'), null);
});

test('deleting a profile removes the work beneath it', async () => {
  const uid = await account('leaving@example.org');
  const ref = db.doc(`makers/${uid}`);
  await ref.set(makerDoc({ review: 'approved' }));
  await ref.collection('work').add({ url: 'https://firebasestorage.googleapis.com/x', path: `makers/${uid}/x.jpg`, caption: '', status: 'approved', created_at: T });
  await sleep(500);
  await ref.delete();
  await waitFor(async () => (await ref.collection('work').get()).empty);
  assert.equal((await ref.collection('work').get()).size, 0);
});

test('fellow attendees see a shared profile through their link, but never a hidden or unreviewed one', async () => {
  const me = await confirm('viewer@example.org', { name: 'Viewer' });
  await confirm('shown@example.org', { name: 'Shown', consents: { attendee_list: true } });
  await confirm('private@example.org', { name: 'Private', consents: { attendee_list: true } });
  await confirm('off@example.org', { name: 'Taken Down', consents: { attendee_list: true } });
  const shown = await account('shown@example.org');
  await db.doc(`makers/${shown}`).set(makerDoc({ headline: 'I weld', visibility: 'community', review: 'approved', cover_url: 'https://firebasestorage.googleapis.com/s' }));
  const priv = await account('private@example.org');
  await db.doc(`makers/${priv}`).set(makerDoc({ headline: 'Hidden', visibility: 'hidden', review: 'approved' }));
  const off = await account('off@example.org');
  await db.doc(`makers/${off}`).set(makerDoc({ headline: 'Bad', visibility: 'public', review: 'hidden' }));
  await sleep(1500);
  const out = await call('eventManage', { r: me.id, t: await tokenOf(me.id), action: 'attendees' });
  const by = Object.fromEntries(out.body.attendees.map((a) => [a.name, a.profile]));
  assert.equal(by.Shown.headline, 'I weld');
  assert.equal(by.Shown.cover_url, 'https://firebasestorage.googleapis.com/s');
  assert.equal(by.Private, null);
  assert.equal(by['Taken Down'], null);
});
