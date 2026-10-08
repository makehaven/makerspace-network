// Security-rules tests for the people layer. Run with `npm run test:rules`,
// which starts the Firestore emulator around this file. Each test says what
// GOVERNANCE.md promises and checks the rules keep it.

import { test, before, after, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import {
  initializeTestEnvironment, assertSucceeds, assertFails,
} from '@firebase/rules-unit-testing';
import {
  doc, setDoc, getDoc, getDocs, updateDoc, deleteDoc, collection, writeBatch, addDoc, query, where, Timestamp,
} from 'firebase/firestore';

const PROJECT = 'makerspace-net';
const T = '2026-09-23T12:00:00.000Z';
let env;

const user = (uid, email, verified = true) =>
  env.authenticatedContext(uid, { email, email_verified: verified }).firestore();

const seed = async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const space = (o) => ({ kind: 'makerspace', partner_type: null, size_tier: null, proposed: false, website: null, city: null, claimed: false, updated_at: T, ...o });
    await setDoc(doc(db, 'spaces_index', 'makehaven'), space({ name: 'MakeHaven', domain: 'makehaven.org', state: 'CT', region_id: 'us-ct' }));
    await setDoc(doc(db, 'spaces_index', 'spark'), space({ name: 'Spark', domain: 'sparkmakerspace.org', state: 'CT', region_id: 'us-ct' }));
    await setDoc(doc(db, 'spaces_index', 'ohio-makers'), space({ name: 'Ohio Makers', domain: 'ohiomakers.org', state: 'OH', region_id: null }));
    await setDoc(doc(db, 'spaces_index', 'partner-decd-ct'), space({ name: 'CT DECD', kind: 'partner', partner_type: 'government', domain: 'ct.gov', state: 'CT', region_id: 'us-ct' }));
    await setDoc(doc(db, 'stewardships', 'admin'), { region_ids: [], network_admin: true, granted_by: 'admin', created_at: T });
    await setDoc(doc(db, 'stewardships', 'ctsteward'), { region_ids: ['us-ct'], network_admin: false, granted_by: 'admin', created_at: T });
  });
};

const person = (name, email, primary = null) => ({
  name, email, email_domain: email.split('@')[1], phone: null, primary_space_id: primary, created_at: T, updated_at: T,
});
const membership = (uid, space, role, status, extra = {}) => ({
  person_id: uid, space_id: space, role, status, functions: ['staff'], contact_preference: 'relay',
  invitations: true, state: space === 'ohio-makers' ? 'OH' : 'CT', region_id: space === 'ohio-makers' ? null : 'us-ct',
  confirmed_by: null, created_at: T, updated_at: T, ...extra,
});

/** Put a person in as an active member, bypassing rules, so later tests can act as them. */
const activate = async (uid, email, space, role) => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'people', uid), person(uid, email, space));
    await setDoc(doc(db, 'memberships', `${uid}_${space}`), membership(uid, space, role, 'active'));
    await setDoc(doc(db, 'roster', uid), {
      name: uid, space_id: space, space_name: '', state: 'CT', region_id: 'us-ct', role, functions: ['staff'],
      email: null, phone: null, updated_at: T,
    });
  });
};

before(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT,
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8180 },
  });
});
after(async () => { await env.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); await seed(); });

// ---------- bootstrap and stewardships ----------

test('the bootstrap address may make itself network admin once; nobody else may', async () => {
  const jr = user('jr', 'jrlogan@makehaven.org');
  // Before the bootstrap, the address cannot grant anyone else.
  await assertFails(setDoc(doc(jr, 'stewardships', 'friend'), { region_ids: [], network_admin: true, granted_by: 'jr', created_at: T }));
  await assertSucceeds(setDoc(doc(jr, 'stewardships', 'jr'), { region_ids: [], network_admin: true, granted_by: 'jr', created_at: T }));
  // After it, they are a network admin like any other and may grant.
  await assertSucceeds(setDoc(doc(jr, 'stewardships', 'friend'), { region_ids: ['us-ct'], network_admin: false, granted_by: 'jr', created_at: T }));
  const rando = user('rando', 'someone@gmail.com');
  await assertFails(setDoc(doc(rando, 'stewardships', 'rando'), { region_ids: [], network_admin: true, granted_by: 'rando', created_at: T }));
});

test('a network admin grants stewardships; a steward cannot', async () => {
  await assertSucceeds(setDoc(doc(user('admin', 'a@x.org'), 'stewardships', 'p1'), { region_ids: ['us-ct'], network_admin: false, granted_by: 'admin', created_at: T }));
  await assertFails(setDoc(doc(user('ctsteward', 's@x.org'), 'stewardships', 'p2'), { region_ids: ['us-ct'], network_admin: false, granted_by: 'ctsteward', created_at: T }));
});

// ---------- spaces_index ----------

test('only a network admin mirrors directory spaces; anyone may propose one', async () => {
  const entry = { name: 'New', kind: 'makerspace', partner_type: null, domain: null, state: 'RI', region_id: null, size_tier: null, proposed: false, website: null, city: null, claimed: false, updated_at: T };
  await assertSucceeds(setDoc(doc(user('admin', 'a@x.org'), 'spaces_index', 'new-space'), entry));
  const rando = user('rando', 'r@gmail.com');
  await assertFails(setDoc(doc(rando, 'spaces_index', 'another'), entry));
  await assertSucceeds(setDoc(doc(rando, 'spaces_index', 'proposed-ri-makers'), { ...entry, proposed: true, proposed_by: 'rando' }));
  // A proposal cannot carry a region or arrive pre-claimed.
  await assertFails(setDoc(doc(rando, 'spaces_index', 'proposed-ri-two'), { ...entry, proposed: true, proposed_by: 'rando', region_id: 'us-ct' }));
  await assertFails(setDoc(doc(rando, 'spaces_index', 'proposed-ri-three'), { ...entry, proposed: true, proposed_by: 'rando', claimed: true }));
});

// ---------- joining ----------

test('a verified email at the space domain claims an unclaimed space as admin, in one batch', async () => {
  const db = user('jo', 'jo@makehaven.org');
  const b = writeBatch(db);
  b.set(doc(db, 'people', 'jo'), person('Jo', 'jo@makehaven.org', 'makehaven'));
  b.set(doc(db, 'memberships', 'jo_makehaven'), membership('jo', 'makehaven', 'space_admin', 'active'));
  b.update(doc(db, 'spaces_index', 'makehaven'), { claimed: true, updated_at: T });
  await assertSucceeds(b.commit());
});

