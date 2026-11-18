import { useEffect, useMemo, useState } from 'react';
import type { Region, Space } from '../types';
import { spacesIn, label, CAPABILITIES, CAPABILITY_DOMAINS, ACCESS_MODELS } from '../data';
import { href, navigate } from '../App';
import RegionMap from '../components/RegionMap';
import Logo from '../components/Logo';
import WorkshopPhoto from '../components/WorkshopPhoto';
import MakingIcon, { MAKING_CATEGORIES } from '../components/MakingIcon';
import { useUrlFilters, setQueryValues } from '../useUrlFilters';

type Facet = 'county' | 'capability' | 'access' | 'flags';

interface Filters {
  q: string;
  domain: string;
  counties: Set<string>;
  capabilities: Set<string>;
  access: Set<string>;
  publicOnly: boolean;
  minorsOnly: boolean;
  lendingOnly: boolean;
}

const empty: Filters = {
  q: '', domain: '', counties: new Set(), capabilities: new Set(), access: new Set(),
  publicOnly: false, minorsOnly: false, lendingOnly: false,
};

const readFilters = (q: URLSearchParams): Filters => ({
  q: q.get('q') ?? '', domain: q.get('domain') ?? '', counties: new Set(q.getAll('county')),
  capabilities: new Set(q.getAll('capability')), access: new Set(q.getAll('access')),
  publicOnly: q.get('public') === '1', minorsOnly: q.get('minors') === '1', lendingOnly: q.get('lending') === '1',
});
const writeFilters = (q: URLSearchParams, f: Filters) => {
  for (const [key, values] of Object.entries({ q: [f.q], domain: [f.domain], county: [...f.counties], capability: [...f.capabilities],
    access: [...f.access], public: [f.publicOnly ? '1' : ''], minors: [f.minorsOnly ? '1' : ''], lending: [f.lendingOnly ? '1' : ''] })) {
    setQueryValues(q, key, values);
  }
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
  if ((s.capabilities?.length ?? 0) === 0) return 'Details not yet confirmed';
  return 'Some tools confirmed';
};

/** `skip` lets a facet count itself against everything *except* its own
 *  selections, so the numbers beside each checkbox stay useful. */
