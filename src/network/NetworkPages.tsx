// Everything that needs a signed-in person lives behind this one lazy import,
// so the public directory never loads the Firebase SDK.

import { SessionProvider } from './session';
import Join from './pages/Join';
import People from './pages/People';
import Steward from './pages/Steward';

export default function NetworkPages({ page, spaceId }: { page: string; spaceId?: string }) {
  return (
    <SessionProvider>
      {page === 'join' && <Join spaceId={spaceId} />}
      {page === 'people' && <People />}
      {page === 'steward' && <Steward />}
    </SessionProvider>
  );
}
