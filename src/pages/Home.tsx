import { REGIONS, SPACES, spacesIn, regionHref, REPO_URL } from '../data';
import { href, navigate } from '../App';

// The network apex. Whoever lands here is overwhelmingly a member of the public
// looking for somewhere to go, so the page's job is to get them into a region
// quickly and answer "what even is a makerspace" on the way. The argument about
// standards and interoperability belongs on About, not here.

const BENEFITS = [
  ['Tools you could not justify owning', 'Professional woodworking, metal, electronics and digital fabrication equipment, for roughly what a gym costs.'],
  ['Someone to show you how', 'Classes, checkouts and the person at the next bench who has already made the mistake you are about to make.'],
  ['People who make things', 'The reason most members give for staying is not the equipment. It is that the room is full of people mid-project.'],
  ['Somewhere to finish the idea', 'A prototype, a repair, a costume, a piece of furniture, a small production run — a place where starting it is normal.'],
];

export default function Home() {
  const active = REGIONS.filter((r) => r.status === 'active');

  return (
    <>
      <section className="hero">
        <div className="wrap narrow">
          <p className="eyebrow">Makerspace Network</p>
          <h1>Find a makerspace near you</h1>
          <p className="lede">
            An open directory of community workshops, kept current by the regional networks
            that actually know these places — with what each one can make, how you get in,
            and what it costs.
          </p>
        </div>
      </section>

      <div className="wrap" style={{ paddingTop: 34 }}>
        <div className="narrow"><h2 style={{ marginBottom: 14 }}>Choose a region</h2></div>

        <div className="cards" style={{ maxWidth: 760, marginBottom: 42 }}>
          {active.map((r) => {
            const n = spacesIn(r).length;
            return (
              <a className="card" key={r.id} href={regionHref(r)}>
                <div className="card-top">
                  <h3>{r.name}</h3>
                  <span className="where">{n} {n === 1 ? 'space' : 'spaces'}</span>
                </div>
                {r.summary && <p className="summary">{r.summary}</p>}
                {r.steward?.organization && (
                  <div className="facts">
                    <span className="fact"><span className="k">Convened by</span> {r.steward.organization}</span>
                  </div>
                )}
              </a>
            );
          })}

          <div className="card" style={{ borderStyle: 'dashed', boxShadow: 'none' }}>
            <div className="card-top"><h3 style={{ color: 'var(--ink-3)' }}>Your state</h3></div>
            <p className="summary">
              Adding a region is a data change, not a code change — a region file and a folder
              of spaces. If you convene a makerspace network somewhere else,{' '}
              <a href={REPO_URL}>the whole thing is yours to fork or join</a>.
            </p>
          </div>
        </div>

        <div className="narrow prose">
          <h2>What is a makerspace?</h2>
          <p>
            A shared workshop. A community of people pool the cost of equipment that none of
            them could justify alone — a laser cutter, a welder, a full woodshop, a sewing
            studio — and open it to members on some combination of subscription, class and
            drop-in. Most are nonprofits. Some live inside a library or a university. Nearly
            all of them will show you around if you ask.
          </p>
          <p>
            The equipment is the visible part, but it is rarely why people stay. A makerspace
            is somewhere to learn a skill from a person rather than a video, and somewhere the
            half-finished thing on your bench is unremarkable.
          </p>

          <h2>Why join one</h2>
          <ul>
            {BENEFITS.map(([title, body]) => (
              <li key={title}><strong>{title}.</strong> {body}</li>
            ))}
          </ul>

          <p style={{ marginTop: 26 }}>
            {SPACES.length} spaces are listed so far, each with its sources written down and
            its gaps admitted rather than filled in with guesses.{' '}
            <a href={href('about')}
               onClick={(e) => { if (e.metaKey || e.ctrlKey) return; e.preventDefault(); navigate('about'); }}>
              Why that matters
            </a>{' '}·{' '}
            <a href={href('for-spaces')}
               onClick={(e) => { if (e.metaKey || e.ctrlKey) return; e.preventDefault(); navigate('for-spaces'); }}>
              If you run a space
            </a>
          </p>
        </div>
      </div>
    </>
  );
}
