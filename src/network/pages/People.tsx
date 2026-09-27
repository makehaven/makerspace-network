import { useEffect, useMemo, useState } from 'react';
import { useSession } from '../session';
import { can } from '../capabilities';
import { listRoster, listInbox, listSpaceIndex, sendMessage, markRead } from '../db';
import { stateName, ORGANISER_ROLES, type RosterEntry, type Message, type SpaceIndex } from '../model';
import { FUNCTIONS, PageLink, SignIn, functionLabel, partnerTypeLabel, roleLabel } from './shared';
import { MyMeetings } from './Meetings';

type Entry = RosterEntry & { id: string };

export default function People() {
  const s = useSession();
  const allowed = can(s, 'roster.read');
  const [roster, setRoster] = useState<Entry[] | null>(null);
  const [inbox, setInbox] = useState<(Message & { id: string })[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState('');
  const [fn, setFn] = useState('');
  const [kind, setKind] = useState('');
  const [orgs, setOrgs] = useState<Map<string, SpaceIndex>>(new Map());
  const [q, setQ] = useState('');
  const [to, setTo] = useState<Entry | null>(null);

  const reload = () => {
    if (!allowed || !s.user) return;
    listRoster().then(setRoster).catch((e) => setError(String(e?.message ?? e)));
    listSpaceIndex().then((xs) => setOrgs(new Map(xs.map((x) => [x.id, x])))).catch(() => undefined);
    listInbox(s.user.uid).then(setInbox).catch(() => undefined);
  };
  useEffect(reload, [allowed, s.user?.uid]); // eslint-disable-line react-hooks/exhaustive-deps

  const states = useMemo(() => [...new Set((roster ?? []).map((r) => r.state).filter(Boolean))].sort() as string[], [roster]);
  const shown = useMemo(() => (roster ?? []).filter((r) =>
    (!state || r.state === state) && (!fn || r.functions.includes(fn))
    && (!kind || (orgs.get(r.space_id)?.kind === 'partner') === (kind === 'partner'))
    && (!q || `${r.name} ${r.space_name}`.toLowerCase().includes(q.toLowerCase()))
    && r.id !== s.user?.uid), [roster, state, fn, kind, orgs, q, s.user?.uid]);

  return (
    <>
      <section className="hero">
        <div className="wrap narrow">
          <p className="eyebrow">People</p>
          <h1>Who's at the other spaces</h1>
          <p className="lede">
            Verified people at makerspaces across the network, in every state, and at the
            agencies, funders and organisations that work with them. Find the person who does
            what you do somewhere else, and reach them.
          </p>
        </div>
      </section>
      <div className="wrap" style={{ paddingTop: 26, paddingBottom: 60 }}>
        {s.status === 'loading' && <p>Loading…</p>}
        {s.status === 'signed_out' && <div className="narrow"><SignIn why="This page is only visible to people verified at a makerspace." /></div>}
        {s.status === 'signed_in' && !allowed && (
          <div className="notice narrow">
            {s.memberships.some((m) => m.status === 'pending')
              ? <>Your membership is waiting for confirmation. Once a space admin or steward confirms you, this page opens up.</>
              : <>You need to be verified at a makerspace to see other people. <PageLink page="join">Join the network</PageLink> first.</>}
          </div>
        )}
        {allowed && (
          <>
            <MyMeetings roster={roster} />
            {inbox.length > 0 && <Inbox items={inbox} me={s.user!.uid} onRead={reload} />}
            <div className="filters">
              <input type="search" placeholder="Name or space" value={q} onChange={(e) => setQ(e.target.value)} />
              <select value={state} onChange={(e) => setState(e.target.value)}>
                <option value="">Every state</option>
                {states.map((st) => <option key={st} value={st}>{stateName(st)}</option>)}
              </select>
              <select value={kind} onChange={(e) => setKind(e.target.value)}>
                <option value="">Makerspaces and partners</option>
                <option value="makerspace">At makerspaces</option>
                <option value="partner">At partner organisations</option>
              </select>
              <select value={fn} onChange={(e) => setFn(e.target.value)}>
                <option value="">Any function</option>
                {FUNCTIONS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
              </select>
              <span className="count">{roster ? `${shown.length} of ${roster.length}` : ''}</span>
              {can(s, 'steward.view') && <PageLink page="steward" className="btn ghost small">Steward tools</PageLink>}
            </div>
            {error && <p className="error">{error}</p>}
            {to && <Compose to={to} onDone={() => { setTo(null); reload(); }} onCancel={() => setTo(null)} />}
            {roster && roster.length === 0 && <p className="muted">Nobody yet. You're first.</p>}
            {shown.length > 0 && (
              <div className="scroll-x">
                <table className="data">
                  <thead><tr><th>Name</th><th>Space</th><th>Does</th><th>Reach them</th></tr></thead>
                  <tbody>
                    {shown.map((r) => (
                      <tr key={r.id}>
                        <td><strong>{r.name}</strong><br /><span className="muted">{roleLabel(r.role)}</span></td>
                        <td>{r.space_name}<br /><span className="muted">{stateName(r.state)}
                          {orgs.get(r.space_id)?.kind === 'partner' && ` · ${partnerTypeLabel(orgs.get(r.space_id)?.partner_type)}`}</span></td>
                        <td>{r.functions.map((f) => <span key={f} className="tag">{functionLabel(f)}</span>)}</td>
                        <td className="actions">
                          {r.email && <a href={`mailto:${r.email}`}>{r.email}</a>}
                          {r.phone && <span>{r.phone}</span>}
                          {!r.email && !r.phone && (
                            <button className="btn ghost small" onClick={() => setTo(r)}>
                              Message{ORGANISER_ROLES.includes(r.role) ? '' : ' (relayed)'}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}

function Compose({ to, onDone, onCancel }: { to: Entry; onDone: () => void; onCancel: () => void }) {
  const s = useSession();
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <form className="compose" onSubmit={async (e) => {
      e.preventDefault(); setBusy(true); setErr(null);
      try { await sendMessage({ uid: s.user!.uid, name: s.person!.name }, to.id, subject, body); onDone(); }
      catch (x) { setErr(x instanceof Error ? x.message : String(x)); }
      setBusy(false);
    }}>
      <h3 style={{ marginTop: 0 }}>Message {to.name} at {to.space_name}</h3>
      <p className="muted">Delivered through the network. They'll see your name and space, and can reply the same way; your address is not shared unless you put it in the message.</p>
      <label className="field"><span>Subject</span><input required maxLength={200} value={subject} onChange={(e) => setSubject(e.target.value)} /></label>
      <label className="field"><span>Message</span><textarea required maxLength={4000} value={body} onChange={(e) => setBody(e.target.value)} /></label>
      {err && <p className="error">{err}</p>}
      <div className="btn-row" style={{ margin: '8px 0 0' }}>
        <button className="btn" disabled={busy}>{busy ? 'Sending…' : 'Send'}</button>
        <button type="button" className="btn ghost" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

function Inbox({ items, me, onRead }: { items: (Message & { id: string })[]; me: string; onRead: () => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const unread = items.filter((m) => m.to_uid === me && !m.read).length;
  return (
    <section style={{ marginBottom: 26 }}>
      <h2 style={{ marginBottom: 8 }}>Messages {unread > 0 && <span className="pill flag">{unread} new</span>}</h2>
      {items.map((m) => {
        const mine = m.from_uid === me;
        return (
          <div key={m.id} className={`msg ${!mine && !m.read ? 'unread' : ''}`}>
            <div className="meta">{mine ? 'To' : 'From'} <strong>{mine ? '' : m.from_name}</strong> · {new Date(m.created_at).toLocaleString()}
              {!mine && m.status !== 'sent' && ' · shown here; email relay not yet enabled'}</div>
            <div><button type="button" className="linkish" onClick={async () => {
              setOpen(open === m.id ? null : m.id);
              if (!mine && !m.read) { await markRead(m.id); onRead(); }
            }}>{m.subject || '(no subject)'}</button></div>
            {open === m.id && <p style={{ whiteSpace: 'pre-wrap', margin: '8px 0 0' }}>{m.body}</p>}
          </div>
        );
      })}
    </section>
  );
}