test('an admin claim without the claim update, or an unverified email, is refused', async () => {
  const db = user('jo', 'jo@makehaven.org');
  const b = writeBatch(db);
  b.set(doc(db, 'people', 'jo'), person('Jo', 'jo@makehaven.org', 'makehaven'));
  b.set(doc(db, 'memberships', 'jo_makehaven'), membership('jo', 'makehaven', 'space_admin', 'active'));
  await assertFails(b.commit());

  const unverified = user('un', 'un@makehaven.org', false);
  const b2 = writeBatch(unverified);
  b2.set(doc(unverified, 'people', 'un'), person('Un', 'un@makehaven.org', 'makehaven'));
  b2.set(doc(unverified, 'memberships', 'un_makehaven'), membership('un', 'makehaven', 'space_admin', 'active'));
  b2.update(doc(unverified, 'spaces_index', 'makehaven'), { claimed: true, updated_at: T });
  await assertFails(b2.commit());
});

test('a second domain-matched admin at a claimed space waits; a domain-matched contact is active at once', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await updateDoc(doc(ctx.firestore(), 'spaces_index', 'makehaven'), { claimed: true });
  });
  const db = user('sam', 'sam@makehaven.org');
  await assertFails(setDoc(doc(db, 'memberships', 'sam_makehaven'), membership('sam', 'makehaven', 'space_admin', 'active')));
  await assertSucceeds(setDoc(doc(db, 'memberships', 'sam_makehaven'), membership('sam', 'makehaven', 'space_admin', 'pending')));
  const db2 = user('kim', 'kim@makehaven.org');
  await assertSucceeds(setDoc(doc(db2, 'memberships', 'kim_makehaven'), membership('kim', 'makehaven', 'space_contact', 'active')));
});

test('an email not at the space domain can only be a pending contact', async () => {
  const db = user('pat', 'pat@gmail.com');
  await assertSucceeds(setDoc(doc(db, 'memberships', 'pat_makehaven'), membership('pat', 'makehaven', 'space_contact', 'pending')));
  const db2 = user('lee', 'lee@gmail.com');
  await assertFails(setDoc(doc(db2, 'memberships', 'lee_makehaven'), membership('lee', 'makehaven', 'space_contact', 'active')));
  await assertFails(setDoc(doc(db2, 'memberships', 'lee_makehaven'), membership('lee', 'makehaven', 'space_admin', 'pending')));
});

test('a membership cannot be filed under the wrong region, and cannot be created for someone else', async () => {
  const db = user('pat', 'pat@gmail.com');
  await assertFails(setDoc(doc(db, 'memberships', 'pat_makehaven'), membership('pat', 'makehaven', 'space_contact', 'pending', { region_id: null })));
  await assertFails(setDoc(doc(db, 'memberships', 'other_makehaven'), membership('other', 'makehaven', 'space_contact', 'pending')));
});

test('a space outside any region can be joined (cross-state)', async () => {
  const db = user('oh', 'oh@ohiomakers.org');
  const b = writeBatch(db);
  b.set(doc(db, 'people', 'oh'), person('Oh', 'oh@ohiomakers.org', 'ohio-makers'));
  b.set(doc(db, 'memberships', 'oh_ohio-makers'), membership('oh', 'ohio-makers', 'space_admin', 'active'));
  b.update(doc(db, 'spaces_index', 'ohio-makers'), { claimed: true, updated_at: T });
  await assertSucceeds(b.commit());
});

// ---------- standing ----------

test('you may edit your own roster settings but never your own standing', async () => {
  const db = user('pat', 'pat@gmail.com');
  await setDoc(doc(db, 'memberships', 'pat_makehaven'), membership('pat', 'makehaven', 'space_contact', 'pending'));
  await assertSucceeds(updateDoc(doc(db, 'memberships', 'pat_makehaven'), { functions: ['youth'], updated_at: T }));
  await assertFails(updateDoc(doc(db, 'memberships', 'pat_makehaven'), { status: 'active', updated_at: T }));
  await assertFails(updateDoc(doc(db, 'memberships', 'pat_makehaven'), { role: 'space_admin', updated_at: T }));
});

test('a space admin confirms a pending contact and writes their roster entry for them', async () => {
  await activate('jo', 'jo@makehaven.org', 'makehaven', 'space_admin');
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'people', 'pat'), person('Pat', 'pat@gmail.com'));
    await setDoc(doc(db, 'memberships', 'pat_makehaven'), membership('pat', 'makehaven', 'space_contact', 'pending'));
  });
  const jo = user('jo', 'jo@makehaven.org');
  const b = writeBatch(jo);
  b.update(doc(jo, 'memberships', 'pat_makehaven'), { status: 'active', confirmed_by: 'jo', updated_at: T });
  b.update(doc(jo, 'people', 'pat'), { primary_space_id: 'makehaven', updated_at: T });
  b.set(doc(jo, 'roster', 'pat'), {
    name: 'Pat', space_id: 'makehaven', space_name: 'MakeHaven', state: 'CT', region_id: 'us-ct',
    role: 'space_contact', functions: ['staff'], email: null, phone: null, updated_at: T,
  });
  await assertSucceeds(b.commit());
});

test('a space admin cannot touch another space; a steward can act in their region and not outside it', async () => {
  await activate('jo', 'jo@makehaven.org', 'makehaven', 'space_admin');
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'memberships', 'x_spark'), membership('x', 'spark', 'space_contact', 'pending'));
    await setDoc(doc(db, 'memberships', 'y_ohio-makers'), membership('y', 'ohio-makers', 'space_contact', 'pending'));
  });
  await assertFails(updateDoc(doc(user('jo', 'jo@makehaven.org'), 'memberships', 'x_spark'), { status: 'active', updated_at: T }));
  const st = user('ctsteward', 's@x.org');
  await assertSucceeds(updateDoc(doc(st, 'memberships', 'x_spark'), { status: 'active', confirmed_by: 'ctsteward', updated_at: T }));
  await assertFails(updateDoc(doc(st, 'memberships', 'y_ohio-makers'), { status: 'active', updated_at: T }));
  await assertSucceeds(updateDoc(doc(user('admin', 'a@x.org'), 'memberships', 'y_ohio-makers'), { status: 'active', confirmed_by: 'admin', updated_at: T }));
});

// ---------- roster ----------

