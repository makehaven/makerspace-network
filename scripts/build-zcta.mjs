#!/usr/bin/env node
// Regenerates data/geo/us-ct-zcta.json: one point per Connecticut ZIP code
// (ZCTA), so "spaces near me" can turn a ZIP into a distance without asking a
// geocoding service at view time.
//
// Source: US Census Bureau Gazetteer files, ZIP Code Tabulation Areas, 2024
// (INTPTLAT/INTPTLONG, an internal point of each area). A US Government work,
// public domain. ZCTAs approximate USPS ZIP codes; a PO-box-only ZIP has none.
//
// Run:  node scripts/build-zcta.mjs   (needs network; output is committed)
import { writeFileSync, mkdtempSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SRC = 'https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2024_Gazetteer/2024_Gaz_zcta_national.zip';
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'geo', 'us-ct-zcta.json');

const dir = mkdtempSync(join(tmpdir(), 'zcta-'));
const zip = join(dir, 'g.zip');
writeFileSync(zip, Buffer.from(await (await fetch(SRC)).arrayBuffer()));
execFileSync('unzip', ['-o', '-q', zip, '-d', dir]);
const rows = readFileSync(join(dir, '2024_Gaz_zcta_national.txt'), 'utf8').split('\n').slice(1);

const points = {};
for (const line of rows) {
  const [zip5, , , , , lat, lon] = line.trim().split('\t');
  // Connecticut's ZIPs all start 06.
  if (!/^06\d{3}$/.test(zip5 ?? '')) continue;
  points[zip5] = [Number(Number(lat).toFixed(4)), Number(Number(lon).toFixed(4))];
}
writeFileSync(OUT, JSON.stringify({
  $comment: 'Connecticut ZIP Code Tabulation Areas: [lat, lon] of each internal point. US Census Bureau 2024 Gazetteer, public domain. Built by scripts/build-zcta.mjs.',
  source: SRC,
  points,
}) + '\n');
console.log(`${Object.keys(points).length} Connecticut ZIPs → ${OUT}`);
