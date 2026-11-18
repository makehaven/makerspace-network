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
            A self-assessment for makerspaces: {FRAMEWORK.standards.length} standards in six core
            areas and five optional ones, covering how well a space is run.
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
          Sign in, open <strong>Home</strong>, and choose <strong>Standards self-assessment</strong>.
          It saves as you go, and anyone on your staff can pick up where a colleague left off.
        </p>

        <h2>Scoring</h2>
        <p>
          You start with a few questions about your space, such as whether you have paid staff,
          serve minors or lend tools. Only the standards that apply to you are shown.
        </p>
        <p>
          Each standard is scored 0 to 3, with an example for each score so that scores mean the
          same thing from one space to the next.
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

        <h2>Who sees your scores</h2>
        <ul>
          <li>
            <strong>Your assessment</strong> (scores, evidence and plans) is visible only to your
            own staff. The region steward and the network cannot see it.
          </li>
          <li>
            <strong>A summary</strong> (your level, your average in each area and the health
            check) is shared only if you choose to share it, and you can withdraw it at any time.
            It never includes individual scores, evidence or notes.
          </li>
        </ul>
        <p>
          The network only reports shared summaries as totals across spaces, never by name.
        </p>

        <div className="notice">
          <h4>Draft</h4>
          <p style={{ margin: '4px 0 0' }}>
            The framework is still being tested and will change. A{' '}
            <a href={`${REPO_URL}/blob/main/docs/STANDARDS_GAPS.md`}>
              gap analysis
            </a>{' '}
            against one space's 186 written procedures found gaps. The biggest: unstaffed 24/7
            member access, which most member-run spaces offer, is only one clause in a
            non-critical standard.
          </p>
        </div>
      </div>
    </>
  );
}