test('the roster is readable by verified people across states, not by pending ones or the public', async () => {
  await activate('jo', 'jo@makehaven.org', 'makehaven', 'space_admin');
  await activate('oh', 'oh@ohiomakers.org', 'ohio-makers', 'space_contact');
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'people', 'pat'), person('Pat', 'pat@gmail.com'));
    await setDoc(doc(db, 'memberships', 'pat_makehaven'), membership('pat', 'makehaven', 'space_contact', 'pending'));
  });
  await assertSucceeds(getDocs(collection(user('oh', 'oh@ohiomakers.org'), 'roster')));
  await assertSucceeds(getDoc(doc(user('jo', 'jo@makehaven.org'), 'roster', 'oh')));
  await assertFails(getDocs(collection(user('pat', 'pat@gmail.com'), 'roster')));
  await assertFails(getDocs(collection(env.unauthenticatedContext().firestore(), 'roster')));
});

test('a roster entry must match its sources; a contact can never expose an email', async () => {
  await activate('jo', 'jo@makehaven.org', 'makehaven', 'space_editor');
  const jo = user('jo', 'jo@makehaven.org');
  const base = { name: 'jo', space_id: 'makehaven', space_name: 'MakeHaven', state: 'CT', region_id: 'us-ct', role: 'space_editor', functions: ['staff'], email: null, phone: null, updated_at: T };
  await assertSucceeds(setDoc(doc(jo, 'roster', 'jo'), base));
  // Preference is relay, so even an organiser cannot show an email yet.
  await assertFails(setDoc(doc(jo, 'roster', 'jo'), { ...base, email: 'jo@makehaven.org' }));
  // Switch preference in the same batch: now allowed.
  const b = writeBatch(jo);
  b.update(doc(jo, 'memberships', 'jo_makehaven'), { contact_preference: 'email', updated_at: T });
  b.set(doc(jo, 'roster', 'jo'), { ...base, email: 'jo@makehaven.org' });
  await assertSucceeds(b.commit());
  // Lying about role or name is refused.
  await assertFails(setDoc(doc(jo, 'roster', 'jo'), { ...base, role: 'space_admin' }));
  await assertFails(setDoc(doc(jo, 'roster', 'jo'), { ...base, name: 'Someone Else' }));

  await activate('kim', 'kim@makehaven.org', 'makehaven', 'space_contact');
  const kim = user('kim', 'kim@makehaven.org');
  const b2 = writeBatch(kim);
  b2.update(doc(kim, 'memberships', 'kim_makehaven'), { contact_preference: 'email', updated_at: T });
  b2.set(doc(kim, 'roster', 'kim'), { ...base, name: 'kim', role: 'space_contact', email: 'kim@makehaven.org' });
  await assertFails(b2.commit());
});

// ---------- messages ----------

test('verified people relay messages to each other and see only their own', async () => {
  await activate('jo', 'jo@makehaven.org', 'makehaven', 'space_admin');
  await activate('oh', 'oh@ohiomakers.org', 'ohio-makers', 'space_contact');
  const jo = user('jo', 'jo@makehaven.org');
  const msg = { from_uid: 'jo', from_name: 'jo', to_uid: 'oh', subject: 'Hi', body: 'Youth programmes?', created_at: T, status: 'queued', read: false };
  const ref = await assertSucceeds(addDoc(collection(jo, 'messages'), msg));
  await assertFails(addDoc(collection(jo, 'messages'), { ...msg, from_uid: 'oh' }));
  await assertFails(addDoc(collection(jo, 'messages'), { ...msg, to_uid: 'nobody' }));
  const oh = user('oh', 'oh@ohiomakers.org');
  await assertSucceeds(getDocs(query(collection(oh, 'messages'), where('to_uid', '==', 'oh'))));
  await assertSucceeds(updateDoc(doc(oh, 'messages', ref.id), { read: true }));
  await assertFails(updateDoc(doc(oh, 'messages', ref.id), { body: 'edited' }));
  await assertFails(getDoc(doc(user('other', 'o@x.org'), 'messages', ref.id)));
});

test('people documents are private to the person and stewards', async () => {
  await activate('jo', 'jo@makehaven.org', 'makehaven', 'space_admin');
  await activate('oh', 'oh@ohiomakers.org', 'ohio-makers', 'space_contact');
  await assertSucceeds(getDoc(doc(user('jo', 'jo@makehaven.org'), 'people', 'jo')));
  await assertSucceeds(getDoc(doc(user('ctsteward', 's@x.org'), 'people', 'jo')));
  await assertFails(getDocs(collection(user('oh', 'oh@ohiomakers.org'), 'people')));
  await assertFails(deleteDoc(doc(user('oh', 'oh@ohiomakers.org'), 'people', 'jo')));
});

test('a verified peer cannot read another person\'s document, so a relayed email stays hidden', async () => {
  await activate('jo', 'jo@makehaven.org', 'makehaven', 'space_admin');
  await activate('oh', 'oh@ohiomakers.org', 'ohio-makers', 'space_contact');
  // Both are verified and can read each other's roster entries...
  await assertSucceeds(getDoc(doc(user('jo', 'jo@makehaven.org'), 'roster', 'oh')));
  // ...but not the people document behind them, which carries the address.
  await assertFails(getDoc(doc(user('jo', 'jo@makehaven.org'), 'people', 'oh')));
  await assertFails(getDoc(doc(user('oh', 'oh@ohiomakers.org'), 'people', 'jo')));
});

test('a pending joiner names the space as primary, and that space\'s admin can then see who is asking', async () => {
  await activate('jo', 'jo@makehaven.org', 'makehaven', 'space_admin');
  const pat = user('pat', 'pat@gmail.com');
  const b = writeBatch(pat);
  b.set(doc(pat, 'people', 'pat'), person('Pat', 'pat@gmail.com', 'makehaven'));
  b.set(doc(pat, 'memberships', 'pat_makehaven'), membership('pat', 'makehaven', 'space_contact', 'pending'));
  await assertSucceeds(b.commit());
  await assertSucceeds(getDoc(doc(user('jo', 'jo@makehaven.org'), 'people', 'pat')));
  // Pending is not verified: no roster for Pat yet.
  await assertFails(getDocs(collection(pat, 'roster')));
  // Another space's admin cannot read Pat.
  await activate('sp', 'sp@sparkmakerspace.org', 'spark', 'space_admin');
  await assertFails(getDoc(doc(user('sp', 'sp@sparkmakerspace.org'), 'people', 'pat')));
});

// ---------- meetings ----------

const meeting = (o = {}) => ({
  title: 'CT safety leads', agenda: '', starts_at: '2026-10-05T16:00:00.000Z', duration_min: 60, location: '',
  audience: 'Connecticut · Safety', region_id: 'us-ct', organiser_uid: 'ctsteward', organiser_name: 'Steward',
  invitee_uids: ['jo'], status: 'scheduled', email_requested_at: null, emailed_uids: [], created_at: T, updated_at: T, ...o,
});

