// The Standards of Excellence self-assessment, as one part of "Your space".
// Every change saves itself; any colleague on staff can pick it up. The
// scores stay with the space. What the network sees is a summary, and only
// when someone presses Share.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSession } from '../session';
import { spaceById } from '../../data';
import { FRAMEWORK, compute, summarize, levelLabel, type Answer, type Flags, type Standard } from '../../standards/framework';
import {
  flagsFromWhatWeKnow, getAssessment, getSummary, saveAssessment, shareSummary, withdrawSummary,
  type Assessment, type AssessmentSummary,
} from '../standardsData';
import { getSpaceMetrics, reportingYear } from '../spaceData';

type Goal = Assessment['goal'];
const CHECK_LABEL: Record<string, string> = { avg: 'Average score', crit: 'Critical standards', ev: 'Evidence on file', records: 'Three years of records' };

export default function StandardsAssessment({ spaceId, canEdit }: { spaceId: string; canEdit: boolean }) {
  const s = useSession();
  const [flags, setFlags] = useState<Flags | null>(null);
  const [goal, setGoal] = useState<Goal>('operational');
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [exists, setExists] = useState(false);
  const [prefilled, setPrefilled] = useState(false);
  const [saving, setSaving] = useState<'idle' | 'pending' | 'saving' | 'saved' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<AssessmentSummary | null>(null);
  const dirty = useRef<Set<string>>(new Set());
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    Promise.all([getAssessment(spaceId), getSpaceMetrics(spaceId, reportingYear()).catch(() => null), getSummary(spaceId).catch(() => null)])
      .then(([a, m, sum]) => {
        if (a) { setFlags(a.flags); setGoal(a.goal); setAnswers(a.answers ?? {}); setExists(true); }
        else { setFlags(flagsFromWhatWeKnow(spaceById(spaceId), m?.metrics)); setPrefilled(true); }
        setSummary(sum);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [spaceId]);

  const computed = useMemo(() => (flags ? compute(flags, answers) : null), [flags, answers]);

  // Save a moment after the last change. Only the standards touched are
  // written, so colleagues working at the same time do not overwrite each other.
  const schedule = (nextFlags: Flags, nextGoal: Goal, nextAnswers: Record<string, Answer>) => {
    if (!canEdit) return;
    setSaving('pending');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      setSaving('saving');
      const changed = new Set(dirty.current); dirty.current.clear();
      try {
        await saveAssessment(spaceId, s.user!.uid, { framework_version: FRAMEWORK.version, flags: nextFlags, goal: nextGoal, answers: nextAnswers }, exists, changed);
        setExists(true); setSaving('saved');
      } catch (e) {
        for (const id of changed) dirty.current.add(id);
        setSaving('error'); setError(e instanceof Error ? e.message : String(e));
      }
    }, 700);
  };
  useEffect(() => () => window.clearTimeout(timer.current), []);

  if (error && !flags) return <p className="error">{error}</p>;
  if (!flags || !computed) return <p>Loading…</p>;

  const setAnswer = (id: string, patch: Partial<Answer>) => {
    const next = { ...answers, [id]: { ...answers[id], ...patch } };
    dirty.current.add(id); setAnswers(next); schedule(flags, goal, next);
  };
  const setFlag = (key: string, on: boolean) => { const next = { ...flags, [key]: on }; setFlags(next); setPrefilled(false); schedule(next, goal, answers); };
  const chooseGoal = (g: Goal) => { setGoal(g); schedule(flags, g, answers); };

  const checks = computed.levelChecks[goal];
  const goalDef = FRAMEWORK.goals.find((g) => g.id === goal)!;
  const shareable = summarize(computed, answers);

  return (
    <div className="std">
      <div className="card form-card">
        <div className="std-head">
          <div>
            <p className="eyebrow" style={{ margin: 0 }}>Where you stand</p>
            <div className="std-level">{levelLabel(computed.level)}</div>
            <p className="muted" style={{ margin: 0 }}>
              {computed.scored} of {computed.applicable.length} standards scored · average {computed.avg.toFixed(2)} ·
              evidence on {Math.round(computed.evidenceShare * 100)}%
              {computed.urgent > 0 && <> · <strong className="std-urgent">{computed.urgent} critical at 0</strong></>}
            </p>
          </div>
          <SaveState state={saving} canEdit={canEdit} />
        </div>
        <div className="inline-fields" style={{ marginTop: 14, alignItems: 'end' }}>
          <label className="field"><span>Working towards</span>
            <select value={goal} disabled={!canEdit} onChange={(e) => chooseGoal(e.target.value as Goal)}>
              {FRAMEWORK.goals.map((g) => <option key={g.id} value={g.id}>{levelLabel(g.id)}</option>)}
            </select></label>
          <ul className="std-checks">
            {Object.entries(checks).map(([k, ok]) => (k === 'records' && !goalDef.needs_records) ? null : (
              <li key={k} className={ok ? 'ok' : ''}>{ok ? '✓' : '○'} {k === 'crit' ? goalDef.label : CHECK_LABEL[k]}
                {k === 'avg' && <span className="muted"> ≥ {goalDef.avg}</span>}
                {k === 'ev' && goalDef.evidence_share > 0 && <span className="muted"> ≥ {Math.round(goalDef.evidence_share * 100)}%</span>}
              </li>
            ))}
          </ul>
        </div>
        <p className="muted" style={{ marginBottom: 0 }}>
          This is private to your space's staff — not even the network steward sees your scores.
          Saves as you go; anyone on your staff can carry on where you left off.
        </p>
      </div>

      <details className="card form-card std-profile" open={!exists}>
        <summary><strong>How your space operates</strong> <span className="muted">— decides which standards apply to you</span></summary>
        {prefilled && <p className="notice info">Pre-filled from your listing and annual data. Check it, then start scoring.</p>}
        <div className="checks" style={{ marginTop: 10 }}>
          {FRAMEWORK.flags.map((f) => (
            <label key={f.key} className={`check ${flags[f.key] ? 'on' : ''}`} title={f.note}>
              <input type="checkbox" disabled={!canEdit} checked={!!flags[f.key]} onChange={(e) => setFlag(f.key, e.target.checked)} />
              {f.label}
            </label>
          ))}
        </div>
      </details>

      {FRAMEWORK.domains.map((d) => {
        const list = computed.applicable.filter((st) => st.domain === d.code);
        const notApplicable = FRAMEWORK.standards.filter((st) => st.domain === d.code && answers[st.id]?.na);
        if (!list.length && !notApplicable.length) return null;
        const dom = computed.domains.find((x) => x.code === d.code);
        return (
          <details key={d.code} className="card form-card std-domain">
            <summary>
              <strong>{d.name}</strong>
              <span className="muted"> {dom ? `${dom.scored} of ${dom.applicable} scored · average ${dom.avg.toFixed(1)}` : 'none apply'}</span>
              {dom && dom.urgent > 0 && <span className="std-urgent"> · {dom.urgent} critical at 0</span>}
            </summary>
            {[...list, ...notApplicable].map((st) => (
              <StandardRow key={st.id} st={st} a={answers[st.id] ?? {}} canEdit={canEdit} onChange={(p) => setAnswer(st.id, p)} />
            ))}
          </details>
        );
      })}

      <div className="card form-card">
        <h3 style={{ marginTop: 0 }}>Share a summary with the network</h3>
        <p className="muted">
          Optional. Shares your level, your average in each domain and the health check — never a single
          standard's score, your evidence or your notes. The steward sees it; the network only ever
          publishes counts and ranges across spaces. You can withdraw it at any time.
        </p>
        <p><strong>{levelLabel(shareable.level)}</strong> · {shareable.domains.map((x) => `${x.name} ${x.avg.toFixed(1)}`).join(' · ')}</p>
        {summary && <p className="notice info">Shared on {summary.shared_at.slice(0, 10)} at {levelLabel(summary.level)}. Sharing again replaces it.</p>}
        {canEdit && computed.scored < computed.applicable.length * 0.8 && (
          <p className="muted">Score at least {Math.ceil(computed.applicable.length * 0.8)} of your {computed.applicable.length} standards first,
            so the summary describes your space rather than how far you got.</p>
        )}
        {canEdit && (
          <div className="btn-row">
            <button className="btn" disabled={computed.scored < computed.applicable.length * 0.8} onClick={async () => {
              const { level, avg, evidence_share, applicable, scored, urgent, domains, health } = shareable;
              try { await shareSummary(spaceId, s.user!.uid, { level, avg, evidence_share, applicable, scored, urgent, domains, health }); setSummary(await getSummary(spaceId)); }
              catch (e) { setError(e instanceof Error ? e.message : String(e)); }
            }}>{summary ? 'Share the current summary' : 'Share summary with the network'}</button>
            {summary && <button className="btn ghost" onClick={async () => { await withdrawSummary(spaceId); setSummary(null); }}>Withdraw</button>}
          </div>
        )}
        {error && <p className="error">{error}</p>}
      </div>
    </div>
  );
}

