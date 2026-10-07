// Groups: a mailing list with an archive, in place of a Google Group. Every
// post goes to members by email (groupMailer) and replies by email come back
// in (groupInbound); this page is the archive, the way in for people who would
// rather not use email, and where managers look after membership.

import { useEffect, useMemo, useState } from 'react';
import { useSession } from '../session';
import { REGIONS } from '../../data';
import {
  addGroupMembers, createGroup, getGroup, getThread, joinGroup, leaveGroup, listGroupMembers, listGroups,
  listPosts, listRoster, listThreads, moderatePost, myGroupMemberships, removeGroupMember, replyToThread,
  setDelivery, startThread, updateGroup,
} from '../db';
import { groupAddress, type Group, type GroupMember, type GroupPost, type GroupThread, type RosterEntry } from '../model';
import { PageLink, SignIn, stewardRegionIds } from './shared';
import type { Session } from '../session';

type WithId<T> = T & { id: string };

export const managesGroup = (s: Session, g: Group) => !!s.user && (!!s.stewardship?.network_admin
  || g.manager_uids.includes(s.user.uid) || (!!g.region_id && !!s.stewardship?.region_ids.includes(g.region_id)));

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const slugify = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

function Frame({ eyebrow, title, lede, children }: { eyebrow: string; title: string; lede?: React.ReactNode; children: React.ReactNode }) {
  const s = useSession();
  const allowed = s.verified || !!s.stewardship;
  return (
    <>
      <section className="hero">
        <div className="wrap narrow">
          <p className="eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
          {lede && <p className="lede">{lede}</p>}
        </div>
      </section>
      <div className="wrap" style={{ paddingTop: 20, paddingBottom: 60 }}>
        {s.status === 'loading' && <p>Loading…</p>}
        {s.status === 'signed_out' && <div className="narrow"><SignIn why="Groups are for people verified at a makerspace or partner organisation." /></div>}
        {s.status === 'signed_in' && !allowed && (
          <p className="notice narrow">Groups open up once you're verified. <PageLink page="join">Your profile</PageLink>.</p>
        )}
        {s.status === 'signed_in' && allowed && children}
      </div>
    </>
  );
}

// ---------- all groups ----------

