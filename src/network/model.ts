// Document shapes for the people layer. The Firestore rules are the contract;
// these are the reader's view of it, kept by hand like src/types.ts. Collection
// names and field names match docs/PEOPLE.md.

export type SpaceRole = 'space_admin' | 'space_editor' | 'space_contact';
export type NetworkRole = 'network_admin' | 'region_steward' | SpaceRole;
export type MembershipStatus = 'pending' | 'active' | 'suspended' | 'revoked';
export type ContactPreference = 'email' | 'phone' | 'relay';
export type SizeTier = 'small' | 'medium' | 'large';

/** Roles that show a direct address to verified people (GOVERNANCE §Roster). */
export const ORGANISER_ROLES: SpaceRole[] = ['space_admin', 'space_editor'];

export interface Person {
  name: string;
  email: string;
  email_domain: string;
  phone: string | null;
  /** The membership that makes this person "verified". Null until one is active. */
  primary_space_id: string | null;
  created_at: string;
  updated_at: string;
}

/** Document id is `${uid}_${space_id}` so rules can find it without a query. */
export interface Membership {
  person_id: string;
  space_id: string;
  role: SpaceRole;
  status: MembershipStatus;
  functions: string[];
  contact_preference: ContactPreference;
  invitations: boolean;
  /** Copied from the space so stewards can query by them. */
  state: string | null;
  region_id: string | null;
  confirmed_by: string | null;
  created_at: string;
  updated_at: string;
}

/** Document id is the uid. Absent for everyone who is not a steward or admin. */
export interface Stewardship {
  region_ids: string[];
  network_admin: boolean;
  granted_by: string;
  created_at: string;
}

/** A Firestore mirror of the fields in data/spaces the rules need to read,
 *  plus spaces people proposed that are not in the directory yet. */
export interface SpaceIndex {
  name: string;
  domain: string | null;
  state: string | null;
  region_id: string | null;
  size_tier: SizeTier | null;
  proposed: boolean;
  proposed_by?: string;
  website?: string | null;
  city?: string | null;
  claimed: boolean;
  updated_at: string;
}

/** What one verified person may see about another. Document id is the uid.
 *  Written by the person (or a steward) as a projection of people + membership;
 *  the rules refuse any field that disagrees with the source documents. */
export interface RosterEntry {
  name: string;
  space_id: string;
  space_name: string;
  state: string | null;
  region_id: string | null;
  role: SpaceRole;
  functions: string[];
  email: string | null;
  phone: string | null;
  updated_at: string;
}

export interface Message {
  from_uid: string;
  from_name: string;
  to_uid: string;
  subject: string;
  body: string;
  created_at: string;
  status: 'queued' | 'sent' | 'failed';
  read: boolean;
}

export type RsvpResponse = 'yes' | 'no' | 'maybe';

/** A convened meeting. `invitee_uids` is frozen when the meeting is made,
 *  so the record says who was asked rather than who matches the filter now. */
export interface Meeting {
  title: string;
  agenda: string;
  starts_at: string;
  duration_min: number;
  /** A video link or a street address. */
  location: string;
  /** The filter the invitation list came from, in words, e.g. "Connecticut · large spaces". */
  audience: string;
  /** The region whose stewards may manage it; null for a network-wide meeting. */
  region_id: string | null;
  organiser_uid: string;
  organiser_name: string;
  invitee_uids: string[];
  status: 'scheduled' | 'cancelled';
  /** Set by the convener to ask the mailer Function to email invitations. */
  email_requested_at: string | null;
  /** Written only by the mailer Function. */
  emailed_uids: string[];
  created_at: string;
  updated_at: string;
}

/** Document id is the invitee's uid. */
export interface Rsvp {
  response: RsvpResponse | null;
  attended: boolean | null;
  updated_at: string;
}

export const membershipId = (uid: string, spaceId: string) => `${uid}_${spaceId}`;

export const domainOfEmail = (email: string): string =>
  (email.split('@')[1] ?? '').toLowerCase();

/** Hostname of a website, `www.` stripped, so it compares to an email domain. */
export const domainOfUrl = (url?: string | null): string | null => {
  if (!url) return null;
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
};

// Same list Nexus keeps in functions/src/index.ts. A consumer domain never
// counts as evidence that you work at a space.
export const COMMON_EMAIL_DOMAINS = new Set([
  'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'live.com', 'aol.com',
  'icloud.com', 'me.com', 'mac.com', 'msn.com', 'protonmail.com', 'proton.me',
  'pm.me', 'ymail.com', 'comcast.net', 'att.net', 'verizon.net', 'sbcglobal.net',
  'cox.net', 'optonline.net', 'earthlink.net', 'mail.com', 'zoho.com', 'gmx.com',
]);

export const isCommonEmailDomain = (domain: string) => COMMON_EMAIL_DOMAINS.has(domain.toLowerCase());

export const US_STATES: [string, string][] = [
  ['AL','Alabama'],['AK','Alaska'],['AZ','Arizona'],['AR','Arkansas'],['CA','California'],
  ['CO','Colorado'],['CT','Connecticut'],['DE','Delaware'],['DC','District of Columbia'],['FL','Florida'],
  ['GA','Georgia'],['HI','Hawaii'],['ID','Idaho'],['IL','Illinois'],['IN','Indiana'],['IA','Iowa'],
  ['KS','Kansas'],['KY','Kentucky'],['LA','Louisiana'],['ME','Maine'],['MD','Maryland'],
  ['MA','Massachusetts'],['MI','Michigan'],['MN','Minnesota'],['MS','Mississippi'],['MO','Missouri'],
  ['MT','Montana'],['NE','Nebraska'],['NV','Nevada'],['NH','New Hampshire'],['NJ','New Jersey'],
  ['NM','New Mexico'],['NY','New York'],['NC','North Carolina'],['ND','North Dakota'],['OH','Ohio'],
  ['OK','Oklahoma'],['OR','Oregon'],['PA','Pennsylvania'],['RI','Rhode Island'],['SC','South Carolina'],
  ['SD','South Dakota'],['TN','Tennessee'],['TX','Texas'],['UT','Utah'],['VT','Vermont'],
  ['VA','Virginia'],['WA','Washington'],['WV','West Virginia'],['WI','Wisconsin'],['WY','Wyoming'],
];
export const stateName = (code?: string | null) =>
  US_STATES.find(([c]) => c === code)?.[1] ?? code ?? '';
