import type { Space } from '../types';

/** Initials, for the spaces whose mark we do not have. Drops the filler words
 *  so "Fairfield County Makers' Guild" reads FC rather than FCMG. */
const monogram = (name: string) =>
  name
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !/^(the|of|and|at|for|a|an)$/i.test(w))
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');

export default function Logo({ space, large }: { space: Space; large?: boolean }) {
  const cls = `logo${large ? ' lg' : ''}`;
  // alt is empty on purpose: the space's name is always rendered next to it, so
  // the logo is decorative and a screen reader should not hear the name twice.
  return space.logo_url ? (
    <div className={cls}><img src={space.logo_url} alt="" loading="lazy" /></div>
  ) : (
    <div className={`${cls} mono`} aria-hidden="true">{monogram(space.name)}</div>
  );
}
