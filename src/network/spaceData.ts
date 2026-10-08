// What a space is asked once it has people: its public listing, and the
// network's annual data. The annual fields are the Standards tool's Annual
// Data tab (tools/standards/app/index.html, `data-m` keys) so a share file and
// a saved record describe the same thing in the same words.

import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import type { Space } from '../types';

const now = () => new Date().toISOString();

// ---------- the public listing ----------

export interface ListingAnswers {
  summary?: string;
  capabilities?: string[];
  access_model?: string;
  public_access?: boolean | null;
  membership_models?: string[];
  monthly_cost_min?: number | null;
  monthly_cost_max?: number | null;
  day_pass_usd?: number | null;
  minor_policy?: string;
  hours_note?: string;
  email?: string;
  phone?: string;
  notes?: string;
}

export interface ListingSubmission {
  listing: ListingAnswers;
  status: 'submitted' | 'merged';
  submitted_by: string;
  submitted_name: string;
  updated_at: string;
}

/** Start from what the directory already says, so people correct rather than retype. */
export function listingFromRecord(s?: Space): ListingAnswers {
  const o = s?.operations ?? {};
  return {
    summary: s?.summary ?? '',
    capabilities: s?.capabilities ?? [],
    access_model: o.access_model ?? '',
    public_access: o.public_access ?? null,
    membership_models: o.membership_models ?? [],
    monthly_cost_min: o.monthly_cost_usd?.min ?? null,
    monthly_cost_max: o.monthly_cost_usd?.max ?? null,
    day_pass_usd: o.day_pass_usd ?? null,
    minor_policy: o.minor_policy ?? '',
    hours_note: o.hours_note ?? '',
    email: s?.contact?.email ?? '',
    phone: s?.contact?.phone ?? '',
    notes: '',
  };
}

export async function getListingSubmission(spaceId: string): Promise<ListingSubmission | null> {
  const d = await getDoc(doc(db, 'listing_submissions', spaceId));
  return d.exists() ? (d.data() as ListingSubmission) : null;
}

export async function submitListing(spaceId: string, uid: string, name: string, listing: ListingAnswers) {
  const s: ListingSubmission = { listing, status: 'submitted', submitted_by: uid, submitted_name: name, updated_at: now() };
  await setDoc(doc(db, 'listing_submissions', spaceId), s);
}

// ---------- annual network data ----------

export type MetricKind = 'number' | 'percent' | 'money' | 'yesno' | 'text' | 'choice';
/** `core` marks the ten asked first: the figures that say most about a space
 *  and that nearly every space can answer without digging. */
export interface MetricField { key: string; label: string; kind: MetricKind; hint?: string; choices?: string[]; core?: boolean }
export interface MetricSection { title: string; fields: MetricField[] }

