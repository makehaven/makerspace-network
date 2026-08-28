import { ACHIEVEMENTS, label, REPO_URL } from '../data';

export default function Achievements() {
  return (
    <>
      <section className="hero">
        <div className="wrap narrow">
          <p className="eyebrow">Draft framework</p>
          <h1>Badges that travel</h1>
          <p className="lede">
            If you learned the table saw at one space, that should mean something at the next
            one. Making it mean something takes a shared definition of what was actually
            assessed — not a shared badge.
          </p>
        </div>
      </section>

      <div className="wrap narrow prose" style={{ paddingTop: 26 }}>
        <h2>The problem</h2>
        <p>
          MakeHaven issues a <em>SawStop</em> badge, not a table saw badge. That is not sloppy —
          the shop manager filmed the training on the machine that is actually in the room, and
          a video hedging about where your saw's riving knife might be is a worse video.
          Tool-specific training is better training. It is also non-portable.
        </p>

        <h2>A badge is two things wearing one name</h2>
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
          Only the first belongs in a credential. So the network publishes <em>achievements</em>;
          a space keeps its own badges and <em>aligns</em> them. Nobody renames anything.
        </p>
        <p>
          Which means a credential is not a key. It substitutes for the competence assessment,
          never for the local orientation — the receiving space still walks you to the machine
          and shows you the stop button, which they were always going to do.
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

        <h2>The asymmetry</h2>
        <p>
          Training on a SawStop <em>adds</em> knowledge — the brake cartridge, bypass mode, that
          wet stock will fire it. That is a short addendum at another shop, not another badge.
        </p>
        <p>
          But it can also <em>subtract</em>. A video shot on a braked saw has little reason to
          discuss operating without one, and habits formed with a safety net travel to shops
          that have none. So the definition carries that as its own critical item — which turns
          the conversation with a shop manager from "your badge is too specific" into "add ninety
          seconds to the video." That is a request someone will say yes to.
        </p>

        <div className="notice info">
          <h4>These are drafts, and deliberately so</h4>
          <p style={{ margin: '4px 0 0' }}>
            A definition written by one space is a draft, not a standard — the validator
            enforces that. If you run a shop and this checklist is wrong, missing something, or
            asks for something nobody actually tests,{' '}
            <a href={`${REPO_URL}/blob/main/docs/ACHIEVEMENTS.md`}>that is the useful feedback</a>.
          </p>
        </div>
      </div>
    </>
  );
}