test('a steward convenes in their own region; nobody else convenes', async () => {
  await activate('jo', 'jo@makehaven.org', 'makehaven', 'space_admin');
  const st = user('ctsteward', 's@x.org');
  await assertSucceeds(setDoc(doc(st, 'meetings', 'm1'), meeting()));
  await assertFails(setDoc(doc(st, 'meetings', 'm2'), meeting({ region_id: null })));
  await assertFails(setDoc(doc(st, 'meetings', 'm3'), meeting({ organiser_uid: 'admin' })));
  await assertFails(setDoc(doc(user('jo', 'jo@makehaven.org'), 'meetings', 'm4'), meeting({ organiser_uid: 'jo' })));
  await assertSucceeds(setDoc(doc(user('admin', 'a@x.org'), 'meetings', 'm5'), meeting({ region_id: null, organiser_uid: 'admin' })));
  // The mailer's record of who was emailed is not the client's to write.
  await assertFails(updateDoc(doc(st, 'meetings', 'm1'), { emailed_uids: ['jo'], updated_at: T }));
  await assertSucceeds(updateDoc(doc(st, 'meetings', 'm1'), { status: 'cancelled', updated_at: T }));
});

test('invitees see and answer their meetings; others see nothing', async () => {
  await activate('jo', 'jo@makehaven.org', 'makehaven', 'space_admin');
  await activate('oh', 'oh@ohiomakers.org', 'ohio-makers', 'space_contact');
  await env.withSecurityRulesDisabled(async (ctx) => { await setDoc(doc(ctx.firestore(), 'meetings', 'm1'), meeting()); });
  const jo = user('jo', 'jo@makehaven.org');
  const oh = user('oh', 'oh@ohiomakers.org');
  await assertSucceeds(getDocs(query(collection(jo, 'meetings'), where('invitee_uids', 'array-contains', 'jo'))));
  await assertFails(getDoc(doc(oh, 'meetings', 'm1')));
  await assertFails(getDocs(collection(oh, 'meetings')));

  await assertSucceeds(setDoc(doc(jo, 'meetings', 'm1', 'rsvps', 'jo'), { response: 'yes', attended: null, updated_at: T }));
  await assertFails(setDoc(doc(jo, 'meetings', 'm1', 'rsvps', 'jo'), { response: 'yes', attended: true, updated_at: T }));
  await assertFails(setDoc(doc(oh, 'meetings', 'm1', 'rsvps', 'oh'), { response: 'yes', attended: null, updated_at: T }));
  await assertFails(setDoc(doc(jo, 'meetings', 'm1', 'rsvps', 'oh'), { response: 'no', attended: null, updated_at: T }));
});

test('the convener records attendance but cannot answer for anyone', async () => {
  await activate('jo', 'jo@makehaven.org', 'makehaven', 'space_admin');
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'meetings', 'm1'), meeting());
    await setDoc(doc(ctx.firestore(), 'meetings', 'm1', 'rsvps', 'jo'), { response: 'maybe', attended: null, updated_at: T });
  });
  const st = user('ctsteward', 's@x.org');
  await assertSucceeds(setDoc(doc(st, 'meetings', 'm1', 'rsvps', 'jo'), { response: 'maybe', attended: true, updated_at: T }));
  await assertFails(setDoc(doc(st, 'meetings', 'm1', 'rsvps', 'jo'), { response: 'yes', attended: true, updated_at: T }));
  // Attendance for someone not invited is refused.
  await assertFails(setDoc(doc(st, 'meetings', 'm1', 'rsvps', 'stranger'), { response: null, attended: true, updated_at: T }));
});

// ---------- ecosystem partners ----------

const partnerOrg = (o = {}) => ({
  name: 'Forge', kind: 'partner', partner_type: 'support_org', domain: 'forgeimpact.org', state: 'CT', region_id: 'us-ct',
  size_tier: null, proposed: false, website: null, city: null, claimed: false, updated_at: T, ...o,
});

test('a steward adds partner organisations in their region only; a partner entry must say what kind it is', async () => {
  const st = user('ctsteward', 's@x.org');
  await assertSucceeds(setDoc(doc(st, 'spaces_index', 'partner-forge-ct'), partnerOrg()));
  await assertFails(setDoc(doc(st, 'spaces_index', 'partner-oh-agency-oh'), partnerOrg({ state: 'OH', region_id: null })));
  await assertFails(setDoc(doc(st, 'spaces_index', 'partner-typeless-ct'), partnerOrg({ partner_type: null })));
  // Stewards add partners, not makerspaces; and a random person cannot add either.
  await assertFails(setDoc(doc(st, 'spaces_index', 'partner-sneaky-ct'), partnerOrg({ kind: 'makerspace', partner_type: null })));
  await assertFails(setDoc(doc(user('rando', 'r@gmail.com'), 'spaces_index', 'partner-mine-ct'), partnerOrg()));
  // Anyone may still propose one, which the network admin reviews.
  await assertSucceeds(setDoc(doc(user('rando', 'r@gmail.com'), 'spaces_index', 'proposed-some-fund-ct'),
    partnerOrg({ proposed: true, proposed_by: 'rando', region_id: null, partner_type: 'funder' })));
});

test('someone at a partner organisation joins only as a pending partner, even with a matching domain', async () => {
  const db = user('bri', 'bri@ct.gov');
  await assertFails(setDoc(doc(db, 'memberships', 'bri_partner-decd-ct'), membership('bri', 'partner-decd-ct', 'partner', 'active')));
  await assertFails(setDoc(doc(db, 'memberships', 'bri_partner-decd-ct'), membership('bri', 'partner-decd-ct', 'space_contact', 'pending')));
  await assertFails(setDoc(doc(db, 'memberships', 'bri_partner-decd-ct'), membership('bri', 'partner-decd-ct', 'space_admin', 'pending')));
  await assertSucceeds(setDoc(doc(db, 'memberships', 'bri_partner-decd-ct'), membership('bri', 'partner-decd-ct', 'partner', 'pending')));
  // And a partner role cannot be taken at a makerspace.
  await assertFails(setDoc(doc(user('pat', 'pat@gmail.com'), 'memberships', 'pat_makehaven'), membership('pat', 'makehaven', 'partner', 'pending')));
  // Nor can a partner organisation be claimed.
  await assertFails(updateDoc(doc(db, 'spaces_index', 'partner-decd-ct'), { claimed: true, updated_at: T }));
});

