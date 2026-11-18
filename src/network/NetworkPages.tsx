// Everything that needs a signed-in person lives behind this one lazy import,
// so the public directory never loads the Firebase SDK.

import { SessionProvider } from './session';
import Join from './pages/Join';
import People from './pages/People';
import Steward from './pages/Steward';
import { GroupPage, GroupsPage } from './pages/Groups';
import SpaceData from './pages/SpaceData';
import EventAdmin from './pages/EventAdmin';
import MakerEdit from './pages/MakerEdit';
import Home from './pages/Home';

export default function NetworkPages({ page, spaceId }: { page: string; spaceId?: string }) {
  return (
    <SessionProvider>
      {page === 'join' && <Join spaceId={spaceId} />}
      {page === 'people' && <People />}
      {page === 'steward' && <Steward />}
      {page === 'groups' && <GroupsPage />}
      {page === 'group' && <GroupPage />}
      {page === 'space-data' && <SpaceData spaceId={spaceId} />}
      {page === 'event-admin' && <EventAdmin />}
      {page === 'maker-edit' && <MakerEdit />}
      {page === 'home' && <Home />}
    </SessionProvider>
  );
}
