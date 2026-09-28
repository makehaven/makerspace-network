// Every write the people layer makes. Each function here has a matching
// clause in firestore.rules; the rules are the authority and these are the
// shapes they expect. Batches are used wherever two documents must agree
// (a membership and its roster entry, a claim and the space it claims), and
// the rules check those with getAfter() so the batch is all-or-nothing.

import {
  addDoc, collection, deleteDoc, doc, documentId, getDoc, getDocs, orderBy, query, setDoc, Timestamp, updateDoc, where, writeBatch,
} from 'firebase/firestore';
import { db } from './firebase';
import type { Space, Region } from '../types';
import {
  domainOfEmail, domainOfUrl, invitationId, isCommonEmailDomain, membershipId, INVITATION_DAYS, ORGANISER_ROLES,
  type ContactPreference, type Group, type GroupMember, type GroupPost, type GroupThread, type Invitation, type Meeting, type PartnerType, type Membership, type Message, type Person, type RosterEntry,
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
  /** partner_type set means the proposal is for a partner organisation. */
  proposal?: { name: string; website: string | null; city: string | null; state: string; partner_type?: PartnerType };
  wantsRole: SpaceRole;
  functions: string[];
  contact_preference: ContactPreference;
  invitations: boolean;
}

export type JoinOutcome =
  | { kind: 'active'; role: SpaceRole; claimed: boolean }
  | { kind: 'pending'; role: SpaceRole; reason: 'proposed' | 'no_domain_match' | 'already_claimed' | 'partner' };

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
      kind: input.proposal.partner_type ? 'partner' : 'makerspace',
      partner_type: input.proposal.partner_type ?? null,
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

  const partner = space.kind === 'partner';
  const domainOk = !partner && input.emailVerified && !space.proposed && !!space.domain
    && space.domain === emailDomain && !isCommonEmailDomain(emailDomain);

  let outcome: JoinOutcome;
  let role: SpaceRole = input.wantsRole;
  let status: Membership['status'];
  let claim = false;
  if (partner) {
    // Partners are always confirmed by a steward (or the network admin, for a proposal).
    role = 'partner'; status = 'pending';
    outcome = { kind: 'pending', role, reason: space.proposed ? 'proposed' : 'partner' };
  } else if (space.proposed) {
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
      kind: 'makerspace',
      partner_type: null,
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

// ---------- partner organisations ----------

/** A steward adds an organisation in their region that works with makerspaces
 *  but is not one. It lives only in the index, never in the public directory. */
export async function addPartnerOrg(actor: string, input: {
  name: string; partner_type: PartnerType; website: string | null; city: string | null; state: string; region_id: string | null;
}) {
  const slug = input.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50);
  const id = `partner-${slug}-${input.state.toLowerCase()}`;
  const entry: SpaceIndex = {
    name: input.name.trim(), kind: 'partner', partner_type: input.partner_type,
    domain: domainOfUrl(input.website), state: input.state, region_id: input.region_id,
    size_tier: null, proposed: false, website: input.website, city: input.city, claimed: false, updated_at: now(),
  };
  await setDoc(doc(db, 'spaces_index', id), entry);
  await audit(actor, 'partner_added', { space_id: id, partner_type: input.partner_type });
  return id;
}

// ---------- invitations ----------

export type InvitationDraft = Pick<Invitation, 'email' | 'name' | 'space_id' | 'role' | 'functions' | 'note' | 'group_ids'>;

/** Create or re-issue invitations. One batch per 400; an existing pending or
 *  revoked invitation to the same address and organisation is replaced, an
 *  accepted one is left alone (the rules refuse it). */
