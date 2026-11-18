// The network's annual data standard, made as easy to answer as it can be:
// the ten core questions first, what we already know offered as suggestions,
// "we don't track this" and "this is an estimate" as real answers, a section
// handed to a colleague by email, and every change saved as it is made.
//
// Only what changed is written, merged into what is there, so colleagues
// answering different questions at once (which "Ask a colleague" invites) do
// not erase each other. A save waiting to happen is sent, not dropped, when
// the person switches tab or year, and leaving the page asks first.

import { useEffect, useId, useRef, useState } from 'react';
import { useSession } from '../session';
import { CAPABILITIES, spaceById } from '../../data';
import {
  METRIC_SECTIONS, REFERRAL_CAPABILITIES, getSpaceMetrics, reportingYear, saveSpaceMetricsPatch, suggestionsFor,
  type MetricField, type MetricValue, type Suggestion,
} from '../spaceData';
import NumberInput from './NumberInput';

const ALL = METRIC_SECTIONS.flatMap((x) => x.fields);
const CORE = ALL.filter((f) => f.core);
const slug = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const show = (f: MetricField, v: MetricValue) =>
  typeof v === 'boolean' ? (v ? 'Yes' : 'No') : f.kind === 'money' ? `$${Number(v).toLocaleString('en-US')}` : f.kind === 'percent' ? `${v}%` : String(v);
/** The person's own calendar day, not UTC's: late in a Connecticut evening UTC is already tomorrow. */
const day = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const SAVED = 'All changes saved';

type Pending = { keys: Set<string>; caps: boolean; untracked: boolean; estimated: boolean };
const nothing = (): Pending => ({ keys: new Set(), caps: false, untracked: false, estimated: false });
/** Everything a save needs, including whose and which space's, so a stale closure cannot misfile it. */
type Answers = { spaceId: string; uid: string; year: number; m: Record<string, MetricValue>; caps: string[]; untracked: string[]; estimated: string[] };

