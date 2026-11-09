// The money decisions, without Firestore or Stripe. Each test names a way a
// registration system goes wrong. Run with `npm run test:events`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const L = require('../functions/lib/eventLogic.js');
const F = require('../functions/lib/eventFinance.js');

const NOW = Date.parse('2027-01-01T12:00:00Z');
const later = new Date(NOW + 60_000).toISOString();
const earlier = new Date(NOW - 60_000).toISOString();
const tier = (o = {}) => ({ id: 'general', name: 'General', description: '', price_cents: 5000, limit: null, requires_code: false, attestation: null, ...o });
const ev = (o = {}) => ({ status: 'open', capacity: 2, tiers: [tier(), tier({ id: 'sch', price_cents: 2500, limit: 1, attestation: 'I need it' }), tier({ id: 'comp', price_cents: 0, requires_code: true })], ...o });
const row = (o = {}) => ({ status: 'confirmed', hold_expires_at: null, tier_id: 'general', code: null, ...o });
const ask = (o = {}) => ({ tier_id: 'general', code: null, attested: false, ...o });

test('the price comes from the event, whatever the form asked for', () => {
  const d = L.decideTicket(ev(), [], { ...ask(), price_cents: 1 }, null, NOW);
  assert.equal(d.price_cents, 5000);
  assert.equal(d.status, 'pending_payment');
});

test('a seat is held by confirmed, offered and live holds, and not by a lapsed hold or a cancellation', () => {
  const rows = [row(), row({ status: 'offered' }), row({ status: 'pending_payment', hold_expires_at: later }),
    row({ status: 'pending_payment', hold_expires_at: earlier }), row({ status: 'cancelled' }), row({ status: 'expired' }),
    row({ status: 'waitlisted' }), row({ status: 'refunded' })];
  assert.equal(L.seatsTaken(rows, NOW), 3);
});

test('a full event waitlists without charging', () => {
  const d = L.decideTicket(ev(), [row(), row()], ask(), null, NOW);
  assert.equal(d.status, 'waitlisted');
});

test('tickets are refused unless the event is open', () => {
  for (const status of ['draft', 'announced', 'closed', 'cancelled']) {
    assert.deepEqual(L.decideTicket(ev({ status }), [], ask(), null, NOW), { ok: false, code: 'closed' });
  }
});

test('a capped tier sells out while the event still has room', () => {
  const d = L.decideTicket(ev(), [row({ tier_id: 'sch' })], ask({ tier_id: 'sch', attested: true }), null, NOW);
  assert.deepEqual(d, { ok: false, code: 'tier_sold_out' });
});

test('the scholarship needs its statement confirmed', () => {
  assert.deepEqual(L.decideTicket(ev(), [], ask({ tier_id: 'sch' }), null, NOW), { ok: false, code: 'attestation_required' });
});

test('a free tier cannot be chosen without a code', () => {
  assert.deepEqual(L.decideTicket(ev(), [], ask({ tier_id: 'comp' }), null, NOW), { ok: false, code: 'needs_code' });
});

test('a code selects its own tier, confirms a free seat at once, and stops at max_uses', () => {
  const code = { tier_id: 'comp', max_uses: 1 };
  const d = L.decideTicket(ev(), [], ask({ code: 'SPONSOR' }), code, NOW);
  assert.equal(d.tier.id, 'comp');
  assert.equal(d.status, 'confirmed');
  const used = [row({ tier_id: 'comp', code: 'SPONSOR' })];
  assert.deepEqual(L.decideTicket(ev(), used, ask({ code: 'SPONSOR' }), code, NOW), { ok: false, code: 'code_used_up' });
  assert.deepEqual(L.decideTicket(ev(), [], ask({ code: 'NOPE' }), null, NOW), { ok: false, code: 'bad_code' });
});

const session = (o = {}) => ({ id: 'cs_1', payment_intent: 'pi_1', payment_status: 'paid', amount_total: 5000, currency: 'usd', ...o });
const pending = (o = {}) => ({ status: 'pending_payment', price_cents: 5000, stripe_payment_intent: null, stripe_session_id: 'cs_1', ...o });

test('a matching paid session settles', () => assert.deepEqual(L.evaluatePayment(session(), pending()), { action: 'credit' }));
test('redelivery of the same payment changes nothing', () =>
  assert.equal(L.evaluatePayment(session(), pending({ status: 'confirmed', stripe_payment_intent: 'pi_1' })).action, 'duplicate'));
test('an unpaid session does not settle', () => assert.equal(L.evaluatePayment(session({ payment_status: 'unpaid' }), pending()).action, 'ignore'));
test('underpayment is flagged, not credited', () => assert.equal(L.evaluatePayment(session({ amount_total: 100 }), pending()).action, 'flag'));
test('a missing amount is flagged, not credited', () => assert.equal(L.evaluatePayment(session({ amount_total: NaN }), pending()).action, 'flag'));
test('the wrong currency is flagged', () => assert.equal(L.evaluatePayment(session({ currency: 'eur' }), pending()).action, 'flag'));
test('a second payment is flagged for refund and does not overwrite the first', () =>
  assert.equal(L.evaluatePayment(session({ payment_intent: 'pi_2' }), pending({ status: 'confirmed', stripe_payment_intent: 'pi_1' })).action, 'flag'));