export const METRIC_SECTIONS: MetricSection[] = [
  { title: 'Structure and access', fields: [
    { key: 'structure', label: 'Legal structure', kind: 'choice',
      choices: ['501(c)(3) nonprofit', 'For-profit', 'Institution-based', 'Grassroots / unincorporated'], core: true },
    { key: 'weeklyHours', label: 'Average weekly open hours', kind: 'number', core: true },
    { key: 'access247', label: '24/7 access for trusted members?', kind: 'yesno' },
    { key: 'acBuilding', label: 'Electronic access control — building', kind: 'yesno', hint: 'card / fob / PIN entry system' },
    { key: 'acTools', label: 'Electronic access control — tools', kind: 'yesno', hint: 'per-tool interlocks or badge readers' },
    { key: 'affilFabLab', label: 'Fab Lab Network member', kind: 'yesno', hint: 'listed on fablabs.io' },
    { key: 'affilNOM', label: 'Nation of Makers member', kind: 'yesno' },
    { key: 'affilOther', label: 'Other network affiliations', kind: 'text' },
  ] },
  { title: 'Staffing and people', fields: [
    { key: 'staffFT', label: 'Paid staff — full-time', kind: 'number', core: true },
    { key: 'staffPT', label: 'Paid staff — part-time', kind: 'number', core: true },
    { key: 'contractors', label: 'Contractors (annual)', kind: 'number' },
    { key: 'contractorExpense', label: 'Contractor expense', kind: 'money' },
    { key: 'volunteers', label: 'Titled regular volunteers', kind: 'number', core: true },
    { key: 'volunteerHours', label: 'Estimated volunteer hours (annual)', kind: 'number' },
  ] },
  { title: 'Finances', fields: [
    { key: 'expenses', label: 'Total operating expenses', kind: 'money', core: true },
    { key: 'surplus', label: 'Year surplus / deficit', kind: 'money' },
    { key: 'revEarned', label: 'Earned income as a share of revenue (memberships, classes, services, rent)', kind: 'percent', core: true },
    { key: 'revContributed', label: 'Contributed income (grants, donations, sponsorships)', kind: 'percent' },
    { key: 'revInstitutional', label: 'Institutional support (university / library / town)', kind: 'percent' },
  ] },
  { title: 'Facility (square feet)', fields: [
    { key: 'sqftTotal', label: 'Total facility, square feet', kind: 'number', core: true },
    { key: 'sqftShops', label: 'Shops / work areas', kind: 'number' },
    { key: 'sqftStorage', label: 'Storage', kind: 'number' },
    { key: 'sqftClass', label: 'Classrooms / event space', kind: 'number' },
    { key: 'sqftOther', label: 'Other', kind: 'number' },
  ] },
  { title: 'Membership and engagement', fields: [
    { key: 'membersEnd', label: 'Active paying members (year end)', kind: 'number', core: true },
    { key: 'membersNew', label: 'New members joined (during year)', kind: 'number', core: true },
    { key: 'membersLost', label: 'Members lost / churned (during year)', kind: 'number' },
    { key: 'eventRegs', label: 'Total event registrations (all types)', kind: 'number' },
    { key: 'publicEvents', label: 'Free / low-cost public events held', kind: 'number',
      hint: 'Open houses, tours, demo nights, repair cafés. Count events, not attendees.' },
    { key: 'coachingSessions', label: 'Individual coaching / skill sessions', kind: 'number' },
  ] },
  { title: 'Impact and reach', fields: [
    { key: 'authIssued', label: 'Tool authorizations issued', kind: 'number', hint: 'Count each authorization, not each person.' },
    { key: 'guestWaivers', label: 'Guest / visitor waivers signed', kind: 'number' },
    { key: 'reducedMembers', label: 'Members on need-based reduced dues', kind: 'number' },
    { key: 'reducedDollars', label: 'Need-based discounts given', kind: 'money', hint: 'Standard price minus what was paid, summed for the year.' },
    { key: 'incidents', label: 'Incident reports recorded', kind: 'number', hint: 'Injuries plus near misses. Zero is only valid if you keep a log.' },
    { key: 'pctBIPOC', label: 'Members identifying as BIPOC — optional', kind: 'percent', hint: 'Only from collected data. Leave blank rather than estimate.' },
    { key: 'pctWomenNB', label: 'Women / non-binary members — optional', kind: 'percent', hint: 'Only from collected data.' },
    { key: 'pctActive90', label: 'Members active in past 90 days — optional', kind: 'percent', hint: 'Needs an access-control or sign-in system.' },
  ] },
];

/** The Standards tool's capability referral map — coarser than the directory's vocabulary. */
export const REFERRAL_CAPABILITIES: [string, string, string][] = [
  ['wood', 'Woodshop', 'saws, sanders, drill press'],
  ['metal', 'Metalshop', 'welding, milling, lathe, sheet metal'],
  ['digifab', 'Digital fabrication', '3D printers, laser cutters, CNC routers'],
  ['electronics', 'Electronics / robotics', 'soldering, oscilloscopes, PCB mill'],
  ['textiles', 'Textiles / soft goods', 'sewing, embroidery, vinyl'],
  ['lab', 'Clean lab / bio / science', 'vent hoods, microscopes, wet lab'],
  ['computer', 'Computer lab / design', 'CAD stations, VR/AR'],
];