test('the steward confirms a partner, who then appears on the roster and may show their address', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'people', 'bri'), person('Bri', 'bri@ct.gov', 'partner-decd-ct'));
    await setDoc(doc(db, 'memberships', 'bri_partner-decd-ct'), membership('bri', 'partner-decd-ct', 'partner', 'pending', { contact_preference: 'email' }));
  });
  const st = user('ctsteward', 's@x.org');
  // A steward cannot turn a partner into a space admin.
  await assertFails(updateDoc(doc(st, 'memberships', 'bri_partner-decd-ct'), { role: 'space_admin', updated_at: T }));
  const b = writeBatch(st);
  b.update(doc(st, 'memberships', 'bri_partner-decd-ct'), { status: 'active', confirmed_by: 'ctsteward', updated_at: T });
  b.set(doc(st, 'roster', 'bri'), {
    name: 'Bri', space_id: 'partner-decd-ct', space_name: 'CT DECD', state: 'CT', region_id: 'us-ct',
    role: 'partner', functions: ['staff'], email: 'bri@ct.gov', phone: null, updated_at: T,
  });
  await assertSucceeds(b.commit());
  // Now verified: Bri reads the roster, including people at makerspaces.
  await activate('jo', 'jo@makehaven.org', 'makehaven', 'space_admin');
  await assertSucceeds(getDocs(collection(user('bri', 'bri@ct.gov'), 'roster')));
});

// ---------- invitations ----------

const inFuture = (days) => Timestamp.fromMillis(Date.now() + days * 864e5);
const invitation = (o = {}) => ({
  email: 'pat@gmail.com', name: 'Pat', space_id: 'makehaven', space_name: 'MakeHaven', role: 'space_editor',
  functions: ['safety'], note: '', region_id: 'us-ct', invited_by: 'ctsteward', invited_by_name: 'Steward',
  status: 'pending', created_at: T, expires_at: inFuture(30), accepted_at: null,
  email_requested_at: null, emailed_at: null, group_ids: [], updated_at: T, ...o,
});
const iid = (space, email) => `${space}~${email}`;

test('stewards invite in their region, space admins at their own space, nobody else', async () => {
  const st = user('ctsteward', 's@x.org');
  await assertSucceeds(setDoc(doc(st, 'invitations', iid('makehaven', 'pat@gmail.com')), invitation()));
  await assertFails(setDoc(doc(st, 'invitations', iid('ohio-makers', 'o@x.org')),
    invitation({ email: 'o@x.org', space_id: 'ohio-makers', space_name: 'Ohio Makers', region_id: null })));
  // The id must be space~email, and the role must suit the organisation.
  await assertFails(setDoc(doc(st, 'invitations', 'something-else'), invitation()));
  await assertFails(setDoc(doc(st, 'invitations', iid('makehaven', 'q@x.org')), invitation({ email: 'q@x.org', role: 'partner' })));
  await assertSucceeds(setDoc(doc(st, 'invitations', iid('partner-decd-ct', 'bri@ct.gov')),
    invitation({ email: 'bri@ct.gov', space_id: 'partner-decd-ct', space_name: 'CT DECD', role: 'partner' })));

  await activate('jo', 'jo@makehaven.org', 'makehaven', 'space_admin');
  const jo = user('jo', 'jo@makehaven.org');
  await assertSucceeds(setDoc(doc(jo, 'invitations', iid('makehaven', 'kim@gmail.com')), invitation({ email: 'kim@gmail.com', invited_by: 'jo' })));
  await assertFails(setDoc(doc(jo, 'invitations', iid('spark', 'kim@gmail.com')),
    invitation({ email: 'kim@gmail.com', space_id: 'spark', space_name: 'Spark', invited_by: 'jo' })));
  await assertFails(setDoc(doc(user('rando', 'r@gmail.com'), 'invitations', iid('makehaven', 'x@gmail.com')),
    invitation({ email: 'x@gmail.com', invited_by: 'rando' })));
  // The mailer's emailed_at is not the inviter's to set.
  await assertFails(updateDoc(doc(st, 'invitations', iid('makehaven', 'pat@gmail.com')), { emailed_at: T, updated_at: T }));
});

const acceptBatch = (db, uid, space, role, o = {}) => {
  const b = writeBatch(db);
  b.set(doc(db, 'people', uid), person(uid, o.email ?? 'pat@gmail.com', space));
  b.set(doc(db, 'memberships', `${uid}_${space}`), membership(uid, space, role, 'active'));
  b.update(doc(db, 'invitations', iid(space, o.email ?? 'pat@gmail.com')), { status: 'accepted', accepted_at: T, updated_at: T });
  return b;
};

test('the invitee accepts with the invited address and becomes active in the invited role at once', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => { await setDoc(doc(ctx.firestore(), 'invitations', iid('makehaven', 'pat@gmail.com')), invitation()); });
  // Someone else cannot see it or use it.
  const other = user('lee', 'lee@gmail.com');
  await assertFails(getDoc(doc(other, 'invitations', iid('makehaven', 'pat@gmail.com'))));
  await assertFails(acceptBatch(other, 'lee', 'makehaven', 'space_editor').commit());
  const pat = user('pat', 'pat@gmail.com');
  await assertSucceeds(getDocs(query(collection(pat, 'invitations'), where('email', '==', 'pat@gmail.com'))));
  // Not a different role than invited, and not without marking it accepted.
  await assertFails(acceptBatch(pat, 'pat', 'makehaven', 'space_admin').commit());
  await assertFails(setDoc(doc(pat, 'memberships', 'pat_makehaven'), membership('pat', 'makehaven', 'space_editor', 'active')));
  await assertSucceeds(acceptBatch(pat, 'pat', 'makehaven', 'space_editor').commit());
  // Used once.
  await assertFails(updateDoc(doc(pat, 'invitations', iid('makehaven', 'pat@gmail.com')), { status: 'pending', updated_at: T }));
});

test('an expired invitation, or one for an unverified address, cannot be accepted', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'invitations', iid('makehaven', 'pat@gmail.com')), invitation({ expires_at: inFuture(-1) }));
    await setDoc(doc(ctx.firestore(), 'invitations', iid('makehaven', 'un@gmail.com')), invitation({ email: 'un@gmail.com' }));
  });
  await assertFails(acceptBatch(user('pat', 'pat@gmail.com'), 'pat', 'makehaven', 'space_editor').commit());
  await assertFails(acceptBatch(user('un', 'un@gmail.com', false), 'un', 'makehaven', 'space_editor', { email: 'un@gmail.com' }).commit());
});

test('accepting an admin invitation claims an unclaimed space in the same batch', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'invitations', iid('spark', 'casey@gmail.com')),
      invitation({ email: 'casey@gmail.com', space_id: 'spark', space_name: 'Spark', role: 'space_admin' }));
  });
  const casey = user('casey', 'casey@gmail.com');
  const b = acceptBatch(casey, 'casey', 'spark', 'space_admin', { email: 'casey@gmail.com' });
  b.update(doc(casey, 'spaces_index', 'spark'), { claimed: true, updated_at: T });
  await assertSucceeds(b.commit());
});