export function GroupsPage() {
  const s = useSession();
  const [groups, setGroups] = useState<WithId<Group>[] | null>(null);
  const [mine, setMine] = useState<Map<string, GroupMember>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const load = async () => {
    try {
      const gs = await listGroups();
      setGroups(gs);
      setMine(await myGroupMemberships(s.user!.uid, gs.map((g) => g.id)));
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };
  useEffect(() => { if (s.user && (s.verified || s.stewardship)) void load(); }, [s.user?.uid, s.verified]); // eslint-disable-line react-hooks/exhaustive-deps
  const canCreate = !!s.stewardship && (s.stewardship.network_admin || s.stewardship.region_ids.length > 0);
  const live = (groups ?? []).filter((g) => !g.archived);

  return (
    <Frame eyebrow="Groups" title="Groups" lede="Mailing lists with an archive. Post by email or here; everyone in the group gets it, and replies by email come back to the group.">
      {error && <p className="error">{error}</p>}
      {groups && !live.length && <p className="muted">No groups yet.</p>}
      <div className="group-list">
        {live.map((g) => {
          const member = mine.get(g.id);
          return (
            <div key={g.id} className="msg">
              <div><PageLink page="group" params={{ g: g.id }}><strong>{g.name}</strong></PageLink>
                {member && <span className="pill ok" style={{ marginLeft: 8 }}>member{member.delivery === 'none' ? ', no email' : ''}</span>}</div>
              {g.description && <p style={{ margin: '4px 0' }}>{g.description}</p>}
              <div className="meta">{groupAddress(g.id)} · {g.posting === 'managers' ? 'announcements' : 'discussion'} · {g.join_policy === 'open' ? 'anyone verified may join' : 'by invitation'}
                {!member && g.join_policy === 'open' && <> · <button className="linkish" onClick={async () => {
                  await joinGroup(s.user!.uid, s.person?.name ?? '', g.id); await load();
                }}>Join</button></>}</div>
            </div>
          );
        })}
      </div>
      {canCreate && <CreateGroup onCreated={load} />}
    </Frame>
  );
}

function CreateGroup({ onCreated }: { onCreated: () => Promise<void> }) {
  const s = useSession();
  const regions = stewardRegionIds(s.stewardship);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [touched, setTouched] = useState(false);
  const [description, setDescription] = useState('');
  const [regionId, setRegionId] = useState(regions[0] ?? '');
  const [join, setJoin] = useState<Group['join_policy']>('managers');
  const [posting, setPosting] = useState<Group['posting']>('members');
  const [msg, setMsg] = useState<string | null>(null);
  const effective = touched ? slug : slugify(name);
  return (
    <form className="card form-card" style={{ marginTop: 24 }} onSubmit={async (e) => {
      e.preventDefault(); setMsg(null);
      try {
        if (await getGroup(effective)) throw new Error(`${groupAddress(effective)} is taken.`);
        await createGroup(s.user!.uid, { name: name.trim(), slug: effective, description: description.trim(),
          region_id: regionId || null, join_policy: join, posting }, s.person?.name ?? '');
        setName(''); setSlug(''); setTouched(false); setDescription('');
        await onCreated();
      } catch (x) { setMsg(x instanceof Error ? x.message : String(x)); }
    }}>
      <h2>New group</h2>
      <label className="field"><span>Name</span><input required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} placeholder="CT Makerspaces" /></label>
      <label className="field"><span>Address</span>
        <span className="inline-address"><input required pattern="[a-z0-9][a-z0-9-]{2,39}" value={effective}
          onChange={(e) => { setTouched(true); setSlug(e.target.value.toLowerCase()); }} /> <span className="muted">@lists.makerspace.network</span></span></label>
      <label className="field"><span>What it's for <em>optional</em></span><textarea maxLength={2000} value={description} onChange={(e) => setDescription(e.target.value)} /></label>
      <div className="inline-fields">
        <label className="field"><span>Managed by</span>
          <select value={regionId} onChange={(e) => setRegionId(e.target.value)}>
            {regions.map((r) => <option key={r} value={r}>{REGIONS.find((g) => g.id === r)?.name ?? r} stewards</option>)}
            {s.stewardship?.network_admin && <option value="">Network admins (a national group)</option>}
          </select></label>
        <label className="field"><span>Who joins</span>
          <select value={join} onChange={(e) => setJoin(e.target.value as Group['join_policy'])}>
            <option value="managers">Added by managers or by invitation</option>
            <option value="open">Any verified person</option>
          </select></label>
        <label className="field"><span>Who posts</span>
          <select value={posting} onChange={(e) => setPosting(e.target.value as Group['posting'])}>
            <option value="members">Every member (discussion)</option>
            <option value="managers">Managers only (announcements)</option>
          </select></label>
      </div>
      {msg && <p className="error">{msg}</p>}
      <div className="btn-row"><button className="btn">Create group</button></div>
    </form>
  );
}

// ---------- one group ----------

