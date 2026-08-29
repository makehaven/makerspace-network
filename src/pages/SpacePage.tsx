import { spaceById, label, CAPABILITY_DOMAINS, CAPABILITIES, completeness, VOCAB, REPO_URL } from '../data';
import { href, navigate } from '../App';
import Logo from '../components/Logo';

export default function SpacePage({ id }: { id: string }) {
  const s = spaceById(id);
  if (!s) return <div className="wrap"><p>No such space.</p></div>;

  const ops = s.operations ?? {};
  const addr = s.address ?? {};
  const { missing } = completeness(s);
  const caps = new Set(s.capabilities ?? []);
  const mapQuery = addr.latitude !== undefined
    ? `${addr.latitude},${addr.longitude}`
    : [s.name, addr.street, addr.locality, addr.region].filter(Boolean).join(', ');

  return (
    <>
      <section className="hero">
        <div className="wrap" style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
          <Logo space={s} large />
          <div style={{ minWidth: 0 }}>
            <p className="eyebrow">
              <a href={href('directory')} onClick={(e) => { e.preventDefault(); navigate('directory'); }}>
                Directory
              </a>
              {' · '}{label('SpaceKind', s.kind)}
            </p>
            <h1>{s.name}</h1>
            {s.summary && <p className="lede">{s.summary}</p>}
          </div>
        </div>
      </section>

      <div className="wrap" style={{ paddingTop: 26 }}>
        <div className="detail-grid">
          <div>
            {(s.capabilities?.length ?? 0) > 0 && (
              <section className="section">
                <h2>What you can make here</h2>
                {CAPABILITY_DOMAINS.map((d) => {
                  const inDomain = CAPABILITIES.filter((c) => c.domain === d.id && caps.has(c.id));
                  if (!inDomain.length) return null;
                  return (
                    <div className="cap-domain" key={d.id}>
                      <h4>{d.label}</h4>
                      <div className="tags">
                        {inDomain.map((c) => <span className="tag on" key={c.id}>{c.label}</span>)}
                      </div>
                    </div>
                  );
                })}
                {s.verification.status === 'imported' && (
                  <p style={{ fontSize: '0.85rem', color: 'var(--ink-3)', marginTop: 10 }}>
                    Inferred from published descriptions, not confirmed by the space.
                  </p>
                )}
              </section>
            )}

            <section className="section">
              <h2>Practical detail</h2>
              <dl className="kv">
                {ops.access_model && (<><dt>Getting in</dt><dd>{label('AccessModel', ops.access_model)}</dd></>)}
                {ops.public_access !== undefined && (
                  <><dt>Non-members</dt><dd>{ops.public_access ? 'Can use the space by some route' : 'Members or affiliates only'}</dd></>
                )}
                {(ops.membership_models?.length ?? 0) > 0 && (
                  <><dt>Membership</dt><dd>{ops.membership_models!.map((m) => label('MembershipModel', m)).join(', ')}</dd></>
                )}
                {ops.monthly_cost_usd && (
                  <><dt>Monthly</dt><dd>
                    ${ops.monthly_cost_usd.min}{ops.monthly_cost_usd.max ? `–$${ops.monthly_cost_usd.max}` : ''}
                    {ops.monthly_cost_usd.as_of && <span style={{ color: 'var(--ink-3)' }}> (as of {ops.monthly_cost_usd.as_of})</span>}
                  </dd></>
                )}
                {ops.minor_policy && (<><dt>Under 18</dt><dd>{label('MinorPolicy', ops.minor_policy)}</dd></>)}
                {ops.tool_lending !== undefined && (<><dt>Tool lending</dt><dd>{ops.tool_lending ? 'Yes' : 'No'}</dd></>)}
                {ops.tax_status && (<><dt>Organisation</dt><dd>{label('TaxStatus', ops.tax_status)}</dd></>)}
                {ops.square_feet && (<><dt>Size</dt><dd>{ops.square_feet.toLocaleString()} sq ft</dd></>)}
                {ops.hours_note && (<><dt>Hours</dt><dd>{ops.hours_note}</dd></>)}
              </dl>
            </section>

            {missing.length > 0 && (
              <div className="notice section">
                <h4>Still to confirm</h4>
                <p style={{ margin: '4px 0 6px' }}>
                  Written down as missing rather than guessed at:
                </p>
                <ul>{missing.map((m) => <li key={m}>{m}</li>)}</ul>
                <p style={{ margin: '10px 0 0' }}>
                  If you run this space,{' '}
                  <a href={href('for-spaces')}
                     onClick={(e) => { if (e.metaKey || e.ctrlKey) return; e.preventDefault(); navigate('for-spaces'); }}>
                    claim the listing
                  </a>{' '}and the record becomes yours to correct — or{' '}
                  <a href={`${REPO_URL}/blob/main/data/spaces/${s.id}.json`}>edit the file directly</a>.
                </p>
              </div>
            )}

            <section className="section">
              <h2>Where this record comes from</h2>
              <p style={{ fontSize: '0.92rem', color: 'var(--ink-2)' }}>
                {label('VerificationStatus', s.verification.status)}
                {s.verification.verified_by && ` — checked by ${s.verification.verified_by}`}
                {s.verification.verified_on && ` on ${s.verification.verified_on}`}.
              </p>
              <div className="scroll-x">
                <table className="data">
                  <thead><tr><th>Source</th><th>Retrieved</th><th>Note</th></tr></thead>
                  <tbody>
                    {s.sources.map((src, i) => (
                      <tr key={i}>
                        <td>{src.url
                          ? <a href={src.url}>{VOCAB.SourceSystem.get(src.system)?.label ?? src.system}</a>
                          : (VOCAB.SourceSystem.get(src.system)?.label ?? src.system)}</td>
                        <td style={{ whiteSpace: 'nowrap' }}>{src.retrieved}</td>
                        <td style={{ color: 'var(--ink-3)' }}>{src.note}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          <aside>
            <div className="aside" style={{ marginBottom: 14 }}>
              <h3>Visit</h3>
              {addr.street ? (
                <p style={{ margin: '0 0 8px' }}>
                  {addr.street}{addr.street_2 && <><br />{addr.street_2}</>}<br />
                  {addr.locality}{addr.region ? `, ${addr.region}` : ''} {addr.postal_code}
                </p>
              ) : (
                <p style={{ margin: '0 0 8px', color: 'var(--ink-3)' }}>
                  Address not yet recorded{addr.locality ? ` — ${addr.locality}` : ''}
                  {addr.county ? `${addr.locality ? ', ' : ' — '}${addr.county} County` : ''}
                </p>
              )}
              {addr.notes && <p style={{ fontSize: '0.86rem', color: 'var(--ink-2)' }}>{addr.notes}</p>}
              {mapQuery && (
                <p style={{ margin: '0 0 10px' }}>
                  <a href={`https://www.openstreetmap.org/search?query=${encodeURIComponent(mapQuery)}`}>
                    Open in map
                  </a>
                </p>
              )}
              {s.contact?.website && <p style={{ margin: '0 0 4px' }}><a href={s.contact.website}>{new URL(s.contact.website).hostname}</a></p>}
              {s.contact?.email && <p style={{ margin: '0 0 4px' }}><a href={`mailto:${s.contact.email}`}>{s.contact.email}</a></p>}
              {s.contact?.phone && <p style={{ margin: 0 }}>{s.contact.phone}</p>}
              {s.contact?.website && (
                <p style={{ marginTop: 12, marginBottom: 0 }}>
                  <a className="btn" href={s.contact.website}>Visit site</a>
                </p>
              )}
            </div>

            {s.endpoints?.spaceapi && (
              <div className="aside" style={{ marginBottom: 14 }}>
                <h3>Live status</h3>
                <p style={{ margin: 0 }}>
                  This space publishes a <a href="https://spaceapi.io">SpaceAPI</a> endpoint —
                  it is the authority for anything it carries.
                </p>
              </div>
            )}

            {(s.external_refs?.length ?? 0) > 0 && (
              <div className="aside">
                <h3>Also listed on</h3>
                {s.external_refs!.map((r) => (
                  <p key={r.system} style={{ margin: '0 0 4px' }}>
                    {r.url ? <a href={r.url}>{VOCAB.SourceSystem.get(r.system)?.label ?? r.system}</a>
                           : (VOCAB.SourceSystem.get(r.system)?.label ?? r.system)}
                  </p>
                ))}
              </div>
            )}
          </aside>
        </div>
      </div>
    </>
  );
}
