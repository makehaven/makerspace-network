// Synthetic reads only. Not a production entry point.
import React from 'react';
import { createRoot } from 'react-dom/client';
import { MakerDirectory } from '../../src/makers/MakerPages';
import EventsPage from '../../src/events/EventsPage';
import { ListingEditor } from '../../src/network/pages/SpaceData';
import { blankMaker } from '../../src/makers/model';
import { ConnectSpaceView } from '../../src/network/pages/ConnectSpace';
import type { EventDoc } from '../../src/events/model';
import seed from '../../data/events/maker-bonanza-2027.json';
import '../../src/styles.css';
const q = new URLSearchParams(location.search);
let attempts = 0;
const loadMakers = async () => {
  await new Promise((resolve) => setTimeout(resolve, 100));
  if (q.get('mode') === 'retry' && ++attempts === 1) throw new Error('Offline');
  return q.get('mode') === 'empty' ? [] : [{ ...blankMaker('Test Maker', '2026-11-14T00:00:00Z'), id: 'fixture', town: 'New Haven' }];
};
const loadEvents = async () => q.get('mode') === 'empty' ? [] : [{ ...seed, id: 'fixture-event', status: 'announced' } as EventDoc];
// A submission saved before enums 0.7.0, so the form has to read it in the new terms.
const oldSubmission = async () => ({
  listing: { summary: 'A fixture space', capabilities: ['woodworking_machine', 'three_d_printing_fdm'], membership_models: ['monthly_membership', 'free_gated', 'sponsored'] },
  status: 'submitted' as const, submitted_by: 'u1', submitted_name: 'Jo', updated_at: '2026-11-01T12:00:00Z',
});
const sent = async (f: unknown) => { (window as unknown as { __sent: unknown }).__sent = f; };
const view = q.get('view');
const saveSpace = async (id: string) => { (window as unknown as { __space: string }).__space = id; };
createRoot(document.getElementById('root')!).render(view === 'connect' ? <main className="wrap narrow"><ConnectSpaceView save={saveSpace} /></main>
  : view === 'events' ? <EventsPage load={loadEvents} />
  : view === 'listing' ? <main className="wrap narrow"><ListingEditor spaceId="fixture" canEdit load={oldSubmission} submit={sent} /></main>
  : <MakerDirectory load={loadMakers} />);
