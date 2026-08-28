// Mirrors data/schema/*.json. Kept by hand: the schemas are the contract and
// these are the reader's view of it. If they drift, the schema wins.

export interface Address {
  street?: string; street_2?: string; locality?: string; county?: string;
  region?: string; postal_code?: string; country?: string;
  latitude?: number; longitude?: number; notes?: string;
}

export interface Contact {
  website?: string; email?: string; phone?: string;
  social?: Record<string, string>;
}

export interface Operations {
  access_model?: string;
  public_access?: boolean;
  tax_status?: string;
  membership_models?: string[];
  monthly_cost_usd?: { min?: number; max?: number; as_of?: string };
  day_pass_usd?: number;
  minor_policy?: string;
  tool_lending?: boolean;
  square_feet?: number;
  staff_fte?: number;
  hours_note?: string;
}

export interface Source { system: string; url?: string; retrieved: string; note?: string }

export interface Verification {
  status: 'imported' | 'steward_verified' | 'space_confirmed' | 'self_managed';
  verified_by?: string;
  verified_on?: string;
  gaps?: string[];
}

export interface Space {
  id: string; name: string; legal_name?: string;
  kind: string; status: string;
  summary?: string; description?: string; year_founded?: number;
  region_ids: string[];
  address?: Address;
  contact?: Contact;
  logo_url?: string; photo_url?: string;
  operations?: Operations;
  capabilities?: string[];
  equipment?: { capability: string; brand?: string; model?: string; count?: number; notes?: string }[];
  endpoints?: { spaceapi?: string; ical?: string; rss?: string };
  external_refs?: { system: string; id: string; url?: string }[];
  standards?: { participating?: boolean; level?: string; assessed_on?: string; shared_publicly?: boolean };
  reciprocity?: Record<string, unknown>;
  sources: Source[];
  verification: Verification;
}

export interface Region {
  id: string; name: string; hostname?: string;
  country: string; region_code: string; status: string;
  summary?: string;
  steward?: { organization?: string; contact?: string; note?: string };
  counties?: string[];
}

export interface EnumEntry {
  id: string; label: string; domain?: string;
  okw?: string; fablabs_io?: string; nexus?: string;
  url?: string; license?: string;
}

export interface Competency {
  id: string; statement: string;
  kind: 'knowledge' | 'judgement' | 'psychomotor';
  min_assessment: string;
  critical?: boolean;
  note?: string;
}

export interface Achievement {
  id: string; version: number; name: string; status: string;
  summary?: string; capability?: string; hazard_class: string;
  authors?: string[];
  competencies: Competency[];
  excludes: string[];
  site_specific: string[];
  brand_deltas?: { key: string; label: string; adds: string[]; asymmetry?: string }[];
  extensions?: string[];
  references?: { label: string; url?: string }[];
}