export async function createInvitations(inviter: { uid: string; name: string }, drafts: InvitationDraft[],
  spaces: Map<string, SpaceIndex>, opts: { sendEmail: boolean }) {
  const t = now();
  const expires = Timestamp.fromMillis(Date.now() + INVITATION_DAYS * 864e5);
  let n = 0;
  for (let i = 0; i < drafts.length; i += 400) {
    const batch = writeBatch(db);
    for (const d of drafts.slice(i, i + 400)) {
      const sp = spaces.get(d.space_id);
      if (!sp) throw new Error(`Unknown organisation ${d.space_id}`);
      const email = d.email.trim().toLowerCase();
      const inv: Omit<Invitation, 'expires_at'> & { expires_at: Timestamp } = {
        email, name: d.name.trim(), space_id: d.space_id, space_name: sp.name,
        role: sp.kind === 'partner' ? 'partner' : d.role, functions: d.functions, note: d.note.trim(),
        region_id: sp.region_id, invited_by: inviter.uid, invited_by_name: inviter.name,
        status: 'pending', created_at: t, expires_at: expires, accepted_at: null,
        email_requested_at: opts.sendEmail ? t : null, emailed_at: null, group_ids: d.group_ids, updated_at: t,
      };
      batch.set(doc(db, 'invitations', invitationId(d.space_id, email)), inv, { merge: false });
      n++;
    }
    await batch.commit();
  }
  await audit(inviter.uid, 'invitations_created', { count: n, emailed: opts.sendEmail });
  return n;
}

/** Everything an inviter may see: all of it for stewards, their own spaces for a space admin. */
export async function listInvitations(s: { steward: boolean; adminSpaceIds: string[] }): Promise<WithId<Invitation>[]> {
  const col = collection(db, 'invitations');
  const snaps = s.steward
    ? [await getDocs(col)]
    : await Promise.all(s.adminSpaceIds.map((sp) => getDocs(query(col, where('space_id', '==', sp)))));
  return snaps.flatMap((x) => x.docs.map((d) => ({ id: d.id, ...(d.data() as Invitation) })))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

/** The pending invitations addressed to the signed-in person. */
export async function myInvitations(email: string): Promise<WithId<Invitation>[]> {
  const snap = await getDocs(query(collection(db, 'invitations'), where('email', '==', email.toLowerCase())));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Invitation) }))
    .filter((i) => i.status === 'pending' && i.expires_at.toMillis() > Date.now());
}

export async function updateInvitation(actor: { uid: string; name: string }, inv: WithId<Invitation>,
  patch: { status?: 'pending' | 'revoked'; requestEmail?: boolean; renew?: boolean }) {
  const t = now();
  await updateDoc(doc(db, 'invitations', inv.id), {
    ...(patch.status ? { status: patch.status } : {}),
    ...(patch.requestEmail ? { email_requested_at: t } : {}),
    ...(patch.renew ? { expires_at: Timestamp.fromMillis(Date.now() + INVITATION_DAYS * 864e5) } : {}),
    invited_by: actor.uid, invited_by_name: actor.name, updated_at: t,
  });
  await audit(actor.uid, 'invitation_updated', { invitation: inv.id, ...patch });
}

/** Accept: the membership, the person, the claim if it is an admin invitation
 *  to an unclaimed space, and the invitation flipped to accepted, in one batch
 *  the rules check together. Then the roster entry, as joinSpace does. */
