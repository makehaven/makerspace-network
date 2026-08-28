import { useEffect, useState } from 'react';
import { resolveRegion, REPO_URL } from './data';
import Directory from './pages/Directory';
import SpacePage from './pages/SpacePage';
import Standards from './pages/Standards';
import About from './pages/About';
import Achievements from './pages/Achievements';

// Query-string routing, no router library — same convention as the sibling
// Entrepreneurship Nexus app.
type Route = { page: string; id?: string };

const parse = (): Route => {
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
  window.history.pushState({}, '', qs ? `?${qs}` : window.location.pathname);
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
  return qs ? `?${qs}` : './';
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
      route.page === 'directory'
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
            <Link page="directory">Spaces</Link>
            <Link page="standards">Standards</Link>
            <Link page="achievements">Badges</Link>
            <Link page="about">About</Link>
            <a href={REPO_URL}>Source</a>
          </nav>
        </div>
      </header>

      <main>
        {route.page === 'directory' && <Directory region={region} />}
        {route.page === 'space' && route.id && <SpacePage id={route.id} />}
        {route.page === 'standards' && <Standards />}
        {route.page === 'achievements' && <Achievements />}
        {route.page === 'about' && <About region={region} />}
      </main>

      <footer className="site-footer">
        <div className="wrap footer-cols">
          <div style={{ maxWidth: '42ch' }}>
            <strong>Makerspace Network</strong>
            <p style={{ marginTop: 6 }}>
              An open directory maintained by the regional networks that know these spaces.
              {region.steward?.organization && <> {region.name} is stewarded by {region.steward.organization}.</>}
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
