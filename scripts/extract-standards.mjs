#!/usr/bin/env node
// One-off: lift the Standards of Excellence framework out of the old
// single-file tool (tools/standards/app/index.html) into versioned data.
// Evaluates the tool's own constant definitions so nothing is retyped.
import { readFileSync, writeFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../tools/standards/app/index.html', import.meta.url), 'utf8');
const grab = (start, end) => {
  const i = html.indexOf(start); const j = html.indexOf(end, i);
  if (i < 0 || j < 0) throw new Error('not found: ' + start);
  return html.slice(i, j);
};
const src = [
  grab('const DOMAINS', '/* ================= State'),
  grab('const HEALTH_CHECK', 'function healthAnswer'),
].join('\n') + '\n;({ DOMAINS, MODULES, FLAG_DEFS, STANDARDS, ANCHORS, LEVELS, GOALS, HEALTH_CHECK })';
const x = vm.runInNewContext(src.replace(/\bconst /g, 'var '));

// GOALS carries critScope as a function; record it as data the app can apply.
const critScope = { foundational: { critical: true, max_tier: 1 }, operational: { critical: true, max_tier: 2 }, accredited: { critical: true, max_tier: null } };
for (const g of Object.keys(x.GOALS)) {
  const probe = (t) => x.GOALS[g].critScope({ c: true, t });
  const max = probe(3) ? null : probe(2) ? 2 : 1;
  if (max !== critScope[g].max_tier) throw new Error('critScope drift for ' + g);
}

const fw = {
  $comment: 'Makerspace Standards of Excellence. Lifted from the original single-file tool (makehaven/Makerspace-Standards) by scripts/extract-standards.mjs on 2026-10-08. A changed standard or anchor is a new framework version; assessments record the version they were made against.',
  id: 'makerspace-standards',
  version: 1,
  licence: 'CC BY-SA 4.0',
  domains: x.DOMAINS,
  modules: Object.entries(x.MODULES).map(([id, m]) => ({ id, label: m.label, always: !!m.always, flag: m.flag ?? null })),
  flags: x.FLAG_DEFS,
  standards: x.STANDARDS.map((s) => ({
    id: s.id, domain: s.d, module: s.m, tier: s.t, critical: s.c, text: s.s, evidence: s.e,
    anchors: x.ANCHORS[s.id],
  })),
  levels: Object.entries(x.LEVELS).map(([id, l]) => ({ id, label: l.label, order: l.order })),
  goals: Object.entries(x.GOALS).map(([id, g]) => ({
    id, avg: g.avg, evidence_share: g.ev, critical_min: g.critNeed, critical_scope: critScope[id], needs_records: g.records, label: g.critLabel,
  })),
  health_check: x.HEALTH_CHECK.map(([question, standard]) => ({ question, standard })),
};
for (const s of fw.standards) if (!Array.isArray(s.anchors) || s.anchors.length !== 4) throw new Error('anchors missing for ' + s.id);
writeFileSync(new URL('../data/standards/framework.v1.json', import.meta.url), JSON.stringify(fw, null, 2) + '\n');
console.log(`framework v1: ${fw.standards.length} standards, ${fw.domains.length} domains, ${fw.modules.length} modules, ${fw.goals.length} goals, ${fw.health_check.length} health checks`);
