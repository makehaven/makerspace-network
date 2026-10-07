// A space's staff answer two sets of questions here: the public listing (a
// submission the steward merges into data/spaces, with the space as source)
// and the network's annual data (private to the space and its stewards; the
// network publishes aggregates only). Anyone with standing at the space can
// come back and continue — the page always opens on what is already saved.

import { useEffect, useState } from 'react';
import { useSession } from '../session';
import { CAPABILITIES, CAPABILITY_DOMAINS, VOCAB, spaceById } from '../../data';
import { STAFF_ROLES } from '../model';
import {
  METRIC_SECTIONS, REFERRAL_CAPABILITIES, getListingSubmission, getSpaceMetrics, listingFromRecord, reportingYear,
  saveSpaceMetrics, submitListing, type ListingAnswers, type MetricValue,
} from '../spaceData';
import { PageLink, SignIn } from './shared';

const options = (vocab: keyof typeof VOCAB) => [...VOCAB[vocab].values()].filter((v) => v.id !== 'unknown');
const num = (v: string): number | null => (v.trim() === '' || Number.isNaN(Number(v)) ? null : Number(v));

export default function SpaceData({ spaceId }: { spaceId?: string }) {
  const s = useSession();
  const [tab, setTab] = useState<'listing' | 'annual'>(
    new URLSearchParams(window.location.search).get('tab') === 'annual' ? 'annual' : 'listing');

  if (s.status === 'loading') return <div className="wrap" style={{ paddingTop: 40 }}><p>Loading…</p></div>;
  if (s.status === 'signed_out') return <div className="wrap narrow" style={{ paddingTop: 30 }}><SignIn /></div>;

  const space = spaceId ? spaceById(spaceId) : undefined;
  const mine = s.memberships.find((m) => m.space_id === spaceId && m.status === 'active' && STAFF_ROLES.includes(m.role));
  const steward = !!s.stewardship && (s.stewardship.network_admin
    || (!!space?.region_ids?.[0] && s.stewardship.region_ids.includes(space.region_ids[0])));

  return (
    <>
      <section className="hero">
        <div className="wrap narrow">
          <p className="eyebrow">Your space</p>
          <h1>{space?.name ?? 'Space data'}</h1>
          <p className="lede">
            Two sets of questions. The <strong>listing</strong> is what the public directory says about
            you. The <strong>annual data</strong> is how the network compares and understands its spaces:
            it is never shown attributed to you, only in totals and ranges across spaces. Answer what
            you can and come back for the rest — anyone on your staff can pick it up.
          </p>
        </div>
      </section>
      <div className="wrap narrow" style={{ paddingTop: 24, paddingBottom: 60 }}>
        {!space && <p className="notice">That space isn't in the directory.</p>}
        {space && !mine && !steward && (
          <p className="notice">Only your space's admins and editors can answer these. <PageLink page="join">Back to your profile</PageLink></p>
        )}
        {space && (mine || steward) && (
          <>
            <div className="tabs" >
              <button className={tab === 'listing' ? 'on' : ''} onClick={() => setTab('listing')}>Public listing</button>
              <button className={tab === 'annual' ? 'on' : ''} onClick={() => setTab('annual')}>Annual data (private)</button>
            </div>
            {tab === 'listing' ? <ListingForm spaceId={space.id} canEdit={!!mine} /> : <AnnualForm spaceId={space.id} canEdit={!!mine} />}
          </>
        )}
      </div>
    </>
  );
}

// ---------- the public listing ----------

function ListingForm({ spaceId, canEdit }: { spaceId: string; canEdit: boolean }) {
  const s = useSession();
  const [f, setF] = useState<ListingAnswers | null>(null);
  const [meta, setMeta] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getListingSubmission(spaceId).then((sub) => {
      setF(sub?.listing ?? listingFromRecord(spaceById(spaceId)));
      if (sub) setMeta(`Last submitted by ${sub.submitted_name} on ${sub.updated_at.slice(0, 10)}${sub.status === 'merged' ? ' — merged into the directory' : ' — waiting for the steward to merge'}.`);
    }).catch((e) => setMsg(e instanceof Error ? e.message : String(e)));
  }, [spaceId]);

  if (!f) return <p>{msg ?? 'Loading…'}</p>;
  const set = (patch: Partial<ListingAnswers>) => { setF({ ...f, ...patch }); setMsg(null); };
  const toggle = (key: 'capabilities' | 'membership_models', id: string, on: boolean) =>
    set({ [key]: on ? [...(f[key] ?? []), id] : (f[key] ?? []).filter((x) => x !== id) });

  return (
    <form className="card form-card" onSubmit={async (e) => {
      e.preventDefault(); setBusy(true);
      try {
        await submitListing(spaceId, s.user!.uid, s.person?.name ?? s.user!.email ?? '', f);
        setMsg('Sent. The steward will merge it into your listing, with your space recorded as the source.');
        setMeta(`Last submitted by you just now — waiting for the steward to merge.`);
      } catch (x) { setMsg(x instanceof Error ? x.message : String(x)); }
      setBusy(false);
    }}>
      <fieldset disabled={!canEdit} style={{ border: 0, padding: 0, margin: 0 }}>
      <p className="muted">Pre-filled from your current listing. Correct anything that's wrong; leave blank what you'd rather not say — a blank is shown as unknown, never guessed.</p>
      {meta && <p className="notice info">{meta}</p>}

      <label className="field"><span>One-line summary</span>
        <input maxLength={300} value={f.summary ?? ''} onChange={(e) => set({ summary: e.target.value })} /></label>

      <h3>What can people make here?</h3>
      {CAPABILITY_DOMAINS.map((d) => {
        const caps = CAPABILITIES.filter((c) => (c as { domain?: string }).domain === d.id);
        if (!caps.length) return null;
        return (
          <div key={d.id}>
            <h4>{d.label}</h4>
            <div className="checks">
              {caps.map((c) => (
                <label key={c.id} className={`check ${f.capabilities?.includes(c.id) ? 'on' : ''}`}>
                  <input type="checkbox" checked={!!f.capabilities?.includes(c.id)} onChange={(e) => toggle('capabilities', c.id, e.target.checked)} />
                  {c.label}
                </label>
              ))}
            </div>
          </div>
        );
      })}

      <h3>Access and cost</h3>
      <label className="field"><span>How members get in</span>
        <select value={f.access_model ?? ''} onChange={(e) => set({ access_model: e.target.value })}>
          <option value="">Not saying / unknown</option>
          {options('AccessModel').map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select></label>
      <label className="field"><span>Hours, in your words</span>
        <input maxLength={300} value={f.hours_note ?? ''} placeholder="e.g. Staffed Tue–Sat 10–6; members 24/7" onChange={(e) => set({ hours_note: e.target.value })} /></label>
      <div className="radios compact">
        <span>Can the public visit or take a class without becoming a member?</span>
        <label className="radio"><input type="radio" checked={f.public_access === true} onChange={() => set({ public_access: true })} /> Yes</label>
        <label className="radio"><input type="radio" checked={f.public_access === false} onChange={() => set({ public_access: false })} /> No</label>
        <label className="radio"><input type="radio" checked={f.public_access == null} onChange={() => set({ public_access: null })} /> Not saying</label>
      </div>
      <h4>Ways to use the space</h4>
      <div className="checks">
        {options('MembershipModel').map((o) => (
          <label key={o.id} className={`check ${f.membership_models?.includes(o.id) ? 'on' : ''}`}>
            <input type="checkbox" checked={!!f.membership_models?.includes(o.id)} onChange={(e) => toggle('membership_models', o.id, e.target.checked)} />
            {o.label}
          </label>
        ))}
      </div>
      <div className="inline-fields">
        <label className="field"><span>Monthly cost from ($)</span>
          <input inputMode="numeric" value={f.monthly_cost_min ?? ''} onChange={(e) => set({ monthly_cost_min: num(e.target.value) })} /></label>
        <label className="field"><span>Monthly cost up to ($)</span>
          <input inputMode="numeric" value={f.monthly_cost_max ?? ''} onChange={(e) => set({ monthly_cost_max: num(e.target.value) })} /></label>
        <label className="field"><span>Day pass ($)</span>
          <input inputMode="numeric" value={f.day_pass_usd ?? ''} onChange={(e) => set({ day_pass_usd: num(e.target.value) })} /></label>
      </div>
      <label className="field"><span>Young people</span>
        <select value={f.minor_policy ?? ''} onChange={(e) => set({ minor_policy: e.target.value })}>
          <option value="">Not saying / unknown</option>
          {options('MinorPolicy').map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select></label>

      <h3>Public contact</h3>
      <div className="inline-fields">
        <label className="field"><span>Email</span><input type="email" value={f.email ?? ''} onChange={(e) => set({ email: e.target.value })} /></label>
        <label className="field"><span>Phone</span><input value={f.phone ?? ''} onChange={(e) => set({ phone: e.target.value })} /></label>
      </div>
      <label className="field"><span>Anything else the steward should know</span>
        <textarea rows={3} maxLength={2000} value={f.notes ?? ''} onChange={(e) => set({ notes: e.target.value })} /></label>

      {msg && <p className="muted">{msg}</p>}
      {canEdit && <div className="btn-row"><button className="btn" disabled={busy}>{busy ? 'Sending…' : 'Send listing'}</button></div>}
      </fieldset>
    </form>
  );
}

// ---------- the annual network data ----------

function AnnualForm({ spaceId, canEdit }: { spaceId: string; canEdit: boolean }) {
  const s = useSession();
  const [year, setYear] = useState(reportingYear());
  const [m, setM] = useState<Record<string, MetricValue> | null>(null);
  const [caps, setCaps] = useState<string[]>([]);
  const [meta, setMeta] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setM(null); setMeta(null); setMsg(null);
    getSpaceMetrics(spaceId, year).then((x) => {
      setM(x?.metrics ?? {}); setCaps(x?.capabilities ?? []);
      if (x) setMeta(`Saved ${x.updated_at.slice(0, 10)}. Continue where it was left.`);
    }).catch((e) => { setM({}); setMsg(e instanceof Error ? e.message : String(e)); });
  }, [spaceId, year]);

  if (!m) return <p>Loading…</p>;
  const set = (k: string, v: MetricValue | null) => {
    const next = { ...m }; if (v === null || v === '') delete next[k]; else next[k] = v;
    setM(next); setMsg(null);
  };
  const filled = METRIC_SECTIONS.flatMap((x) => x.fields).filter((x) => m[x.key] !== undefined).length;
  const total = METRIC_SECTIONS.flatMap((x) => x.fields).length;

  return (
    <form className="card form-card" onSubmit={async (e) => {
      e.preventDefault(); setBusy(true);
      try { await saveSpaceMetrics(spaceId, year, s.user!.uid, m, caps); setMsg('Saved.'); setMeta('Saved just now.'); }
      catch (x) { setMsg(x instanceof Error ? x.message : String(x)); }
      setBusy(false);
    }}>
      <fieldset disabled={!canEdit} style={{ border: 0, padding: 0, margin: 0 }}>
      <p className="muted">
        The network's annual data standard — the same questions as the Annual Data tab in the{' '}
        <a href="https://standards.makerspace.network">Standards tool</a>. Calendar year, due January 31.
        Organisational figures only; no member is ever named. Your space's staff and the regional
        steward can see these answers; the network publishes totals, medians and ranges, never your figures.
      </p>
      <div className="inline-fields">
        <label className="field"><span>Reporting year</span>
          <select value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {[0, 1, 2].map((i) => reportingYear() - i).map((y) => <option key={y} value={y}>{y}</option>)}
          </select></label>
        <p className="muted" style={{ alignSelf: 'end' }}>{filled} of {total} answered</p>
      </div>
      {meta && <p className="notice info">{meta}</p>}

      {METRIC_SECTIONS.map((sec) => (
        <div key={sec.title}>
          <h3>{sec.title}</h3>
          {sec.fields.map((x) => {
            const v = m[x.key];
            if (x.kind === 'yesno') return (
              <div key={x.key} className="radios compact">
                <span>{x.label}{x.hint && <em className="muted"> — {x.hint}</em>}</span>
                <label className="radio"><input type="radio" checked={v === true} onChange={() => set(x.key, true)} /> Yes</label>
                <label className="radio"><input type="radio" checked={v === false} onChange={() => set(x.key, false)} /> No</label>
                <label className="radio"><input type="radio" checked={v === undefined} onChange={() => set(x.key, null)} /> Blank</label>
              </div>
            );
            if (x.kind === 'choice') return (
              <label key={x.key} className="field"><span>{x.label}</span>
                <select value={typeof v === 'string' ? v : ''} onChange={(e) => set(x.key, e.target.value || null)}>
                  <option value="">—</option>{x.choices!.map((c) => <option key={c}>{c}</option>)}
                </select></label>
            );
            if (x.kind === 'text') return (
              <label key={x.key} className="field"><span>{x.label}</span>
                <input maxLength={300} value={typeof v === 'string' ? v : ''} onChange={(e) => set(x.key, e.target.value || null)} /></label>
            );
            return (
              <label key={x.key} className="field">
                <span>{x.label}{x.kind === 'percent' ? ' (%)' : x.kind === 'money' ? ' ($)' : ''}</span>
                <input inputMode="numeric" value={typeof v === 'number' ? String(v) : ''}
                       onChange={(e) => set(x.key, num(e.target.value.replace(/[$,%\s]/g, '')))} />
                {x.hint && <em className="muted">{x.hint}</em>}
              </label>
            );
          })}
        </div>
      ))}

      <h3>Capabilities (statewide referral map)</h3>
      <div className="checks">
        {REFERRAL_CAPABILITIES.map(([id, label, note]) => (
          <label key={id} className={`check ${caps.includes(id) ? 'on' : ''}`} title={note}>
            <input type="checkbox" checked={caps.includes(id)}
                   onChange={(e) => { setCaps(e.target.checked ? [...caps, id] : caps.filter((c) => c !== id)); setMsg(null); }} />
            {label}
          </label>
        ))}
      </div>

      {msg && <p className="muted">{msg}</p>}
      {canEdit && <div className="btn-row"><button className="btn" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button></div>}
      </fieldset>
    </form>
  );
}
