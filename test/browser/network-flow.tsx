// Synthetic reads only. Not a production entry point.
import React from 'react';
import { createRoot } from 'react-dom/client';
import { MakerDirectory } from '../../src/makers/MakerPages';
import EventsPage from '../../src/events/EventsPage';
import { blankMaker } from '../../src/makers/model';
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
createRoot(document.getElementById('root')!).render(q.get('view') === 'events'
  ? <EventsPage load={loadEvents} /> : <MakerDirectory load={loadMakers} />);
