import { REPO_URL } from '../data';
import { href, navigate } from '../App';
import { FRAMEWORK } from '../standards/framework';

export default function Standards() {
  return (
    <>
      <section className="hero">
        <div className="wrap narrow">
          <p className="eyebrow">Tools</p>
          <h1>Standards of Excellence</h1>
          <p className="lede">
            A self-assessment framework for makerspaces — {FRAMEWORK.standards.length} standards across six
            core domains and five optional ones — and the question none of the other makerspace
            standards ask: not what a space has, but whether it is well run.
          </p>
        </div>
      </section>

      <div className="wrap narrow prose" style={{ paddingTop: 26 }}>
        <p>
          <a className="btn" href={href('join')}
             onClick={(e) => { if (e.metaKey || e.ctrlKey) return; e.preventDefault(); navigate('join'); }}>
            Start your assessment
          </a>
          {' '}
          <a className="btn ghost" href={`${REPO_URL}/blob/main/data/standards/framework.v${FRAMEWORK.version}.json`}>Framework source</a>
        </p>

        <p>
          Sign in, open <strong>Your space</strong>, and choose <strong>Standards self-assessment</strong>.
          It saves as you go, and anyone on your space's staff can pick it up where a colleague left off.
        </p>

        <h2>How it works</h2>
        <p>
          Standards apply conditionally. A space answers a short profile questionnaire — formal
          membership? paid staff? serves minors? lends tools? — and only the relevant standards
          activate, so a volunteer-run space is not graded against employment practices it does
          not have.
        </p>
        <p>
          Each standard scores 0–3, with four behaviourally anchored examples — one per score —
          so the numbers mean the same thing across different spaces and different assessors.
        </p>

        <div className="scroll-x">
          <table className="data">
            <thead><tr><th>Score</th><th>Meaning</th></tr></thead>
            <tbody>
              <tr><td>0</td><td>Absent</td></tr>
              <tr><td>1</td><td>Foundational — basic practice exists, may be informal or inconsistent</td></tr>
              <tr><td>2</td><td>Operational — written, assigned, consistently implemented, evidenced</td></tr>
              <tr><td>3</td><td>Sustained and review-ready</td></tr>
            </tbody>
          </table>
        </div>

        <h2>Your scores are nobody else's business</h2>
        <p>
          A benchmarking tool that leaks per-standard scores to funders is a tool that quietly
          teaches everyone to inflate their scores. So the assessment has two parts, and only
          one of them can ever leave your space:
        </p>
        <ul>
          <li>
            <strong>Your assessment</strong> — every score, every piece of evidence, every plan.
            Readable by your own staff and nobody else; not the regional steward, not the
            network. The database refuses anyone else, not just the page.
          </li>
          <li>
            <strong>A summary you choose to share</strong> — your level, your average in each
            domain and the health check. Never a single standard's score, your evidence or
            your notes. Shared by pressing a button, withdrawn the same way.
          </li>
        </ul>
        <p>
          The network reports shared summaries only in aggregate — level counts, medians,
          ranges — never attributed to a named space.
        </p>

        <h2>Why the network cares</h2>
        <p>
          Beyond a space's own improvement, the assessment does one thing nothing else can. When
          a member walks into another space carrying a badge earned somewhere else, the question
          that matters is not whether the badge is forged. It is whether the place that issued it
          checks anything. The tool-authorisation and hazard-assessment standards answer exactly
          that, which is why they are what makes a space a{' '}
          <a href={`${REPO_URL}/blob/main/docs/RECIPROCITY.md`}>recognised issuer</a> rather than
          a list somebody curates by hand.
        </p>

        <div className="notice">
          <h4>Draft</h4>
          <p style={{ margin: '4px 0 0' }}>
            The framework is being stress-tested against real operations and is expected to
            change. A{' '}
            <a href={`${REPO_URL}/blob/main/docs/STANDARDS_GAPS.md`}>
              gap analysis
            </a>{' '}
            against one space's 186 documented operational processes found real holes — the
            largest being that unstaffed 24/7 member access, the dominant model for
            member-based makerspaces, is currently one clause inside a non-critical standard.
          </p>
        </div>
      </div>
    </>
  );
}
