// A maker's profile: what a person says about themselves, plus what only the
// network can say (came to an event, a moderator looked). firestore.rules is the
// contract; GOVERNANCE §Makers explains why this is separate from the roster.

import enumsJson from '../../data/schema/enums.json';
import type { EnumEntry } from '../types';

const enums = enumsJson as unknown as Record<string, EnumEntry[]>;
export const DISCIPLINES = enums.MakerDiscipline ?? [];
export const OPEN_TO = enums.MakerOpenTo ?? [];
export const LOOKING_FOR = enums.LookingFor ?? [];
export const wordFor = (list: EnumEntry[], id: string) => list.find((e) => e.id === id)?.label ?? id;

export type Visibility = 'hidden' | 'community' | 'public';

export interface MakerDoc {
  display_name: string;
  headline: string;
  bio: string;
  town: string;
  state: string;
  home_space_id: string | null;
  disciplines: string[];
  open_to: string[];
  looking_for: string[];
  website: string | null;
  instagram: string | null;
  contact_email: string | null;
  visibility: Visibility;
  /** Written by moderators and Functions only. */
  review: 'pending' | 'approved' | 'hidden';
  events: { id: string; title: string; attended: boolean }[];
  cover_url: string | null;
  work_count: number;
  work_pending: number;
  created_at: string;
  updated_at: string;
}

export interface WorkDoc { url: string; path: string; caption: string; status: 'pending' | 'approved' | 'rejected'; created_at: string }

export const blankMaker = (name: string, iso: string): MakerDoc => ({
  display_name: name, headline: '', bio: '', town: '', state: 'CT', home_space_id: null, disciplines: [], open_to: [], looking_for: [],
  website: null, instagram: null, contact_email: null, visibility: 'community', review: 'pending', events: [], cover_url: null,
  work_count: 0, work_pending: 0, created_at: iso, updated_at: iso,
});
