import zcta from '../data/geo/us-ct-zcta.json';
import { SPACES, institutionalAccess } from './data';
import type { Space } from './types';

const POINTS = (zcta as unknown as { points: Record<string, [number, number]> }).points;

/** Straight-line miles between two points. Good enough to rank nearby spaces. */
function miles([lat1, lon1]: [number, number], [lat2, lon2]: [number, number]) {
  const r = (d: number) => (d * Math.PI) / 180;
  const a = Math.sin(r(lat2 - lat1) / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(r(lon2 - lon1) / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.sqrt(a));
}

/** The open spaces nearest a Connecticut ZIP, spaces the public can use first.
 *  null means the ZIP is not one we can place (outside CT, or a PO-box ZIP). */
export function spacesNear(zip: string, n = 3): { space: Space; miles: number }[] | null {
  const here = POINTS[zip.trim().slice(0, 5)];
  if (!here) return null;
  return SPACES
    .filter((s) => s.status !== 'closed' && s.address?.latitude != null && s.address?.longitude != null)
    .map((space) => ({ space, miles: miles(here, [space.address!.latitude!, space.address!.longitude!]) }))
    // A campus space a visitor cannot use is a poor first suggestion, however close.
    .sort((a, b) => Number(institutionalAccess(a.space) !== null) - Number(institutionalAccess(b.space) !== null) || a.miles - b.miles)
    .slice(0, n);
}
