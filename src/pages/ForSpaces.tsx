import { REPO_URL, STANDARDS_URL, SPACES, completeness } from '../data';
import { href, navigate } from '../App';

const CONTACT = 'mailto:directory@makerspace.network';

export default function ForSpaces() {
  const thin = SPACES.filter((s) => completeness(s).missing.length > 3).length;

  return (
    <>
      <section className="hero">
        <div className="wrap narrow">
          <p className="eyebrow">For makerspaces</p>
          <h1>This is your listing, not ours</h1>
          <p className="lede">
            Every space in the directory is described from public sources, with the gaps
            written down rather than guessed at. If one of them is yours, you can take it
            over — and you should, because you are the only one who knows when the hours
            change.
          </p>
        </div>
      </section>

      <div className="wrap narrow prose" style={{ paddingTop: 34 }}>
        <h2>Claim your listing</h2>
        <p>
          Email us from an address at your space's own domain and say which listing is
          yours. We check that the domain matches the website on the record, then hand you
          editing rights over it. {thin > 0 && (
            <>Right now {thin} of the {SPACES.length} records are thin enough that ten
            minutes from the right person would visibly improve them.</>
          )}
        </p>
        <div className="btn-row">
          <a className="btn" href={CONTACT}>Claim a listing</a>
          <a className="btn ghost" href={REPO_URL}>Or send a pull request</a>
        </div>
        <p>
          Nothing about this is locked behind us. The records are plain JSON files in a
          public repository under a share-alike licence, so a correction is a one-file
          change that anyone can propose and everyone can see.
        </p>

        <h2>Can several people from one space have access?</h2>
        <p>
          Yes — that is the intended shape, because the person who knows the membership
          price is rarely the person who knows the laser cutter's bed size. A space can
          have as many people as it likes, in two roles:
        </p>
        <div className="scroll-x">
          <table className="data">
            <thead><tr><th>Role</th><th>Can do</th><th>Cannot do</th></tr></thead>
            <tbody>
              <tr>
                <td><strong>Space admin</strong></td>
                <td>Edit every field on the record, and invite, promote or remove other
                    people at that space.</td>
                <td>Touch any other space's record.</td>
              </tr>
              <tr>
                <td><strong>Space editor</strong></td>
                <td>Edit every field on the record.</td>
                <td>Manage who else has access.</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          Above those sits a <strong>region steward</strong> — the organisation convening the
          network in that state — who can verify records and invite spaces, but does not own
          them. Connecticut's steward is MakeHaven, which also runs one of the listed spaces;
          the roles are separate on purpose so that stewarding a region never means
          controlling the neighbours' entries.
        </p>
        <p>
          The first person to claim an unclaimed record becomes its space admin outright. Once
          a space has someone in it, later requests go to that admin — or to the region
          steward — to approve, so a listing cannot be quietly taken over. Invitations are
          single-use links that expire, and they only work for the exact address they were
          sent to.
        </p>
        <p className="notice info">
          <strong>Being straight about what exists today:</strong> the role model above is
          specified and the vocabulary is settled — it deliberately mirrors the sibling
          Entrepreneurship Nexus project so the two converge rather than fork — but the
          sign-in and invitation machinery is not built yet. Until it is, claiming runs
          through email and pull requests, and we do the edit for you. See{' '}
          <a href={`${REPO_URL}/blob/main/docs/GOVERNANCE.md`}>docs/GOVERNANCE.md</a> for the
          full specification.
        </p>

        <h2>Add a space that is missing</h2>
        <p>
          Tell us it exists and we will create the record with whatever can be sourced, and
          write down what we could not confirm. A record with honest gaps is publishable
          here; a plausible guess is not. That rule is the whole reason this directory
          exists — the makerspace maps that went stale did so by preferring a confident
          wrong answer to an admitted blank.
        </p>

        <h2>Two things worth your time</h2>
        <div className="scroll-x">
          <table className="data">
            <thead><tr><th>Tool</th><th>What it is</th><th>Status</th></tr></thead>
            <tbody>
              <tr>
                <td><a href={STANDARDS_URL}>Standards of Excellence</a></td>
                <td>An 84-standard self-assessment across six domains, asking whether a space
                    is <em>well run</em> rather than what equipment it owns. Runs entirely in
                    your browser; nothing is sent anywhere unless you choose to share it.</td>
                <td><span className="pill ok">Live</span></td>
              </tr>
              <tr>
                <td>
                  <a href={href('achievements')}
                     onClick={(e) => { if (e.metaKey || e.ctrlKey) return; e.preventDefault(); navigate('achievements'); }}>
                    Badges that travel
                  </a>
                </td>
                <td>Shared competency definitions your own badges can point at, so a member
                    checked out on a table saw at one shop can be recognised at another.</td>
                <td><span className="pill flag">In development</span></td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          The badge work needs two or three spaces writing the definitions alongside us, not
          a finished thing to adopt. If that sounds like your shop,{' '}
          <a href={CONTACT}>say so</a>.
        </p>
      </div>
    </>
  );
}
