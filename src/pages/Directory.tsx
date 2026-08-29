import { useEffect, useMemo, useState } from 'react';
import type { Region, Space } from '../types';
import { spacesIn, label, CAPABILITIES, CAPABILITY_DOMAINS, ACCESS_MODELS, completeness } from '../data';
import { href, navigate } from '../App';
import RegionMap from '../components/RegionMap';
import Logo from '../components/Logo';

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

/** Someone looking for somewhere to build a thing wants the big open workshops
 *  first. Library corners and campus labs are worth listing — they are the
 *  feeders, and some of them are excellent — but they rarely hold the woodshop
 *  and the welder, and putting them in the same run makes the page harder to
 *  read, not fairer.
 *
 *  The split is on recorded facts rather than editorial judgement, so it can be
 *  argued with: a space leads if it has at least this many distinct capabilities
 *  on file and is not restricted to its own institution's students or patrons.
 *  A thin record therefore demotes itself, and fixing the record promotes it. */
const LEADS_MIN_CAPABILITIES = 4;

const leads = (s: Space) =>
  (s.capabilities?.length ?? 0) >= LEADS_MIN_CAPABILITIES &&
  s.operations?.public_access !== false;

/** Why a space is in the second tier, said plainly on its card. */
const whyBelow = (s: Space): string => {
  if (s.operations?.public_access === false) return 'Its own students and staff';
  if ((s.capabilities?.length ?? 0) === 0) return 'Nothing on file yet';
  return 'Small toolset on file';
};

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

function useNarrow() {
  const query = '(max-width: 860px)';
  const [narrow, setNarrow] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(query).matches,
  );
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setNarrow(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return narrow;
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
  const caps = s.capabilities ?? [];
  const where = [s.address?.locality, s.address?.county && `${s.address.county} County`]
    .filter(Boolean).join(' · ');

  return (
    <a className="card" href={href('space', { space: s.id })}
       onClick={(e) => { if (e.metaKey || e.ctrlKey) return; e.preventDefault(); navigate('space', { space: s.id }); }}>
      <div className="card-head">
        <Logo space={s} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="card-top">
            <h3>{s.name}</h3>
            {where && <span className="where">{where}</span>}
          </div>

          {s.summary ? (
            <p className="summary">{s.summary}</p>
          ) : (
            // The map-pin imports carry a name and a location and nothing else.
            // Say so, rather than leaving a card that looks broken.
            <p className="summary" style={{ color: 'var(--ink-3)' }}>
              Known to be here, but nothing about it is confirmed yet.
            </p>
          )}

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
              {caps.slice(0, 6).map((c) => <span className="tag" key={c}>{label('Capability', c)}</span>)}
              {caps.length > 6 && <span className="tag more">+{caps.length - 6} more</span>}
            </div>
          )}
        </div>
      </div>
    </a>
  );
}

