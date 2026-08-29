import { useMemo, useState } from 'react';
import type { Space } from '../types';
import geo from '../../data/geo/us-ct.json';
import { navigate } from '../App';

// A hand-drawn SVG of the region rather than a slippy map. At this scale it
// answers the only question a visitor actually has — roughly where are these,
// and is one near me — with no mapping library, no tile request, and nothing
// that has to be exempted from the site's content-security policy.

interface Geo {
  viewBox: string;
  projection: { minLon: number; maxLat: number; kx: number; k: number; pad: number };
  counties: { name: string; fips: string; label: [number, number]; d: string }[];
}

const G = geo as unknown as Geo;

const project = (lat: number, lon: number): [number, number] => {
  const p = G.projection;
  return [p.pad + (lon - p.minLon) * p.kx * p.k, p.pad + (p.maxLat - lat) * p.k];
};

/** Downtown New Haven alone has three spaces inside a kilometre, which at this
 *  scale is a few pixels. Merge anything that would overlap into one dot
 *  carrying a count, so nothing is drawn hidden underneath something else. */
const CLUSTER_RADIUS = 16;

interface Dot { x: number; y: number; spaces: Space[] }

function cluster(spaces: Space[]): Dot[] {
  const dots: Dot[] = [];
  for (const s of spaces) {
    const { latitude, longitude } = s.address ?? {};
    if (latitude === undefined || longitude === undefined) continue;
    const [x, y] = project(latitude, longitude);
    const near = dots.find((d) => Math.hypot(d.x - x, d.y - y) < CLUSTER_RADIUS);
    if (near) near.spaces.push(s);
    else dots.push({ x, y, spaces: [s] });
  }
  return dots;
}

export default function RegionMap({
  regionName, all, results, counties, onToggleCounty, isPrimary, filtered,
}: {
  regionName: string;
  all: Space[];
  results: Space[];
  counties: Set<string>;
  onToggleCounty: (county: string) => void;
  /** Separates the open workshops from the library, campus and undocumented
   *  spaces, so the map carries the same emphasis as the list below it. */
  isPrimary: (s: Space) => boolean;
  /** True when the visitor has filtered — that is already digging deeper, so
   *  the map stops holding anything back. */
  filtered: boolean;
}) {
  // The old Connecticut map put fifteen pins of wildly different weight on one
  // page, so a library display case and a 28,000 sq ft workshop looked alike.
  // Lead with the open workshops and let the rest be asked for.
  const [showAll, setShowAll] = useState(false);
  const reveal = showAll || filtered;

  const inScope = useMemo(
    () => (reveal ? all : all.filter(isPrimary)),
    [all, reveal, isPrimary],
  );
  const dots = useMemo(() => cluster(inScope), [inScope]);
  const shown = useMemo(() => new Set(results.map((s) => s.id)), [results]);

  const perCounty = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of all) {
      const c = s.address?.county;
      if (c) m.set(c, (m.get(c) ?? 0) + 1);
    }
    return m;
  }, [all]);

  const located = inScope.filter((s) => s.address?.latitude !== undefined).length;
  const unlocated = inScope.length - located;
  const withheld = all.length - inScope.length;

  return (
    <div className="map-panel">
      <svg viewBox={G.viewBox} role="img"
           aria-label={
             `Map of ${regionName} showing ${located} ` +
             (reveal ? `of ${all.length} spaces` : 'open workshops') + ' by county'
           }>
        {G.counties.map((c) => {
          const n = perCounty.get(c.name) ?? 0;
          const on = counties.has(c.name);
          return (
            <g key={c.fips}>
              <path
                className={`map-county${on ? ' on' : ''}${n === 0 ? ' empty' : ''}`}
                d={c.d}
                role={n > 0 ? 'button' : undefined}
                tabIndex={n > 0 ? 0 : undefined}
                aria-pressed={n > 0 ? on : undefined}
                onClick={n > 0 ? () => onToggleCounty(c.name) : undefined}
                onKeyDown={n > 0 ? (e) => {
                  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggleCounty(c.name); }
                } : undefined}
              >
                <title>
                  {n === 0
                    ? `${c.name} County — no spaces listed yet`
                    : `${c.name} County — ${n} ${n === 1 ? 'space' : 'spaces'}${on ? ' (filtering)' : ''}`}
                </title>
              </path>
              <text className="map-label" x={c.label[0]} y={c.label[1]} textAnchor="middle">
                {c.name}
              </text>
            </g>
          );
        })}

        {dots.map((d) => {
          const visible = d.spaces.filter((s) => shown.has(s.id));
          const many = d.spaces.length > 1;
          const only = d.spaces[0];
          const primary = d.spaces.some(isPrimary);
          return (
            <g key={`${d.x},${d.y}`} opacity={visible.length ? 1 : 0.22}>
              <circle
                className={`map-pin${primary ? '' : ' secondary'}`}
                cx={d.x} cy={d.y} r={many ? 15 : primary ? 10 : 7}
                role="button" tabIndex={0}
                onClick={() => (many
                  ? only.address?.county && onToggleCounty(only.address.county)
                  : navigate('space', { space: only.id }))}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter' && e.key !== ' ') return;
                  e.preventDefault();
                  if (many) only.address?.county && onToggleCounty(only.address.county);
                  else navigate('space', { space: only.id });
                }}
              >
                <title>{d.spaces.map((s) => s.name).join(' · ')}</title>
              </circle>
              {many && (
                <text x={d.x} y={d.y + 5} textAnchor="middle"
                      style={{ fontSize: 15, fontWeight: 700,
                               fill: primary ? 'var(--card)' : 'var(--accent)',
                               pointerEvents: 'none' }}>
                  {d.spaces.length}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      <p className="map-foot">
        <span>
          {reveal
            ? `Showing all ${located} mapped spaces.`
            : `Showing the ${located} workshops open to everyone.`}
          {unlocated > 0 && (
            <> {unlocated} {unlocated === 1 ? 'has' : 'have'} no location on file yet.</>
          )}
        </span>
        <span className="spacer" />
        {withheld > 0 && !filtered && (
          <button className="map-more" onClick={() => setShowAll(true)}>
            Also show {withheld} library and campus {withheld === 1 ? 'space' : 'spaces'}
          </button>
        )}
        {showAll && !filtered && (
          <button className="map-more" onClick={() => setShowAll(false)}>
            Show workshops only
          </button>
        )}
      </p>
      <p className="map-foot" style={{ paddingTop: 0 }}>
        Select a county to filter, or a pin to open the space.
      </p>
    </div>
  );
}