// ---------- groups ----------

const group = (o = {}) => ({
  name: 'CT Makerspaces', slug: 'ct-makerspaces', description: '', region_id: 'us-ct', manager_uids: ['ctsteward'],
  join_policy: 'managers', posting: 'members', archived: false, created_by: 'ctsteward', created_at: T, updated_at: T, ...o,
});
const member = (by, o = {}) => ({ name: 'M', delivery: 'each', added_by: by, via_invitation: null, joined_at: T, updated_at: T, ...o });
const seedGroup = async (o = {}) => env.withSecurityRulesDisabled(async (ctx) => {
  await setDoc(doc(ctx.firestore(), 'groups', o.slug ?? 'ct-makerspaces'), group(o));
});

test('stewards create groups in their region; addresses are validated and reserved ones refused', async () => {
  const st = user('ctsteward', 's@x.org');
  await assertSucceeds(setDoc(doc(st, 'groups', 'ct-makerspaces'), group()));
  await assertFails(setDoc(doc(st, 'groups', 'national'), group({ slug: 'national', region_id: null })));
  await assertFails(setDoc(doc(st, 'groups', 'Bad Slug'), group({ slug: 'Bad Slug' })));
  await assertFails(setDoc(doc(st, 'groups', 'reply'), group({ slug: 'reply' })));
  await activate('jo', 'jo@makehaven.org', 'makehaven', 'space_admin');
  await assertFails(setDoc(doc(user('jo', 'jo@makehaven.org'), 'groups', 'jos-group'), group({ slug: 'jos-group', created_by: 'jo', manager_uids: ['jo'] })));
});

test('verified people join open groups themselves; invitation-only groups are joined by a manager adding them', async () => {
  await activate('jo', 'jo@makehaven.org', 'makehaven', 'space_admin');
  await seedGroup({ slug: 'open-group', join_policy: 'open' });
  await seedGroup();
  const jo = user('jo', 'jo@makehaven.org');
  await assertSucceeds(setDoc(doc(jo, 'groups', 'open-group', 'members', 'jo'), member('jo')));
  await assertFails(setDoc(doc(jo, 'groups', 'ct-makerspaces', 'members', 'jo'), member('jo')));
  // Not verified: cannot join even an open group.
  await assertFails(setDoc(doc(user('pat', 'pat@gmail.com'), 'groups', 'open-group', 'members', 'pat'), member('pat')));
  // A manager adds someone on the roster, not someone who is not.
  const st = user('ctsteward', 's@x.org');
  await assertSucceeds(setDoc(doc(st, 'groups', 'ct-makerspaces', 'members', 'jo'), member('ctsteward')));
  await assertFails(setDoc(doc(st, 'groups', 'ct-makerspaces', 'members', 'nobody'), member('ctsteward')));
  // A member changes their own delivery, and nothing else.
  await assertSucceeds(updateDoc(doc(jo, 'groups', 'ct-makerspaces', 'members', 'jo'), { delivery: 'none', updated_at: T }));
  await assertFails(updateDoc(doc(jo, 'groups', 'ct-makerspaces', 'members', 'jo'), { added_by: 'jo', updated_at: T }));
});

const startBatch = (db, gid, uid, name, o = {}) => {
  const b = writeBatch(db);
  const t = doc(collection(db, 'groups', gid, 'threads'));
  b.set(t, { subject: 'Hello', started_by: uid, started_by_name: name, created_at: T, last_post_at: T, last_author_name: name, post_count: 1 });
  b.set(doc(collection(t, 'posts')), { author_uid: uid, author_name: name, body: 'Hi all', created_at: T, source: 'web', status: 'queued', sent_count: 0, ...o });
  return { b, t };
};

test('members post to a discussion group; only managers post to an announcement group; outsiders read nothing', async () => {
  await activate('jo', 'jo@makehaven.org', 'makehaven', 'space_admin');
  await activate('oh', 'oh@ohiomakers.org', 'ohio-makers', 'space_contact');
  await seedGroup();
  await seedGroup({ slug: 'ct-news', posting: 'managers' });
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'groups', 'ct-makerspaces', 'members', 'jo'), member('ctsteward'));
    await setDoc(doc(ctx.firestore(), 'groups', 'ct-news', 'members', 'jo'), member('ctsteward'));
  });
  const jo = user('jo', 'jo@makehaven.org');
  const { b, t } = startBatch(jo, 'ct-makerspaces', 'jo', 'jo');
  await assertSucceeds(b.commit());
  // A web post cannot pretend to be email, or skip the mailer's queue.
  await assertFails(startBatch(jo, 'ct-makerspaces', 'jo', 'jo', { status: 'sent' }).b.commit());
  await assertFails(startBatch(jo, 'ct-news', 'jo', 'jo').b.commit());
  const oh = user('oh', 'oh@ohiomakers.org');
  await assertFails(getDocs(collection(oh, 'groups', 'ct-makerspaces', 'threads')));
  await assertFails(startBatch(oh, 'ct-makerspaces', 'oh', 'oh').b.commit());
  // A reply bumps the thread by exactly one.
  const r = writeBatch(jo);
  r.set(doc(collection(t, 'posts')), { author_uid: 'jo', author_name: 'jo', body: 'Me again', created_at: T, source: 'web', status: 'queued', sent_count: 0 });
  r.update(t, { last_post_at: T, last_author_name: 'jo', post_count: 2 });
  await assertSucceeds(r.commit());
});

test('a manager releases a held email post; a member cannot', async () => {
  await activate('jo', 'jo@makehaven.org', 'makehaven', 'space_admin');
  await seedGroup();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'groups', 'ct-makerspaces', 'members', 'jo'), member('ctsteward'));
    await setDoc(doc(db, 'groups', 'ct-makerspaces', 'threads', 't1'), { subject: 's', started_by: 'jo', started_by_name: 'jo', created_at: T, last_post_at: T, last_author_name: 'jo', post_count: 1 });
    await setDoc(doc(db, 'groups', 'ct-makerspaces', 'threads', 't1', 'posts', 'p1'), { author_uid: 'jo', author_name: 'jo', body: 'b', created_at: T, source: 'email', status: 'held', sent_count: 0 });
  });
  await assertFails(updateDoc(doc(user('jo', 'jo@makehaven.org'), 'groups', 'ct-makerspaces', 'threads', 't1', 'posts', 'p1'), { status: 'queued' }));
  await assertSucceeds(updateDoc(doc(user('ctsteward', 's@x.org'), 'groups', 'ct-makerspaces', 'threads', 't1', 'posts', 'p1'), { status: 'queued' }));
});

