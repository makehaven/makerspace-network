import { Suspense, lazy, useEffect, useState } from 'react';
import { SHOW_MAKERS_DIRECTORY } from './features';
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
import FeedbackButton from './components/FeedbackButton';
import { useHint } from './authHint';

// The people layer (join, people, steward) needs Firebase. It is loaded only
// when one of those pages is opened, so the public directory stays static.
const NetworkPages = lazy(() => import('./network/NetworkPages'));
const NETWORK_PAGES = new Set(['join', 'people', 'steward', 'groups', 'group', 'space-data', 'event-admin', 'maker-edit', 'home']);
// An event's public page needs Firestore but no sign-in, so unlike the pages
// above it stays on the regional host instead of being handed to the apex.
const EventsPage = lazy(() => import('./events/EventsPage'));
const EventPage = lazy(() => import('./events/EventPage'));
// Likewise makers: browsing them needs no sign-in, on any host.
const MakerPages = lazy(() => import('./makers/MakerPages'));

// Query-string routing, no router library — same convention as the sibling
// Entrepreneurship Nexus app.
type Route = { page: string; id?: string; achievement?: string; version?: number; event?: string; maker?: string };

// Achievement definitions are the one thing here with a permanent, path-based
// URL, because it is baked into signed credentials. Everything else is
// query-string routed.
const ACHIEVEMENT_PATH = /^\/achievements\/([a-z0-9-]+)\/v(\d+)\/?$/;
// Events get a short path too, because it goes on flyers and in other people's emails.
const EVENT_PATH = /^\/events\/([a-z0-9-]+)\/?$/;
const EVENT_ALIASES: Record<string, string> = { '/bonanza': 'maker-bonanza-2027', '/bonanza/': 'maker-bonanza-2027' };

const parse = (): Route => {
  const m = ACHIEVEMENT_PATH.exec(window.location.pathname);
  if (m) return { page: 'achievement', achievement: m[1], version: Number(m[2]) };
  const ev = EVENT_ALIASES[window.location.pathname] ?? EVENT_PATH.exec(window.location.pathname)?.[1];
  if (ev) return { page: 'event', event: ev };
  const q = new URLSearchParams(window.location.search);
  return { page: q.get('page') ?? 'directory', id: q.get('space') ?? undefined, event: q.get('event') ?? undefined, maker: q.get('maker') ?? undefined };
};

// Sign-in is kept per origin, so a person signed in at the apex is signed out
// on connecticut.makerspace.network. The people layer therefore lives only at
// the apex: a regional host hands any of its pages over, and people stay signed in.
const APEX = 'makerspace.network';
const host = window.location.hostname.toLowerCase();
const onRegionalHost = host.endsWith(`.${APEX}`);
const toApex = (qs: string) => { window.location.assign(`https://${APEX}/${qs ? `?${qs}` : ''}`); };
if (onRegionalHost && NETWORK_PAGES.has(new URLSearchParams(window.location.search).get('page') ?? '')) {
  toApex(window.location.search.slice(1));
}

export function navigate(page: string, params: Record<string, string> = {}) {
  if (onRegionalHost && NETWORK_PAGES.has(page)) {
    toApex(new URLSearchParams({ page, ...params }).toString());
    return;
  }
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
  if (onRegionalHost && NETWORK_PAGES.has(page)) return `https://${APEX}/?${new URLSearchParams({ page, ...params })}`;
  const q = new URLSearchParams(window.location.search);
  const next = new URLSearchParams();
  const region = q.get('region');
  if (region) next.set('region', region);
  if (page !== 'directory') next.set('page', page);
  for (const [k, v] of Object.entries(params)) next.set(k, v);
  const qs = next.toString();
  return qs ? `/?${qs}` : '/';
};

function Link({ page, params, children, className, label }: { page: string; params?: Record<string, string>; children: React.ReactNode; className?: string; label?: string }) {
  const here = parse().page;
  // Everything about you and your space belongs to Home.
  const current = here === page
    || (page === 'home' && ['join', 'space-data', 'maker-edit'].includes(here))
    || (page === 'makers' && here === 'maker')
    || (page === 'directory' && here === 'space')
    || (page === 'events' && here === 'event')
    || (page === 'for-spaces' && ['people', 'groups', 'group', 'steward', 'event-admin'].includes(here));
  return (
    <a
      href={href(page, params)}
      className={className}
      aria-label={label}
      title={label}
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

/** Sign in, or who you are: the header's one answer to "am I signed in?". */
function AccountLink() {
  const { who, photo } = useHint();
  const [broken, setBroken] = useState(false);
  if (!who) return <Link page="home" className="nav-signin">Sign in</Link>;
  return (
    <Link page="home" className="nav-account" label={`My network, signed in as ${who}`}>
      {photo && !broken
        ? <img className="avatar" src={photo} alt="" referrerPolicy="no-referrer" onError={() => setBroken(true)} />
        : <span className="avatar" aria-hidden="true">{who.trim().charAt(0).toUpperCase()}</span>}
      My network
    </Link>
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
            {region?.id === 'us-ct' && <img className="regional-mark" src="/brand/connecticut-makerspace-network.png" alt="Connecticut" width="42" height="42" />}
            <span>Makerspace<span className="net">.network</span></span>
          </a>
          <nav className="nav" aria-label="Main navigation">
            <Link page="directory">Find a space</Link>
            {SHOW_MAKERS_DIRECTORY && <Link page="makers">Meet makers</Link>}
            <Link page="events">Events</Link>
            <Link page="for-spaces">For organisers</Link>
            <AccountLink />
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
        {(route.page === 'makers' || route.page === 'maker') && (
          <Suspense fallback={<div className="wrap" style={{ paddingTop: 40 }}><p>Loading…</p></div>}>
            <MakerPages id={route.page === 'maker' ? route.maker : undefined} />
          </Suspense>
        )}
        {route.page === 'events' && (
          <Suspense fallback={<div className="wrap" role="status"><p>Loading events…</p></div>}><EventsPage /></Suspense>
        )}
        {route.page === 'event' && route.event && (
          <Suspense fallback={<div className="wrap" style={{ paddingTop: 40 }}><p>Loading…</p></div>}>
            <EventPage id={route.event} />
          </Suspense>
        )}
        {NETWORK_PAGES.has(route.page) && (
          <Suspense fallback={<div className="wrap" style={{ paddingTop: 40 }}><p>Loading…</p></div>}>
            <NetworkPages page={route.page} spaceId={route.id} />
          </Suspense>
        )}
      </main>

      <FeedbackButton />

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
              <a href={href('about')}>About the network</a> · <a href={REPO_URL}>Data and code on GitHub</a>
            </p>
          </div>
        </div>
      </footer>
    </>
  );
}
