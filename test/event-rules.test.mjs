// What firestore.rules promise about events: no client can create a
// registration, settle one or read someone else's. `npm run test:events:rules`.

import { test, before, after, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, getDocs, updateDoc, deleteDoc, collection, query, where } from 'firebase/firestore';
import { ref, uploadBytes, getBytes, deleteObject, listAll } from 'firebase/storage';

const T = '2026-11-05T12:00:00.000Z';
let env;
const user = (uid, email = `${uid}@example.org`) => env.authenticatedContext(uid, { email, email_verified: true }).firestore();
const anon = () => env.unauthenticatedContext().firestore();
const event = (o = {}) => ({ title: 'Bonanza', status: 'announced', region_id: 'us-ct', capacity: 100, tiers: [], sponsor_tiers: [], sponsors: [], terms: 'x', terms_version: 'v1', updated_at: T, ...o });
const reg = (o = {}) => ({ event_id: 'ev', region_id: 'us-ct', name: 'Jo', email: 'jo@example.org', status: 'waitlisted', price_cents: 5000, amount_paid_cents: 0, attended: null, updated_at: T, ...o });

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'makerspace-net',
    firestore: { rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8180 },
    storage: { rules: readFileSync(new URL('../storage.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 9399 },
  });
});
after(async () => { await env.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'stewardships', 'ct'), { region_ids: ['us-ct'], network_admin: false, granted_by: 'x', created_at: T });
    await setDoc(doc(db, 'stewardships', 'ri'), { region_ids: ['us-ri'], network_admin: false, granted_by: 'x', created_at: T });
    await setDoc(doc(db, 'events', 'ev'), event());
    await setDoc(doc(db, 'events', 'hidden'), event({ status: 'draft' }));
    await setDoc(doc(db, 'event_stats', 'ev'), { registered: 1 });
    await setDoc(doc(db, 'event_registrations', 'r1'), reg());
    await setDoc(doc(db, 'event_registrations', 'paid'), reg({ status: 'pending_payment' }));
    await setDoc(doc(db, 'event_registration_secrets', 'r1'), { manage_token: 'secret' });
    await setDoc(doc(db, 'event_sponsors', 's1'), { event_id: 'ev', region_id: 'us-ct', status: 'inquiry', amount_paid_cents: 0, updated_at: T });
    await setDoc(doc(db, 'event_interest', 'i1'), { event_id: 'ev', region_id: 'us-ct', email: 'a@b.c' });
    await setDoc(doc(db, 'event_codes', 'ev~FREE'), { event_id: 'ev', region_id: 'us-ct', tier_id: 'comp', max_uses: 1, note: '', created_at: T });
    await setDoc(doc(db, 'event_finance', 'ev'), { costs: [] });
    await setDoc(doc(db, 'event_space_stats', 'ev~spark'), { event_id: 'ev', space_id: 'spark', region_id: 'us-ct', home: 1, people: [] });
    await setDoc(doc(db, 'people', 'sparkadmin'), { name: 'A', email: 'a@spark.org' });
    await setDoc(doc(db, 'memberships', 'sparkadmin_spark'), { person_id: 'sparkadmin', space_id: 'spark', role: 'space_admin', status: 'active' });
    await setDoc(doc(db, 'memberships', 'sparkmember_spark'), { person_id: 'sparkmember', space_id: 'spark', role: 'space_contact', status: 'active' });
  });
});

