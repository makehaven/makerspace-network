import { useMemo, useState } from 'react';
import type { Region, Space } from '../types';
import { spacesIn, label, CAPABILITIES, CAPABILITY_DOMAINS, ACCESS_MODELS, completeness, REPO_URL } from '../data';
import { href, navigate } from '../App';

type Facet = 'county' | 'capability' | 'access' | 'flags';

interface Filters {
  q: string;
  counties: Set<string>;
  capabilities: Set<string>;
  access: Set<string>;
  publicOnly: boolean;
  minorsOnly: boolean;
  lendingOnly: boolean;
}

const empty: Filters = {
  q: '', counties: new Set(), capabilities: new Set(), access: new Set(),
  publicOnly: false, minorsOnly: false, lendingOnly: false,
};

const MINORS_OK = new Set(['minors_with_adult', 'minors_in_programs', 'minors_members', 'primarily_youth']);

/** `skip` lets a facet count itself against everything *except* its own
 *  selections, so the numbers beside each checkbox stay useful. */
function matches(s: Space, f: Filters, skip?: Facet): boolean {
  if (f.q) {
    const hay = [s.name, s.summary, s.address?.locality, s.address?.county,
                 ...(s.capabilities ?? []).map((c) => label('Capability', c))]
      .join(' ').toLowerCase();
    if (!hay.includes(f.q.toLowerCase())) return false;
  }
  if (skip !== 'county' && f.counties.size && !f.counties.has(s.address?.county ?? '')) return false;
  if (skip !== 'capability' && f.capabilities.size) {
    const caps = new Set(s.capabilities ?? []);
    for (const c of f.capabilities) if (!caps.has(c)) return false;
  }
  if (skip !== 'access' && f.access.size && !f.access.has(s.operations?.access_model ?? '')) return false;
  if (skip !== 'flags') {
    if (f.publicOnly && s.operations?.public_access !== true) return false;
    if (f.minorsOnly && !MINORS_OK.has(s.operations?.minor_policy ?? '')) return false;
    if (f.lendingOnly && s.operations?.tool_lending !== true) return false;
  }
  return true;
}

function Check({ checked, onChange, children, count }:
  { checked: boolean; onChange: () => void; children: React.ReactNode; count?: number }) {
  return (
    <label className="check" style={count === 0 ? { opacity: 0.4 } : undefined}>
      <input type="checkbox" checked={checked} onChange={onChange} />
      <span>{children}</span>
      {count !== undefined && <span className="count">{count}</span>}
    </label>
  );
}

function Card({ s }: { s: Space }) {
  const ops = s.operations ?? {};
  const { missing } = completeness(s);
  const caps = s.capabilities ?? [];
  const unconfirmed = s.verification.status === 'imported';

  return (
    <a className="card" href={href('space', { space: s.id })}
       onClick={(e) => { if (e.metaKey || e.ctrlKey) return; e.preventDefault(); navigate('space', { space: s.id }); }}>
      <div className="card-top">
        <h3>{s.name}</h3>
        <span className="where">
          {s.address?.locality ? `${s.address.locality}, ` : ''}{s.address?.county ? `${s.address.county} County` : ''}
        </span>
        {unconfirmed && <span className="pill flag" title="Imported from another source and not yet checked">unconfirmed</span>}
      </div>

      {s.summary && <p className="summary">{s.summary}</p>}

      <div className="facts">
        <span className="fact"><span className="k">Type</span> {label('SpaceKind', s.kind)}</span>
        {ops.access_model && <span className="fact"><span className="k">Access</span> {label('AccessModel', ops.access_model)}</span>}
        {ops.monthly_cost_usd?.min !== undefined && (
          <span className="fact"><span className="k">From</span> ${ops.monthly_cost_usd.min}/mo</span>
        )}
        {ops.public_access === true && <span className="fact">Open to non-members</span>}
      </div>

      {caps.length > 0 && (
        <div className="tags">
          {caps.slice(0, 7).map((c) => <span className="tag" key={c}>{label('Capability', c)}</span>)}
          {caps.length > 7 && <span className="tag more">+{caps.length - 7}</span>}
        </div>
      )}

      {missing.length > 0 && (
        <p style={{ margin: '10px 0 0', fontSize: '0.8rem', color: 'var(--ink-3)' }}>
          Missing: {missing.join(' · ')}
        </p>
      )}
    </a>
  );
}

