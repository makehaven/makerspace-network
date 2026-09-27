// Check capabilities, not roles. Copied from the lesson Nexus wrote down in
// src/domain/auth/capabilities.ts: code asks whether the actor may
// `membership.confirm`, not whether they are a `space_admin`, because roles are
// bundles that will change and the check sites should not.
//
// This is the UI's view. The Firestore rules enforce the same table server-side
// and are the authority; if they disagree, the rules win and this is a bug.

import type { NetworkRole } from './model';
import type { Session } from './session';

export const CAPABILITIES = {
  'roster.read': 'roster.read',            // see verified people across the network
  'roster.contact': 'roster.contact',      // send a relayed message
  'membership.confirm': 'membership.confirm', // pending → active
  'membership.set_role': 'membership.set_role',
  'listing.update': 'listing.update',      // edit the space record (phase 0b, later)
  'space.set_size_tier': 'space.set_size_tier',
  'steward.view': 'steward.view',          // the steward page
  'index.sync': 'index.sync',              // mirror data/spaces into Firestore
  'stewardship.grant': 'stewardship.grant',
  'meeting.convene': 'meeting.convene',    // call a meeting from a roster query
} as const;
export type Capability = keyof typeof CAPABILITIES;

const VERIFIED_BASE: Capability[] = ['roster.read', 'roster.contact'];

export const ROLE_CAPABILITIES: Record<NetworkRole, Capability[]> = {
  network_admin: Object.keys(CAPABILITIES) as Capability[],
  region_steward: [...VERIFIED_BASE, 'membership.confirm', 'membership.set_role', 'space.set_size_tier', 'steward.view', 'meeting.convene'],
  space_admin: [...VERIFIED_BASE, 'membership.confirm', 'membership.set_role', 'listing.update', 'space.set_size_tier'],
  space_editor: [...VERIFIED_BASE, 'listing.update'],
  space_contact: [...VERIFIED_BASE],
};

export interface Scope { spaceId?: string; regionId?: string | null }

/** Every role the session holds within a scope. Space roles need an active
 *  membership; the roster capabilities need the person to be verified at all. */
function rolesIn(session: Session, scope: Scope): NetworkRole[] {
  const out: NetworkRole[] = [];
  if (session.stewardship?.network_admin) out.push('network_admin');
  if (session.stewardship && (scope.regionId == null
      ? session.stewardship.region_ids.length > 0
      : session.stewardship.region_ids.includes(scope.regionId))) {
    out.push('region_steward');
  }
  for (const m of session.memberships) {
    if (m.status !== 'active') continue;
    if (scope.spaceId && m.space_id !== scope.spaceId) continue;
    out.push(m.role);
  }
  return out;
}

export function can(session: Session, cap: Capability, scope: Scope = {}): boolean {
  if (session.status !== 'signed_in') return false;
  if (VERIFIED_BASE.includes(cap) && !session.verified) {
    // A steward who is not attached to any space can still read the roster.
    if (!session.stewardship) return false;
  }
  return rolesIn(session, scope).some((r) => ROLE_CAPABILITIES[r].includes(cap));
}