test('an invitation that names a group lets the invitee join it after accepting; reply keys are never readable', async () => {
  await seedGroup();
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'invitations', iid('makehaven', 'pat@gmail.com')), invitation({ group_ids: ['ct-makerspaces'] }));
    await setDoc(doc(ctx.firestore(), 'reply_keys', 'abc'), { gid: 'ct-makerspaces', tid: 't', uid: 'pat' });
  });
  const pat = user('pat', 'pat@gmail.com');
  const joinVia = () => setDoc(doc(pat, 'groups', 'ct-makerspaces', 'members', 'pat'), member('pat', { via_invitation: 'makehaven' }));
  await assertFails(joinVia());
  await acceptBatch(pat, 'pat', 'makehaven', 'space_editor').commit();
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'roster', 'pat'), { name: 'pat', space_id: 'makehaven', space_name: 'MakeHaven', state: 'CT', region_id: 'us-ct', role: 'space_editor', functions: ['staff'], email: null, phone: null, updated_at: T });
  });
  await assertSucceeds(joinVia());
  await assertFails(getDoc(doc(pat, 'reply_keys', 'abc')));
});

// ---------- a space's own data ----------

const metrics = (uid, space, year = 2025, extra = {}) => ({
  space_id: space, year, metrics: { membersEnd: 120, structure: '501(c)(3) nonprofit', access247: true },
  capabilities: ['wood'], updated_by: uid, updated_at: T, ...extra,
});

test('a space\'s staff save annual data; members, partners and other spaces cannot read or write it', async () => {
  await activate('jo', 'jo@makehaven.org', 'makehaven', 'space_editor');
  await activate('mem', 'mem@gmail.com', 'makehaven', 'space_contact');
  await activate('sp', 'sp@sparkmakerspace.org', 'spark', 'space_admin');
  await activate('pat', 'pat@ct.gov', 'partner-decd-ct', 'partner');
  const jo = user('jo', 'jo@makehaven.org');
  await assertSucceeds(setDoc(doc(jo, 'space_metrics', 'makehaven~2025'), metrics('jo', 'makehaven')));
  // A colleague comes back to it.
  await activate('al', 'al@makehaven.org', 'makehaven', 'space_admin');
  await assertSucceeds(getDoc(doc(user('al', 'al@makehaven.org'), 'space_metrics', 'makehaven~2025')));
  await assertSucceeds(setDoc(doc(user('al', 'al@makehaven.org'), 'space_metrics', 'makehaven~2025'), metrics('al', 'makehaven')));
  for (const [u, e] of [['mem', 'mem@gmail.com'], ['sp', 'sp@sparkmakerspace.org'], ['pat', 'pat@ct.gov']]) {
    await assertFails(getDoc(doc(user(u, e), 'space_metrics', 'makehaven~2025')));
    await assertFails(setDoc(doc(user(u, e), 'space_metrics', 'makehaven~2025'), metrics(u, 'makehaven')));
  }
  await assertFails(getDocs(collection(jo, 'space_metrics')));
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'space_metrics', 'makehaven~2025')));
});

test('annual data is filed under the right space and year, and a partner organisation has none', async () => {
  await activate('jo', 'jo@makehaven.org', 'makehaven', 'space_admin');
  const jo = user('jo', 'jo@makehaven.org');
  await assertFails(setDoc(doc(jo, 'space_metrics', 'makehaven~2024'), metrics('jo', 'makehaven', 2025)));
  await assertFails(setDoc(doc(jo, 'space_metrics', 'makehaven~2025'), metrics('someone-else', 'makehaven')));
  await assertFails(setDoc(doc(jo, 'space_metrics', 'makehaven~2025'), metrics('jo', 'makehaven', 2025, { member_names: ['x'] })));
  await activate('pat', 'pat@ct.gov', 'partner-decd-ct', 'partner');
  await assertFails(setDoc(doc(user('pat', 'pat@ct.gov'), 'space_metrics', 'partner-decd-ct~2025'), metrics('pat', 'partner-decd-ct')));
});

test('the region steward and network admin read annual data; a steward elsewhere does not', async () => {
  await activate('jo', 'jo@makehaven.org', 'makehaven', 'space_admin');
  await assertSucceeds(setDoc(doc(user('jo', 'jo@makehaven.org'), 'space_metrics', 'makehaven~2025'), metrics('jo', 'makehaven')));
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'stewardships', 'ohsteward'), { region_ids: ['us-oh'], network_admin: false, granted_by: 'admin', created_at: T });
  });
  await assertSucceeds(getDoc(doc(user('ctsteward', 's@x.org'), 'space_metrics', 'makehaven~2025')));
  await assertSucceeds(getDoc(doc(user('admin', 'a@x.org'), 'space_metrics', 'makehaven~2025')));
  await assertFails(getDoc(doc(user('ohsteward', 'o@x.org'), 'space_metrics', 'makehaven~2025')));
  // Stewards read; they do not write a space's figures for it.
  await assertFails(setDoc(doc(user('ctsteward', 's@x.org'), 'space_metrics', 'makehaven~2025'), metrics('ctsteward', 'makehaven')));
});

test('staff submit their listing; the steward marks it merged but cannot rewrite it', async () => {
  await activate('jo', 'jo@makehaven.org', 'makehaven', 'space_admin');
  await activate('mem', 'mem@gmail.com', 'makehaven', 'space_contact');
  const sub = (uid, extra = {}) => ({ listing: { access_model: 'member_24_7', capabilities: ['laser_cutting'] }, status: 'submitted',
    submitted_by: uid, submitted_name: uid, updated_at: T, ...extra });
  await assertFails(setDoc(doc(user('mem', 'mem@gmail.com'), 'listing_submissions', 'makehaven'), sub('mem')));
  await assertFails(setDoc(doc(user('jo', 'jo@makehaven.org'), 'listing_submissions', 'makehaven'), sub('jo', { status: 'merged' })));
  await assertSucceeds(setDoc(doc(user('jo', 'jo@makehaven.org'), 'listing_submissions', 'makehaven'), sub('jo')));
  const st = user('ctsteward', 's@x.org');
  await assertSucceeds(getDocs(collection(st, 'listing_submissions')));
  await assertFails(updateDoc(doc(st, 'listing_submissions', 'makehaven'), { listing: {}, updated_at: T }));
  await assertSucceeds(updateDoc(doc(st, 'listing_submissions', 'makehaven'), { status: 'merged', updated_at: T }));
  await assertFails(getDoc(doc(user('mem', 'mem@gmail.com'), 'listing_submissions', 'makehaven')));
});