export function GroupPage() {
  const s = useSession();
  const q = new URLSearchParams(window.location.search);
  const gid = q.get('g') ?? '';
  const tid = q.get('t');
  const [group, setGroup] = useState<Group | null | undefined>(undefined);
  const [me, setMe] = useState<GroupMember | null>(null);
  const [tab, setTab] = useState<'threads' | 'members' | 'settings'>('threads');
  const load = async () => {
    const g = await getGroup(gid).catch(() => null);
    setGroup(g);
    if (g && s.user) setMe((await myGroupMemberships(s.user.uid, [gid])).get(gid) ?? null);
  };
  useEffect(() => { if (s.user && (s.verified || s.stewardship)) void load(); }, [gid, s.user?.uid, s.verified]); // eslint-disable-line react-hooks/exhaustive-deps

  const manager = !!group && managesGroup(s, group);
  const canRead = !!me || manager;
  return (
    <Frame eyebrow="Group" title={group?.name ?? 'Group'} lede={group?.description || undefined}>
      {group === null && <p className="muted">No such group. <PageLink page="groups">All groups</PageLink>.</p>}
      {group && (
        <>
          <div className="group-bar">
            <a href={`mailto:${groupAddress(gid)}`}>{groupAddress(gid)}</a>
            {me && (
              <>
                <label className="check"><input type="checkbox" checked={me.delivery === 'each'}
                  onChange={async (e) => { await setDelivery(s.user!.uid, gid, e.target.checked ? 'each' : 'none'); await load(); }} /> Email me every post</label>
                <button className="linkish" onClick={async () => { if (confirm(`Leave ${group.name}?`)) { await leaveGroup(s.user!.uid, gid); await load(); } }}>Leave</button>
              </>
            )}
            {!me && group.join_policy === 'open' && !group.archived && (
              <button className="btn small" onClick={async () => { await joinGroup(s.user!.uid, s.person?.name ?? '', gid); await load(); }}>Join</button>
            )}
            <PageLink page="groups">All groups</PageLink>
          </div>
          {group.archived && <p className="notice">This group is archived: readable, but closed to new posts.</p>}
          {!canRead && <p className="notice">{group.join_policy === 'open' ? 'Join to read and post.' : 'This group is by invitation. A manager or steward can add you.'}</p>}
          {canRead && (
            <>
              {manager && (
                <div className="tabs">
                  <button className={tab === 'threads' ? 'on' : ''} onClick={() => setTab('threads')}>Threads</button>
                  <button className={tab === 'members' ? 'on' : ''} onClick={() => setTab('members')}>Members</button>
                  <button className={tab === 'settings' ? 'on' : ''} onClick={() => setTab('settings')}>Settings</button>
                </div>
              )}
              {tab === 'threads' && (tid
                ? <ThreadView gid={gid} tid={tid} group={group} manager={manager} member={!!me} />
                : <ThreadList gid={gid} group={group} manager={manager} member={!!me} />)}
              {tab === 'members' && manager && <Members gid={gid} group={group} />}
              {tab === 'settings' && manager && <Settings gid={gid} group={group} onSaved={load} />}
            </>
          )}
        </>
      )}
    </Frame>
  );
}

const mayPost = (group: Group, manager: boolean, member: boolean) =>
  member && !group.archived && (group.posting === 'members' || manager);

