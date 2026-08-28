import type { Space, Region, EnumEntry, Achievement } from './types';
import enumsJson from '../data/schema/enums.json';

// data/ is globbed at build time rather than generated into src/. There is no
// codegen step to forget to run, and the JSON files stay the canonical artifact.
const spaceModules = import.meta.glob<Space>('../data/spaces/*.json', { eager: true, import: 'default' });
const regionModules = import.meta.glob<Region>('../data/regions/*.json', { eager: true, import: 'default' });
const achModules = import.meta.glob<Achievement>('../data/achievements/*.json', { eager: true, import: 'default' });

export const SPACES: Space[] = Object.values(spaceModules).sort((a, b) => a.name.localeCompare(b.name));
export const REGIONS: Region[] = Object.values(regionModules);
export const ACHIEVEMENTS: Achievement[] = Object.values(achModules);

type Enums = Record<string, EnumEntry[]>;
const enums = enumsJson as unknown as Enums;

const index = (name: string) => new Map((enums[name] ?? []).map((e) => [e.id, e]));

export const VOCAB = {
  SpaceKind: index('SpaceKind'),
  Capability: index('Capability'),
  AccessModel: index('AccessModel'),
  MembershipModel: index('MembershipModel'),
  TaxStatus: index('TaxStatus'),
  MinorPolicy: index('MinorPolicy'),
  VerificationStatus: index('VerificationStatus'),
  SourceSystem: index('SourceSystem'),
};

export const CAPABILITIES = enums.Capability ?? [];
export const ACCESS_MODELS = enums.AccessModel ?? [];
export const SPACE_KINDS = enums.SpaceKind ?? [];

/** Human label for a vocabulary id, falling back to the raw id so an unmapped
 *  value is visible rather than silently blank. */
export const label = (vocab: keyof typeof VOCAB, id?: string): string =>
  (id && VOCAB[vocab].get(id)?.label) || id || '';

export const CAPABILITY_DOMAINS: { id: string; label: string }[] = [
  { id: 'digital_fabrication', label: 'Digital fabrication' },
  { id: 'woodworking', label: 'Woodworking' },
  { id: 'metalworking', label: 'Metal' },
  { id: 'electronics', label: 'Electronics' },
  { id: 'textiles', label: 'Textiles' },
  { id: 'print', label: 'Print' },
  { id: 'craft', label: 'Craft' },
  { id: 'media', label: 'Media' },
  { id: 'repair', label: 'Repair' },
  { id: 'science', label: 'Science' },
];

/** The region this visit is about. Subdomain first so
 *  connecticut.makerspace.network just works, then ?region=, then the only one. */
export function resolveRegion(): Region {
  const host = window.location.hostname.toLowerCase();
  const byHost = REGIONS.find((r) => r.hostname && host === r.hostname.toLowerCase());
  if (byHost) return byHost;

  const sub = host.split('.')[0];
  const byName = REGIONS.find((r) => r.name.toLowerCase().replace(/\s+/g, '-') === sub);
  if (byName) return byName;

  const param = new URLSearchParams(window.location.search).get('region');
  const byParam = REGIONS.find((r) => r.id === param);
  if (byParam) return byParam;

  return REGIONS[0];
}

export const spacesIn = (region: Region): Space[] =>
  SPACES.filter((s) => s.region_ids.includes(region.id) && s.status !== 'closed');

export const spaceById = (id: string): Space | undefined => SPACES.find((s) => s.id === id);

export const REPO_URL = 'https://github.com/makehaven/makerspace-network';

/** How complete a record is, as a fraction of the fields a visitor actually
 *  wants. Drives the "help us" prompts — an honest gap is an invitation. */
export function completeness(s: Space): { score: number; missing: string[] } {
  const checks: [string, boolean][] = [
    ['street address', Boolean(s.address?.street)],
    ['map location', s.address?.latitude !== undefined],
    ['website', Boolean(s.contact?.website)],
    ['how to get in', Boolean(s.operations?.access_model)],
    ['what it costs', Boolean(s.operations?.monthly_cost_usd || s.operations?.membership_models?.length)],
    ['policy on minors', Boolean(s.operations?.minor_policy)],
    ['equipment', Boolean(s.capabilities?.length)],
  ];
  const missing = checks.filter(([, ok]) => !ok).map(([name]) => name);
  return { score: (checks.length - missing.length) / checks.length, missing };
}
