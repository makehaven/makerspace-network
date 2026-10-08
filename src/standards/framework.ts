// The Standards of Excellence framework and the arithmetic that turns scores
// into a level. Ported from the original single-file tool's computeFor() and
// summarize(); test/standards.test.mjs checks the two agree on random input.
// Plain TypeScript with no imports beyond the JSON, so node can run it too.

import fw from '../../data/standards/framework.v1.json' with { type: 'json' };

export interface Standard {
  id: string; domain: string; module: string; tier: number; critical: boolean;
  text: string; evidence: string; anchors: string[];
}
export interface Goal {
  id: string; avg: number; evidence_share: number; critical_min: number;
  critical_scope: { critical: boolean; max_tier: number | null }; needs_records: boolean; label: string;
}
export interface Framework {
  id: string; version: number;
  domains: { code: string; name: string }[];
  modules: { id: string; label: string; always: boolean; flag: string | null }[];
  flags: { key: string; label: string; note: string }[];
  standards: Standard[];
  levels: { id: string; label: string; order: number }[];
  goals: Goal[];
  health_check: { question: string; standard: string }[];
}
export const FRAMEWORK = fw as Framework;

/** One standard's answer. `evidence` is links and notes in the space's own words. */
export interface Answer {
  score?: number | null; na?: boolean; evidence?: string;
  owner?: string; due?: string; action?: string;
}
export type Flags = Record<string, boolean>;

export interface Computed {
  applicable: Standard[];
  scored: number;
  avg: number;
  evidenceCount: number;
  evidenceShare: number;
  level: string;
  levelChecks: Record<string, { avg: boolean; crit: boolean; ev: boolean; records: boolean }>;
  domains: { code: string; name: string; applicable: number; scored: number; avg: number; urgent: number }[];
  urgent: number;
}

const inScope = (g: Goal, s: Standard) =>
  (!g.critical_scope.critical || s.critical) && (g.critical_scope.max_tier == null || s.tier <= g.critical_scope.max_tier);

export const hasEvidence = (a?: Answer) => !!a?.evidence?.trim();

export function compute(flags: Flags, answers: Record<string, Answer>, f: Framework = FRAMEWORK): Computed {
  const mods = new Map(f.modules.map((m) => [m.id, m]));
  const applicable = f.standards.filter((s) => {
    const m = mods.get(s.module)!;
    if (!(m.always || (m.flag && flags[m.flag]))) return false;
    return !answers[s.id]?.na;
  });
  const sc = (id: string) => { const v = answers[id]?.score; return typeof v === 'number' ? v : null; };
  const total = applicable.reduce((a, s) => a + (sc(s.id) ?? 0), 0);
  const avg = applicable.length ? total / applicable.length : 0;
  const evidenceCount = applicable.filter((s) => hasEvidence(answers[s.id])).length;
  const evidenceShare = applicable.length ? evidenceCount / applicable.length : 0;

  const levelChecks: Computed['levelChecks'] = {};
  for (const g of f.goals) {
    levelChecks[g.id] = {
      avg: avg >= g.avg,
      crit: applicable.filter((s) => inScope(g, s)).every((s) => (sc(s.id) ?? 0) >= g.critical_min),
      ev: evidenceShare >= g.evidence_share,
      records: !g.needs_records || !!flags.records3yr,
    };
  }
  // Levels are cumulative in the original: each one met overrides the last.
  let level = 'emerging';
  for (const g of f.goals) if (Object.values(levelChecks[g.id]).every(Boolean)) level = g.id;

  const domains = f.domains.map((d) => {
    const list = applicable.filter((s) => s.domain === d.code);
    const dTotal = list.reduce((a, s) => a + (sc(s.id) ?? 0), 0);
    return {
      code: d.code, name: d.name, applicable: list.length,
      scored: list.filter((s) => sc(s.id) !== null).length,
      avg: list.length ? dTotal / list.length : 0,
      urgent: list.filter((s) => s.critical && (sc(s.id) ?? 0) === 0).length,
    };
  }).filter((d) => d.applicable > 0);

  return {
    applicable, scored: applicable.filter((s) => sc(s.id) !== null).length, avg, evidenceCount, evidenceShare,
    level, levelChecks, domains, urgent: applicable.filter((s) => s.critical && (sc(s.id) ?? 0) === 0).length,
  };
}

/** The health check answers, derived from scores so nobody answers twice. */
export function health(c: Computed, answers: Record<string, Answer>, f: Framework = FRAMEWORK): string[] {
  return f.health_check.map(({ standard }) => {
    if (!c.applicable.some((s) => s.id === standard)) return 'N/A';
    const v = answers[standard]?.score;
    if (typeof v !== 'number') return 'Not scored';
    return v >= 2 ? 'Yes' : v === 1 ? 'In progress' : 'No';
  });
}

/** What a space may choose to share with the network: no per-standard data, no evidence, no notes. */
export function summarize(c: Computed, answers: Record<string, Answer>, f: Framework = FRAMEWORK) {
  return {
    level: c.level, avg: +c.avg.toFixed(3), evidence_share: +c.evidenceShare.toFixed(3),
    applicable: c.applicable.length, scored: c.scored, urgent: c.urgent,
    domains: c.domains.map((d) => ({ code: d.code, name: d.name, applicable: d.applicable, avg: +d.avg.toFixed(3) })),
    health: health(c, answers, f),
  };
}

export const levelLabel = (id: string) => FRAMEWORK.levels.find((l) => l.id === id)?.label ?? id;