function ThreadList({ gid, group, manager, member }: { gid: string; group: Group; manager: boolean; member: boolean }) {
  const s = useSession();
  const [threads, setThreads] = useState<WithId<GroupThread>[] | null>(null);
  const [composing, setComposing] = useState(false);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const load = () => listThreads(gid).then(setThreads).catch((e) => setErr(String(e?.message ?? e)));
  useEffect(() => { void load(); }, [gid]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      {mayPost(group, manager, member) && (composing ? (
        <form className="compose" onSubmit={async (e) => {
          e.preventDefault(); setBusy(true); setErr(null);
          try { await startThread(gid, { uid: s.user!.uid, name: s.person!.name }, subject, body); setSubject(''); setBody(''); setComposing(false); await load(); }
          catch (x) { setErr(x instanceof Error ? x.message : String(x)); }
          setBusy(false);
        }}>
          <label className="field"><span>Subject</span><input required maxLength={200} value={subject} onChange={(e) => setSubject(e.target.value)} /></label>
          <label className="field"><span>Message</span><textarea required rows={8} maxLength={20000} value={body} onChange={(e) => setBody(e.target.value)} /></label>
          <p className="muted">Goes to everyone in {group.name} who takes email. You can also email {groupAddress(gid)} directly.</p>
          {err && <p className="error">{err}</p>}
          <div className="btn-row" style={{ margin: '8px 0 0' }}>
            <button className="btn" disabled={busy}>{busy ? 'Posting…' : 'Post'}</button>
            <button type="button" className="btn ghost" onClick={() => setComposing(false)}>Cancel</button>
          </div>
        </form>
      ) : <div className="btn-row"><button className="btn" onClick={() => setComposing(true)}>New thread</button></div>)}
      {err && !composing && <p className="error">{err}</p>}
      {threads && !threads.length && <p className="muted">No threads yet.</p>}
      {threads && threads.length > 0 && (
        <div className="scroll-x">
          <table className="data">
            <thead><tr><th>Subject</th><th>Started by</th><th>Posts</th><th>Last</th></tr></thead>
            <tbody>
              {threads.map((t) => (
                <tr key={t.id}>
                  <td><PageLink page="group" params={{ g: gid, t: t.id }}><strong>{t.subject}</strong></PageLink></td>
                  <td>{t.started_by_name}</td>
                  <td>{t.post_count}</td>
                  <td>{when(t.last_post_at)}<br /><span className="muted">{t.last_author_name}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function ThreadView({ gid, tid, group, manager, member }: { gid: string; tid: string; group: Group; manager: boolean; member: boolean }) {
  const s = useSession();
  const [thread, setThread] = useState<GroupThread | null>(null);
  const [posts, setPosts] = useState<WithId<GroupPost>[]>([]);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const load = async () => {
    const [t, p] = await Promise.all([getThread(gid, tid), listPosts(gid, tid)]);
    setThread(t); setPosts(p);
  };
  useEffect(() => { void load().catch((e) => setErr(String(e?.message ?? e))); }, [gid, tid]); // eslint-disable-line react-hooks/exhaustive-deps
  // Held and rejected posts are for managers only.
  const shown = posts.filter((p) => manager || (p.status !== 'held' && p.status !== 'rejected'));

  if (!thread) return err ? <p className="error">{err}</p> : <p>Loading…</p>;
  return (
    <>
      <p><PageLink page="group" params={{ g: gid }}>← All threads</PageLink></p>
      <h2>{thread.subject}</h2>
      {shown.map((p) => (
        <div key={p.id} className={`msg ${p.status === 'held' ? 'held' : ''}`}>
          <div className="meta"><strong>{p.author_name}</strong> · {when(p.created_at)}{p.source === 'email' ? ' · by email' : ''}
            {manager && p.status === 'held' && <> · <span className="pill flag">held</span></>}
            {manager && p.status === 'rejected' && <> · <span className="pill">rejected</span></>}
            {manager && p.status === 'failed' && <> · <span className="pill flag">email failed</span></>}</div>
          <div style={{ whiteSpace: 'pre-wrap', marginTop: 6 }}>{p.body}</div>
          {manager && p.status === 'held' && (
            <div className="btn-row" style={{ margin: '8px 0 0' }}>
              <span className="muted">This came by email but couldn't be tied firmly to {p.author_name}'s address.</span>
              <button className="btn small" onClick={async () => { await moderatePost(s.user!.uid, gid, tid, p.id, 'queued'); await load(); }}>Approve and send</button>
              <button className="btn ghost small" onClick={async () => { await moderatePost(s.user!.uid, gid, tid, p.id, 'rejected'); await load(); }}>Reject</button>
            </div>
          )}
        </div>
      ))}
      {mayPost(group, manager, member) && (
        <form className="compose" onSubmit={async (e) => {
          e.preventDefault(); setBusy(true); setErr(null);
          try { await replyToThread(gid, tid, thread, { uid: s.user!.uid, name: s.person!.name }, body); setBody(''); await load(); }
          catch (x) { setErr(x instanceof Error ? x.message : String(x)); }
          setBusy(false);
        }}>
          <label className="field"><span>Reply to the group</span><textarea required rows={5} maxLength={20000} value={body} onChange={(e) => setBody(e.target.value)} /></label>
          {err && <p className="error">{err}</p>}
          <div className="btn-row" style={{ margin: '8px 0 0' }}><button className="btn" disabled={busy}>{busy ? 'Posting…' : 'Reply'}</button></div>
        </form>
      )}
    </>
  );
}

function Members({ gid, group }: { gid: string; group: Group }) {
  const s = useSession();
  const [members, setMembers] = useState<WithId<GroupMember>[]>([]);
  const [roster, setRoster] = useState<WithId<RosterEntry>[]>([]);
  const [q, setQ] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const load = async () => {
    const [m, r] = await Promise.all([listGroupMembers(gid), listRoster()]);
    setMembers(m); setRoster(r);
  };
  useEffect(() => { void load().catch((e) => setErr(String(e?.message ?? e))); }, [gid]); // eslint-disable-line react-hooks/exhaustive-deps
  const ids = useMemo(() => new Set(members.map((m) => m.id)), [members]);
  const matches = q.trim() ? roster.filter((r) => !ids.has(r.id)
    && `${r.name} ${r.space_name}`.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 8) : [];
  const spaceOf = new Map(roster.map((r) => [r.id, r.space_name]));
  const act = async (f: () => Promise<void>) => { setErr(null); try { await f(); await load(); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } };

  return (
    <>
      <label className="field" style={{ maxWidth: 420 }}><span>Add someone on the roster</span>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or space" /></label>
      {matches.length > 0 && (
        <ul className="picker">
          {matches.map((r) => <li key={r.id}><button type="button" onClick={() => void act(async () => { await addGroupMembers(s.user!.uid, gid, [{ uid: r.id, name: r.name }]); setQ(''); })}>
            <strong>{r.name}</strong> <span className="muted">{r.space_name}</span></button></li>)}
        </ul>
      )}
      <p className="muted">People not on the roster yet join by invitation: on the Steward page, invite them and tick this group. To add a filtered set of people at once, use <strong>Add these to a group</strong> on the Steward page.</p>
      {err && <p className="error">{err}</p>}
      <div className="scroll-x">
        <table className="data">
          <thead><tr><th>Member</th><th>Email</th><th>Manager</th><th></th></tr></thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id}>
                <td><strong>{m.name}</strong><br /><span className="muted">{spaceOf.get(m.id) ?? 'not on the roster'}</span></td>
                <td>{m.delivery === 'each' ? 'every post' : <span className="muted">site only</span>}</td>
                <td><input type="checkbox" aria-label="Manager" checked={group.manager_uids.includes(m.id)}
                  onChange={(e) => void act(() => updateGroup(s.user!.uid, gid, {
                    manager_uids: e.target.checked ? [...group.manager_uids, m.id] : group.manager_uids.filter((x) => x !== m.id),
                  }))} /></td>
                <td className="actions">{m.id !== s.user?.uid && <button className="btn ghost small" onClick={() => void act(() => removeGroupMember(s.user!.uid, gid, m.id))}>Remove</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted">{members.length} member{members.length === 1 ? '' : 's'}, {members.filter((m) => m.delivery === 'each').length} by email.</p>
    </>
  );
}

function Settings({ gid, group, onSaved }: { gid: string; group: Group; onSaved: () => Promise<void> }) {
  const s = useSession();
  const [name, setName] = useState(group.name);
  const [description, setDescription] = useState(group.description);
  const [join, setJoin] = useState(group.join_policy);
  const [posting, setPosting] = useState(group.posting);
  const [archived, setArchived] = useState(group.archived);
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <form className="card form-card" style={{ marginTop: 14 }} onSubmit={async (e) => {
      e.preventDefault();
      try { await updateGroup(s.user!.uid, gid, { name: name.trim(), description: description.trim(), join_policy: join, posting, archived }); setMsg('Saved.'); await onSaved(); }
      catch (x) { setMsg(x instanceof Error ? x.message : String(x)); }
    }}>
      <label className="field"><span>Name</span><input required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} /></label>
      <label className="field"><span>What it's for</span><textarea maxLength={2000} value={description} onChange={(e) => setDescription(e.target.value)} /></label>
      <div className="inline-fields">
        <label className="field"><span>Who joins</span>
          <select value={join} onChange={(e) => setJoin(e.target.value as Group['join_policy'])}>
            <option value="managers">Added by managers or by invitation</option>
            <option value="open">Any verified person</option>
          </select></label>
        <label className="field"><span>Who posts</span>
          <select value={posting} onChange={(e) => setPosting(e.target.value as Group['posting'])}>
            <option value="members">Every member</option>
            <option value="managers">Managers only</option>
          </select></label>
      </div>
      <label className="check standalone"><input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} /> Archived — readable, closed to posts</label>
      {msg && <p className="muted">{msg}</p>}
      <div className="btn-row"><button className="btn">Save</button></div>
    </form>
  );
}
