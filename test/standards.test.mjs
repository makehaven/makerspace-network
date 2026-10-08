// The ported scoring must agree with the original tool on any input. Runs the
// original computeFor()/summarize() from tools/standards/app/index.html in a
// sandbox against src/standards/framework.ts, on random assessments.
// Run: node --test test/standards.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { compute, summarize, FRAMEWORK } from '../src/standards/framework.ts';

const html = readFileSync(new URL('../tools/standards/app/index.html', import.meta.url), 'utf8');
const cut = (a, b) => html.slice(html.indexOf(a), html.indexOf(b, html.indexOf(a)));
const original = vm.runInNewContext([
  cut('const DOMAINS', '/* ================= State'),
  cut('function computeFor', '/* ================= Utilities'),
  cut('const HEALTH_CHECK', 'function num('),
  cut('function summarize', 'function collectSharedResources'),
].join('\n').replace(/\bconst /g, 'var ') + '\n;({ computeFor, summarize })');

let seed = 7;
const seen = new Set();
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };

test('levels, averages, domains and health checks match the original tool', () => {
  for (let run = 0; run < 400; run++) {
    // Aim each run at a level in turn, with noise, so every level is exercised.
    const aim = run % 4;
    const flags = Object.fromEntries(FRAMEWORK.flags.map((f) => [f.key, rnd() < 0.5]));
    if (aim === 3) flags.records3yr = rnd() < 0.9;
    const answers = {}; const legacy = {};
    for (const s of FRAMEWORK.standards) {
      if (aim < 3 && rnd() < 0.08) continue;
      let score;
      if (aim === 0) score = rnd() < 0.1 ? null : Math.floor(rnd() * 4);
      else if (aim === 1) score = Math.min(3, (s.critical && s.tier === 1 ? 1 : 0) + Math.floor(rnd() * 2) + (rnd() < 0.3 ? 1 : 0));
      else if (aim === 2) score = rnd() < 0.97 || s.critical ? 2 + (rnd() < 0.3 ? 1 : 0) : 1;
      else score = rnd() < 0.985 || s.critical ? 3 : 2;
      const na = rnd() < (aim === 3 ? 0.01 : 0.05);
      const ev = rnd() < [0.3, 0.6, 0.9, 0.99][aim] ? 'policy.pdf' : '';
      answers[s.id] = { score, na, evidence: ev };
      legacy[s.id] = { score: score ?? undefined, na, evidenceItems: ev ? [{ kind: 'note', note: ev }] : [] };
    }
    const mine = summarize(compute(flags, answers), answers);
    // JSON round-trip: objects from the sandbox have another realm's prototypes.
    const theirs = JSON.parse(JSON.stringify(original.summarize(original.computeFor({ profile: { flags }, scores: legacy }))));
    seen.add(mine.level);
    assert.equal(mine.level, theirs.level, `run ${run}`);
    assert.equal(mine.avg, theirs.avg); assert.equal(mine.evidence_share, theirs.evPct);
    assert.equal(mine.applicable, theirs.applicable); assert.equal(mine.scored, theirs.scored); assert.equal(mine.urgent, theirs.urgent);
    assert.deepEqual(mine.domains, theirs.domains); assert.deepEqual(mine.health, theirs.health);
  }
  // The random runs must actually reach every level, or the comparison proves little.
  assert.deepEqual([...seen].sort(), ['accredited', 'emerging', 'foundational', 'operational']);
});
