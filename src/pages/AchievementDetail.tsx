import type { Achievement } from '../types';
import { label, REPO_URL } from '../data';
import { href, navigate } from '../App';

const ASSESSMENT: Record<string, string> = {
  self_attested: 'self-attested',
  knowledge_check: 'knowledge check',
  observed_demonstration: 'observed demonstration',
  supervised_hours: 'supervised hours',
};

export default function AchievementDetail({ a }: { a: Achievement }) {
  const canonical = `https://makerspace.network/achievements/${a.id}/v${a.version}`;

  return (
    <>
      <section className="hero">
        <div className="wrap narrow">
          <p className="eyebrow">
            <a href={href('achievements')} onClick={(e) => { e.preventDefault(); navigate('achievements'); }}>
              Achievements
            </a>{' · '}{a.status}{' · '}{label('Capability', a.capability)}
          </p>
          <h1>{a.name} <span style={{ color: 'var(--ink-3)', fontWeight: 400 }}>v{a.version}</span></h1>
          <p className="lede">{a.summary}</p>
        </div>
      </section>

      <div className="wrap narrow prose" style={{ paddingTop: 26 }}>
        <div className="aside" style={{ marginBottom: 24 }}>
          <h3>Permanent identifier</h3>
          <p style={{ margin: '0 0 6px' }}><code>{canonical}</code></p>
          <p style={{ margin: 0, fontSize: '0.86rem', color: 'var(--ink-2)' }}>
            Use this as the <code>targetUrl</code> in an Open Badges{' '}
            <code>alignment</code>. Published versions are never edited, so this link
            will always mean the same thing. Machine-readable:{' '}
            <a href={`/achievements/${a.id}/v${a.version}.json`}>v{a.version}.json</a>.
          </p>
        </div>

        {a.status !== 'published' && (
          <div className="notice" style={{ marginBottom: 24 }}>
            <h4>This is a {a.status}</h4>
            <p style={{ margin: '4px 0 0' }}>
              This will be published once two or more spaces have checked it against their
              own training. Do not issue credentials against a draft.
            </p>
          </div>
        )}

        <h2>Competencies</h2>
        <p style={{ color: 'var(--ink-2)' }}>
          Each item applies at any space. Anything that depends on one shop's layout, rules
          or equipment is under "Stays local" below.
        </p>
        <div className="scroll-x">
          <table className="data">
            <thead>
              <tr><th></th><th>The holder…</th><th>Assessed at least by</th></tr>
            </thead>
            <tbody>
              {a.competencies.map((c) => (
                <tr key={c.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <code>{c.id}</code>
                    {c.critical && <div><span className="pill flag">critical</span></div>}
                  </td>
                  <td>
                    {c.statement}
                    {c.note && <div style={{ fontSize: '0.86rem', color: 'var(--ink-3)', marginTop: 4 }}>{c.note}</div>}
                  </td>
                  <td style={{ whiteSpace: 'nowrap', color: 'var(--ink-2)' }}>
                    {ASSESSMENT[c.min_assessment] ?? c.min_assessment}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={{ fontSize: '0.88rem', color: 'var(--ink-3)' }}>
          A local badge missing any <strong>critical</strong> item cannot claim alignment.
        </p>

        <h2>Explicitly not covered</h2>
        <ul>{a.excludes.map((e) => <li key={e}>{e}</li>)}</ul>

        <h2>Stays local, always</h2>
        <p style={{ color: 'var(--ink-2)' }}>
          The receiving space always covers these, whatever badge someone arrives with.
        </p>
        <ul>{a.site_specific.map((e) => <li key={e}>{e}</li>)}</ul>

        {(a.brand_deltas?.length ?? 0) > 0 && (
          <>
            <h2>Specific machines</h2>
            {a.brand_deltas!.map((b) => (
              <div key={b.key} className="aside" style={{ marginBottom: 12 }}>
                <h3>{b.key}</h3>
                <h4 style={{ marginBottom: 8 }}>{b.label}</h4>
                <p style={{ margin: '0 0 4px', fontSize: '0.88rem', color: 'var(--ink-3)' }}>Adds</p>
                <ul style={{ marginTop: 0 }}>{b.adds.map((x) => <li key={x}>{x}</li>)}</ul>
                {b.asymmetry && (
                  <div className="notice" style={{ marginTop: 10 }}>
                    <h4>Where it can leave a gap</h4>
                    <p style={{ margin: '4px 0 0' }}>{b.asymmetry}</p>
                  </div>
                )}
              </div>
            ))}
          </>
        )}

        <h2>Aligning a badge to this</h2>
        <p>
          Keep your own badge name. Go through the checklist with whoever runs the shop, note
          where each item is covered and how it is checked, and record the answers in the{' '}
          <a href={`${REPO_URL}/tree/main/data/alignments`}>alignment files</a>. Any item marked{' '}
          <code>no</code> or <code>partial</code> goes on your list of things to add.
        </p>
      </div>
    </>
  );
}