test('money that arrives after a hold lapsed is honoured and flagged, never dropped', () => {
  for (const status of ['expired', 'cancelled']) assert.equal(L.evaluatePayment(session(), pending({ status })).action, 'credit_flagged');
});
test('an offered place settles', () => assert.equal(L.evaluatePayment(session(), pending({ status: 'offered' })).action, 'credit'));

test('only a full refund releases the seat', () => {
  assert.equal(L.evaluateRefund(5000, 5000).status, 'refunded');
  assert.equal(L.evaluateRefund(2500, 5000).status, null);
});

const sign = (body, secret, t) => `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${body}`).digest('hex')}`;
test('webhook signatures: good, tampered, wrong secret, stale, malformed, rotated', () => {
  const t = 1_800_000_000;
  assert.equal(L.verifyStripeSignature('{"a":1}', sign('{"a":1}', 's', t), 's', t), true);
  assert.equal(L.verifyStripeSignature('{"a":2}', sign('{"a":1}', 's', t), 's', t), false);
  assert.equal(L.verifyStripeSignature('{"a":1}', sign('{"a":1}', 'x', t), 's', t), false);
  assert.equal(L.verifyStripeSignature('{"a":1}', sign('{"a":1}', 's', t), 's', t + 301), false);
  assert.equal(L.verifyStripeSignature('{"a":1}', 'garbage', 's', t), false);
  assert.equal(L.verifyStripeSignature('{"a":1}', '', 's', t), false);
  assert.equal(L.verifyStripeSignature('{"a":1}', `${sign('{"a":1}', 'old', t)},v1=${sign('{"a":1}', 's', t).split('v1=')[1]}`, 's', t), true);
});

test('test and live keys are told apart, including restricted keys', () => {
  assert.equal(L.keyIsLive('rk_live_x'), true);
  assert.equal(L.keyIsLive('sk_live_x'), true);
  assert.equal(L.keyIsLive('rk_test_x'), false);
});

test('every opt-in is off unless it is literally true', () => {
  const c = L.cleanConsents({ followup: 'true', network: 1, attendee_list: true, unknown: true });
  assert.deepEqual(c, { attendee_list: true, peer_contact: false, followup: false, network: false, space_share: false, space_intro: false });
  assert.deepEqual(L.cleanConsents(null), { attendee_list: false, peer_contact: false, followup: false, network: false, space_share: false, space_intro: false });
});

test('answers are trimmed to known values', () => {
  const a = L.cleanAnswers({ relationship: ['space_member', 'king'], tracks: ['arts', 'x'], home_space_id: '../evil', makes: 'y'.repeat(900) }, ['arts']);
  assert.deepEqual(a.relationship, ['space_member']);
  assert.deepEqual(a.tracks, ['arts']);
  assert.equal(a.home_space_id, null);
  assert.equal(a.makes.length, 500);
});

test('checkout only returns to our own hosts', () => {
  assert.equal(L.returnOrigin('https://connecticut.makerspace.network', false), 'https://connecticut.makerspace.network');
  assert.equal(L.returnOrigin('https://evil.example', false), 'https://makerspace.network');
  assert.equal(L.returnOrigin('https://makerspace.network.evil.example', false), 'https://makerspace.network');
  assert.equal(L.returnOrigin('http://localhost:3100', false), 'https://makerspace.network');
  assert.equal(L.returnOrigin('http://localhost:3100', true), 'http://localhost:3100');
});

test('the vocabulary on the form matches the versioned one', () => {
  const enums = JSON.parse(readFileSync(new URL('../data/schema/enums.json', import.meta.url)));
  assert.deepEqual(enums.MakerRelationship.map((r) => r.id), [...L.RELATIONSHIPS]);
  const model = readFileSync(new URL('../src/events/model.ts', import.meta.url), 'utf8');
  for (const r of enums.MakerRelationship) assert.ok(model.includes(`['${r.id}',`), `model.ts lacks ${r.id}`);
});

test('public stats count only confirmed people and name only known spaces', () => {
  const s = L.publicStats({ capacity: 3, tiers: [tier({ id: 'sch', limit: 1 })], sponsor_tiers: [{ id: 'p', slots: 1 }] }, [
    { status: 'confirmed', hold_expires_at: null, tier_id: 'sch', home_space_id: 'spark' },
    { status: 'pending_payment', hold_expires_at: later, tier_id: 'general', home_space_id: 'makehaven' },
    { status: 'confirmed', hold_expires_at: null, tier_id: 'general', home_space_id: 'ghost' },
  ], { p: 1 }, (id) => ({ spark: 'Spark', makehaven: 'MakeHaven' }[id] ?? null), NOW, 'now');
  assert.equal(s.registered, 2);
  assert.equal(s.spots_left, 0);
  assert.deepEqual(s.spaces, ['Spark']);
  assert.deepEqual(s.tiers_sold_out, ['sch']);
  assert.deepEqual(s.sponsor_tiers_full, ['p']);
});

// The brief's numbers, so the argument in docs/EVENTS.md stays true if the code changes.
const budget = { fee_rate: 0.029, fee_fixed_cents: 30, max_loss_cents: 500000, costs: F.parseCosts(
  'Coffee | 9 | head\nLunch | 26 | head\nSupplies | 6.50 | head\nFacilitators | 4000\nRedwood consulting |  | not priced yet') };

test('budget lines parse, and a line with no number is left out', () => {
  assert.equal(budget.costs.length, 4);
  assert.equal(F.perHeadCost(budget), 4150);
  assert.equal(F.fixedCosts(budget), 400000);
});

test('a $50 ticket adds under $7 after food and fees; a $25 one loses money', () => {
  assert.equal(F.stripeFee(5000, budget), 175);
  assert.equal(F.marginPerHead(budget, 5000), 675);
  assert.ok(F.marginPerHead(budget, 2500) < 0);
});

test('sponsors needed falls slowly with headcount, and a comped person costs real money', () => {
  assert.equal(F.sponsorsToBreakEven(budget, 100, 5000), 400000 - 67500);
  assert.equal(F.sponsorsToBreakEven(budget, 200, 5000), 400000 - 135000);
  const withComp = F.net(budget, { heads: 2, ticket_cents: [5000], sponsor_cents: 0 });
  const without = F.net(budget, { heads: 1, ticket_cents: [5000], sponsor_cents: 0 });
  assert.equal(without - withComp, 4150);
});

const M = require('../functions/lib/makerLogic.js');

test('refunds close when the catering count locks, and only paid confirmed tickets qualify', () => {
  const paid = { status: 'confirmed', amount_paid_cents: 5000, stripe_payment_intent: 'pi' };
  assert.equal(L.canSelfRefund(paid, later, NOW), true);
  assert.equal(L.canSelfRefund(paid, earlier, NOW), false);
  assert.equal(L.canSelfRefund(paid, null, NOW), false);
  assert.equal(L.canSelfRefund({ ...paid, status: 'refunded' }, later, NOW), false);
  assert.equal(L.canSelfRefund({ ...paid, amount_paid_cents: 0 }, later, NOW), false);
  assert.equal(L.canSelfRefund({ ...paid, stripe_payment_intent: null }, later, NOW), false);
});

test('a ticket can go to anyone not already holding or waiting for a place', () => {
  assert.equal(L.canTransfer({ status: 'confirmed' }, undefined, NOW), true);
  assert.equal(L.canTransfer({ status: 'confirmed' }, { status: 'cancelled', hold_expires_at: null }, NOW), true);
  assert.equal(L.canTransfer({ status: 'confirmed' }, { status: 'confirmed', hold_expires_at: null }, NOW), false);
  assert.equal(L.canTransfer({ status: 'confirmed' }, { status: 'waitlisted', hold_expires_at: null }, NOW), false);
  assert.equal(L.canTransfer({ status: 'waitlisted' }, undefined, NOW), false);
});

test('the maker vocabularies on the form match the versioned ones', () => {
  const enums = JSON.parse(readFileSync(new URL('../data/schema/enums.json', import.meta.url)));
  assert.deepEqual(enums.LookingFor.map((r) => r.id), [...L.LOOKING_FOR]);
  const model = readFileSync(new URL('../src/events/model.ts', import.meta.url), 'utf8');
  for (const r of enums.LookingFor) assert.ok(model.includes(`['${r.id}', '${r.label}']`), `model.ts lacks ${r.id}`);
});

const profile = (o = {}) => ({ headline: '', bio: '', town: '', disciplines: [], open_to: [], website: null, instagram: null, work_count: 0, events: [], ...o });
test('a fuller profile scores higher, shown work counts most, and the steps total 100', () => {
  assert.equal(M.profileScore(profile()), 0);
  assert.equal(M.profileSteps(profile()).reduce((n, s) => n + s.points, 0), 100);
  assert.equal(M.profileScore(profile({ work_count: 1 })), 30);
  assert.equal(M.profileScore(profile({ bio: 'short' })), 0);
  assert.equal(M.profileScore(profile({ events: [{ attended: false }] })), 0, 'a ticket alone is not attending');
  assert.equal(M.profileScore(profile({ events: [{ attended: true }] })), 10);
});

test('only a web address can become a link on a profile', () => {
  assert.equal(M.safeWebUrl('example.org'), 'https://example.org/');
  assert.equal(M.safeWebUrl('http://example.org/x'), 'http://example.org/x');
  assert.equal(M.safeWebUrl('javascript:alert(1)'), null);
  assert.equal(M.safeWebUrl('data:text/html,hi'), null);
  assert.equal(M.safeWebUrl(''), null);
});
