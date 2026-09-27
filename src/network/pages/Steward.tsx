import { useEffect, useMemo, useState } from 'react';
import { useSession } from '../session';
import { can } from '../capabilities';
import { REGIONS, SPACES } from '../../data';
import {
  listMembershipsVisibleTo, loadPeople, listSpaceIndex, setMembership, setSizeTier, syncSpaceIndex,
  listStewardships, findPersonByEmail, grantStewardship,
} from '../db';
import { stateName, type Membership, type Person, type SpaceIndex, type Stewardship, type SizeTier, type SpaceRole } from '../model';
import { FUNCTIONS, PageLink, SignIn, StatusPill, csvEsc, download, functionLabel, roleLabel } from './shared';

type Row = Membership & { id: string; person?: Person; space?: SpaceIndex };

export default function Steward() {
  const s = useSession();
  const allowed = can(s, 'steward.view') || s.memberships.some((m) => m.status === 'active' && m.role === 'space_admin');
  const [tab, setTab] = useState<'people' | 'spaces' | 'stewards'>('people');

  return (
    <>
      <section className="hero">
        <div className="wrap narrow">
          <p className="eyebrow">Steward</p>
          <h1>Convene the network</h1>
          <p className="lede">
            Who is at each space, who is waiting to be confirmed, and who to invite to which
            meeting. Regions steward records; the people are one network.
          </p>
        </div>
      </section>
      <div className="wrap" style={{ paddingTop: 10, paddingBottom: 60 }}>
        {s.status === 'loading' && <p>Loading…</p>}
        {s.status === 'signed_out' && <div className="narrow"><SignIn /></div>}
        {s.status === 'signed_in' && !allowed && (
          <p className="notice narrow">This page is for regional stewards, network admins and space admins. <PageLink page="join">Your profile</PageLink>.</p>
        )}
        {allowed && (
          <>
            <div className="tabs">
              <button className={tab === 'people' ? 'on' : ''} onClick={() => setTab('people')}>People</button>
              <button className={tab === 'spaces' ? 'on' : ''} onClick={() => setTab('spaces')}>Spaces</button>
              {s.stewardship?.network_admin && <button className={tab === 'stewards' ? 'on' : ''} onClick={() => setTab('stewards')}>Stewards</button>}
            </div>
            {tab === 'people' && <PeopleTab />}
            {tab === 'spaces' && <SpacesTab />}
            {tab === 'stewards' && <StewardsTab />}
          </>
        )}
      </div>
    </>
  );
}

