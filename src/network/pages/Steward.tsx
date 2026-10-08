import { useEffect, useMemo, useState } from 'react';
import { useSession } from '../session';
import { can } from '../capabilities';
import { listFeedback, type Feedback } from '../feedback';
import { listSummaries, type AssessmentSummary } from '../standardsData';
import { levelLabel } from '../../standards/framework';
import { REGIONS, SPACES, VOCAB, label, spaceById } from '../../data';
import { listListingSubmissions, listingFromRecord, markListingMerged, type ListingAnswers, type ListingSubmission } from '../spaceData';
import {
  listMembershipsVisibleTo, listRoster, loadPeople, listSpaceIndex, setMembership, setSizeTier, syncSpaceIndex,
  listStewardships, findPersonByEmail, grantStewardship, addPartnerOrg, addGroupMembers, listGroups, mergeOrganisation,
} from '../db';
import { normalizeUrl, stateName, US_STATES, type Group, type Membership, type PartnerType, type Person, type SpaceIndex, type Stewardship, type SizeTier, type SpaceRole } from '../model';
import { FUNCTIONS, PARTNER_TYPES, PageLink, SignIn, StatusPill, csvEsc, download, functionLabel, partnerTypeLabel, roleLabel, stewardRegionIds } from './shared';
import { MeetingForm, MeetingsTab } from './Meetings';
import { InvitationsTab } from './Invitations';
import { managesGroup } from './Groups';

/** `rosterName` covers a space admin looking at someone whose primary space
 *  is elsewhere: their people document is not readable, their roster entry is. */
type Row = Membership & { id: string; person?: Person; space?: SpaceIndex; rosterName?: string };

