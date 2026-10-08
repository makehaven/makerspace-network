// The network's annual data standard, made as easy to answer as it can be:
// the ten core questions first, what we already know offered as suggestions,
// "we don't track this" and "this is an estimate" as real answers, a section
// handed to a colleague by email, and every change saved as it is made.

import { useEffect, useRef, useState } from 'react';
import { useSession } from '../session';
import { CAPABILITIES, spaceById } from '../../data';
import {
  METRIC_SECTIONS, REFERRAL_CAPABILITIES, getSpaceMetrics, reportingYear, saveSpaceMetrics, suggestionsFor,
  type MetricField, type MetricValue, type Suggestion,
} from '../spaceData';

const ALL = METRIC_SECTIONS.flatMap((x) => x.fields);
const CORE = ALL.filter((f) => f.core);
const num = (v: string): number | null => (v.trim() === '' || Number.isNaN(Number(v)) ? null : Number(v));
const slug = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const show = (f: MetricField, v: MetricValue) =>
  typeof v === 'boolean' ? (v ? 'Yes' : 'No') : f.kind === 'money' ? `$${Number(v).toLocaleString('en-US')}` : f.kind === 'percent' ? `${v}%` : String(v);

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
  useEffect(() => () => window.clearTimeout(timer.current), []);

  useEffect(() => {
    setM(null); setStatus(null);
    const domainOf = (id: string) => CAPABILITIES.find((c) => c.id === id)?.domain;
    Promise.all([getSpaceMetrics(spaceId, year), suggestionsFor(space, spaceId, year, domainOf).catch(() => null)])
      .then(([x, sug]) => {
        setM(x?.metrics ?? {}); setCaps(x?.capabilities ?? []);
        setUntracked(x?.untracked ?? []); setEstimated(x?.estimated ?? []);
        setHints(sug?.fields ?? {}); setCapHint(x?.capabilities?.length ? [] : sug?.capabilities ?? []);
        if (x) setStatus(`Last saved ${x.updated_at.slice(0, 10)}`);
      })
      .catch((e) => { setM({}); setStatus(e instanceof Error ? e.message : String(e)); });
  }, [spaceId, year]); // eslint-disable-line react-hooks/exhaustive-deps

  // Jump to a section a colleague was sent to.
  useEffect(() => {
    if (!m || !window.location.hash) return;
    const el = document.getElementById(window.location.hash.slice(1));
    if (el) { if (el instanceof HTMLDetailsElement) el.open = true; el.scrollIntoView({ behavior: 'smooth' }); }
  }, [m === null]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!m) return <p>Loading…</p>;

  const save = (next: { m?: Record<string, MetricValue>; caps?: string[]; untracked?: string[]; estimated?: string[] }) => {
    const nm = next.m ?? m, nc = next.caps ?? caps, nu = next.untracked ?? untracked, ne = next.estimated ?? estimated;
    if (next.m) setM(nm); if (next.caps) setCaps(nc); if (next.untracked) setUntracked(nu); if (next.estimated) setEstimated(ne);
    if (!canEdit) return;
    window.clearTimeout(timer.current); setStatus('Unsaved changes…');
    timer.current = window.setTimeout(() => {
      setStatus('Saving…');
      saveSpaceMetrics(spaceId, year, s.user!.uid, nm, nc, nu, ne)
        .then(() => setStatus('All changes saved'))
        .catch((x) => setStatus(x instanceof Error ? x.message : String(x)));
    }, 700);
  };
  const setValue = (k: string, v: MetricValue | null) => {
    const next = { ...m }; if (v === null || v === '') delete next[k]; else next[k] = v;
    save({ m: next, untracked: untracked.filter((x) => x !== k) });
  };
  const toggleUntracked = (k: string) => {
    if (untracked.includes(k)) return save({ untracked: untracked.filter((x) => x !== k) });
    const next = { ...m }; delete next[k];
    save({ m: next, untracked: [...untracked, k], estimated: estimated.filter((x) => x !== k) });
  };
  const toggleEstimate = (k: string) =>
    save({ estimated: estimated.includes(k) ? estimated.filter((x) => x !== k) : [...estimated, k] });

  const answered = (f: MetricField) => m[f.key] !== undefined || untracked.includes(f.key);
  const open = Object.entries(hints).filter(([k]) => m[k] === undefined && !untracked.includes(k) && ALL.some((f) => f.key === k));
  const acceptAll = () => {
    const next = { ...m }; for (const [k, h] of open) next[k] = h.value;
    save({ m: next, caps: caps.length ? caps : capHint });
    setCapHint([]);
  };

  const row = (f: MetricField) => (
    <FieldRow key={f.key} f={f} v={m[f.key]} hint={m[f.key] === undefined ? hints[f.key] : undefined}
              untracked={untracked.includes(f.key)} estimated={estimated.includes(f.key)} canEdit={canEdit}
              onValue={(v) => setValue(f.key, v)} onUntracked={() => toggleUntracked(f.key)} onEstimate={() => toggleEstimate(f.key)} />
  );
  const ask = (title: string) => {
    const link = `https://makerspace.network/?page=space-data&space=${spaceId}&tab=annual#${slug(title)}`;
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
            <strong>Core: {CORE.filter(answered).length} of {CORE.length}</strong>
            <span className="muted"> · all questions {ALL.filter(answered).length} of {ALL.length}</span>
            {canEdit && status && <> · <span className={`std-save ${status === 'All changes saved' ? 'saved' : ''}`}>{status}</span></>}
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
          <h3>The core ten</h3>
          {canEdit && <a className="linkish" href={ask('The core ten')}>Ask a colleague</a>}
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
  const numeric = f.kind === 'number' || f.kind === 'money' || f.kind === 'percent';
  let input: React.ReactNode;
  if (untracked) input = <p className="annual-untracked">We don't track this</p>;
  else if (f.kind === 'yesno') input = (
    <div className="radios compact">
      <label className="radio"><input type="radio" disabled={!canEdit} checked={v === true} onChange={() => onValue(true)} /> Yes</label>
      <label className="radio"><input type="radio" disabled={!canEdit} checked={v === false} onChange={() => onValue(false)} /> No</label>
    </div>
  );
  else if (f.kind === 'choice') input = (
    <select disabled={!canEdit} value={typeof v === 'string' ? v : ''} onChange={(e) => onValue(e.target.value || null)}>
      <option value="">—</option>{f.choices!.map((c) => <option key={c}>{c}</option>)}
    </select>
  );
  else if (f.kind === 'text') input = <input disabled={!canEdit} maxLength={300} value={typeof v === 'string' ? v : ''} onChange={(e) => onValue(e.target.value || null)} />;
  else input = (
    <div className="annual-num">
      {f.kind === 'money' && <span className="affix">$</span>}
      <input inputMode="decimal" disabled={!canEdit} value={typeof v === 'number' ? String(v) : ''}
             onChange={(e) => onValue(num(e.target.value.replace(/[$,%\s]/g, '')))} />
      {f.kind === 'percent' && <span className="affix">%</span>}
    </div>
  );

  return (
    <div className={`annual-row ${v !== undefined || untracked ? 'done' : ''}`}>
      <div className="annual-q">
        <span className="annual-label">{f.label}</span>
        {f.hint && <span className="muted annual-hint">{f.hint}</span>}
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
              <label><input type="checkbox" checked={estimated} onChange={onEstimate} /> estimate</label>
            )}
            <button type="button" className="linkish" onClick={onUntracked}>{untracked ? 'We do track it' : "We don't track this"}</button>
          </div>
        )}
      </div>
    </div>
  );
}