function useVisible() {
  const s = useSession();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [spaces, setSpaces] = useState<Map<string, SpaceIndex & { id: string }>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const load = async () => {
    try {
      const [ms, idx] = await Promise.all([
        listMembershipsVisibleTo({
          uid: s.user!.uid,
          networkAdmin: !!s.stewardship?.network_admin,
          regionIds: s.stewardship?.region_ids ?? [],
          adminSpaceIds: s.memberships.filter((m) => m.status === 'active' && m.role === 'space_admin').map((m) => m.space_id),
        }),
        listSpaceIndex(),
      ]);
      const people = await loadPeople(ms.map((m) => m.person_id));
      const byId = new Map(idx.map((x) => [x.id, x]));
      setSpaces(byId);
      setRows(ms.map((m) => ({ ...m, person: people.get(m.person_id), space: byId.get(m.space_id) })));
      setError(null);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };
  useEffect(() => { void load(); }, [s.user?.uid]); // eslint-disable-line react-hooks/exhaustive-deps
  return { rows, spaces, error, reload: load };
}

function PeopleTab() {
  const s = useSession();
  const { rows, error, reload } = useVisible();
  const [status, setStatus] = useState('');
  const [state, setState] = useState('');
  const [tier, setTier] = useState('');
  const [fn, setFn] = useState('');
  const [invitesOnly, setInvitesOnly] = useState(false);
  const [copied, setCopied] = useState(false);

  const states = useMemo(() => [...new Set((rows ?? []).map((r) => r.state).filter(Boolean))].sort() as string[], [rows]);
  const shown = useMemo(() => (rows ?? []).filter((r) =>
    (!status || r.status === status) && (!state || r.state === state)
    && (!tier || r.space?.size_tier === tier) && (!fn || r.functions.includes(fn))
    && (!invitesOnly || (r.invitations && r.status === 'active')))
    .sort((a, b) => (a.status === 'pending' ? 0 : 1) - (b.status === 'pending' ? 0 : 1) || (a.person?.name ?? '').localeCompare(b.person?.name ?? '')),
    [rows, status, state, tier, fn, invitesOnly]);

  const emails = shown.filter((r) => r.person?.email && r.invitations && r.status === 'active').map((r) => r.person!.email);
  const act = async (r: Row, patch: { role?: SpaceRole; status?: Membership['status'] }) => {
    if (!r.person || !r.space) return;
    await setMembership(s.user!.uid, r, r.person, r.space.name, patch);
    await reload();
  };
  const exportCsv = () => {
    const head = ['Name', 'Email', 'Phone', 'Space', 'State', 'Region', 'Size tier', 'Role', 'Status', 'Functions', 'Invitations'];
    const lines = shown.map((r) => [r.person?.name, r.person?.email, r.person?.phone, r.space?.name, r.state, r.region_id,
      r.space?.size_tier, r.role, r.status, r.functions.map(functionLabel).join('; '), r.invitations ? 'yes' : 'no']);
    download('network-people.csv', [head, ...lines].map((l) => l.map(csvEsc).join(',')).join('\n'));
  };

  return (
    <>
      <div className="filters">
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Any status</option>
          {['pending', 'active', 'suspended', 'revoked'].map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
        <select value={state} onChange={(e) => setState(e.target.value)}>
          <option value="">Every state</option>
          {states.map((st) => <option key={st} value={st}>{stateName(st)}</option>)}
        </select>
        <select value={tier} onChange={(e) => setTier(e.target.value)}>
          <option value="">Any size</option>
          {['small', 'medium', 'large'].map((x) => <option key={x} value={x}>{x} spaces</option>)}
        </select>
        <select value={fn} onChange={(e) => setFn(e.target.value)}>
          <option value="">Any function</option>
          {FUNCTIONS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
        </select>
        <label className="check"><input type="checkbox" checked={invitesOnly} onChange={(e) => setInvitesOnly(e.target.checked)} /> Wants invitations</label>
        <span className="count">{rows ? `${shown.length} of ${rows.length}` : ''}</span>
      </div>
      <div className="btn-row" style={{ marginTop: 0 }}>
        <button className="btn ghost small" disabled={!emails.length} onClick={async () => {
          await navigator.clipboard.writeText(emails.join(', ')); setCopied(true); setTimeout(() => setCopied(false), 2000);
        }}>{copied ? 'Copied' : `Copy ${emails.length} invitation email${emails.length === 1 ? '' : 's'}`}</button>
        <button className="btn ghost small" disabled={!shown.length} onClick={exportCsv}>Download CSV</button>
      </div>
      {error && <p className="error">{error}</p>}
      {rows && rows.length === 0 && <p className="muted">Nobody has joined in your scope yet.</p>}
      {shown.length > 0 && (
        <div className="scroll-x">
          <table className="data">
            <thead><tr><th>Person</th><th>Space</th><th>Role</th><th>Status</th><th>Does</th><th></th></tr></thead>
            <tbody>
              {shown.map((r) => {
                const canAct = can(s, 'membership.confirm', { spaceId: r.space_id, regionId: r.region_id });
                return (
                  <tr key={r.id} className={r.status === 'pending' ? 'warn-row' : ''}>
                    <td><strong>{r.person?.name ?? r.person_id}</strong><br /><span className="muted">{r.person?.email}</span></td>
                    <td>{r.space?.name ?? r.space_id}{r.space?.proposed && <span className="pill flag" style={{ marginLeft: 6 }}>proposed</span>}<br />
                        <span className="muted">{stateName(r.state)}{r.space?.size_tier ? ` · ${r.space.size_tier}` : ''}</span></td>
                    <td>{canAct
                      ? <select value={r.role} onChange={(e) => void act(r, { role: e.target.value as SpaceRole })}>
                          {(['space_admin', 'space_editor', 'space_contact'] as const).map((x) => <option key={x} value={x}>{roleLabel(x)}</option>)}
                        </select>
                      : roleLabel(r.role)}</td>
                    <td><StatusPill status={r.status} />{!r.invitations && <><br /><span className="muted">no invitations</span></>}</td>
                    <td>{r.functions.map((f) => <span key={f} className="tag">{functionLabel(f)}</span>)}</td>
                    <td className="actions">
                      {canAct && r.status === 'pending' && <button className="btn small" onClick={() => void act(r, { status: 'active' })}>Confirm</button>}
                      {canAct && r.status === 'active' && r.person_id !== s.user?.uid && <button className="btn ghost small" onClick={() => void act(r, { status: 'suspended' })}>Suspend</button>}
                      {canAct && r.status === 'suspended' && <button className="btn ghost small" onClick={() => void act(r, { status: 'active' })}>Reinstate</button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function SpacesTab() {
  const s = useSession();
  const { rows, spaces, error, reload } = useVisible();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows ?? []) if (r.status === 'active') m.set(r.space_id, (m.get(r.space_id) ?? 0) + 1);
    return m;
  }, [rows]);
  const list = [...spaces.values()].sort((a, b) => a.name.localeCompare(b.name));
  const unsynced = SPACES.filter((sp) => !spaces.has(sp.id)).length;

  return (
    <>
      {can(s, 'index.sync') && (
        <div className="btn-row" style={{ marginTop: 14 }}>
          <button className="btn ghost small" disabled={busy} onClick={async () => {
            setBusy(true);
            try { const n = await syncSpaceIndex(SPACES, REGIONS); setMsg(`Synced ${n} directory spaces.`); await reload(); }
            catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
            setBusy(false);
          }}>{busy ? 'Syncing…' : `Sync directory into the index${unsynced ? ` (${unsynced} missing)` : ''}`}</button>
          {msg && <span className="muted">{msg}</span>}
        </div>
      )}
      {error && <p className="error">{error}</p>}
      <p className="muted">A space with fewer than two active people is one departure from going dark.</p>
      <div className="scroll-x">
        <table className="data">
          <thead><tr><th>Space</th><th>State</th><th>Region</th><th>Size</th><th>Active people</th><th>Claimed</th></tr></thead>
          <tbody>
            {list.map((sp) => {
              const n = counts.get(sp.id) ?? 0;
              const editable = can(s, 'space.set_size_tier', { spaceId: sp.id, regionId: sp.region_id });
              return (
                <tr key={sp.id} className={n < 2 && !sp.proposed ? 'warn-row' : ''}>
                  <td><strong>{sp.name}</strong>{sp.proposed && <span className="pill flag" style={{ marginLeft: 6 }}>proposed</span>}<br />
                      <span className="muted">{sp.city}{sp.website ? ` · ${sp.website.replace(/^https?:\/\//, '')}` : ''}</span></td>
                  <td>{stateName(sp.state)}</td>
                  <td>{sp.region_id ?? <span className="muted">none yet</span>}</td>
                  <td>{editable
                    ? <select value={sp.size_tier ?? ''} onChange={async (e) => { await setSizeTier(sp.id, (e.target.value || null) as SizeTier | null); await reload(); }}>
                        <option value="">—</option>{['small', 'medium', 'large'].map((x) => <option key={x} value={x}>{x}</option>)}
                      </select>
                    : (sp.size_tier ?? '—')}</td>
                  <td>{n}</td>
                  <td>{sp.claimed ? 'yes' : <span className="muted">no</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function StewardsTab() {
  const s = useSession();
  const [list, setList] = useState<(Stewardship & { id: string; person?: Person })[]>([]);
  const [email, setEmail] = useState('');
  const [regionIds, setRegionIds] = useState<string[]>([]);
  const [admin, setAdmin] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const load = async () => {
    const st = await listStewardships();
    const people = await loadPeople(st.map((x) => x.id));
    setList(st.map((x) => ({ ...x, person: people.get(x.id) })));
  };
  useEffect(() => { void load(); }, []);

  return (
    <>
      <div className="scroll-x" style={{ marginTop: 14 }}>
        <table className="data">
          <thead><tr><th>Person</th><th>Regions</th><th>Network admin</th></tr></thead>
          <tbody>
            {list.map((x) => (
              <tr key={x.id}>
                <td><strong>{x.person?.name ?? x.id}</strong><br /><span className="muted">{x.person?.email}</span></td>
                <td>{x.region_ids.map((r) => REGIONS.find((g) => g.id === r)?.name ?? r).join(', ') || '—'}</td>
                <td>{x.network_admin ? 'yes' : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <form className="card form-card" style={{ marginTop: 20 }} onSubmit={async (e) => {
        e.preventDefault(); setMsg(null);
        const p = await findPersonByEmail(email);
        if (!p) { setMsg('No signed-up person has that email. They need to join first.'); return; }
        await grantStewardship(s.user!.uid, p.id, { region_ids: regionIds, network_admin: admin });
        setMsg(`Granted to ${p.name}.`); setEmail(''); await load();
      }}>
        <h2>Grant a stewardship</h2>
        <label className="field"><span>Their email (must have joined already)</span>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <div className="checks">
          {REGIONS.map((r) => (
            <label key={r.id} className={`check ${regionIds.includes(r.id) ? 'on' : ''}`}>
              <input type="checkbox" checked={regionIds.includes(r.id)}
                     onChange={(e) => setRegionIds(e.target.checked ? [...regionIds, r.id] : regionIds.filter((x) => x !== r.id))} />
              Steward of {r.name}
            </label>
          ))}
          <label className={`check ${admin ? 'on' : ''}`}><input type="checkbox" checked={admin} onChange={(e) => setAdmin(e.target.checked)} /> Network admin</label>
        </div>
        {msg && <p className="muted" style={{ marginTop: 10 }}>{msg}</p>}
        <div className="btn-row"><button className="btn">Grant</button></div>
      </form>
    </>
  );
}
