// Events at Connecticut makerspaces and craft studios, from the Community
// Calendar (~/development/Community-Calendar, calendar `ct-makerspaces`). It
// pulls each organisation's own calendar nightly, only from places that agreed
// to be listed, and every link goes to the organisation's own page to sign up.

export const COMMUNITY_FEED = 'https://makehaven-community-cal.web.app/data/ct-makerspaces.json';

export interface CommunityItem {
  id: string;
  title: string;
  orgName: string;
  summary?: string;
  start: string;
  timeKnown: boolean;
  location?: string;
  categories: string[];
  audience: 'adult' | 'youth' | 'all';
  registrationClosed?: boolean;
  price?: string | null;
  moreDates: { id: string; start: string }[];
  link: string;
}

/** The Community Calendar's topic list (functions/src/core/categories.ts there). */
export const TOPICS: [string, string][] = [
  ['woodworking', 'Woodworking'], ['metalworking', 'Metal & welding'], ['ceramics', 'Ceramics & pottery'],
  ['textiles', 'Sewing, fibre & leather'], ['jewelry', 'Jewellery'], ['printmaking', 'Printmaking & book arts'],
  ['drawing-painting', 'Drawing & painting'], ['sculpture', 'Sculpture & mixed media'], ['glass', 'Glass'],
  ['photo-media', 'Photo, video & audio'], ['electronics', 'Electronics & code'], ['digital-fab', '3D printing, laser & CNC'],
  ['repair', 'Repair & DIY'], ['food', 'Food & fermentation'], ['manufacturing', 'Manufacturing'],
  ['community', 'Markets, fairs & festivals'],
];
export const topicLabel = (id: string) => TOPICS.find(([k]) => k === id)?.[1] ?? id;

export async function loadCommunityEvents(): Promise<CommunityItem[]> {
  const res = await fetch(COMMUNITY_FEED);
  if (!res.ok) throw new Error(`calendar ${res.status}`);
  const data = await res.json() as { items: CommunityItem[] };
  return data.items;
}
