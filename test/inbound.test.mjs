// End-to-end test of group mail in the Functions emulator: Postmark's inbound
// webhook in, posts and threads out, and the mailer's reply keys. Postmark
// itself is not reached (the token is fake), so outbound mail ends "failed" -
// what is checked is everything this code decides. Run with `npm run test:inbound`.

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../functions/package.json', import.meta.url));
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

initializeApp({ projectId: 'makerspace-net' });
const db = getFirestore();
const URL_ = 'http://127.0.0.1:5101/makerspace-net/us-central1/groupInbound';
const SECRET = 'test-inbound-secret';
const T = new Date().toISOString();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const post = (payload, secret = SECRET) => fetch(URL_, {
  method: 'POST', headers: { 'Content-Type': 'application/json', 'x-postmark-webhook-secret': secret }, body: JSON.stringify(payload),
});
const mail = (o = {}) => ({
  FromFull: { Email: 'jo@makehaven.org', Name: 'Jo' }, ToFull: [{ Email: 'ct@lists.makerspace.network' }],
  OriginalRecipient: 'ct@lists.makerspace.network', Subject: 'Shop insurance', TextBody: 'Who do you use?\n\n> quoted',
  StrippedTextReply: 'Who do you use?', Headers: [{ Name: 'Received-SPF', Value: 'Pass (sender SPF authorized)' }], ...o,
});
const threads = async () => (await db.collection('groups/ct/threads').get()).docs;
const postsOf = async (tid) => (await db.collection(`groups/ct/threads/${tid}/posts`).orderBy('created_at').get()).docs.map((d) => d.data());
async function waitFor(f, ms = 8000) {
  for (let t = 0; t < ms; t += 200) { const v = await f(); if (v) return v; await sleep(200); }
  return f();
}

before(async () => {
  for (const c of ['groups', 'people', 'roster', 'reply_keys', 'audit']) await db.recursiveDelete(db.collection(c));
  const person = (email) => ({ name: email.split('@')[0], email, email_domain: email.split('@')[1], phone: null, primary_space_id: 'x', created_at: T, updated_at: T });
  const roster = (name) => ({ name, space_id: 'x', space_name: 'Somewhere', state: 'CT', region_id: 'us-ct', role: 'space_contact', functions: [], email: null, phone: null, updated_at: T });
  const member = (name) => ({ name, delivery: 'each', added_by: 'x', via_invitation: null, joined_at: T, updated_at: T });
  await db.doc('people/jo').set(person('jo@makehaven.org')); await db.doc('roster/jo').set(roster('Jo'));
  await db.doc('people/kim').set(person('kim@spark.org')); await db.doc('roster/kim').set(roster('Kim'));
  await db.doc('people/out').set(person('out@else.org')); await db.doc('roster/out').set(roster('Out'));
  await db.doc('groups/ct').set({ name: 'CT Makerspaces', slug: 'ct', description: '', region_id: 'us-ct', manager_uids: [], join_policy: 'managers', posting: 'members', archived: false, created_by: 'x', created_at: T, updated_at: T });
  await db.doc('groups/ct/members/jo').set(member('Jo'));
  await db.doc('groups/ct/members/kim').set(member('Kim'));
});

test('a bad secret is refused outright', async () => {
  assert.equal((await post(mail(), 'wrong')).status, 401);
});

test('a member mailing the group address with SPF passing starts a thread, quoted text stripped', async () => {
  const res = await (await post(mail())).json();
  assert.equal(res.outcome, 'posted');
  const ts = await threads();
  assert.equal(ts.length, 1);
  assert.equal(ts[0].get('subject'), 'Shop insurance');
  const [p] = await postsOf(ts[0].id);
  assert.equal(p.body, 'Who do you use?');
  assert.equal(p.author_uid, 'jo');
  assert.equal(p.source, 'email');
});