// ---------- feedback ----------

test('anyone sends feedback, signed in or not, without claiming to be someone else; only stewards read it', async () => {
  const fb = (extra = {}) => ({ message: 'The join form confused me', email: null, page: 'makerspace.network/?page=join',
    uid: null, created_at: T, user_agent: null, ...extra });
  const anon = env.unauthenticatedContext().firestore();
  await assertSucceeds(addDoc(collection(anon, 'feedback'), fb()));
  await assertFails(addDoc(collection(anon, 'feedback'), fb({ uid: 'jo' })));
  await assertFails(addDoc(collection(anon, 'feedback'), fb({ message: '' })));
  await assertFails(addDoc(collection(anon, 'feedback'), fb({ extra: 1 })));
  const jo = user('jo', 'jo@makehaven.org');
  await assertSucceeds(addDoc(collection(jo, 'feedback'), fb({ uid: 'jo', email: 'jo@makehaven.org' })));
  await assertFails(getDocs(collection(jo, 'feedback')));
  await assertFails(getDocs(collection(anon, 'feedback')));
  await assertSucceeds(getDocs(collection(user('ctsteward', 's@x.org'), 'feedback')));
});

// ---------- proposing a space while joining it ----------

test('someone proposes an unlisted space or organisation and joins it in the same batch, as the join form does', async () => {
  for (const [uid, email, id, kind, partnerType, role] of [
    ['lee', 'lee@newstudio.example', 'proposed-new-studio-ct', 'makerspace', null, 'space_contact'],
    ['ash', 'ash@example-foundation.org', 'proposed-example-foundation-ct', 'partner', 'support_org', 'partner'],
  ]) {
    const db = user(uid, email);
    const b = writeBatch(db);
    b.set(doc(db, 'spaces_index', id), { name: 'New Studio', kind, partner_type: partnerType, domain: 'newstudio.example', state: 'CT',
      region_id: null, size_tier: null, proposed: true, proposed_by: uid, website: 'https://newstudio.example', city: 'Bethel', claimed: false, updated_at: T });
    b.set(doc(db, 'memberships', `${uid}_${id}`), { ...membership(uid, id, role, 'pending'), state: 'CT', region_id: null });
    b.set(doc(db, 'people', uid), person(uid, email, id));
    await assertSucceeds(b.commit());
  }
  // Proposing never makes you anything but pending.
  const db = user('eve', 'eve@evil.org');
  const b = writeBatch(db);
  b.set(doc(db, 'spaces_index', 'proposed-evil-ct'), { name: 'Evil', kind: 'makerspace', partner_type: null, domain: 'evil.org', state: 'CT',
    region_id: null, size_tier: null, proposed: true, proposed_by: 'eve', website: null, city: null, claimed: false, updated_at: T });
  b.set(doc(db, 'memberships', 'eve_proposed-evil-ct'), { ...membership('eve', 'proposed-evil-ct', 'space_admin', 'active'), state: 'CT', region_id: null });
  await assertFails(b.commit());
});

// ---------- Standards of Excellence ----------

const assessment = (uid, extra = {}) => ({ framework_version: 1, flags: { membership: true }, goal: 'operational',
  answers: { S001: { score: 2, evidence: 'Filings on file' } }, updated_by: uid, updated_at: T, ...extra });
const summary = (uid, extra = {}) => ({ framework_version: 1, level: 'foundational', avg: 1.4, evidence_share: 0.5,
  applicable: 60, scored: 40, urgent: 2, domains: [{ code: '1', name: 'Governance', applicable: 10, avg: 1.5 }],
  health: ['Yes'], shared_by: uid, shared_at: T, ...extra });

test('a space\'s staff keep its assessment; nobody else reads it, the steward included', async () => {
  await activate('jo', 'jo@makehaven.org', 'makehaven', 'space_editor');
  await activate('al', 'al@makehaven.org', 'makehaven', 'space_admin');
  await activate('mem', 'mem@gmail.com', 'makehaven', 'space_contact');
  await activate('sp', 'sp@sparkmakerspace.org', 'spark', 'space_admin');
  const jo = user('jo', 'jo@makehaven.org');
  await assertSucceeds(setDoc(doc(jo, 'assessments', 'makehaven'), assessment('jo')));
  // A colleague continues, one standard at a time (autosave).
  const al = user('al', 'al@makehaven.org');
  await assertSucceeds(updateDoc(doc(al, 'assessments', 'makehaven'), { 'answers.S002': { score: 1 }, updated_by: 'al', updated_at: T }));
  await assertSucceeds(getDoc(doc(al, 'assessments', 'makehaven')));
  for (const [u, e] of [['mem', 'mem@gmail.com'], ['sp', 'sp@sparkmakerspace.org'], ['ctsteward', 's@x.org'], ['admin', 'a@x.org']]) {
    await assertFails(getDoc(doc(user(u, e), 'assessments', 'makehaven')));
  }
  await assertFails(updateDoc(doc(al, 'assessments', 'makehaven'), { 'answers.S003': { score: 3 }, updated_by: 'jo', updated_at: T }));
  await assertFails(setDoc(doc(jo, 'assessments', 'makehaven'), assessment('jo', { goal: 'perfect' })));
});

test('staff share a summary; stewards read it; it never carries a single standard\'s score', async () => {
  await activate('jo', 'jo@makehaven.org', 'makehaven', 'space_admin');
  await activate('mem', 'mem@gmail.com', 'makehaven', 'space_contact');
  const jo = user('jo', 'jo@makehaven.org');
  await assertFails(setDoc(doc(jo, 'assessment_summaries', 'makehaven'), summary('jo', { answers: { S001: { score: 2 } } })));
  await assertFails(setDoc(doc(user('mem', 'mem@gmail.com'), 'assessment_summaries', 'makehaven'), summary('mem')));
  await assertSucceeds(setDoc(doc(jo, 'assessment_summaries', 'makehaven'), summary('jo')));
  await assertSucceeds(getDoc(doc(user('ctsteward', 's@x.org'), 'assessment_summaries', 'makehaven')));
  await assertSucceeds(getDocs(collection(user('admin', 'a@x.org'), 'assessment_summaries')));
  await assertFails(getDoc(doc(user('mem', 'mem@gmail.com'), 'assessment_summaries', 'makehaven')));
  // Withdrawing is the space's own call.
  await assertSucceeds(deleteDoc(doc(jo, 'assessment_summaries', 'makehaven')));
});