export type MetricValue = string | number | boolean;
export interface SpaceMetrics {
  space_id: string;
  year: number;
  metrics: Record<string, MetricValue>;
  capabilities: string[];
  /** Questions the space says it does not track — an answer, not a blank. */
  untracked?: string[];
  /** Figures given as estimates rather than from records. */
  estimated?: string[];
  updated_by: string;
  updated_at: string;
}

/** Reporting covers the last full calendar year (due January 31), so 2025 is reported during 2026. */
export const reportingYear = (d = new Date()) => d.getFullYear() - 1;

export const metricsId = (spaceId: string, year: number) => `${spaceId}~${year}`;

export async function getSpaceMetrics(spaceId: string, year: number): Promise<SpaceMetrics | null> {
  const d = await getDoc(doc(db, 'space_metrics', metricsId(spaceId, year)));
  return d.exists() ? (d.data() as SpaceMetrics) : null;
}

export async function saveSpaceMetrics(spaceId: string, year: number, uid: string,
                                       metrics: Record<string, MetricValue>, capabilities: string[],
                                       untracked: string[] = [], estimated: string[] = []) {
  const m: SpaceMetrics = { space_id: spaceId, year, metrics, capabilities, untracked, estimated, updated_by: uid, updated_at: now() };
  await setDoc(doc(db, 'space_metrics', metricsId(spaceId, year)), m);
}

// ---------- suggestions: what we already know ----------

export interface Suggestion { value: MetricValue; from: string }

const STRUCTURE: Record<string, string> = {
  nonprofit_501c3: '501(c)(3) nonprofit', for_profit: 'For-profit',
  university: 'Institution-based', public_library: 'Institution-based', public_school: 'Institution-based', government: 'Institution-based',
};
const REFERRAL_FROM_DOMAIN: Record<string, string> = {
  digital_fabrication: 'digifab', woodworking: 'wood', metalworking: 'metal', electronics: 'electronics', textiles: 'textiles', science: 'lab',
};

/** Answers we can offer before anyone types: last year's figures, then what
 *  the directory record already says. Offered, never saved until accepted —
 *  last year's member count is not this year's. */
export async function suggestionsFor(space: Space | undefined, spaceId: string, year: number,
                                     capabilityDomain: (id: string) => string | undefined) {
  const out: Record<string, Suggestion> = {};
  let caps: string[] = [];
  const last = await getSpaceMetrics(spaceId, year - 1).catch(() => null);
  if (last) {
    for (const [k, v] of Object.entries(last.metrics)) out[k] = { value: v, from: `${year - 1}` };
    caps = last.capabilities;
  }
  const o = space?.operations ?? {};
  const fromListing = (k: string, v: MetricValue | undefined) => { if (v !== undefined && !(k in out)) out[k] = { value: v, from: 'your listing' }; };
  fromListing('structure', STRUCTURE[o.tax_status ?? '']);
  if (o.access_model) fromListing('access247', o.access_model === 'member_24_7');
  fromListing('sqftTotal', o.square_feet);
  if (space?.external_refs?.some((r) => r.system === 'fablabs_io')) fromListing('affilFabLab', true);
  if (!caps.length && space?.capabilities?.length) {
    caps = [...new Set(space.capabilities.map((c) => (c === 'computer_workstations' ? 'computer' : REFERRAL_FROM_DOMAIN[capabilityDomain(c) ?? ''])).filter(Boolean))] as string[];
  }
  return { fields: out, capabilities: caps, from: last ? `${year - 1}` : 'your listing' };
}