export default function Steward() {
  const s = useSession();
  const allowed = can(s, 'steward.view') || s.memberships.some((m) => m.status === 'active' && m.role === 'space_admin');
  type Tab = 'people' | 'invitations' | 'meetings' | 'spaces' | 'listings' | 'stewards' | 'feedback';
  const [tab, setTab] = useState<Tab>(() => {
    const t = new URLSearchParams(window.location.search).get('tab');
    return (['people', 'invitations', 'meetings', 'spaces', 'listings', 'stewards', 'feedback'] as const).find((x) => x === t) ?? 'people';
  });

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
              <button className={tab === 'invitations' ? 'on' : ''} onClick={() => setTab('invitations')}>Invitations</button>
              {can(s, 'meeting.convene') && <button className={tab === 'meetings' ? 'on' : ''} onClick={() => setTab('meetings')}>Meetings</button>}
              <button className={tab === 'spaces' ? 'on' : ''} onClick={() => setTab('spaces')}>Spaces</button>
              {!!s.stewardship && <button className={tab === 'listings' ? 'on' : ''} onClick={() => setTab('listings')}>Listings</button>}
              {s.stewardship?.network_admin && <button className={tab === 'stewards' ? 'on' : ''} onClick={() => setTab('stewards')}>Stewards</button>}
              {!!s.stewardship && <button className={tab === 'feedback' ? 'on' : ''} onClick={() => setTab('feedback')}>Feedback</button>}
            </div>
            {tab === 'people' && <PeopleTab />}
            {tab === 'invitations' && <InvitationsTab />}
            {tab === 'meetings' && <MeetingsTab />}
            {tab === 'spaces' && <SpacesTab />}
            {tab === 'listings' && <ListingsTab />}
            {tab === 'stewards' && <StewardsTab />}
            {tab === 'feedback' && <FeedbackTab />}
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
      const canList = !!s.stewardship && (s.stewardship.network_admin || s.stewardship.region_ids.length > 0);
      const [ms, idx, roster] = await Promise.all([
        listMembershipsVisibleTo({
          uid: s.user!.uid,
          networkAdmin: !!s.stewardship?.network_admin,
          regionIds: s.stewardship?.region_ids ?? [],
          adminSpaceIds: s.memberships.filter((m) => m.status === 'active' && m.role === 'space_admin').map((m) => m.space_id),
        }),
        listSpaceIndex(),
        listRoster().catch(() => []),
      ]);
      const people = await loadPeople(ms.map((m) => m.person_id), { canList });
      const names = new Map(roster.map((r) => [r.id, r.name]));
      const byId = new Map(idx.map((x) => [x.id, x]));
      setSpaces(byId);
      setRows(ms.map((m) => ({ ...m, person: people.get(m.person_id), rosterName: names.get(m.person_id), space: byId.get(m.space_id) })));
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
  const [kind, setKind] = useState('');
  const [invitesOnly, setInvitesOnly] = useState(false);
  const [copied, setCopied] = useState(false);
  const [convening, setConvening] = useState(false);

  const states = useMemo(() => [...new Set((rows ?? []).map((r) => r.state).filter(Boolean))].sort() as string[], [rows]);
  const shown = useMemo(() => (rows ?? []).filter((r) =>
    (!status || r.status === status) && (!state || r.state === state)
    && (!tier || r.space?.size_tier === tier) && (!fn || r.functions.includes(fn))
    && (!kind || (kind === 'makerspace' ? r.space?.kind !== 'partner' : r.space?.kind === 'partner'
        && (kind === 'partner' || r.space?.partner_type === kind)))
    && (!invitesOnly || (r.invitations && r.status === 'active')))
    .sort((a, b) => (a.status === 'pending' ? 0 : 1) - (b.status === 'pending' ? 0 : 1) || (a.person?.name ?? '').localeCompare(b.person?.name ?? '')),
    [rows, status, state, tier, fn, kind, invitesOnly]);

  const emails = shown.filter((r) => r.person?.email && r.invitations && r.status === 'active').map((r) => r.person!.email);
  // One seat per person, however many spaces they belong to.
  const invitees = [...new Map(shown.filter((r) => r.invitations && r.status === 'active')
    .map((r) => [r.person_id, { uid: r.person_id, name: r.person?.name ?? r.rosterName ?? r.person_id }])).values()];
  const audience = [
    state ? stateName(state) : 'Every state',
    kind === 'makerspace' ? 'Makerspaces' : kind === 'partner' ? 'Partners' : kind && partnerTypeLabel(kind),
    tier && `${tier} spaces`, fn && functionLabel(fn),
  ].filter(Boolean).join(' · ');
  const act = async (r: Row, patch: { role?: SpaceRole; status?: Membership['status'] }) => {
    if (!r.space) return;
    await setMembership(s.user!.uid, r, r.person ?? null, r.space.name, patch);
    await reload();
  };
  const exportCsv = () => {
    const head = ['Name', 'Email', 'Phone', 'Organisation', 'Kind', 'State', 'Region', 'Size tier', 'Role', 'Status', 'Functions', 'Invitations'];
    const lines = shown.map((r) => [r.person?.name, r.person?.email, r.person?.phone, r.space?.name,
      r.space?.kind === 'partner' ? partnerTypeLabel(r.space.partner_type) : 'Makerspace', r.state, r.region_id,
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
        <select value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="">Makerspaces and partners</option>
          <option value="makerspace">Makerspaces only</option>
          <option value="partner">Partners only</option>
          {PARTNER_TYPES.map((t) => <option key={t.id} value={t.id}>Partners: {t.label}</option>)}
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
        {can(s, 'meeting.convene') && (
          <button className="btn small" disabled={!invitees.length} onClick={() => setConvening(true)}>
            Invite these {invitees.length} to a meeting</button>
        )}
      </div>
      {can(s, 'meeting.convene') && <AddToGroup people={invitees} />}
      {convening && <MeetingForm invitees={invitees} audience={audience}
        onDone={() => setConvening(false)} onCancel={() => setConvening(false)} />}
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
                    <td><strong>{r.person?.name ?? r.rosterName ?? r.person_id}</strong><br />
                        <span className="muted">{r.person?.email ?? (r.person ? '' : 'primary space is elsewhere')}</span></td>
                    <td>{r.space?.name ?? r.space_id}{r.space?.proposed && <span className="pill flag" style={{ marginLeft: 6 }}>proposed</span>}<br />
                        <span className="muted">{stateName(r.state)}{r.space?.kind === 'partner' ? ` · ${partnerTypeLabel(r.space.partner_type)}`
                          : r.space?.size_tier ? ` · ${r.space.size_tier}` : ''}</span></td>
                    <td>{canAct && r.role !== 'partner'
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
  const list = [...spaces.values()].sort((a, b) => (a.kind === 'partner' ? 1 : 0) - (b.kind === 'partner' ? 1 : 0) || a.name.localeCompare(b.name));
  const unsynced = SPACES.filter((sp) => !spaces.has(sp.id)).length;
  // Standards summaries a space chose to share. Only stewards may list them.
  const [levels, setLevels] = useState<Map<string, AssessmentSummary>>(new Map());
  useEffect(() => { if (s.stewardship) listSummaries().then(setLevels).catch(() => undefined); }, [s.stewardship]);

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
      <p className="muted">A space with fewer than two active people is one departure from going dark. Partner organisations are listed after the spaces.</p>
      <div className="scroll-x">
        <table className="data">
          <thead><tr><th>Organisation</th><th>State</th><th>Region</th><th>Size or type</th><th>Active people</th><th>Claimed</th><th>Standards</th></tr></thead>
          <tbody>
            {list.map((sp) => {
              const n = counts.get(sp.id) ?? 0;
              const editable = can(s, 'space.set_size_tier', { spaceId: sp.id, regionId: sp.region_id });
              return (
                <tr key={sp.id} className={n < 2 && !sp.proposed && sp.kind !== 'partner' ? 'warn-row' : ''}>
                  <td><strong>{sp.name}</strong>{sp.proposed && <span className="pill flag" style={{ marginLeft: 6 }}>proposed</span>}<br />
                      <span className="muted">{sp.city}{sp.website ? ` · ${sp.website.replace(/^https?:\/\//, '')}` : ''}</span>
                      {sp.proposed && s.stewardship?.network_admin && (
                        <MergeControl from={sp} options={list.filter((x) => !x.proposed && (x.kind ?? 'makerspace') === (sp.kind ?? 'makerspace'))}
                                      onMerged={async (msg) => { setMsg(msg); await reload(); }} />
                      )}</td>
                  <td>{stateName(sp.state)}</td>
                  <td>{sp.region_id ?? <span className="muted">none yet</span>}</td>
                  <td>{sp.kind === 'partner' ? <span className="tag">{partnerTypeLabel(sp.partner_type)}</span> : editable
                    ? <select value={sp.size_tier ?? ''} onChange={async (e) => { await setSizeTier(sp.id, (e.target.value || null) as SizeTier | null); await reload(); }}>
                        <option value="">—</option>{['small', 'medium', 'large'].map((x) => <option key={x} value={x}>{x}</option>)}
                      </select>
                    : (sp.size_tier ?? '—')}</td>
                  <td>{n}</td>
                  <td>{sp.claimed ? 'yes' : <span className="muted">no</span>}</td>
                  <td>{levels.get(sp.id) ? <span title={`Shared ${levels.get(sp.id)!.shared_at.slice(0, 10)}`}>{levelLabel(levels.get(sp.id)!.level)}</span> : <span className="muted">—</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {(s.stewardship?.network_admin || (s.stewardship?.region_ids.length ?? 0) > 0) && <PartnerForm onAdded={reload} />}
    </>
  );
}

/** Agencies, funders, support organisations and the like: in the network, not
 *  in the directory. A steward adds them for their region; people at them then
 *  join as partners and the steward confirms them. */
function PartnerForm({ onAdded }: { onAdded: () => Promise<void> }) {
  const s = useSession();
  const regions = stewardRegionIds(s.stewardship);
  const [f, setF] = useState({ name: '', partner_type: '' as PartnerType | '', website: '', city: '', state: '', region_id: regions[0] ?? '' });
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <form className="card form-card" style={{ marginTop: 20 }} onSubmit={async (e) => {
      e.preventDefault(); setMsg(null);
      try {
        await addPartnerOrg(s.user!.uid, {
          name: f.name, partner_type: f.partner_type as PartnerType, website: normalizeUrl(f.website),
          city: f.city.trim() || null, state: f.state, region_id: f.region_id || null,
        });
        setMsg(`Added ${f.name}. People there can now find it when they join.`);
        setF({ ...f, name: '', website: '', city: '' });
        await onAdded();
      } catch (x) { setMsg(x instanceof Error ? x.message : String(x)); }
    }}>
      <h2>Add a partner organisation</h2>
      <p className="muted">An agency, funder, support organisation, school, company or network that works with the spaces. It is not listed in the public directory.</p>
      <label className="field"><span>Name</span><input required maxLength={160} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
      <div className="inline-fields">
        <label className="field"><span>Kind</span>
          <select required value={f.partner_type} onChange={(e) => setF({ ...f, partner_type: e.target.value as PartnerType })}>
            <option value="">Choose</option>{PARTNER_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select></label>
        <label className="field"><span>State</span>
          <select required value={f.state} onChange={(e) => setF({ ...f, state: e.target.value })}>
            <option value="">Choose</option>{US_STATES.map(([c, n]) => <option key={c} value={c}>{n}</option>)}
          </select></label>
        <label className="field"><span>Region</span>
          <select value={f.region_id} onChange={(e) => setF({ ...f, region_id: e.target.value })}>
            {regions.map((r) => <option key={r} value={r}>{REGIONS.find((g) => g.id === r)?.name ?? r}</option>)}
            {s.stewardship?.network_admin && <option value="">No region (network admin)</option>}
          </select></label>
      </div>
      <div className="inline-fields">
        <label className="field"><span>Website</span><input inputMode="url" autoCapitalize="off" maxLength={300} value={f.website} onChange={(e) => setF({ ...f, website: e.target.value })} placeholder="example.org" /></label>
        <label className="field"><span>City</span><input value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} /></label>
      </div>
      {msg && <p className="muted">{msg}</p>}
      <div className="btn-row"><button className="btn">Add organisation</button></div>
    </form>
  );
}

/** A proposed organisation that turns out to be one already listed. */
function MergeControl({ from, options, onMerged }: {
  from: SpaceIndex & { id: string }; options: (SpaceIndex & { id: string })[]; onMerged: (msg: string) => Promise<void>;
}) {
  const s = useSession();
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const target = options.find((o) => o.id === to);
  return (
    <div className="merge">
      <span className="muted">Same as one already listed?</span>
      <select value={to} onChange={(e) => { setTo(e.target.value); setErr(null); }}>
        <option value="">Choose…</option>
        {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
      <button className="btn ghost small" disabled={!to || busy} onClick={async () => {
        if (!target || !window.confirm(`Merge "${from.name}" into "${target.name}"? Its people move across with the same role and status, and "${from.name}" is removed.`)) return;
        setBusy(true);
        try { const n = await mergeOrganisation(s.user!.uid, from.id, to); await onMerged(`Merged ${from.name} into ${target.name}; ${n} ${n === 1 ? 'person' : 'people'} moved.`); }
        catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
        setBusy(false);
      }}>{busy ? 'Merging…' : 'Merge'}</button>
      {err && <span className="error">{err}</span>}
    </div>
  );
}

/** What a space's staff sent for their listing, against what is on file. The
 *  directory is plain JSON in the repository, so merging is a change to
 *  data/spaces/<id>.json with the space recorded as the source; this tab shows
 *  exactly what changed and records that it was merged. */
function ListingsTab() {
  const [items, setItems] = useState<(ListingSubmission & { id: string })[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = () => listListingSubmissions().then(setItems).catch((e) => setError(String(e?.message ?? e)));
  useEffect(() => { void load(); }, []);
  if (error) return <p className="error">{error}</p>;
  if (!items) return <p>Loading…</p>;
  if (!items.length) return <p className="muted" style={{ marginTop: 14 }}>No listing submissions yet.</p>;
  return (
    <div style={{ marginTop: 14 }}>
      <p className="muted">
        A space's staff answer their listing under Your space; it reaches the public directory once it is
        merged into <code>data/spaces/&lt;id&gt;.json</code> with the space as the source. Ask Claude to merge a
        submission, or make the change as a pull request, then mark it merged here.
      </p>
      {items.map((x) => <ListingDiff key={x.id} sub={x} onMerged={load} />)}
    </div>
  );
}

const LISTING_LABELS: Record<keyof ListingAnswers, string> = {
  summary: 'Summary', capabilities: 'What people can make', access_model: 'Access', public_access: 'Open to non-members',
  membership_models: 'Ways to use the space', monthly_cost_min: 'Monthly cost from', monthly_cost_max: 'Monthly cost up to',
  day_pass_usd: 'Day pass', minor_policy: 'Young people', hours_note: 'Hours', email: 'Email', phone: 'Phone', notes: 'Note to the steward',
};
const VOCAB_FOR: Partial<Record<keyof ListingAnswers, keyof typeof VOCAB>> = {
  capabilities: 'Capability', access_model: 'AccessModel', membership_models: 'MembershipModel', minor_policy: 'MinorPolicy',
};

function ListingDiff({ sub, onMerged }: { sub: ListingSubmission & { id: string }; onMerged: () => Promise<unknown> }) {
  const onFile = listingFromRecord(spaceById(sub.id));
  const say = (k: keyof ListingAnswers, v: unknown): string => {
    if (v === null || v === undefined || v === '' || (Array.isArray(v) && !v.length)) return '—';
    const voc = VOCAB_FOR[k];
    if (Array.isArray(v)) return v.map((x) => (voc ? label(voc, x) : x)).join(', ');
    if (typeof v === 'boolean') return v ? 'Yes' : 'No';
    return voc ? label(voc, String(v)) : String(v);
  };
  const same = (a: unknown, b: unknown) => JSON.stringify(Array.isArray(a) ? [...a].sort() : a ?? null) === JSON.stringify(Array.isArray(b) ? [...b].sort() : b ?? null)
    || (!a && !b);
  const changes = (Object.keys(LISTING_LABELS) as (keyof ListingAnswers)[]).filter((k) => !same(onFile[k], sub.listing[k]));
  return (
    <div className="card form-card" style={{ marginBottom: 12 }}>
      <div className="card-top">
        <h3 style={{ margin: 0 }}>{spaceById(sub.id)?.name ?? sub.id}</h3>
        <span className={`pill ${sub.status === 'merged' ? 'ok' : 'flag'}`}>{sub.status === 'merged' ? 'merged' : 'waiting'}</span>
        <span className="muted">from {sub.submitted_name}, {sub.updated_at.slice(0, 10)}</span>
      </div>
      {changes.length === 0 ? <p className="muted">Nothing differs from the record on file.</p> : (
        <div className="scroll-x">
          <table className="data">
            <thead><tr><th>Field</th><th>On file</th><th>They say</th></tr></thead>
            <tbody>
              {changes.map((k) => (
                <tr key={k}><td>{LISTING_LABELS[k]}</td><td className="muted">{say(k, onFile[k])}</td><td><strong>{say(k, sub.listing[k])}</strong></td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {sub.status !== 'merged' && (
        <div className="btn-row" style={{ marginBottom: 0 }}>
          <button className="btn ghost small" onClick={async () => { await markListingMerged(sub.id); await onMerged(); }}>Mark merged</button>
        </div>
      )}
    </div>
  );
}

function FeedbackTab() {
  const [items, setItems] = useState<(Feedback & { id: string })[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { listFeedback().then(setItems).catch((e) => setError(String(e?.message ?? e))); }, []);
  if (error) return <p className="error">{error}</p>;
  if (!items) return <p>Loading…</p>;
  if (!items.length) return <p className="muted" style={{ marginTop: 14 }}>No feedback yet.</p>;
  return (
    <div style={{ marginTop: 14 }}>
      <p className="muted">{items.length} message{items.length === 1 ? '' : 's'}, newest first.</p>
      {items.map((f) => (
        <div key={f.id} className="card form-card" style={{ marginBottom: 10 }}>
          <p style={{ whiteSpace: 'pre-wrap', marginTop: 0 }}>{f.message}</p>
          <p className="muted" style={{ marginBottom: 0 }}>
            {f.created_at.slice(0, 16).replace('T', ' ')} UTC · {f.page}
            {f.email && <> · <a href={`mailto:${f.email}`}>{f.email}</a></>}
            {f.uid && ' · signed in'}
          </p>
        </div>
      ))}
    </div>
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

/** Put the filtered, active people into a group in one go — the roster
 *  filter is the membership list, as it is for meetings. */
function AddToGroup({ people }: { people: { uid: string; name: string }[] }) {
  const s = useSession();
  const [groups, setGroups] = useState<(Group & { id: string })[]>([]);
  const [gid, setGid] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    listGroups().then((gs) => setGroups(gs.filter((g) => !g.archived && managesGroup(s, g)))).catch(() => setGroups([]));
  }, [s.user?.uid]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!groups.length) return null;
  return (
    <div className="btn-row" style={{ marginTop: 0 }}>
      <select value={gid} onChange={(e) => { setGid(e.target.value); setMsg(null); }}>
        <option value="">Add these to a group…</option>
        {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
      </select>
      <button className="btn ghost small" disabled={!gid || !people.length} onClick={async () => {
        try { await addGroupMembers(s.user!.uid, gid, people); setMsg(`Added ${people.length} to ${groups.find((g) => g.id === gid)?.name}.`); }
        catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
      }}>Add {people.length}</button>
      {msg && <span className="muted">{msg}</span>}
    </div>
  );
}