test('anyone can read an event that has left draft, and its public counts', async () => {
  await assertSucceeds(getDoc(doc(anon(), 'events', 'ev')));
  await assertSucceeds(getDoc(doc(anon(), 'event_stats', 'ev')));
});
test('a draft is visible only to its stewards', async () => {
  await assertFails(getDoc(doc(anon(), 'events', 'hidden')));
  await assertFails(getDoc(doc(user('someone'), 'events', 'hidden')));
  await assertFails(getDoc(doc(user('ri'), 'events', 'hidden')));
  await assertSucceeds(getDoc(doc(user('ct'), 'events', 'hidden')));
});
test('the public cannot list drafts, but can list what is public', async () => {
  await assertFails(getDocs(collection(anon(), 'events')));
  await assertSucceeds(getDocs(query(collection(anon(), 'events'), where('status', 'in', ['announced', 'open']))));
});
test('only the region\'s steward edits an event; prices cannot be changed from outside', async () => {
  await assertFails(updateDoc(doc(anon(), 'events', 'ev'), { capacity: 9999, updated_at: T }));
  await assertFails(updateDoc(doc(user('someone'), 'events', 'ev'), { capacity: 9999, updated_at: T }));
  await assertFails(updateDoc(doc(user('ri'), 'events', 'ev'), { capacity: 9999, updated_at: T }));
  await assertSucceeds(updateDoc(doc(user('ct'), 'events', 'ev'), { capacity: 200, updated_at: T }));
});
test('an event cannot open without terms', async () => {
  await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'events', 'noterms'), event({ status: 'draft', terms: '', terms_version: '' })));
  await assertFails(updateDoc(doc(user('ct'), 'events', 'noterms'), { status: 'open', updated_at: T }));
  await assertSucceeds(updateDoc(doc(user('ct'), 'events', 'noterms'), { status: 'announced', updated_at: T }));
});
test('a new event must start as a draft, and a steward cannot move it between regions', async () => {
  await assertFails(setDoc(doc(user('ct'), 'events', 'n'), event({ status: 'open' })));
  await assertSucceeds(setDoc(doc(user('ct'), 'events', 'n'), event({ status: 'draft' })));
  await assertFails(updateDoc(doc(user('ct'), 'events', 'ev'), { region_id: 'us-ri', updated_at: T }));
});

test('nobody, steward included, can create a registration from a browser', async () => {
  for (const db of [anon(), user('someone'), user('ct')]) {
    await assertFails(setDoc(doc(db, 'event_registrations', 'forged'), reg({ status: 'confirmed', amount_paid_cents: 5000 })));
  }
});
test('registrations are private to the region\'s stewards', async () => {
  await assertFails(getDoc(doc(anon(), 'event_registrations', 'r1')));
  await assertFails(getDoc(doc(user('someone'), 'event_registrations', 'r1')));
  await assertFails(getDoc(doc(user('ri'), 'event_registrations', 'r1')));
  await assertFails(getDoc(doc(user('sparkadmin'), 'event_registrations', 'r1')));
  await assertSucceeds(getDoc(doc(user('ct'), 'event_registrations', 'r1')));
});
test('a steward can offer a waitlisted place and check someone in', async () => {
  const db = user('ct');
  await assertSucceeds(updateDoc(doc(db, 'event_registrations', 'r1'), { status: 'offered', offered_at: T, updated_at: T }));
  await assertSucceeds(updateDoc(doc(db, 'event_registrations', 'r1'), { attended: true, checked_in_at: T, updated_at: T }));
});
test('a steward cannot mark someone paid or confirmed, or change a price', async () => {
  const db = user('ct');
  await assertFails(updateDoc(doc(db, 'event_registrations', 'paid'), { status: 'confirmed', updated_at: T }));
  await assertFails(updateDoc(doc(db, 'event_registrations', 'r1'), { status: 'confirmed', updated_at: T }));
  await assertFails(updateDoc(doc(db, 'event_registrations', 'r1'), { amount_paid_cents: 5000, updated_at: T }));
  await assertFails(updateDoc(doc(db, 'event_registrations', 'r1'), { price_cents: 0, updated_at: T }));
  await assertFails(updateDoc(doc(db, 'event_registrations', 'r1'), { consents: { network: true }, updated_at: T }));
  await assertFails(deleteDoc(doc(db, 'event_registrations', 'r1')));
});
test('manage tokens, locks and rate limits are reachable by no client', async () => {
  await assertFails(getDoc(doc(user('ct'), 'event_registration_secrets', 'r1')));
  await assertFails(getDoc(doc(user('ct'), 'event_locks', 'ev')));
  await assertFails(setDoc(doc(user('ct'), 'event_rate_limits', 'x'), { n: 0 }));
});
test('a space\'s staff see their own counts; its other members and other people do not', async () => {
  await assertSucceeds(getDoc(doc(user('sparkadmin'), 'event_space_stats', 'ev~spark')));
  await assertSucceeds(getDoc(doc(user('ct'), 'event_space_stats', 'ev~spark')));
  await assertFails(getDoc(doc(user('sparkmember'), 'event_space_stats', 'ev~spark')));
  await assertFails(getDoc(doc(user('someone'), 'event_space_stats', 'ev~spark')));
  await assertFails(getDoc(doc(anon(), 'event_space_stats', 'ev~spark')));
});
test('sponsors, interest, codes and the budget are stewards only', async () => {
  for (const [c, id] of [['event_sponsors', 's1'], ['event_interest', 'i1'], ['event_codes', 'ev~FREE'], ['event_finance', 'ev']]) {
    await assertFails(getDoc(doc(anon(), c, id)));
    await assertFails(getDoc(doc(user('someone'), c, id)));
    await assertFails(getDoc(doc(user('ri'), c, id)));
    await assertSucceeds(getDoc(doc(user('ct'), c, id)));
  }
});
test('a steward tracks a sponsor by hand but cannot rewrite what a card paid', async () => {
  const db = user('ct');
  await assertSucceeds(updateDoc(doc(db, 'event_sponsors', 's1'), { status: 'invoiced', updated_at: T }));
  await assertFails(updateDoc(doc(db, 'event_sponsors', 's1'), { amount_paid_cents: 999, updated_at: T }));
  await assertFails(setDoc(doc(db, 'event_sponsors', 'new'), { event_id: 'ev', region_id: 'us-ct', status: 'paid' }));
});
test('interest cannot be written from a browser', async () => {
  await assertFails(setDoc(doc(anon(), 'event_interest', 'x'), { event_id: 'ev', region_id: 'us-ct', email: 'a@b.c' }));
});