function MiniCard({ s }: { s: Space }) {
  const where = [s.address?.locality, s.address?.county && `${s.address.county} County`]
    .filter(Boolean).join(' · ');
  return (
    <a className="card mini" href={href('space', { space: s.id })}
       onClick={(e) => { if (e.metaKey || e.ctrlKey) return; e.preventDefault(); navigate('space', { space: s.id }); }}>
      <Logo space={s} />
      <div style={{ minWidth: 0 }}>
        <h3>{s.name}</h3>
        <span className="where">{where || label('SpaceKind', s.kind)}</span>
        <span className="reason">{whyBelow(s)}</span>
      </div>
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

  const thin = all.filter((s) => completeness(s).missing.length > 3).length;

  const narrow = useNarrow();
  const activeCount =
    f.counties.size + f.capabilities.size + f.access.size +
    (f.q ? 1 : 0) + (f.publicOnly ? 1 : 0) + (f.minorsOnly ? 1 : 0) + (f.lendingOnly ? 1 : 0);

  const rail = (
    <>
            <div className="filter-group">
              <input
                className="search" type="search" placeholder="Search name, town, tool…"
                value={f.q} onChange={(e) => set('q', e.target.value)}
                aria-label="Search spaces"
              />
            </div>

            <div className="filter-group">
              <h4>Getting in</h4>
              {ACCESS_MODELS.filter((a) => all.some((s) => s.operations?.access_model === a.id)).map((a) => (
                <Check key={a.id} checked={f.access.has(a.id)} onChange={() => toggle('access', a.id)}
                       count={countIn('access', (s) => s.operations?.access_model === a.id)}>
                  {a.label}
                </Check>
              ))}
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
              <h4>What can I make</h4>
              {CAPABILITY_DOMAINS.map((d) => {
                const caps = CAPABILITIES.filter((c) => c.domain === d.id && presentCaps.has(c.id));
                if (!caps.length) return null;
                const chosen = caps.filter((c) => f.capabilities.has(c.id)).length;
                return (
                  <details className="fold" key={d.id} open={chosen > 0}>
                    <summary>
                      {d.label}
                      <span className="count">{chosen ? `${chosen} selected` : caps.length}</span>
                    </summary>
                    <div>
                      {caps.map((c) => (
                        <Check key={c.id} checked={f.capabilities.has(c.id)}
                               onChange={() => toggle('capabilities', c.id)}
                               count={countIn('capability', (s) => (s.capabilities ?? []).includes(c.id))}>
                          {c.label}
                        </Check>
                      ))}
                    </div>
                  </details>
                );
              })}
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
    </>
  );

  const filterPanel = (
    <details className="filter-shell">
      <summary>
        Filter these {all.length} spaces
        {activeCount > 0 && <span className="count">{activeCount} on</span>}
      </summary>
      <div>{rail}</div>
    </details>
  );

  const headline = results.filter(leads);
  const rest = results.filter((s) => !leads(s));

  return (
    <>
      <section className="hero">
        <div className="wrap">
          <p className="eyebrow">{region.name} · {all.length} spaces</p>
          <h1>Find a place to make something</h1>
          <p className="lede">{region.summary}</p>
        </div>
      </section>

      <div className="wrap" style={{ paddingTop: narrow ? 16 : 30 }}>
        <div className="cols">
          {/* On a phone the rail is not a column beside anything — it would sit
              on top of the results. Move it below the map instead, folded. */}
          {!narrow && <aside className="filters">{rail}</aside>}

          <div>
            <RegionMap
              regionName={region.name}
              all={all}
              results={results}
              counties={f.counties}
              onToggleCounty={(c) => toggle('counties', c)}
              isPrimary={leads}
            />

            {narrow && filterPanel}

            <div className="result-head">
              <span className="result-count">
                {active
                  ? `${results.length} of ${all.length} spaces`
                  : `${headline.length} open workshops` +
                    (rest.length ? ` · ${rest.length} more listed below` : '')}
              </span>
              {active && <button className="clear" onClick={() => setF(empty)}>Clear filters</button>}
            </div>

            {results.length === 0 ? (
              <div className="notice info">
                <h4>Nothing matches that combination</h4>
                <p>
                  It may also be that the space exists and we do not have the field recorded yet —
                  filters only match what has been confirmed.
                </p>
              </div>
            ) : active ? (
              // Someone who has filtered deliberately wants one list, not a
              // ranking of it.
              <div className="cards">
                {results.map((s) => <Card key={s.id} s={s} />)}
              </div>
            ) : (
              <>
                <div className="cards">
                  {headline.map((s) => <Card key={s.id} s={s} />)}
                </div>

                {rest.length > 0 && (
                  <section>
                    <h2 className="tier-head">Also in {region.name}</h2>
                    <p className="tier-note">
                      Library and campus workshops, and places we know exist but have not
                      documented yet. Listed separately because they are open only to their
                      own patrons, or because there is not yet enough on file to say what you
                      could make there.
                    </p>
                    <div className="cards compact">
                      {rest.map((s) => <MiniCard key={s.id} s={s} />)}
                    </div>
                  </section>
                )}
              </>
            )}

            {thin > 0 && !active && (
              <div className="notice" style={{ marginTop: 30 }}>
                <h4>Help fill these in</h4>
                <p>
                  {thin} of the {all.length} records are missing things a visitor wants —
                  opening hours, cost, whether children are welcome. Every record says what it
                  does not know rather than quietly leaving it blank, and filling those gaps is
                  also what moves a space up this page. If you run one,{' '}
                  <a href={href('for-spaces')}
                     onClick={(e) => { if (e.metaKey || e.ctrlKey) return; e.preventDefault(); navigate('for-spaces'); }}>
                    claim your listing
                  </a>.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
