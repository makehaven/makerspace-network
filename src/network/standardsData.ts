// Reads and writes for a space's Standards assessment. The full assessment is
// private to the space's staff; the summary is shared only on request.
// firestore.rules §Standards of Excellence holds both lines.

import { collection, deleteDoc, doc, getDoc, getDocs, setDoc, updateDoc } from 'firebase/firestore';
import { db } from './firebase';
import type { Space } from '../types';
import { FRAMEWORK, type Answer, type Flags } from '../standards/framework';
import type { MetricValue } from './spaceData';

const now = () => new Date().toISOString();

export interface Assessment {
  framework_version: number;
  flags: Flags;
  goal: 'foundational' | 'operational' | 'accredited';
  answers: Record<string, Answer>;
  updated_by: string;
  updated_at: string;
}

export interface AssessmentSummary {
  framework_version: number;
  level: string; avg: number; evidence_share: number;
  applicable: number; scored: number; urgent: number;
  domains: { code: string; name: string; applicable: number; avg: number }[];
  health: string[];
  shared_by: string; shared_at: string;
}

export async function getAssessment(spaceId: string): Promise<Assessment | null> {
  const d = await getDoc(doc(db, 'assessments', spaceId));
  return d.exists() ? (d.data() as Assessment) : null;
}

/** Create the document whole the first time; afterwards write only what changed,
 *  so two colleagues working on different standards do not overwrite each other. */
export async function saveAssessment(spaceId: string, uid: string, a: Omit<Assessment, 'updated_by' | 'updated_at'>,
                                     exists: boolean, changed: Set<string>) {
  const t = now();
  if (!exists) {
    await setDoc(doc(db, 'assessments', spaceId), { ...a, framework_version: FRAMEWORK.version, updated_by: uid, updated_at: t });
    return;
  }
  const patch: Record<string, unknown> = { flags: a.flags, goal: a.goal, updated_by: uid, updated_at: t };
  for (const id of changed) patch[`answers.${id}`] = a.answers[id] ?? {};
  await updateDoc(doc(db, 'assessments', spaceId), patch);
}

export async function getSummary(spaceId: string): Promise<AssessmentSummary | null> {
  const d = await getDoc(doc(db, 'assessment_summaries', spaceId));
  return d.exists() ? (d.data() as AssessmentSummary) : null;
}

/** Stewards only (the rules refuse anyone else a list). */
export async function listSummaries(): Promise<Map<string, AssessmentSummary>> {
  const s = await getDocs(collection(db, 'assessment_summaries'));
  return new Map(s.docs.map((d) => [d.id, d.data() as AssessmentSummary]));
}

export async function shareSummary(spaceId: string, uid: string, s: Omit<AssessmentSummary, 'shared_by' | 'shared_at' | 'framework_version'>) {
  await setDoc(doc(db, 'assessment_summaries', spaceId), { ...s, framework_version: FRAMEWORK.version, shared_by: uid, shared_at: now() });
}

export async function withdrawSummary(spaceId: string) {
  await deleteDoc(doc(db, 'assessment_summaries', spaceId));
}

const MINORS_OK = new Set(['minors_with_adult', 'minors_in_programs', 'minors_members', 'primarily_youth']);
const positive = (v?: MetricValue) => typeof v === 'number' && v > 0;

/** Which optional modules apply, guessed from what the space already told us,
 *  so the profile is a confirmation rather than a questionnaire. */
export function flagsFromWhatWeKnow(space?: Space, metrics?: Record<string, MetricValue>): Flags {
  const o = space?.operations ?? {};
  return {
    membership: !!o.membership_models?.some((m) => m === 'monthly_membership' || m === 'annual_membership'),
    publicAccess: o.public_access === true,
    paidStaff: positive(metrics?.staffFT) || positive(metrics?.staffPT) || (o.staff_fte ?? 0) > 0,
    volunteer: positive(metrics?.volunteers),
    toolLending: o.tool_lending === true,
    youth: MINORS_OK.has(o.minor_policy ?? ''),
    incubation: false, repair: false, rentals: false, records3yr: false,
  };
}