// The admin page lists rather than gets, and a list is judged differently: the
// query itself must prove it stays inside the steward's region.
const ofEvent = (db, c) => query(collection(db, c), where('event_id', '==', 'ev'), where('region_id', '==', 'us-ct'));
test('a region steward can list each event collection, scoped to their region', async () => {
  for (const c of ['event_registrations', 'event_sponsors', 'event_interest', 'event_codes']) await assertSucceeds(getDocs(ofEvent(user('ct'), c)));
});
test('the same lists are refused to everyone else', async () => {
  for (const c of ['event_registrations', 'event_sponsors', 'event_interest', 'event_codes']) {
    await assertFails(getDocs(ofEvent(anon(), c)));
    await assertFails(getDocs(ofEvent(user('someone'), c)));
    await assertFails(getDocs(ofEvent(user('ri'), c)));
    await assertFails(getDocs(ofEvent(user('sparkadmin'), c)));
  }
});
test('an unscoped list is refused even to a region steward', async () => {
  await assertFails(getDocs(collection(user('ct'), 'event_registrations')));
  await assertFails(getDocs(query(collection(user('ct'), 'event_registrations'), where('event_id', '==', 'ev'))));
});
test('a steward makes codes for their own events, not another region\'s', async () => {
  const code = { event_id: 'ev', region_id: 'us-ct', tier_id: 'comp', max_uses: 2, note: '', created_at: T };
  await assertSucceeds(setDoc(doc(user('ct'), 'event_codes', 'ev~NEW'), code));
  await assertFails(setDoc(doc(user('ri'), 'event_codes', 'ev~NEW2'), code));
  await assertFails(setDoc(doc(user('ri'), 'event_codes', 'ev~NEW3'), { ...code, region_id: 'us-ri' }));
  await assertFails(setDoc(doc(user('ct'), 'event_codes', 'other~NEW'), code));
});

// ---------- makers ----------
const maker = (o = {}) => ({
  display_name: 'Riley', headline: '', bio: '', town: '', state: 'CT', home_space_id: null, disciplines: [], open_to: [], looking_for: [],
  website: null, instagram: null, contact_email: null, visibility: 'public', review: 'pending', events: [], cover_url: null, work_count: 0, work_pending: 0,
  created_at: T, updated_at: T, ...o,
});
const work = (o = {}) => ({ url: 'https://firebasestorage.googleapis.com/v0/x', path: 'makers/riley/abc.jpg', caption: '', status: 'pending', created_at: T, ...o });
const seedMaker = (id, o) => env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'makers', id), maker(o)));
const seedWork = (id, wid, o) => env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'makers', id, 'work', wid), work(o)));