function SaveState({ state, canEdit }: { state: string; canEdit: boolean }) {
  if (!canEdit) return <span className="muted">Read only</span>;
  const text = { idle: '', pending: 'Unsaved changes…', saving: 'Saving…', saved: 'All changes saved', error: 'Not saved — check your connection' }[state];
  return <span className={`std-save ${state}`}>{text}</span>;
}

function StandardRow({ st, a, canEdit, onChange }: { st: Standard; a: Answer; canEdit: boolean; onChange: (p: Partial<Answer>) => void }) {
  const [open, setOpen] = useState(false);
  const score = typeof a.score === 'number' ? a.score : null;
  return (
    <div className={`std-row ${a.na ? 'na' : ''}`}>
      <div className="std-row-head">
        <span className="std-id">{st.id}</span>
        {st.critical && <span className="chip critical">Critical</span>}
        <span className="chip">Tier {st.tier}</span>
        <span className="std-score">{a.na ? 'Does not apply' : score === null ? 'Not scored' : `${score} / 3`}</span>
      </div>
      <p className="std-text">{st.text}</p>
      {!a.na && (
        <div className="std-anchors">
          {st.anchors.map((text, n) => (
            <button key={n} type="button" disabled={!canEdit} className={`std-anchor ${score === n ? 'on' : ''}`}
                    onClick={() => onChange({ score: score === n ? null : n })}>
              <span className="n">{n}</span><span>{text}</span>
            </button>
          ))}
        </div>
      )}
      <div className="std-row-foot">
        <button type="button" className="linkish" onClick={() => setOpen(!open)}>
          {open ? 'Hide evidence and plan' : a.evidence?.trim() || a.action ? 'Evidence and plan ✓' : 'Add evidence or a plan'}
        </button>
        {canEdit && (
          <button type="button" className="linkish" onClick={() => onChange({ na: !a.na })}>
            {a.na ? 'It applies after all' : 'Doesn\'t apply to us'}
          </button>
        )}
      </div>
      {open && (
        <div className="std-more">
          <label className="field"><span>Evidence — links or where it is kept</span>
            <textarea rows={2} disabled={!canEdit} maxLength={2000} placeholder={`Expected: ${st.evidence}`}
                      value={a.evidence ?? ''} onChange={(e) => onChange({ evidence: e.target.value })} /></label>
          {(score ?? 0) < 3 && (
            <div className="inline-fields">
              <label className="field"><span>Who will improve it</span>
                <input disabled={!canEdit} maxLength={120} value={a.owner ?? ''} onChange={(e) => onChange({ owner: e.target.value })} /></label>
              <label className="field"><span>By when</span>
                <input type="date" disabled={!canEdit} value={a.due ?? ''} onChange={(e) => onChange({ due: e.target.value })} /></label>
              <label className="field" style={{ flex: 2 }}><span>What will change</span>
                <input disabled={!canEdit} maxLength={500} value={a.action ?? ''} onChange={(e) => onChange({ action: e.target.value })} /></label>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