function matches(s: Space, f: Filters, skip?: Facet): boolean {
  if (f.domain && !(s.capabilities ?? []).some((id) => CAPABILITIES.some((c) => c.id === id && c.domain === f.domain))) return false;
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

const SHORT_ACCESS: Record<string, string> = {
  member_24_7: '24/7 member access', member_extended_hours: 'Extended member hours',
  staffed_hours_only: 'Staffed hours only', scheduled_open_hours: 'Community hours',
  appointment_only: 'By appointment', host_institution_hours: 'Library / campus hours',
};
const SHORT_CAPABILITY: Record<string, string> = {
  three_d_printing_fdm: '3D printing · FDM', three_d_printing_resin: 'Resin printing',
  laser_cutting: 'Laser cutting', cnc_router: 'CNC router', metalworking_machine: 'Machine shop',
  woodworking_machine: 'Woodshop', woodworking_hand: 'Hand woodworking',
  electronics_bench: 'Electronics & soldering', printmaking: 'Printmaking', welding_mig_tig: 'Welding',
};
function Card({ s, domain = '' }: { s: Space; domain?: string }) {
  const ops = s.operations ?? {};
  const caps = [...(s.capabilities ?? [])].sort((a, b) => Number(CAPABILITIES.some((c) => c.id === b && c.domain === domain)) - Number(CAPABILITIES.some((c) => c.id === a && c.domain === domain)));
  const where = [s.address?.locality, s.address?.county && `${s.address.county} County`]
    .filter(Boolean).join(' · ');

  return (
    <a className="card space-list-card" href={href('space', { space: s.id })}
       onClick={(e) => { if (e.metaKey || e.ctrlKey) return; e.preventDefault(); navigate('space', { space: s.id }); }}>
      <div className="card-head">
        <Logo space={s} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="card-top">
            <h3>{s.name}</h3>
            {where && <span className="where">{where}</span>}
          </div>

          <div className="facts">
            {s.kind !== 'community_makerspace' && <span className="fact">{label('SpaceKind', s.kind)}</span>}
            {ops.access_model && <span className="fact">{SHORT_ACCESS[ops.access_model] ?? label('AccessModel', ops.access_model)}</span>}
            {ops.monthly_cost_usd?.min !== undefined && (
              <span className="fact"><span className="k">From</span> ${ops.monthly_cost_usd.min}/mo</span>
            )}
            {ops.public_access === true && <span className="fact">Open to non-members</span>}
          </div>

          {caps.length > 0 && (
            <div className="tags">
              {caps.slice(0, 3).map((c) => <span className="tag" key={c}>{SHORT_CAPABILITY[c] ?? label('Capability', c)}</span>)}
              {caps.length > 3 && <span className="tag more">+{caps.length - 3} more</span>}
            </div>
          )}
        </div>
      </div>
      {s.id === 'makehaven' && <div className="space-card-photo"><WorkshopPhoto photo="woodworking" /><span>Inside MakeHaven</span></div>}
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
  const [f, setF] = useUrlFilters(readFilters, writeFilters);

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
  const active = f.q || f.domain || f.counties.size || f.capabilities.size || f.access.size ||
                 f.publicOnly || f.minorsOnly || f.lendingOnly;


  const narrow = useNarrow();
  const activeCount =
    f.counties.size + f.capabilities.size + f.access.size +
    (f.q ? 1 : 0) + (f.domain ? 1 : 0) + (f.publicOnly ? 1 : 0) + (f.minorsOnly ? 1 : 0) + (f.lendingOnly ? 1 : 0);

  const rail = (
    <>
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
    <div className="discovery">
      <section className="workshop-hero directory-hero wrap">
        <div className="workshop-intro">
          <h1>{region.name} makerspaces</h1>
          <p className="workshop-lede">{all.length} spaces. Search by town, name or tool.</p>
          <label className="directory-search"><span>Find a space</span>
            <input className="search" type="search" placeholder="Try a town, space or tool…"
              value={f.q} onChange={(e) => set('q', e.target.value)} aria-label="Search spaces" />
          </label>
          <a className="text-link" href="#spaces">View all spaces</a>
        </div>
        {region.id === 'us-ct' && <figure className="workshop-cover">
          <WorkshopPhoto photo="bags" priority />
          <figcaption>Handmade bags at MakeHaven, New Haven</figcaption>
        </figure>}
      </section>

      <div className="wrap directory-body" id="spaces">
        <div className="making-categories" role="group" aria-label="Explore by activity">
          {MAKING_CATEGORIES.filter((d) => CAPABILITIES.some((c) => c.domain === d.id && presentCaps.has(c.id))).map((d) =>
            <button key={d.id} aria-pressed={f.domain === d.id} onClick={() => set('domain', f.domain === d.id ? '' : d.id)}>
              <MakingIcon domain={d.id} /><span>{d.label}</span>
            </button>)}
        </div>
        {region.featured_event && (
          <div className="notice info event-banner">
            <span><strong>{region.featured_event.title}, {region.featured_event.date_label}.</strong> {region.featured_event.blurb}</span>
            <a className="btn small" href={href('event', { event: region.featured_event.id })}
               onClick={(e) => { if (e.metaKey || e.ctrlKey) return; e.preventDefault(); navigate('event', { event: region.featured_event!.id }); }}>Find out more</a>
          </div>
        )}
        <div className="cols">
          {/* Keep detailed filters compact on phones; search stays in the hero. */}
          {!narrow && <aside className="filters">{rail}</aside>}

          <div>
            <details className="directory-map"><summary>Explore the map</summary>
            <RegionMap
              regionName={region.name}
              all={all}
              results={results}
              counties={f.counties}
              onToggleCounty={(c) => toggle('counties', c)}
              isPrimary={leads}
              filtered={Boolean(active)}
            />
            </details>

            {narrow && filterPanel}

            <div className="result-head">
              <span className="result-count" role="status">
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
                  Try fewer filters. Results only include details we can confirm.
                </p>
              </div>
            ) : active ? (
              // Someone who has filtered deliberately wants one list, not a
              // ranking of it.
              <div className="cards">
                {results.map((s) => <Card key={s.id} s={s} domain={f.domain} />)}
              </div>
            ) : (
              <>
                <div className="cards">
                  {headline.map((s) => <Card key={s.id} s={s} domain={f.domain} />)}
                </div>

                {rest.length > 0 && (
                  <section>
                    <h2 className="tier-head">Also in {region.name}</h2>
                    <p className="tier-note">
                      More workshops, including campus spaces and listings with fewer confirmed details.
                    </p>
                    <div className="cards compact">
                      {rest.map((s) => <MiniCard key={s.id} s={s} />)}
                    </div>
                  </section>
                )}
              </>
            )}

            <p className="directory-owner"><a href={href('for-spaces')}>Run a space? Update your listing <span aria-hidden="true">→</span></a></p>
          </div>
        </div>
      </div>
    </div>
  );
}
