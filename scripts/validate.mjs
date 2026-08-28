#!/usr/bin/env node
// Validates every record in data/spaces and data/regions against the schema's
// required fields and the controlled vocabularies in data/schema/enums.json.
// Dependency-free on purpose: the data layer must be checkable by anyone with
// node installed, before any of the site tooling exists.

import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));

const enums = read('data/schema/enums.json');
const schema = read('data/schema/space.schema.json');
const ids = (name) => new Set((enums[name] ?? []).map((e) => e.id));

// Which enum guards which field. The schema records this as $comment because
// JSON Schema has no way to reference an external vocabulary by name.
const ENUM_FIELDS = [
  ['kind', 'SpaceKind', (s) => [s.kind]],
  ['status', 'OperatingStatus', (s) => [s.status]],
  ['capabilities', 'Capability', (s) => s.capabilities ?? []],
  ['operations.access_model', 'AccessModel', (s) => [s.operations?.access_model]],
  ['operations.tax_status', 'TaxStatus', (s) => [s.operations?.tax_status]],
  ['operations.membership_models', 'MembershipModel', (s) => s.operations?.membership_models ?? []],
  ['operations.minor_policy', 'MinorPolicy', (s) => [s.operations?.minor_policy]],
  ['verification.status', 'VerificationStatus', (s) => [s.verification?.status]],
  ['sources[].system', 'SourceSystem', (s) => (s.sources ?? []).map((x) => x.system)],
  ['external_refs[].system', 'SourceSystem', (s) => (s.external_refs ?? []).map((x) => x.system)],
  ['equipment[].capability', 'Capability', (s) => (s.equipment ?? []).map((x) => x.capability)],
];

const regionIds = new Set(
  readdirSync(join(root, 'data/regions'))
    .filter((f) => f.endsWith('.json'))
    .map((f) => read(`data/regions/${f}`).id),
);

const errors = [];
const warnings = [];
let count = 0;

for (const file of readdirSync(join(root, 'data/spaces')).filter((f) => f.endsWith('.json'))) {
  const s = read(`data/spaces/${file}`);
  const at = (msg) => errors.push(`${file}: ${msg}`);
  count++;

  for (const req of schema.required) {
    if (s[req] === undefined) at(`missing required field "${req}"`);
  }

  if (s.id !== file.replace(/\.json$/, '')) at(`id "${s.id}" does not match filename`);
  if (s.id && !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(s.id)) at(`id "${s.id}" is not a valid slug`);

  for (const [path, enumName, get] of ENUM_FIELDS) {
    const allowed = ids(enumName);
    for (const v of get(s)) {
      if (v !== undefined && v !== null && !allowed.has(v)) {
        at(`${path}: "${v}" is not in the ${enumName} vocabulary`);
      }
    }
  }

  for (const r of s.region_ids ?? []) {
    if (!regionIds.has(r)) at(`region_ids: unknown region "${r}"`);
  }

  const known = new Set(Object.keys(schema.properties));
  for (const k of Object.keys(s)) if (!known.has(k)) at(`unknown field "${k}"`);

  // Not errors — a record with honest gaps is publishable, a record that
  // quietly omits them is not. This is the whole point of the OKW provenance
  // model; see docs/INTEROP.md.
  const gaps = s.verification?.gaps ?? [];
  const hasAddress = s.address?.street && s.address?.latitude !== undefined;
  if (!hasAddress && !gaps.some((g) => /address|coordinate/i.test(g))) {
    warnings.push(`${file}: no street address or coordinates, and verification.gaps does not say so`);
  }
  if (!s.contact?.website && !gaps.some((g) => /website/i.test(g))) {
    warnings.push(`${file}: no website, and verification.gaps does not say so`);
  }
}

for (const w of warnings) console.warn(`  warn  ${w}`);
for (const e of errors) console.error(`  ERROR ${e}`);

console.log(
  `\n${count} space records · ${regionIds.size} regions · ` +
    `${errors.length} errors · ${warnings.length} warnings`,
);
process.exit(errors.length ? 1 : 0);