test('anyone with a verified address can say they are a maker, and it starts unreviewed', async () => {
  await assertSucceeds(setDoc(doc(user('riley'), 'makers', 'riley'), maker()));
  await assertFails(setDoc(doc(anon(), 'makers', 'x'), maker()));
  await assertFails(setDoc(doc(user('other'), 'makers', 'riley'), maker()));
  const unverified = env.authenticatedContext('nov', { email: 'n@example.org', email_verified: false }).firestore();
  await assertFails(setDoc(doc(unverified, 'makers', 'nov'), maker()));
});
test('a maker cannot approve themselves, award themselves an event or set their own photo count', async () => {
  await assertFails(setDoc(doc(user('riley'), 'makers', 'riley'), maker({ review: 'approved' })));
  await assertFails(setDoc(doc(user('riley'), 'makers', 'riley'), maker({ events: [{ id: 'x', title: 'X', attended: true }] })));
  await seedMaker('riley');
  const db = user('riley');
  await assertFails(updateDoc(doc(db, 'makers', 'riley'), { review: 'approved', updated_at: T }));
  await assertFails(updateDoc(doc(db, 'makers', 'riley'), { events: [{ id: 'x', title: 'X', attended: true }], updated_at: T }));
  await assertFails(updateDoc(doc(db, 'makers', 'riley'), { work_count: 9, updated_at: T }));
  await assertFails(updateDoc(doc(db, 'makers', 'riley'), { cover_url: 'https://evil.example/x.jpg', updated_at: T }));
  await assertSucceeds(updateDoc(doc(db, 'makers', 'riley'), { bio: 'I weld', updated_at: T }));
});
test('a link on a profile must open a web page', async () => {
  await seedMaker('riley');
  const db = user('riley');
  await assertFails(updateDoc(doc(db, 'makers', 'riley'), { website: 'javascript:alert(1)', updated_at: T }));
  await assertSucceeds(updateDoc(doc(db, 'makers', 'riley'), { website: 'https://example.org', updated_at: T }));
  await assertFails(updateDoc(doc(db, 'makers', 'riley'), { instagram: 'x/../../y', updated_at: T }));
});
test('who sees a profile: public, community, hidden, unreviewed', async () => {
  await seedMaker('pub', { review: 'approved', visibility: 'public' });
  await seedMaker('com', { review: 'approved', visibility: 'community' });
  await seedMaker('hid', { review: 'approved', visibility: 'hidden' });
  await seedMaker('new', { review: 'pending', visibility: 'public' });
  await seedMaker('off', { review: 'hidden', visibility: 'public' });
  await seedMaker('peer', { review: 'approved', visibility: 'hidden' });
  await assertSucceeds(getDoc(doc(anon(), 'makers', 'pub')));
  await assertFails(getDoc(doc(anon(), 'makers', 'com')));
  await assertFails(getDoc(doc(user('noprofile'), 'makers', 'com')));
  await assertSucceeds(getDoc(doc(user('peer'), 'makers', 'com')));
  for (const id of ['hid', 'new', 'off']) {
    await assertFails(getDoc(doc(anon(), 'makers', id)));
    await assertFails(getDoc(doc(user('peer'), 'makers', id)));
    await assertSucceeds(getDoc(doc(user('ct'), 'makers', id)));
    await assertSucceeds(getDoc(doc(user(id), 'makers', id)));
  }
});
test('the public directory query works signed out; the community one needs a profile', async () => {
  await seedMaker('peer', { review: 'approved', visibility: 'hidden' });
  const list = (db, visibility) => getDocs(query(collection(db, 'makers'), where('visibility', '==', visibility), where('review', '==', 'approved')));
  await assertSucceeds(list(anon(), 'public'));
  await assertFails(list(anon(), 'community'));
  await assertSucceeds(list(user('peer'), 'community'));
  await assertFails(getDocs(collection(anon(), 'makers')));
});
test('only a steward or admin moderates, and only the review field', async () => {
  await seedMaker('riley');
  await assertFails(updateDoc(doc(user('someone'), 'makers', 'riley'), { review: 'approved', updated_at: T }));
  await assertSucceeds(updateDoc(doc(user('ct'), 'makers', 'riley'), { review: 'approved', updated_at: T }));
  await assertFails(updateDoc(doc(user('ct'), 'makers', 'riley'), { bio: 'edited by a steward', updated_at: T }));
});
test('being a maker opens nothing on the roster', async () => {
  await seedMaker('peer', { review: 'approved' });
  await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'roster', 'someone'), { name: 'S', space_id: 'x' }));
  await assertFails(getDoc(doc(user('peer'), 'roster', 'someone')));
});
test('a photo starts unreviewed and cannot point somewhere else or approve itself', async () => {
  await seedMaker('riley', { review: 'approved' });
  const db = user('riley');
  const w = (id) => doc(db, 'makers', 'riley', 'work', id);
  await assertSucceeds(setDoc(w('ok'), work()));
  await assertFails(setDoc(w('a'), work({ status: 'approved' })));
  await assertFails(setDoc(w('b'), work({ url: 'https://evil.example/x.jpg' })));
  await assertFails(setDoc(w('c'), work({ path: 'makers/someone-else/abc.jpg' })));
  await assertFails(updateDoc(w('ok'), { status: 'approved' }));
  await assertSucceeds(updateDoc(w('ok'), { caption: 'A chair' }));
  await assertFails(updateDoc(w('ok'), { url: 'https://firebasestorage.googleapis.com/v0/other' }));
  await assertSucceeds(updateDoc(doc(user('ct'), 'makers', 'riley', 'work', 'ok'), { status: 'approved' }));
  await assertFails(updateDoc(doc(user('someone'), 'makers', 'riley', 'work', 'ok'), { status: 'rejected' }));
});
test('other people see approved photos of a visible maker only', async () => {
  await seedMaker('riley', { review: 'approved', visibility: 'public' });
  await seedWork('riley', 'yes', { status: 'approved' });
  await seedWork('riley', 'wait', { status: 'pending' });
  await assertSucceeds(getDoc(doc(anon(), 'makers', 'riley', 'work', 'yes')));
  await assertFails(getDoc(doc(anon(), 'makers', 'riley', 'work', 'wait')));
  await assertSucceeds(getDocs(query(collection(anon(), 'makers', 'riley', 'work'), where('status', '==', 'approved'))));
  await assertFails(getDocs(collection(anon(), 'makers', 'riley', 'work')));
  await assertSucceeds(getDoc(doc(user('riley'), 'makers', 'riley', 'work', 'wait')));
  await seedMaker('riley', { review: 'hidden', visibility: 'public' });
  await assertFails(getDoc(doc(anon(), 'makers', 'riley', 'work', 'yes')), 'hiding a maker hides their photos');
});

