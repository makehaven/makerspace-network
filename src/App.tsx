import { useEffect, useState } from 'react';
import { resolveRegion, REPO_URL } from './data';
import Directory from './pages/Directory';
import SpacePage from './pages/SpacePage';
import Standards from './pages/Standards';
import About from './pages/About';
import Achievements from './pages/Achievements';
import Home from './pages/Home';
import ForSpaces from './pages/ForSpaces';
import AchievementDetail from './pages/AchievementDetail';
import { ACHIEVEMENTS } from './data';

// Query-string routing, no router library — same convention as the sibling
// Entrepreneurship Nexus app.
type Route = { page: string; id?: string; achievement?: string; version?: number };

// Achievement definitions are the one thing here with a permanent, path-based
// URL, because it is baked into signed credentials. Everything else is
// query-string routed.
const ACHIEVEMENT_PATH = /^\/achievements\/([a-z0-9-]+)\/v(\d+)\/?$/;

const parse = (): Route => {
  const m = ACHIEVEMENT_PATH.exec(window.location.pathname);
  if (m) return { page: 'achievement', achievement: m[1], version: Number(m[2]) };
  const q = new URLSearchParams(window.location.search);
  return { page: q.get('page') ?? 'directory', id: q.get('space') ?? undefined };
};

export function navigate(page: string, params: Record<string, string> = {}) {
  const q = new URLSearchParams(window.location.search);
  const region = q.get('region');
  const next = new URLSearchParams();
  if (region) next.set('region', region);
  if (page !== 'directory') next.set('page', page);
  for (const [k, v] of Object.entries(params)) next.set(k, v);
  const qs = next.toString();
  // Always return to the site root — an achievement's permanent path must not
  // become a base that other links hang off.
  window.history.pushState({}, '', qs ? `/?${qs}` : '/');
  window.dispatchEvent(new PopStateEvent('popstate'));
  window.scrollTo(0, 0);
}

export const href = (page: string, params: Record<string, string> = {}) => {
  const q = new URLSearchParams(window.location.search);
  const next = new URLSearchParams();
  const region = q.get('region');
  if (region) next.set('region', region);
  if (page !== 'directory') next.set('page', page);
  for (const [k, v] of Object.entries(params)) next.set(k, v);
  const qs = next.toString();
  return qs ? `/?${qs}` : '/';
};

function Link({ page, params, children }: { page: string; params?: Record<string, string>; children: React.ReactNode }) {
  const current = parse().page === page;
  return (
    <a
      href={href(page, params)}
      aria-current={current ? 'page' : undefined}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey) return;
        e.preventDefault();
        navigate(page, params);
      }}
    >
      {children}
    </a>
  );
}

export default function App() {
  const [route, setRoute] = useState<Route>(parse);
  const region = resolveRegion();

  useEffect(() => {
    const on = () => setRoute(parse());
    window.addEventListener('popstate', on);
    return () => window.removeEventListener('popstate', on);
  }, []);

  useEffect(() => {
    document.title =
      route.page === 'directory' && region
        ? `${region.name} Makerspaces — Makerspace Network`
        : 'Makerspace Network';
  }, [route, region]);

  return (
    <>
      <header className="site-header">
        <div className="wrap">
          <a className="brand" href={href('directory')} onClick={(e) => { e.preventDefault(); navigate('directory'); }}>
            Makerspace<span className="net">.network</span>
          </a>
          <nav className="nav">
            <Link page="directory">{region ? 'Spaces' : 'Regions'}</Link>
            <Link page="for-spaces">For makerspaces</Link>
            <Link page="about">About</Link>
          </nav>
        </div>
      </header>

      <main>
        {route.page === 'directory' && (region ? <Directory region={region} /> : <Home />)}
        {route.page === 'space' && route.id && <SpacePage id={route.id} />}
        {route.page === 'for-spaces' && <ForSpaces />}
        {route.page === 'standards' && <Standards />}
        {route.page === 'achievements' && <Achievements />}
        {route.page === 'achievement' && (() => {
          const a = ACHIEVEMENTS.find((x) => x.id === route.achievement && x.version === route.version);
          return a ? <AchievementDetail a={a} />
                   : <div className="wrap" style={{ paddingTop: 40 }}>
                       <p>No achievement definition at this address.</p>
                     </div>;
        })()}
        {route.page === 'about' && <About region={region} />}
      </main>

      <footer className="site-footer">
        <div className="wrap footer-cols">
          <div style={{ maxWidth: '42ch' }}>
            <strong>Makerspace Network</strong>
            <p style={{ marginTop: 6 }}>
              An open directory maintained by the regional networks that know these spaces.
              {region?.steward?.organization && <> {region.name} is stewarded by {region.steward.organization}.</>}
            </p>
          </div>
          <div>
            <p style={{ margin: 0 }}>
              Code MIT · data <a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a>
              <br />
              <a href={REPO_URL}>Corrections and additions welcome</a>
            </p>
          </div>
        </div>
      </footer>
    </>
  );
}