export default function Directory({ region }: { region: Region }) {
  const all = useMemo(() => spacesIn(region), [region]);
  const [f, setF] = useState<Filters>(empty);

  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => setF((p) => ({ ...p, [k]: v }));
  const toggle = (k: 'counties' | 'capabilities' | 'access', v: string) =>
    setF((p) => {
      const next = new Set(p[k]);
      next.has(v) ? next.delete(v) : next.add(v);
      return { ...p, [k]: next };
    });

  const results = all.filter((s) => matches(s, f));
  const countIn = (facet: Facet, pred: (s: Space) => boolean) =>
    all.filter((s) => matches(s, f, facet) && pred(s)).length;

  const counties = useMemo(
    () => [...new Set(all.map((s) => s.address?.county).filter(Boolean) as string[])].sort(),
    [all],
  );
  const presentCaps = useMemo(() => new Set(all.flatMap((s) => s.capabilities ?? [])), [all]);
  const active = f.q || f.counties.size || f.capabilities.size || f.access.size ||
                 f.publicOnly || f.minorsOnly || f.lendingOnly;

  const withGaps = all.filter((s) => completeness(s).missing.length > 0).length;

  return (
    <>
      <section className="hero">
        <div className="wrap">
          <p className="eyebrow">{region.name} · {all.length} spaces</p>
          <h1>Makerspaces in {region.name}</h1>
          <p className="lede">{region.summary}</p>
        </div>
      </section>

      <div className="wrap" style={{ paddingTop: 26 }}>
        <div className="cols">
          <aside className="filters">
            <div className="filter-group">
              <input
                className="search" type="search" placeholder="Search name, town, tool…"
                value={f.q} onChange={(e) => set('q', e.target.value)}
                aria-label="Search spaces"
              />
            </div>

            <div className="filter-group">
              <h4>What can I make</h4>
              {CAPABILITY_DOMAINS.map((d) => {
                const caps = CAPABILITIES.filter((c) => c.domain === d.id && presentCaps.has(c.id));
                if (!caps.length) return null;
                return (
                  <div key={d.id}>
                    <div className="subhead">{d.label}</div>
                    {caps.map((c) => (
                      <Check key={c.id} checked={f.capabilities.has(c.id)}
                             onChange={() => toggle('capabilities', c.id)}
                             count={countIn('capability', (s) => (s.capabilities ?? []).includes(c.id))}>
                        {c.label}
                      </Check>
                    ))}
                  </div>
                );
              })}
            </div>

            <div className="filter-group">
              <h4>Getting in</h4>
              {ACCESS_MODELS.filter((a) => all.some((s) => s.operations?.access_model === a.id)).map((a) => (
                <Check key={a.id} checked={f.access.has(a.id)} onChange={() => toggle('access', a.id)}
                       count={countIn('access', (s) => s.operations?.access_model === a.id)}>
                  {a.label}
                </Check>
              ))}
              <div className="subhead">Also</div>
              <Check checked={f.publicOnly} onChange={() => set('publicOnly', !f.publicOnly)}
                     count={countIn('flags', (s) => s.operations?.public_access === true)}>
                Open to non-members
              </Check>
              <Check checked={f.minorsOnly} onChange={() => set('minorsOnly', !f.minorsOnly)}
                     count={countIn('flags', (s) => MINORS_OK.has(s.operations?.minor_policy ?? ''))}>
                Admits under-18s
              </Check>
              <Check checked={f.lendingOnly} onChange={() => set('lendingOnly', !f.lendingOnly)}
                     count={countIn('flags', (s) => s.operations?.tool_lending === true)}>
                Lends tools
              </Check>
            </div>

            <div className="filter-group">
              <h4>County</h4>
              {counties.map((c) => (
                <Check key={c} checked={f.counties.has(c)} onChange={() => toggle('counties', c)}
                       count={countIn('county', (s) => s.address?.county === c)}>
                  {c}
                </Check>
              ))}
            </div>
          </aside>

          <div>
            <div className="result-head">
              <span className="result-count">
                {results.length} of {all.length} {results.length === 1 ? 'space' : 'spaces'}
              </span>
              {active && <button className="clear" onClick={() => setF(empty)}>Clear filters</button>}
            </div>

            {withGaps > 0 && !active && (
              <div className="notice" style={{ marginBottom: 16 }}>
                <h4>{withGaps} of these {all.length} records are incomplete</h4>
                <p style={{ margin: '4px 0 0' }}>
                  Every record says what it is missing rather than quietly leaving it blank.
                  If you run one of these spaces — or just know the answer —{' '}
                  <a href={REPO_URL}>a correction is a one-file pull request</a>.
                </p>
              </div>
            )}

            {results.length === 0 ? (
              <div className="notice info">
                <h4>Nothing matches that combination</h4>
                <p style={{ margin: '4px 0 0' }}>
                  It may also be that the space exists and we do not have the field recorded yet —
                  filters only match what has been confirmed.
                </p>
              </div>
            ) : (
              <div className="cards">
                {results.map((s) => <Card key={s.id} s={s} />)}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
