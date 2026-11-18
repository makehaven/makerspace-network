import { ACHIEVEMENTS, label, REPO_URL } from '../data';
import { openFeedback } from '../components/FeedbackButton';

export default function Achievements() {
  return (
    <>
      <section className="hero">
        <div className="wrap narrow">
          <p className="eyebrow">Draft framework</p>
          <h1>Badges that travel</h1>
          <p className="lede">
            If you learned the table saw at one space, the next space should be able to see
            what you were checked on. That takes a shared definition of the skills, not a
            shared badge.
          </p>
        </div>
      </section>

      <div className="wrap narrow prose" style={{ paddingTop: 26 }}>
        <h2>The problem</h2>
        <p>
          MakeHaven issues a <em>SawStop</em> badge, because its training video was filmed on the
          SawStop in its shop. Training on the actual machine is better training, but the badge
          means less at a space with a different saw.
        </p>

        <h2>What a badge covers</h2>
        <div className="scroll-x">
          <table className="data">
            <thead><tr><th></th><th>Transfers</th><th>Example</th></tr></thead>
            <tbody>
              <tr>
                <td><strong>Competence</strong></td><td>Yes, fully</td>
                <td>What kickback is. Why the fence and miter gauge are never used together.</td>
              </tr>
              <tr>
                <td><strong>Site knowledge</strong></td><td>Never</td>
                <td>Where this saw's disconnect is. Who is allowed to change a blade here.</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          Only competence can be shared between spaces. The network publishes shared skill
          definitions, called <em>achievements</em>. Each space keeps its own badges and maps
          them to the achievements.
        </p>
        <p>
          A badge from another space can replace the skills check, but not the local
          orientation. The receiving space still shows you the machine and its stop button.
        </p>

        <h2>Definitions</h2>
        {ACHIEVEMENTS.map((a) => (
          <div key={`${a.id}${a.version}`} className="aside" style={{ marginBottom: 16 }}>
            <h3>{a.status}</h3>
            <h2 style={{ fontSize: '1.2rem', marginBottom: 6 }}>
              <a href={`/achievements/${a.id}/v${a.version}`}>{a.name}</a>{' '}
              <span style={{ color: 'var(--ink-3)', fontWeight: 400 }}>v{a.version}</span>
            </h2>
            <p style={{ marginBottom: 10 }}>{a.summary}</p>
            <p style={{ fontSize: '0.85rem', color: 'var(--ink-3)', margin: '0 0 10px' }}>
              {a.competencies.length} competencies ·{' '}
              {a.competencies.filter((c) => c.critical).length} critical ·{' '}
              authorises {label('Capability', a.capability)}
            </p>
            <details>
              <summary style={{ cursor: 'pointer', color: 'var(--accent)' }}>The checklist</summary>
              <ol style={{ paddingLeft: 20, marginTop: 10 }}>
                {a.competencies.map((c) => (
                  <li key={c.id} style={{ marginBottom: 8 }}>
                    {c.statement}
                    {c.critical && <span className="pill flag" style={{ marginLeft: 6 }}>critical</span>}
                    {c.note && (
                      <div style={{ fontSize: '0.85rem', color: 'var(--ink-3)', marginTop: 3 }}>{c.note}</div>
                    )}
                  </li>
                ))}
              </ol>
              <p style={{ fontSize: '0.88rem' }}><strong>Explicitly not covered:</strong> {a.excludes.join('; ')}.</p>
              <p style={{ fontSize: '0.88rem' }}>
                <strong>Stays local, always:</strong> {a.site_specific.join('; ')}.
              </p>
            </details>
          </div>
        ))}

        <h2>When one machine teaches different habits</h2>
        <p>
          Training on a SawStop <em>adds</em> things to know: the brake cartridge, bypass mode,
          and that wet wood will fire the brake. Another shop can cover those in a short
          addendum.
        </p>
        <p>
          It can also leave something out. A video filmed on a saw with a brake may not cover
          working without one, and members who learned with the brake may carry those habits to
          shops without it. So the definition lists this as a critical item. For most shops that
          means adding a minute or two to the training video.
        </p>

        <div className="notice info">
          <h4>These are drafts</h4>
          <p style={{ margin: '4px 0 0' }}>
            A definition stays a draft until more than one space has reviewed it. If you run a
            shop and a checklist is wrong or missing something,{' '}
            <button type="button" className="linkish" onClick={() => openFeedback('Feedback on the badge checklists: ')}>tell us</button>.
            The full write-up is <a href={`${REPO_URL}/blob/main/docs/ACHIEVEMENTS.md`}>on GitHub</a>.
          </p>
        </div>
      </div>
    </>
  );
}
