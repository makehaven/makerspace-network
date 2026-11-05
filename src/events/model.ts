// Reader's view of the event documents and the endpoints that change them.
// functions/src/eventLogic.ts decides; firestore.rules enforces; docs/EVENTS.md explains.

export interface TicketTier {
  id: string; name: string; description: string; price_cents: number;
  limit: number | null; requires_code: boolean; attestation: string | null;
}
export interface SponsorTier { id: string; name: string; amount_cents: number; benefits: string[]; slots: number | null }
export interface ListedSponsor { name: string; tier_id: string | null; url: string | null; logo: string | null }
export type EventStatus = 'draft' | 'announced' | 'open' | 'closed' | 'cancelled';

export interface EventDoc {
  title: string;
  tagline: string;
  description: string[];
  status: EventStatus;
  region_id: string | null;
  /** Stated as the date alone until the times are settled. */
  date_label: string;
  starts_at: string | null;
  ends_at: string | null;
  location: string;
  hosts: { name: string; url: string | null; role: string }[];
  includes: string[];
  tracks: { id: string; label: string }[];
  capacity: number;
  min_age: number | null;
  asks_over_21: boolean;
  tiers: TicketTier[];
  sponsor_tiers: SponsorTier[];
  sponsor_pitch: string;
  sponsors: ListedSponsor[];
  terms: string;
  terms_version: string;
  statement_descriptor: string;
  payment_host: string;
  notify_email: string;
  public_url: string;
  updated_at: string;
}

export interface EventStats {
  registered: number; spots_left: number; spaces: string[];
  tiers_sold_out: string[]; sponsor_tiers_full: string[];
}

export const RELATIONSHIP_WORDS: [string, string][] = [
  ['space_leader', 'I help run a makerspace'],
  ['space_member', "I'm a makerspace member"],
  ['independent_maker', 'I make things on my own'],
  ['entrepreneur', "I'm building a product or venture"],
  ['software_builder', 'I build software'],
  ['student_faculty', "I'm a student or faculty"],
  ['partner', 'I support makers'],
  ['curious', "I'm new and curious"],
];

export interface Answers {
  relationship: string[]; home_space_id: string | null; home_space_other: string; looking_for_space: boolean;
  looking_for: string[]; town: string; organization: string; unconference_before: boolean | null; excited: string; challenged: string; makes: string; offer_session: string; tracks: string[]; dietary: string; access_needs: string; over_21: boolean | null;
}
export const EMPTY_ANSWERS: Answers = {
  relationship: [], home_space_id: null, home_space_other: '', looking_for_space: false, looking_for: [],
  organization: '', unconference_before: null, excited: '', challenged: '',
  town: '', makes: '', offer_session: '', tracks: [], dietary: '', access_needs: '', over_21: null,
};

export const LOOKING_FOR_WORDS: [string, string][] = [
  ['tool_access', 'Access to tools and space'],
  ['collaborators', 'People to make things with'],
  ['learning', 'Learning new skills'],
  ['customers', 'Customers or places to sell'],
  ['fabricators', 'Fabricators or suppliers'],
  ['cofounders_funding', 'Co-founders or funding'],
  ['teaching_opportunities', 'Places to teach'],
  ['community', 'A community of makers'],
];

export type ConsentKey = 'attendee_list' | 'peer_contact' | 'followup' | 'network' | 'space_share' | 'space_intro';
export type Consents = Record<ConsentKey, boolean>;
export const NO_CONSENTS: Consents = { attendee_list: false, peer_contact: false, followup: false, network: false, space_share: false, space_intro: false };

export interface MyRegistration {
  event_id: string; name: string; email: string; status: string; tier_name: string; price_cents: number;
  answers: Answers; consents: Consents; amount_paid_cents: number;
  can_pay: boolean; can_accept_free: boolean; can_cancel: boolean; can_refund: boolean; can_transfer: boolean; refund_until: string | null;
}

export const money = (cents: number) =>
  `${cents < 0 ? '-' : ''}$${(Math.abs(cents) / 100).toLocaleString('en-US', { minimumFractionDigits: cents % 100 ? 2 : 0 })}`;

export class ApiError extends Error { constructor(public code: string, msg: string) { super(msg); } }

/** Same origin, through a Hosting rewrite, so the site's CSP needs no exception. */
export async function api<T = Record<string, unknown>>(path: 'register' | 'manage' | 'interest' | 'sponsor' | 'mine', body: unknown, idToken?: string): Promise<T> {
  const res = await fetch(`/api/events/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}) },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({})) as { code?: string; error?: string };
  if (!res.ok) throw new ApiError(json.code ?? 'error', json.error ?? 'Something went wrong. Please try again.');
  return json as T;
}
