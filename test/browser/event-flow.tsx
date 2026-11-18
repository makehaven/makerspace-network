// Browser-only fixture: real UI, synthetic event, all write requests intercepted
// by Playwright. This is not an entry point in the production build.
import React from 'react';
import { createRoot } from 'react-dom/client';
import { Manage, Register, Sponsors } from '../../src/events/EventPage';
import { type EventDoc } from '../../src/events/model';
import seed from '../../data/events/maker-bonanza-2027.json';
import '../../src/styles.css';
const event = { ...seed, status: 'open', starts_at: '2027-01-22T14:00:00Z', ends_at: '2027-01-22T22:00:00Z' } as EventDoc;
const mode = new URLSearchParams(location.search).get('mode');
createRoot(document.getElementById('root')!).render(<React.StrictMode>
  <header className="site-header"><div className="wrap"><a className="brand" href="#">Makerspace.network</a></div></header>
  {mode === 'partners' ? <main className="wrap narrow event-body"><Sponsors id="browser-fixture" event={event}
      partners={[{ event_id: 'browser-fixture', space_id: 'makehaven', space_name: 'MakeHaven', agreed_by: 'x', created_at: '2026-11-18T00:00:00Z' }]} /></main>
  : mode === 'manage' ? <Manage id="browser-fixture" event={event} regId="fixture-registration" token="test-token" />
    : <main className="wrap narrow event-body"><Register id="browser-fixture" event={event} stats={{ registered: 0, spots_left: 100, spaces: [], tiers_sold_out: [], sponsor_tiers_full: [] }} /></main>}
</React.StrictMode>);
