#!/usr/bin/env node
// Publishes each achievement definition at its canonical, permanent URL:
//
//   https://makerspace.network/achievements/<id>/v<n>        human-readable
//   https://makerspace.network/achievements/<id>/v<n>.json   the definition
//
// These URLs are baked into Open Badges BadgeClass alignment and into every
// credential signed against them. They can never move. That is the whole reason
// the raw JSON is emitted as a static file rather than served by the app: the
// definition must resolve even if the site is rewritten or retired.
import { readdirSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = join(root, 'data/achievements');
const outDir = join(root, 'dist/achievements');

mkdirSync(outDir, { recursive: true });
const index = [];

for (const file of readdirSync(srcDir).filter((f) => f.endsWith('.json'))) {
  const def = JSON.parse(readFileSync(join(srcDir, file), 'utf8'));
  const dir = join(outDir, def.id);
  mkdirSync(dir, { recursive: true });

  const canonical = `https://makerspace.network/achievements/${def.id}/v${def.version}`;
  writeFileSync(join(dir, `v${def.version}.json`), JSON.stringify({ '@id': canonical, ...def }, null, 2) + '\n');

  index.push({ id: def.id, version: def.version, name: def.name, status: def.status, url: canonical });
}

writeFileSync(join(outDir, 'index.json'), JSON.stringify(index, null, 2) + '\n');
console.log(`published ${index.length} achievement definition(s) to dist/achievements/`);