export default function AnnualData({ spaceId, canEdit }: { spaceId: string; canEdit: boolean }) {
  const s = useSession();
  const space = spaceById(spaceId);
  const [year, setYear] = useState(reportingYear());
  const [m, setM] = useState<Record<string, MetricValue> | null>(null);
  const [caps, setCaps] = useState<string[]>([]);
  const [untracked, setUntracked] = useState<string[]>([]);
  const [estimated, setEstimated] = useState<string[]>([]);
  const [hints, setHints] = useState<Record<string, Suggestion>>({});
  const [capHint, setCapHint] = useState<string[]>([]);
  const [status, setStatus] = useState<string | null>(null);

  const timer = useRef<number | undefined>(undefined);
  const pending = useRef<Pending>(nothing());
  const latest = useRef<Answers | null>(null);
  const exists = useRef(false);
  const inflight = useRef(0);

  /** Send whatever is waiting now. Reads refs only, so a stale closure is safe to call. */
  const flush = () => {
    window.clearTimeout(timer.current); timer.current = undefined;
    const p = pending.current, a = latest.current;
    if (!a || (!p.keys.size && !p.caps && !p.untracked && !p.estimated)) return;
    pending.current = nothing();
    const whole = !exists.current;
    inflight.current++;
    setStatus('Saving…');
    // Firestore holds a write while offline rather than failing it; say so.
    const slow = window.setTimeout(() => setStatus('Not saved yet — waiting for a connection. Keep this page open.'), 6000);
    saveSpaceMetricsPatch(a.spaceId, a.year, a.uid, {
      metrics: Object.fromEntries([...p.keys].map((k) => [k, a.m[k] ?? null])),
      ...(whole || p.caps ? { capabilities: a.caps } : {}),
      ...(whole || p.untracked ? { untracked: a.untracked } : {}),
      ...(whole || p.estimated ? { estimated: a.estimated } : {}),
    }).then(() => {
      exists.current = true;
      if (inflight.current === 1 && !timer.current) setStatus(SAVED);
    }).catch((x) => {
      // Put it back so the next change retries it.
      for (const k of p.keys) pending.current.keys.add(k);
      pending.current.caps ||= p.caps; pending.current.untracked ||= p.untracked; pending.current.estimated ||= p.estimated;
      setStatus(`Not saved — ${x instanceof Error ? x.message : String(x)}`);
    }).finally(() => { window.clearTimeout(slow); inflight.current--; });
  };

  // Leaving with a save waiting or on its way: send it and ask first.
  useEffect(() => {
    const onLeave = (e: BeforeUnloadEvent) => {
      if (!timer.current && !inflight.current) return;
      flush(); e.preventDefault(); e.returnValue = '';
    };
    window.addEventListener('beforeunload', onLeave);
    return () => window.removeEventListener('beforeunload', onLeave);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setM(null); setStatus(null);
    let live = true;
    const domainOf = (id: string) => CAPABILITIES.find((c) => c.id === id)?.domain;
    Promise.all([getSpaceMetrics(spaceId, year), suggestionsFor(space, spaceId, year, domainOf).catch(() => null)])
      .then(([x, sug]) => {
        if (!live) return;
        exists.current = !!x;
        latest.current = { spaceId, uid: s.user!.uid, year, m: x?.metrics ?? {}, caps: x?.capabilities ?? [], untracked: x?.untracked ?? [], estimated: x?.estimated ?? [] };
        setM(x?.metrics ?? {}); setCaps(x?.capabilities ?? []);
        setUntracked(x?.untracked ?? []); setEstimated(x?.estimated ?? []);
        setHints(sug?.fields ?? {}); setCapHint(x?.capabilities?.length ? [] : sug?.capabilities ?? []);
        if (x) setStatus(`Last saved ${day(x.updated_at)}`);
      })
      .catch((e) => { if (live) { setM({}); setStatus(e instanceof Error ? e.message : String(e)); } });
    // Switching year or tab sends what is waiting for the year it was typed in.
    return () => { live = false; flush(); };
  }, [spaceId, year]); // eslint-disable-line react-hooks/exhaustive-deps

  // Jump to a section a colleague was sent to: `section=` survives the sign-in
  // link (a #hash does not); older links used the hash.
  useEffect(() => {
    if (!m) return;
    const target = new URLSearchParams(window.location.search).get('section') ?? window.location.hash.slice(1);
    const el = target ? document.getElementById(target) : null;
    if (!el) return;
    const fold = el instanceof HTMLDetailsElement ? el : el.closest('details');
    if (fold) fold.open = true;
    el.scrollIntoView({ behavior: 'smooth' });
  }, [m === null]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!m) return <p>Loading…</p>;

  type Change = { m?: Record<string, MetricValue>; caps?: string[]; untracked?: string[]; estimated?: string[]; keys?: string[] };
  const save = (next: Change) => {
    const nm = next.m ?? m, nc = next.caps ?? caps, nu = next.untracked ?? untracked, ne = next.estimated ?? estimated;
    if (next.m) setM(nm); if (next.caps) setCaps(nc); if (next.untracked) setUntracked(nu); if (next.estimated) setEstimated(ne);
    latest.current = { spaceId, uid: s.user!.uid, year, m: nm, caps: nc, untracked: nu, estimated: ne };
    if (!canEdit) return;
    for (const k of next.keys ?? []) pending.current.keys.add(k);
    if (next.caps) pending.current.caps = true;
    if (next.untracked) pending.current.untracked = true;
    if (next.estimated) pending.current.estimated = true;
    window.clearTimeout(timer.current); setStatus('Unsaved changes…');
    timer.current = window.setTimeout(flush, 700);
  };
  const setValue = (k: string, v: MetricValue | null) => {
    const next = { ...m }; if (v === null || v === '') delete next[k]; else next[k] = v;
    save({ m: next, keys: [k], ...(untracked.includes(k) ? { untracked: untracked.filter((x) => x !== k) } : {}) });
  };
  const toggleUntracked = (k: string) => {
    if (untracked.includes(k)) return save({ untracked: untracked.filter((x) => x !== k) });
    const next = { ...m }; delete next[k];
    save({ m: next, keys: [k], untracked: [...untracked, k], ...(estimated.includes(k) ? { estimated: estimated.filter((x) => x !== k) } : {}) });
  };
  const toggleEstimate = (k: string) =>
    save({ estimated: estimated.includes(k) ? estimated.filter((x) => x !== k) : [...estimated, k] });

  const answered = (f: MetricField) => m[f.key] !== undefined || untracked.includes(f.key);
  const open = Object.entries(hints).filter(([k]) => m[k] === undefined && !untracked.includes(k) && ALL.some((f) => f.key === k));
  const acceptAll = () => {
    const next = { ...m }; for (const [k, h] of open) next[k] = h.value;
    save({ m: next, keys: open.map(([k]) => k), ...(caps.length ? {} : { caps: capHint }) });
    setCapHint([]);
  };

  const row = (f: MetricField) => (
    <FieldRow key={f.key} f={f} v={m[f.key]} hint={m[f.key] === undefined ? hints[f.key] : undefined}
              untracked={untracked.includes(f.key)} estimated={estimated.includes(f.key)} canEdit={canEdit}
              onValue={(v) => setValue(f.key, v)} onUntracked={() => toggleUntracked(f.key)} onEstimate={() => toggleEstimate(f.key)} />
  );
  const ask = (title: string, id = slug(title)) => {
    const link = `https://makerspace.network/?page=space-data&space=${spaceId}&tab=annual&section=${id}`;
    const body = `Could you fill in the "${title}" part of our makerspace network data for ${year}? It takes a few minutes and saves as you go.\n\n${link}\n\nYou'll need to sign in with your ${space?.name ?? 'space'} email address. If it asks, join ${space?.name ?? 'our space'} as staff.\n\nThe figures are private to our staff and the network steward; the network only ever publishes totals across spaces.`;
    return `mailto:?subject=${encodeURIComponent(`${space?.name ?? 'Our space'} — network data: ${title}`)}&body=${encodeURIComponent(body)}`;
  };

  return (
    <div className="annual">
      <div className="card form-card">
        <p className="muted" style={{ marginTop: 0 }}>
          The network's annual data standard. Calendar year, due January 31. Organisational figures
          only — no member is ever named. Your staff and the regional steward can see these answers; the
          network publishes totals, medians and ranges, never your figures.
        </p>
        <div className="inline-fields" style={{ alignItems: 'end' }}>
          <label className="field" style={{ maxWidth: 180 }}><span>Reporting year</span>
            <select value={year} onChange={(e) => setYear(Number(e.target.value))}>
              {[0, 1, 2].map((i) => reportingYear() - i).map((y) => <option key={y} value={y}>{y}</option>)}
            </select></label>
          <p style={{ margin: '0 0 12px' }}>
            <strong>Start here: {CORE.filter(answered).length} of {CORE.length}</strong>
            <span className="muted"> · all questions {ALL.filter(answered).length} of {ALL.length}</span>
            {canEdit && status && <> · <span role="status" className={`std-save ${status === SAVED ? 'saved' : status.startsWith('Not saved') ? 'error' : ''}`}>{status}</span></>}
          </p>
        </div>
        {canEdit && open.length > 0 && (
          <div className="notice info">
            <p style={{ margin: 0 }}>
              We can fill in {open.length} answer{open.length === 1 ? '' : 's'} from what we already know — {[...new Set(open.map(([, h]) => h.from))].join(' and ')}.
              They're shown under each question; check them before you accept.
            </p>
            <div className="btn-row" style={{ margin: '10px 0 0' }}>
              <button type="button" className="btn small" onClick={acceptAll}>Accept all {open.length}</button>
            </div>
          </div>
        )}
      </div>

      <section className="card form-card" id="core">
        <div className="sec-head">
          <h3>Start here</h3>
          {canEdit && <a className="linkish" href={ask('Start here', 'core')}>Ask a colleague</a>}
        </div>
        <p className="muted">Answer these and you've given the network what matters most. A good estimate beats a blank.</p>
        {CORE.map(row)}
      </section>

      <details className="card form-card" id="more">
        <summary><strong>If you track it</strong> <span className="muted">— {ALL.length - CORE.length} more, all optional</span></summary>
        {METRIC_SECTIONS.map((sec) => {
          const rest = sec.fields.filter((f) => !f.core);
          if (!rest.length) return null;
          return (
            <div key={sec.title} id={slug(sec.title)} className="annual-sec">
              <div className="sec-head">
                <h4>{sec.title}</h4>
                {canEdit && <a className="linkish" href={ask(sec.title)}>Ask a colleague</a>}
              </div>
              {rest.map(row)}
            </div>
          );
        })}
        <div className="annual-sec">
          <h4>What people can make here — statewide referral map</h4>
          {capHint.length > 0 && !caps.length && (
            <p className="muted">Suggested from your listing: {capHint.map((c) => REFERRAL_CAPABILITIES.find(([id]) => id === c)?.[1]).join(', ')}.{' '}
              {canEdit && <button type="button" className="linkish" onClick={() => { save({ caps: capHint }); setCapHint([]); }}>Use these</button>}</p>
          )}
          <div className="checks">
            {REFERRAL_CAPABILITIES.map(([id, label, note]) => (
              <label key={id} className={`check ${caps.includes(id) ? 'on' : ''}`} title={note}>
                <input type="checkbox" disabled={!canEdit} checked={caps.includes(id)}
                       onChange={(e) => save({ caps: e.target.checked ? [...caps, id] : caps.filter((c) => c !== id) })} />
                {label}
              </label>
            ))}
          </div>
        </div>
      </details>
    </div>
  );
}

