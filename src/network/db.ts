// Every write the people layer makes. Each function here has a matching
// clause in firestore.rules; the rules are the authority and these are the
// shapes they expect. Batches are used wherever two documents must agree
// (a membership and its roster entry, a claim and the space it claims), and
// the rules check those with getAfter() so the batch is all-or-nothing.

import {
  addDoc, collection, doc, documentId, getDoc, getDocs, query, setDoc, updateDoc, where, writeBatch,
} from 'firebase/firestore';
import { db } from './firebase';
import type { Space, Region } from '../types';
import {
  domainOfEmail, domainOfUrl, isCommonEmailDomain, membershipId, ORGANISER_ROLES,
  type ContactPreference, type Meeting, type Membership, type Message, type Person, type RosterEntry,
  type Rsvp, type RsvpResponse, type SizeTier, type SpaceIndex, type SpaceRole, type Stewardship,
} from './model';

const now = () => new Date().toISOString();
type WithId<T> = T & { id: string };

// ---------- reads ----------

export async function getSpaceIndex(id: string): Promise<SpaceIndex | null> {
  const s = await getDoc(doc(db, 'spaces_index', id));
  return s.exists() ? (s.data() as SpaceIndex) : null;
}

export async function listSpaceIndex(): Promise<WithId<SpaceIndex>[]> {
  const s = await getDocs(collection(db, 'spaces_index'));
  return s.docs.map((d) => ({ id: d.id, ...(d.data() as SpaceIndex) }));
}