const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
const asUser = (uid, verified = true) => env.authenticatedContext(uid, { email: `${uid}@example.org`, email_verified: verified }).storage();
test('uploads: your own folder, JPEG only, under the size limit', async () => {
  const meta = { contentType: 'image/jpeg' };
  await assertSucceeds(uploadBytes(ref(asUser('riley'), 'makers/riley/a.jpg'), jpeg, meta));
  await assertFails(uploadBytes(ref(asUser('other'), 'makers/riley/b.jpg'), jpeg, meta));
  await assertFails(uploadBytes(ref(env.unauthenticatedContext().storage(), 'makers/riley/c.jpg'), jpeg, meta));
  await assertFails(uploadBytes(ref(asUser('nov', false), 'makers/nov/d.jpg'), jpeg, meta));
  await assertFails(uploadBytes(ref(asUser('riley'), 'makers/riley/e.svg'), jpeg, { contentType: 'image/svg+xml' }));
  await assertFails(uploadBytes(ref(asUser('riley'), 'makers/riley/big.jpg'), new Uint8Array(4 * 1024 * 1024 + 1), meta));
  await assertFails(uploadBytes(ref(asUser('riley'), 'elsewhere/f.jpg'), jpeg, meta));
});
test('a photo can be fetched by address, but the folder cannot be listed, and only its owner deletes it', async () => {
  await assertSucceeds(uploadBytes(ref(asUser('riley'), 'makers/riley/g.jpg'), jpeg, { contentType: 'image/jpeg' }));
  await assertSucceeds(getBytes(ref(env.unauthenticatedContext().storage(), 'makers/riley/g.jpg')));
  await assertFails(listAll(ref(env.unauthenticatedContext().storage(), 'makers/riley')));
  await assertFails(deleteObject(ref(asUser('other'), 'makers/riley/g.jpg')));
  await assertSucceeds(deleteObject(ref(asUser('riley'), 'makers/riley/g.jpg')));
});
