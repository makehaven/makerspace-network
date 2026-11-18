// What makes a maker profile credible. Shared on purpose, like ics.ts: the site
// uses it to sort and to coach, the tests run it. No dependencies. Anyone is a
// maker if they say so; a fuller profile, shown work and having turned up are
// what earn trust, so those are what this counts.

export interface ProfileFacts {
  headline: string;
  bio: string;
  town: string;
  disciplines: string[];
  open_to: string[];
  website: string | null;
  instagram: string | null;
  work_count: number;
  events: { attended: boolean }[];
}

export interface Step { key: string; points: number; done: boolean; prompt: string }

export function profileSteps(p: ProfileFacts): Step[] {
  return [
    { key: 'work', points: 30, done: p.work_count > 0, prompt: 'Show a photo of something you made' },
    { key: 'bio', points: 20, done: p.bio.trim().length >= 40, prompt: 'Say what you enjoy and what you bring' },
    { key: 'headline', points: 10, done: p.headline.trim().length > 0, prompt: 'Add a one-line description' },
    { key: 'disciplines', points: 10, done: p.disciplines.length > 0, prompt: 'Choose what you work in' },
    { key: 'open_to', points: 10, done: p.open_to.length > 0, prompt: "Say what you're open to" },
    { key: 'town', points: 5, done: p.town.trim().length > 0, prompt: 'Add your town' },
    { key: 'link', points: 5, done: !!p.website || !!p.instagram, prompt: 'Link to your work' },
    { key: 'event', points: 10, done: p.events.some((e) => e.attended), prompt: 'Come to a network event' },
  ];
}

export const profileScore = (p: ProfileFacts) => profileSteps(p).filter((s) => s.done).reduce((n, s) => n + s.points, 0);

/** Only a link that opens a web page may become an href on a profile. */
export const safeWebUrl = (raw: string): string | null => {
  const t = raw.trim();
  if (!t) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(t) ? t : `https://${t.replace(/^\/+/, '')}`;
  try {
    const u = new URL(withScheme);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null;
  } catch { return null; }
};