test('the mailer records a reply key for every other member, and one reply by it joins the thread', async () => {
  const tid = (await threads())[0].id;
  const key = createHmac('sha256', 'test-reply-key-secret').update(`ct/${tid}/kim`).digest('hex').slice(0, 24);
  const k = await waitFor(async () => (await db.doc(`reply_keys/${key}`).get()).exists);
  assert.ok(k, 'mailer wrote the reply key for kim');
  assert.equal((await db.doc(`reply_keys/${createHmac('sha256', 'test-reply-key-secret').update(`ct/${tid}/jo`).digest('hex').slice(0, 24)}`).get()).exists, false,
    'no key for the author, who is not mailed their own post');
  const res = await (await post(mail({
    FromFull: { Email: 'kim@spark.org' }, OriginalRecipient: `reply+${key}@lists.makerspace.network`,
    ToFull: [{ Email: `reply+${key}@lists.makerspace.network` }], Subject: 'Re: [CT Makerspaces] Shop insurance',
    StrippedTextReply: 'We use Hanover.', Headers: [],
  }))).json();
  assert.equal(res.outcome, 'posted');
  const ps = await postsOf(tid);
  assert.equal(ps.length, 2);
  assert.equal(ps[1].author_uid, 'kim');
  assert.equal(ps[1].status === 'held', false);
  assert.equal((await db.doc(`groups/ct/threads/${tid}`).get()).get('post_count'), 2);
});

test('a reply key used from a different address is held, not posted as its owner', async () => {
  const tid = (await threads())[0].id;
  const key = createHmac('sha256', 'test-reply-key-secret').update(`ct/${tid}/kim`).digest('hex').slice(0, 24);
  const res = await (await post(mail({ FromFull: { Email: 'someone@forwarded.org' }, OriginalRecipient: `reply+${key}@lists.makerspace.network`, ToFull: [], StrippedTextReply: 'hi', Headers: [] }))).json();
  assert.equal(res.outcome, 'held');
  const ps = await postsOf(tid);
  assert.equal(ps.at(-1).status, 'held');
});

test('no SPF on the group address holds the post; strangers, non-members and auto-replies are dropped', async () => {
  assert.equal((await (await post(mail({ Subject: 'Unverified', Headers: [] }))).json()).outcome, 'held');
  assert.equal((await (await post(mail({ FromFull: { Email: 'stranger@x.org' } }))).json()).outcome, 'unknown sender');
  assert.equal((await (await post(mail({ FromFull: { Email: 'out@else.org' } }))).json()).outcome, 'not allowed');
  assert.equal((await (await post(mail({ Headers: [{ Name: 'Auto-Submitted', Value: 'auto-replied' }] }))).json()).outcome, 'automated');
  assert.equal((await (await post(mail({ Subject: 'Out of Office: back Monday', Headers: [] }))).json()).outcome, 'automated');
  assert.equal((await (await post(mail({ StrippedTextReply: '', TextBody: '' }))).json()).outcome, 'empty');
  assert.equal((await threads()).length, 2, 'only the held thread was added');
});

test('unsubscribe: GET only asks (link scanners), POST stops email but keeps membership', async () => {
  const tid = (await threads()).find((t) => t.get('subject') === 'Shop insurance').id;
  const key = createHmac('sha256', 'test-reply-key-secret').update(`ct/${tid}/kim`).digest('hex').slice(0, 24);
  const u = `http://127.0.0.1:5101/makerspace-net/us-central1/groupUnsubscribe?k=${key}`;
  const page = await (await fetch(u)).text();
  assert.match(page, /Stop email from CT Makerspaces/);
  assert.equal((await db.doc('groups/ct/members/kim').get()).get('delivery'), 'each');
  assert.equal((await fetch(u, { method: 'POST', body: 'List-Unsubscribe=One-Click', headers: { 'Content-Type': 'application/x-www-form-urlencoded' } })).status, 200);
  const m = await db.doc('groups/ct/members/kim').get();
  assert.equal(m.exists, true);
  assert.equal(m.get('delivery'), 'none');
  assert.equal((await fetch(u.replace(key, 'deadbeef'))).status, 404);
});