export async function acceptInvitation(input: {
  uid: string; email: string; inv: WithId<Invitation>; name: string; phone: string | null;
  existingPerson: Person | null; primaryStatus: Membership['status'] | null;
  functions: string[]; contact_preference: ContactPreference; invitations: boolean;
}) {
  const { uid, inv } = input;
  const space = await getSpaceIndex(inv.space_id);
  if (!space) throw new Error('That organisation is no longer in the index.');
  const t = now();
  const organiser = ORGANISER_ROLES.includes(inv.role);
  const membership: Membership = {
    person_id: uid, space_id: inv.space_id, role: inv.role, status: 'active',
    functions: input.functions, contact_preference: organiser ? input.contact_preference : 'relay',
    invitations: input.invitations, state: space.state, region_id: space.region_id,
    confirmed_by: null, created_at: t, updated_at: t,
  };
  // An active primary stays; anything less gives way to this active membership.
  const current = input.existingPerson?.primary_space_id ?? null;
  const primary = current != null && input.primaryStatus === 'active' ? current : inv.space_id;
  const person: Person = input.existingPerson
    ? { ...input.existingPerson, name: input.name.trim(), phone: input.phone, updated_at: t, primary_space_id: primary }
    : { name: input.name.trim(), email: input.email.toLowerCase(), email_domain: domainOfEmail(input.email), phone: input.phone,
        primary_space_id: primary, created_at: t, updated_at: t };

  const batch = writeBatch(db);
  batch.set(doc(db, 'memberships', membershipId(uid, inv.space_id)), membership);
  batch.set(doc(db, 'people', uid), person);
  batch.update(doc(db, 'invitations', inv.id), { status: 'accepted', accepted_at: t, updated_at: t });
  const claim = inv.role === 'space_admin' && !space.claimed;
  if (claim) batch.update(doc(db, 'spaces_index', inv.space_id), { claimed: true, updated_at: t });
  await batch.commit();
  await audit(uid, 'invitation_accepted', { space_id: inv.space_id, role: inv.role, invited_by: inv.invited_by });
  if (person.primary_space_id === inv.space_id) {
    await setDoc(doc(db, 'roster', uid), rosterFrom(person, membership, space.name));
  }
  // Then the groups the invitation named. Each is its own write, allowed by
  // the now-accepted invitation; one that fails (a deleted group) does not
  // undo the rest.
  for (const gid of inv.group_ids ?? []) {
    const m: GroupMember = { name: person.name, delivery: 'each', added_by: uid, via_invitation: inv.space_id, joined_at: t, updated_at: t };
    await setDoc(doc(db, 'groups', gid, 'members', uid), m).catch(() => undefined);
  }
}

// ---------- groups ----------

export async function listGroups(): Promise<WithId<Group>[]> {
  const s = await getDocs(collection(db, 'groups'));
  return s.docs.map((d) => ({ id: d.id, ...(d.data() as Group) })).sort((a, b) => a.name.localeCompare(b.name));
}

export async function getGroup(gid: string): Promise<Group | null> {
  const s = await getDoc(doc(db, 'groups', gid));
  return s.exists() ? (s.data() as Group) : null;
}

/** My membership in each of these groups; absent where I am not a member.
 *  Reading someone else's is refused, so a failure means "not a member". */
export async function myGroupMemberships(uid: string, gids: string[]): Promise<Map<string, GroupMember>> {
  const got = await Promise.all(gids.map((g) => getDoc(doc(db, 'groups', g, 'members', uid)).catch(() => null)));
  const out = new Map<string, GroupMember>();
  got.forEach((x, i) => { if (x?.exists()) out.set(gids[i], x.data() as GroupMember); });
  return out;
}

export async function createGroup(actor: string, g: Pick<Group, 'name' | 'slug' | 'description' | 'region_id' | 'join_policy' | 'posting'>, actorName: string) {
  const t = now();
  const group: Group = { ...g, manager_uids: [actor], archived: false, created_by: actor, created_at: t, updated_at: t };
  const batch = writeBatch(db);
  batch.set(doc(db, 'groups', g.slug), group);
  await batch.commit();
  // The creator is a member too, so they get the mail.
  await setDoc(doc(db, 'groups', g.slug, 'members', actor),
    { name: actorName, delivery: 'each', added_by: actor, via_invitation: null, joined_at: t, updated_at: t } satisfies GroupMember);
  await audit(actor, 'group_created', { group: g.slug });
}

export async function updateGroup(actor: string, gid: string, patch: Partial<Pick<Group, 'name' | 'description' | 'join_policy' | 'posting' | 'archived' | 'manager_uids'>>) {
  await updateDoc(doc(db, 'groups', gid), { ...patch, updated_at: now() });
  await audit(actor, 'group_updated', { group: gid, ...patch });
}

export async function listGroupMembers(gid: string): Promise<WithId<GroupMember>[]> {
  const s = await getDocs(collection(db, 'groups', gid, 'members'));
  return s.docs.map((d) => ({ id: d.id, ...(d.data() as GroupMember) })).sort((a, b) => a.name.localeCompare(b.name));
}