function FieldRow({ f, v, hint, untracked, estimated, canEdit, onValue, onUntracked, onEstimate }: {
  f: MetricField; v: MetricValue | undefined; hint?: Suggestion; untracked: boolean; estimated: boolean; canEdit: boolean;
  onValue: (v: MetricValue | null) => void; onUntracked: () => void; onEstimate: () => void;
}) {
  // The question names its answer for screen readers; the hint describes it.
  const labelId = useId();
  const hintId = useId();
  const named = { 'aria-labelledby': labelId, 'aria-describedby': f.hint ? hintId : undefined };
  const numeric = f.kind === 'number' || f.kind === 'money' || f.kind === 'percent';
  let input: React.ReactNode;
  if (untracked) input = <p className="annual-untracked">We don't track this</p>;
  else if (f.kind === 'yesno') input = (
    <div className="radios compact" role="radiogroup" {...named}>
      <label className="radio"><input type="radio" disabled={!canEdit} checked={v === true} onChange={() => onValue(true)} /> Yes</label>
      <label className="radio"><input type="radio" disabled={!canEdit} checked={v === false} onChange={() => onValue(false)} /> No</label>
    </div>
  );
  else if (f.kind === 'choice') input = (
    <select disabled={!canEdit} value={typeof v === 'string' ? v : ''} onChange={(e) => onValue(e.target.value || null)} {...named}>
      <option value="">—</option>{f.choices!.map((c) => <option key={c}>{c}</option>)}
    </select>
  );
  else if (f.kind === 'text') input = <input disabled={!canEdit} maxLength={300} value={typeof v === 'string' ? v : ''} onChange={(e) => onValue(e.target.value || null)} {...named} />;
  else input = (
    <div className="annual-num">
      {f.kind === 'money' && <span className="affix">$</span>}
      <NumberInput value={typeof v === 'number' ? v : null} onChange={onValue} disabled={!canEdit} signed={f.signed}
                   max={f.kind === 'percent' ? 100 : undefined} {...named} />
      {f.kind === 'percent' && <span className="affix">%</span>}
    </div>
  );

  return (
    <div className={`annual-row ${v !== undefined || untracked ? 'done' : ''}`}>
      <div className="annual-q">
        <span className="annual-label" id={labelId}>{f.label}</span>
        {f.hint && <span className="muted annual-hint" id={hintId}>{f.hint}</span>}
      </div>
      <div className="annual-a">
        {input}
        {hint && !untracked && canEdit && (
          <button type="button" className="annual-suggest" onClick={() => onValue(hint.value)}>
            Use {show(f, hint.value)} <span className="muted">from {hint.from}</span>
          </button>
        )}
        {canEdit && (
          <div className="annual-opts">
            {numeric && !untracked && v !== undefined && (
              <label><input type="checkbox" checked={estimated} onChange={onEstimate} aria-describedby={labelId} /> estimate</label>
            )}
            <button type="button" className="linkish" onClick={onUntracked} aria-describedby={labelId}>{untracked ? 'We do track it' : "We don't track this"}</button>
          </div>
        )}
      </div>
    </div>
  );
}
