// Security-rules tests for the people layer. Run with `npm run test:rules`,
// which starts the Firestore emulator around this file. Each test says what
// GOVERNANCE.md promises and checks the rules keep it.

import { test, before, after, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import {
  initializeTestEnvironment, assertSucceeds, assertFails,
} from '@firebase/rules-unit-testing';
import {
  doc, setDoc, getDoc, getDocs, updateDoc, deleteDoc, collection, writeBatch, addDoc, query, where,
} from 'firebase/firestore';

const PROJECT = 'makerspace-net';
const T = '2026-09-23T12:00:00.000Z';
let env;

const user = (uid, email, verified = true) =>
  env.authenticatedContext(uid, { email, email_verified: verified }).firestore();

const seed = async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const space = (o) => ({ size_tier: null, proposed: false, website: null, city: null, claimed: false, updated_at: T, ...o });
    await setDoc(doc(db, 'spaces_index', 'makehaven'), space({ name: 'MakeHaven', domain: 'makehaven.org', state: 'CT', region_id: 'us-ct' }));
    await setDoc(doc(db, 'spaces_index', 'spark'), space({ name: 'Spark', domain: 'sparkmakerspace.org', state: 'CT', region_id: 'us-ct' }));
    await setDoc(doc(db, 'spaces_index', 'ohio-makers'), space({ name: 'Ohio Makers', domain: 'ohiomakers.org', state: 'OH', region_id: null }));
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
  const entry = { name: 'New', domain: null, state: 'RI', region_id: null, size_tier: null, proposed: false, website: null, city: null, claimed: false, updated_at: T };
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