export async function joinGroup(uid: string, name: string, gid: string) {
  const t = now();
  await setDoc(doc(db, 'groups', gid, 'members', uid),
    { name, delivery: 'each', added_by: uid, via_invitation: null, joined_at: t, updated_at: t } satisfies GroupMember);
}

export async function setDelivery(uid: string, gid: string, delivery: GroupMember['delivery']) {
  await updateDoc(doc(db, 'groups', gid, 'members', uid), { delivery, updated_at: now() });
}

export async function leaveGroup(uid: string, gid: string) {
  await deleteDoc(doc(db, 'groups', gid, 'members', uid));
}

/** A manager adds people already on the roster, e.g. a steward's filtered list. */
export async function addGroupMembers(actor: string, gid: string, people: { uid: string; name: string }[]) {
  const t = now();
  for (let i = 0; i < people.length; i += 400) {
    const batch = writeBatch(db);
    for (const p of people.slice(i, i + 400)) {
      batch.set(doc(db, 'groups', gid, 'members', p.uid),
        { name: p.name, delivery: 'each', added_by: actor, via_invitation: null, joined_at: t, updated_at: t } satisfies GroupMember);
    }
    await batch.commit();
  }
  await audit(actor, 'group_members_added', { group: gid, count: people.length });
}

export async function removeGroupMember(actor: string, gid: string, uid: string) {
  await deleteDoc(doc(db, 'groups', gid, 'members', uid));
  await audit(actor, 'group_member_removed', { group: gid, person: uid });
}

export async function listThreads(gid: string): Promise<WithId<GroupThread>[]> {
  const s = await getDocs(query(collection(db, 'groups', gid, 'threads'), orderBy('last_post_at', 'desc')));
  return s.docs.map((d) => ({ id: d.id, ...(d.data() as GroupThread) }));
}

export async function getThread(gid: string, tid: string): Promise<GroupThread | null> {
  const s = await getDoc(doc(db, 'groups', gid, 'threads', tid));
  return s.exists() ? (s.data() as GroupThread) : null;
}

export async function listPosts(gid: string, tid: string): Promise<WithId<GroupPost>[]> {
  const s = await getDocs(query(collection(db, 'groups', gid, 'threads', tid, 'posts'), orderBy('created_at')));
  return s.docs.map((d) => ({ id: d.id, ...(d.data() as GroupPost) }));
}

/** A new thread and its first post, together. The post is queued; the
 *  groupMailer Function emails it to every member who takes email. */
export async function startThread(gid: string, author: { uid: string; name: string }, subject: string, body: string) {
  const t = now();
  const threadRef = doc(collection(db, 'groups', gid, 'threads'));
  const batch = writeBatch(db);
  batch.set(threadRef, {
    subject: subject.trim().slice(0, 200), started_by: author.uid, started_by_name: author.name,
    created_at: t, last_post_at: t, last_author_name: author.name, post_count: 1,
  } satisfies GroupThread);
  batch.set(doc(collection(threadRef, 'posts')), {
    author_uid: author.uid, author_name: author.name, body: body.trim().slice(0, 20000),
    created_at: t, source: 'web', status: 'queued', sent_count: 0,
  } satisfies GroupPost);
  await batch.commit();
  return threadRef.id;
}

export async function replyToThread(gid: string, tid: string, thread: GroupThread, author: { uid: string; name: string }, body: string) {
  const t = now();
  const threadRef = doc(db, 'groups', gid, 'threads', tid);
  const batch = writeBatch(db);
  batch.set(doc(collection(threadRef, 'posts')), {
    author_uid: author.uid, author_name: author.name, body: body.trim().slice(0, 20000),
    created_at: t, source: 'web', status: 'queued', sent_count: 0,
  } satisfies GroupPost);
  batch.update(threadRef, { last_post_at: t, last_author_name: author.name, post_count: thread.post_count + 1 });
  await batch.commit();
}

export async function moderatePost(actor: string, gid: string, tid: string, pid: string, status: 'queued' | 'rejected') {
  await updateDoc(doc(db, 'groups', gid, 'threads', tid, 'posts', pid), { status });
  await audit(actor, 'group_post_moderated', { group: gid, thread: tid, post: pid, status });
}
