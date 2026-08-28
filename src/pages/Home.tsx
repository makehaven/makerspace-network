import { REGIONS, SPACES, spacesIn, regionHref, REPO_URL, STANDARDS_URL, completeness } from '../data';
import { href, navigate } from '../App';

export default function Home() {
  const active = REGIONS.filter((r) => r.status === 'active');
  const verified = SPACES.filter((s) => completeness(s).missing.length === 0).length;

  return (
    <>
      <section className="hero">
        <div className="wrap narrow">
          <p className="eyebrow">Makerspace Network</p>
          <h1>Shared infrastructure for regional makerspace networks</h1>
          <p className="lede">
            An open directory of makerspaces, tools that build real data about how they
            operate, and a way for what you learned at one space to count at the next.
            Maintained by the regional networks that actually know these spaces.
          </p>
        </div>
      </section>

      <div className="wrap" style={{ paddingTop: 30 }}>
        <div className="narrow">
          <h2 style={{ marginBottom: 12 }}>Regions</h2>
        </div>

        <div className="cards" style={{ maxWidth: 760, marginBottom: 34 }}>
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
                    <span className="fact"><span className="k">Steward</span> {r.steward.organization}</span>
                  </div>
                )}
              </a>
            );
          })}

          <div className="card" style={{ borderStyle: 'dashed' }}>
            <div className="card-top"><h3 style={{ color: 'var(--ink-3)' }}>Your state</h3></div>
            <p className="summary">
              Adding a region is a data change, not a code change — a region file and a folder
              of spaces. If you run or convene a makerspace network somewhere else,{' '}
              <a href={REPO_URL}>the whole thing is yours to fork or join</a>.
            </p>
          </div>
        </div>

        <div className="narrow prose">
          <h2>What is here</h2>
          <div className="scroll-x">
            <table className="data">
              <thead><tr><th>Thing</th><th>What it does</th></tr></thead>
              <tbody>
                <tr>
                  <td><a href={active[0] ? regionHref(active[0]) : href('directory')}>Directory</a></td>
                  <td>
                    {SPACES.length} space records, filterable by what you can make, how you get
                    in, what it costs, and whether under-18s are admitted. Every record states
                    its sources and what it still does not know — {verified} of {SPACES.length}{' '}
                    are currently complete.
                  </td>
                </tr>
                <tr>
                  <td><a href={STANDARDS_URL}>Standards of Excellence</a></td>
                  <td>
                    84-standard self-assessment across six domains. Other frameworks describe
                    what a space has, or whether it is open right now. This one asks whether it
                    is well run.
                  </td>
                </tr>
                <tr>
                  <td>
                    <a href={href('achievements')}
                       onClick={(e) => { if (e.metaKey || e.ctrlKey) return; e.preventDefault(); navigate('achievements'); }}>
                      Badges that travel
                    </a>
                  </td>
                  <td>
                    Versioned competency definitions that a space's own badges align to, so a
                    credential earned at one shop can be read at another. Each has a permanent
                    URL you can point an Open Badges alignment at.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <h2>Not another map</h2>
          <p>
            There are at least six makerspace maps and most are going stale, because a global
            crowdsourced map has nobody whose job it is to keep any particular corner of it
            current. The scarce input is not software — it is a named local steward with a
            reason to care. So this is built as a federation of regional networks that
            interoperates with the existing standards rather than replacing them:{' '}
            <a href="https://standards.internetofproduction.org/pub/okw/release/2">Open Know-Where</a>{' '}
            for vocabulary and provenance, <a href="https://spaceapi.io">SpaceAPI</a> for live
            status, <a href="https://www.fablabs.io">fablabs.io</a> for import.
          </p>
          <p>
            <a className="btn" href={REPO_URL}>Repository</a>{' '}
            <a className="btn ghost" href={`${REPO_URL}/blob/main/docs/INTEROP.md`}>
              The landscape survey
            </a>
          </p>
        </div>
      </div>
    </>
  );
}