export async function listRoster(): Promise<WithId<RosterEntry>[]> {
  const s = await getDocs(collection(db, 'roster'));
  return s.docs
    .map((d) => ({ id: d.id, ...(d.data() as RosterEntry) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Memberships a steward may see: everything for a network admin, their
 *  regions for a steward, their own space for a space admin. */
export async function listMembershipsVisibleTo(s: {
  uid: string; networkAdmin: boolean; regionIds: string[]; adminSpaceIds: string[];
}): Promise<WithId<Membership>[]> {
  const col = collection(db, 'memberships');
  let docs;
  if (s.networkAdmin) {
    docs = (await getDocs(col)).docs;
  } else {
    const parts = [];
    if (s.regionIds.length) parts.push(getDocs(query(col, where('region_id', 'in', s.regionIds.slice(0, 30)))));
    for (const sp of s.adminSpaceIds) parts.push(getDocs(query(col, where('space_id', '==', sp))));
    docs = (await Promise.all(parts)).flatMap((r) => r.docs);
  }
  const seen = new Map<string, WithId<Membership>>();
  for (const d of docs) seen.set(d.id, { id: d.id, ...(d.data() as Membership) });
  return [...seen.values()];
}

/** Stewards may list people; a space admin may only get the people whose
 *  primary space is theirs, one at a time, and the rest are simply absent. */
export async function loadPeople(ids: string[], opts: { canList: boolean } = { canList: true }): Promise<Map<string, Person>> {
  const out = new Map<string, Person>();
  const unique = [...new Set(ids)];
  if (!opts.canList) {
    const got = await Promise.all(unique.map((id) => getDoc(doc(db, 'people', id)).catch(() => null)));
    got.forEach((g, i) => { if (g?.exists()) out.set(unique[i], g.data() as Person); });
    return out;
  }
  for (let i = 0; i < unique.length; i += 30) {
    const chunk = unique.slice(i, i + 30);
    const s = await getDocs(query(collection(db, 'people'), where(documentId(), 'in', chunk)));
    for (const d of s.docs) out.set(d.id, d.data() as Person);
  }
  return out;
}

export async function findPersonByEmail(email: string): Promise<WithId<Person> | null> {
  const s = await getDocs(query(collection(db, 'people'), where('email', '==', email.trim().toLowerCase())));
  const d = s.docs[0];
  return d ? { id: d.id, ...(d.data() as Person) } : null;
}

export async function listStewardships(): Promise<WithId<Stewardship>[]> {
  const s = await getDocs(collection(db, 'stewardships'));
  return s.docs.map((d) => ({ id: d.id, ...(d.data() as Stewardship) }));
}

export async function listInbox(uid: string): Promise<WithId<Message>[]> {
  const [to, from] = await Promise.all([
    getDocs(query(collection(db, 'messages'), where('to_uid', '==', uid))),
    getDocs(query(collection(db, 'messages'), where('from_uid', '==', uid))),
  ]);
  return [...to.docs, ...from.docs]
    .map((d) => ({ id: d.id, ...(d.data() as Message) }))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

// ---------- writes ----------

async function audit(actor: string, action: string, details: Record<string, unknown>) {
  await addDoc(collection(db, 'audit'), { actor, action, details, created_at: now() });
}

/** The roster entry is a projection of people + membership. The rules refuse
 *  a projection that disagrees with its sources, so this is the only place
 *  the projection is computed. */
export function rosterFrom(person: Person, m: Membership, spaceName: string): RosterEntry {
  const organiser = ORGANISER_ROLES.includes(m.role);
  return {
    name: person.name,
    space_id: m.space_id,
    space_name: spaceName,
    state: m.state,
    region_id: m.region_id,
    role: m.role,
    functions: m.functions,
    email: organiser && m.contact_preference === 'email' ? person.email : null,
    phone: organiser && m.contact_preference === 'phone' ? (person.phone ?? null) : null,
    updated_at: now(),
  };
}

export interface JoinInput {
  uid: string;
  email: string;
  emailVerified: boolean;
  name: string;
  phone: string | null;
  existingPerson: Person | null;
  /** Status of the membership at existingPerson.primary_space_id, if any. */
  primaryStatus: Membership['status'] | null;
  /** Either a directory space id, or a proposal for one that is not listed. */
  spaceId: string;
  proposal?: { name: string; website: string | null; city: string | null; state: string };
  wantsRole: SpaceRole;
  functions: string[];
  contact_preference: ContactPreference;
  invitations: boolean;
}

export type JoinOutcome =
  | { kind: 'active'; role: SpaceRole; claimed: boolean }
  | { kind: 'pending'; role: SpaceRole; reason: 'proposed' | 'no_domain_match' | 'already_claimed' };

/** Decide what the rules will accept, then do it in one batch. The decision
 *  is duplicated in firestore.rules — this side exists so the UI can explain
 *  the outcome before the click, and the rules side so it cannot be faked. */
export async function joinSpace(input: JoinInput): Promise<JoinOutcome> {
  const { uid } = input;
  const email = input.email.toLowerCase();
  const emailDomain = domainOfEmail(email);
  let space = await getSpaceIndex(input.spaceId);
  const t = now();
  const batch = writeBatch(db);

  if (!space) {
    if (!input.proposal) throw new Error('That space is not in the index yet. Ask the network admin to sync the directory.');
    space = {
      name: input.proposal.name.trim(),
      domain: domainOfUrl(input.proposal.website),
      state: input.proposal.state,
      region_id: null,
      size_tier: null,
      proposed: true,
      proposed_by: uid,
      website: input.proposal.website,
      city: input.proposal.city,
      claimed: false,
      updated_at: t,
    };
    batch.set(doc(db, 'spaces_index', input.spaceId), space);
  }

  const domainOk = input.emailVerified && !space.proposed && !!space.domain
    && space.domain === emailDomain && !isCommonEmailDomain(emailDomain);

  let outcome: JoinOutcome;
  let role: SpaceRole = input.wantsRole;
  let status: Membership['status'];
  let claim = false;
  if (space.proposed) {
    role = 'space_contact'; status = 'pending';
    outcome = { kind: 'pending', role, reason: 'proposed' };
  } else if (!domainOk) {
    role = 'space_contact'; status = 'pending';
    outcome = { kind: 'pending', role, reason: 'no_domain_match' };
  } else if (role === 'space_admin') {
    if (space.claimed) {
      status = 'pending';
      outcome = { kind: 'pending', role, reason: 'already_claimed' };
    } else {
      status = 'active'; claim = true;
      outcome = { kind: 'active', role, claimed: true };
    }
  } else {
    status = 'active';
    outcome = { kind: 'active', role, claimed: false };
  }

  const membership: Membership = {
    person_id: uid,
    space_id: input.spaceId,
    role, status,
    functions: input.functions,
    contact_preference: input.contact_preference,
    invitations: input.invitations,
    state: space.state,
    region_id: space.region_id,
    confirmed_by: null,
    created_at: t,
    updated_at: t,
  };
  batch.set(doc(db, 'memberships', membershipId(uid, input.spaceId)), membership);

  // The primary space is set on request, not on confirmation: it is what lets
  // that space's admin read who is asking (firestore.rules, people get). An
  // active primary is never displaced; a pending one gives way to an active
  // join, and a dead one to anything.
  const current = input.existingPerson?.primary_space_id ?? null;
  const keep = current != null && (input.primaryStatus === 'active'
    || (input.primaryStatus === 'pending' && status !== 'active'));
  const primary = keep ? current : input.spaceId;
  const person: Person = input.existingPerson
    ? { ...input.existingPerson, name: input.name.trim(), phone: input.phone, updated_at: t, primary_space_id: primary }
    : { name: input.name.trim(), email, email_domain: emailDomain, phone: input.phone,
        primary_space_id: primary, created_at: t, updated_at: t };
  batch.set(doc(db, 'people', uid), person);

  if (claim) batch.update(doc(db, 'spaces_index', input.spaceId), { claimed: true, updated_at: t });

  await batch.commit();
  await audit(uid, claim ? 'space_claimed' : status === 'active' ? 'joined' : 'join_requested',
    { space_id: input.spaceId, role, status, proposed: space.proposed });

  if (status === 'active' && person.primary_space_id === input.spaceId) {
    await setDoc(doc(db, 'roster', uid), rosterFrom(person, membership, space.name));
  }
  return outcome;
}

export async function updateProfile(uid: string, person: Person, patch: { name: string; phone: string | null },
  primary: Membership | null, spaceName: string | null) {
  const t = now();
  const next: Person = { ...person, name: patch.name.trim(), phone: patch.phone, updated_at: t };
  const batch = writeBatch(db);
  batch.update(doc(db, 'people', uid), { name: next.name, phone: next.phone, updated_at: t });
  if (primary?.status === 'active' && spaceName) batch.set(doc(db, 'roster', uid), rosterFrom(next, primary, spaceName));
  await batch.commit();
}

export async function updateRosterSettings(uid: string, person: Person, m: WithId<Membership>, spaceName: string,
  patch: { functions: string[]; contact_preference: ContactPreference; invitations: boolean }) {
  const t = now();
  const next: Membership = { ...m, ...patch, updated_at: t };
  const batch = writeBatch(db);
  batch.update(doc(db, 'memberships', m.id), { ...patch, updated_at: t });
  if (m.status === 'active' && person.primary_space_id === m.space_id) {
    batch.set(doc(db, 'roster', uid), rosterFrom(person, next, spaceName));
  }
  await batch.commit();
}

/** Steward or space admin changes someone's standing. When a membership goes
 *  active at the person's primary space (or they have none yet), the roster
 *  entry is written for them, so they appear without having to come back and
 *  press a button. `person` is null when the actor may not read it, which
 *  means the person's primary space is elsewhere and their roster entry is
 *  not this membership's to touch. */
export async function setMembership(actor: string, m: WithId<Membership>, person: Person | null, spaceName: string,
  patch: { role?: SpaceRole; status?: Membership['status'] }) {
  const t = now();
  const next: Membership = { ...m, ...patch, updated_at: t, confirmed_by: patch.status === 'active' ? actor : m.confirmed_by };
  const batch = writeBatch(db);
  batch.update(doc(db, 'memberships', m.id), { ...patch, confirmed_by: next.confirmed_by, updated_at: t });
  const becomesPrimary = !!person && next.status === 'active' && (person.primary_space_id == null || person.primary_space_id === m.space_id);
  if (person && becomesPrimary) {
    if (person.primary_space_id == null) batch.update(doc(db, 'people', m.person_id), { primary_space_id: m.space_id, updated_at: t });
    batch.set(doc(db, 'roster', m.person_id), rosterFrom(person, next, spaceName));
  } else if (person && next.status !== 'active' && person.primary_space_id === m.space_id) {
    batch.delete(doc(db, 'roster', m.person_id));
  }
  await batch.commit();
  await audit(actor, 'membership_changed', { membership: m.id, ...patch });
}

export async function setSizeTier(spaceId: string, tier: SizeTier | null) {
  await updateDoc(doc(db, 'spaces_index', spaceId), { size_tier: tier, updated_at: now() });
}

/** Mirror data/spaces into Firestore so the rules can read a space's domain
 *  and state. Network admin only. Keeps claimed and size_tier as they are. */
export async function syncSpaceIndex(spaces: Space[], regions: Region[]) {
  const existing = new Map((await listSpaceIndex()).map((s) => [s.id, s]));
  const t = now();
  const batch = writeBatch(db);
  for (const s of spaces) {
    const prev = existing.get(s.id);
    const regionId = s.region_ids?.[0] ?? null;
    const entry: SpaceIndex = {
      name: s.name,
      domain: domainOfUrl(s.contact?.website),
      state: s.address?.region ?? regions.find((r) => r.id === regionId)?.region_code ?? null,
      region_id: regionId,
      size_tier: prev?.size_tier ?? s.size_tier ?? null,
      proposed: false,
      website: s.contact?.website ?? null,
      city: s.address?.locality ?? null,
      claimed: prev?.claimed ?? false,
      updated_at: t,
    };
    batch.set(doc(db, 'spaces_index', s.id), entry);
  }
  await batch.commit();
  return spaces.length;
}

export async function grantStewardship(actor: string, uid: string, patch: { region_ids: string[]; network_admin: boolean }) {
  const s: Stewardship = { ...patch, granted_by: actor, created_at: now() };
  await setDoc(doc(db, 'stewardships', uid), s);
  await audit(actor, 'stewardship_granted', { person: uid, ...patch });
}

/** First network admin. The rules allow exactly the bootstrap addresses to do
 *  this for themselves, once; after that stewardships are granted. */
export async function bootstrapNetworkAdmin(uid: string) {
  await setDoc(doc(db, 'stewardships', uid), { region_ids: [], network_admin: true, granted_by: uid, created_at: now() });
}

export async function sendMessage(from: { uid: string; name: string }, toUid: string, subject: string, body: string) {
  const m: Message = {
    from_uid: from.uid, from_name: from.name, to_uid: toUid,
    subject: subject.trim().slice(0, 200), body: body.trim().slice(0, 4000),
    created_at: now(), status: 'queued', read: false,
  };
  await addDoc(collection(db, 'messages'), m);
}

export async function markRead(id: string) {
  await updateDoc(doc(db, 'messages', id), { read: true });
}

// ---------- meetings ----------

/** Stewards and network admins see every meeting. */
export async function listAllMeetings(): Promise<WithId<Meeting>[]> {
  const s = await getDocs(collection(db, 'meetings'));
  return s.docs.map((d) => ({ id: d.id, ...(d.data() as Meeting) }))
    .sort((a, b) => b.starts_at.localeCompare(a.starts_at));
}

/** The meetings a person was invited to. */
export async function listMyMeetings(uid: string): Promise<WithId<Meeting>[]> {
  const s = await getDocs(query(collection(db, 'meetings'), where('invitee_uids', 'array-contains', uid)));
  return s.docs.map((d) => ({ id: d.id, ...(d.data() as Meeting) }))
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
}

export async function listRsvps(meetingId: string): Promise<Map<string, Rsvp>> {
  const s = await getDocs(collection(db, 'meetings', meetingId, 'rsvps'));
  return new Map(s.docs.map((d) => [d.id, d.data() as Rsvp]));
}

export type MeetingDraft = Pick<Meeting, 'title' | 'agenda' | 'starts_at' | 'duration_min' | 'location' | 'audience' | 'region_id' | 'invitee_uids'>;

export async function createMeeting(organiser: { uid: string; name: string }, draft: MeetingDraft, sendEmail: boolean) {
  const t = now();
  const m: Meeting = {
    ...draft,
    organiser_uid: organiser.uid, organiser_name: organiser.name,
    status: 'scheduled',
    email_requested_at: sendEmail ? t : null,
    emailed_uids: [],
    created_at: t, updated_at: t,
  };
  const ref = await addDoc(collection(db, 'meetings'), m);
  await audit(organiser.uid, 'meeting_created', { meeting: ref.id, invitees: draft.invitee_uids.length, audience: draft.audience });
  return ref.id;
}

export async function updateMeeting(actor: string, id: string,
  patch: Partial<Pick<Meeting, 'title' | 'agenda' | 'starts_at' | 'duration_min' | 'location' | 'status' | 'invitee_uids'>> & { requestEmail?: boolean }) {
  const { requestEmail, ...fields } = patch;
  const t = now();
  await updateDoc(doc(db, 'meetings', id), { ...fields, ...(requestEmail ? { email_requested_at: t } : {}), updated_at: t });
  await audit(actor, 'meeting_updated', { meeting: id, ...fields, requestEmail: !!requestEmail });
}

/** The invitee's answer. Attendance is carried over untouched, which the
 *  rules require. */
export async function setRsvp(meetingId: string, uid: string, response: RsvpResponse, existing: Rsvp | undefined) {
  const r: Rsvp = { response, attended: existing?.attended ?? null, updated_at: now() };
  await setDoc(doc(db, 'meetings', meetingId, 'rsvps', uid), r);
}

/** The convener's record of who came. The answer is carried over untouched. */
export async function setAttended(meetingId: string, uid: string, attended: boolean, existing: Rsvp | undefined) {
  const r: Rsvp = { response: existing?.response ?? null, attended, updated_at: now() };
  await setDoc(doc(db, 'meetings', meetingId, 'rsvps', uid), r);
}
