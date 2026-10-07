// Convening (GOVERNANCE §Roster, purpose 1). A steward turns the roster
// filters into an invitation list, the list is frozen on a meeting, invitees
// answer on the People page, and the steward records who came. Attendance is
// the continuity signal: it shows which spaces are actually represented.

import { useEffect, useMemo, useState } from 'react';
import { useSession } from '../session';
import { REGIONS } from '../../data';
import {
  createMeeting, listAllMeetings, listMyMeetings, listRoster, listRsvps, loadPeople,
  setAttended, setRsvp, updateMeeting, type MeetingDraft,
} from '../db';
import type { Meeting, Person, RosterEntry, Rsvp, RsvpResponse } from '../model';
import { download, stewardRegionIds } from './shared';
import { meetingIcs } from '../../../functions/src/ics';

type WithId<T> = T & { id: string };

const when = (iso: string) => new Date(iso).toLocaleString(undefined, {
  weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
});
const isPast = (m: Meeting) => Date.parse(m.starts_at) + m.duration_min * 60_000 < Date.now();
const downloadIcs = (m: WithId<Meeting>) =>
  download(`${m.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'meeting'}.ics`, meetingIcs(m), 'text/calendar');

/** `<input type="datetime-local">` speaks local time without a zone. */
const toLocalInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);

// ---------- new meeting (from the steward's People tab) ----------

export function MeetingForm({ invitees, audience, onDone, onCancel }: {
  invitees: { uid: string; name: string }[]; audience: string; onDone: () => void; onCancel: () => void;
}) {
  const s = useSession();
  const regionChoices = stewardRegionIds(s.stewardship);
  const [title, setTitle] = useState('');
  const [agenda, setAgenda] = useState('');
  const [start, setStart] = useState(() => {
    const d = new Date(Date.now() + 7 * 864e5); d.setHours(12, 0, 0, 0); return toLocalInput(d);
  });
  const [duration, setDuration] = useState(60);
  const [location, setLocation] = useState('');
  const [regionId, setRegionId] = useState<string | null>(regionChoices[0] ?? null);
  const [sendEmail, setSendEmail] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  return (
    <form className="card form-card" onSubmit={async (e) => {
      e.preventDefault(); setBusy(true); setErr(null);
      try {
        const draft: MeetingDraft = {
          title: title.trim(), agenda: agenda.trim(), starts_at: new Date(start).toISOString(),
          duration_min: duration, location: location.trim(), audience, region_id: regionId,
          invitee_uids: invitees.map((i) => i.uid),
        };
        await createMeeting({ uid: s.user!.uid, name: s.person?.name ?? s.user!.email ?? 'Steward' }, draft, sendEmail);
        onDone();
      } catch (x) { setErr(x instanceof Error ? x.message : String(x)); }
      setBusy(false);
    }}>
      <h2>New meeting</h2>
      <p className="muted">
        Inviting {invitees.length} {invitees.length === 1 ? 'person' : 'people'} ({audience}). The list is saved with
        the meeting; people who join later are not added unless you add them.
      </p>
      <label className="field"><span>Title</span>
        <input required maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Connecticut safety leads, autumn call" /></label>
      <div className="inline-fields">
        <label className="field"><span>Starts</span>
          <input type="datetime-local" required value={start} onChange={(e) => setStart(e.target.value)} /></label>
        <label className="field"><span>Minutes</span>
          <input type="number" min={5} max={600} step={5} required value={duration} onChange={(e) => setDuration(Number(e.target.value))} /></label>
      </div>
      <label className="field"><span>Where <em>video link or address</em></span>
        <input maxLength={300} value={location} onChange={(e) => setLocation(e.target.value)} /></label>
      <label className="field"><span>Agenda <em>optional</em></span>
        <textarea maxLength={4000} value={agenda} onChange={(e) => setAgenda(e.target.value)} /></label>
      {(regionChoices.length > 1 || s.stewardship?.network_admin) && (
        <label className="field"><span>Managed by</span>
          <select value={regionId ?? ''} onChange={(e) => setRegionId(e.target.value || null)}>
            {regionChoices.map((r) => <option key={r} value={r}>{REGIONS.find((g) => g.id === r)?.name ?? r} stewards</option>)}
            {s.stewardship?.network_admin && <option value="">The whole network (network admins)</option>}
          </select></label>
      )}
      <label className="check"><input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} /> Email the invitations
        <span className="muted"> (needs the mailer; otherwise they see it on their People page)</span></label>
      {err && <p className="error">{err}</p>}
      <div className="btn-row">
        <button className="btn" disabled={busy || !invitees.length}>{busy ? 'Saving…' : 'Create meeting'}</button>
        <button type="button" className="btn ghost" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

// ---------- steward: every meeting ----------

export function MeetingsTab() {
  const [meetings, setMeetings] = useState<WithId<Meeting>[] | null>(null);
  const [roster, setRoster] = useState<Map<string, RosterEntry>>(new Map());
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = async () => {
    try {
      const [ms, r] = await Promise.all([listAllMeetings(), listRoster()]);
      setMeetings(ms); setRoster(new Map(r.map((x) => [x.id, x])));
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };
  useEffect(() => { void load(); }, []);

  const upcoming = (meetings ?? []).filter((m) => !isPast(m)).reverse();
  const past = (meetings ?? []).filter(isPast);
  return (
    <>
      <p className="muted" style={{ marginTop: 14 }}>
        To call a meeting, filter the People tab down to who should come and press <strong>Invite these to a meeting</strong>.
      </p>
      {error && <p className="error">{error}</p>}
      {meetings && !meetings.length && <p className="muted">No meetings yet.</p>}
      {upcoming.length > 0 && <h3>Upcoming</h3>}
      {upcoming.map((m) => <MeetingRow key={m.id} m={m} roster={roster} open={open === m.id}
        onToggle={() => setOpen(open === m.id ? null : m.id)} onChange={load} />)}
      {past.length > 0 && <h3>Past</h3>}
      {past.map((m) => <MeetingRow key={m.id} m={m} roster={roster} open={open === m.id}
        onToggle={() => setOpen(open === m.id ? null : m.id)} onChange={load} />)}
    </>
  );
}

function MeetingRow({ m, roster, open, onToggle, onChange }: {
  m: WithId<Meeting>; roster: Map<string, RosterEntry>; open: boolean; onToggle: () => void; onChange: () => Promise<void>;
}) {
  const s = useSession();
  const [rsvps, setRsvps] = useState<Map<string, Rsvp>>(new Map());
  const [people, setPeople] = useState<Map<string, Person>>(new Map());
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const reload = async () => {
    const [r, p] = await Promise.all([listRsvps(m.id), loadPeople(m.invitee_uids)]);
    setRsvps(r); setPeople(p);
  };
  useEffect(() => { if (open) reload().catch((e) => setErr(String(e?.message ?? e))); }, [open, m.updated_at]); // eslint-disable-line react-hooks/exhaustive-deps

  const count = (r: RsvpResponse) => [...rsvps.values()].filter((x) => x.response === r).length;
  const attended = [...rsvps.values()].filter((x) => x.attended).length;
  const spacesThere = new Set(m.invitee_uids.filter((u) => rsvps.get(u)?.attended).map((u) => roster.get(u)?.space_id).filter(Boolean)).size;
  const notEmailed = m.invitee_uids.filter((u) => !m.emailed_uids.includes(u)).length;
  const past = isPast(m);
  const act = async (f: () => Promise<void>) => { setErr(null); try { await f(); await onChange(); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } };

  return (
    <div className={`msg ${m.status === 'cancelled' ? '' : !past ? 'unread' : ''}`}>
      <div className="meta">{when(m.starts_at)} · {m.duration_min} min · {m.audience}
        {m.status === 'cancelled' && <> · <span className="pill">Cancelled</span></>}</div>
      <div><button type="button" className="linkish" onClick={onToggle}><strong>{m.title}</strong></button>
        <span className="muted"> — {m.invitee_uids.length} invited{open ? `, ${count('yes')} yes, ${count('maybe')} maybe, ${count('no')} no` : ''}
          {past && open ? `, ${attended} came from ${spacesThere} space${spacesThere === 1 ? '' : 's'}` : ''}</span></div>
      {open && (
        <div style={{ marginTop: 10 }}>
          {m.location && <p style={{ margin: '0 0 6px' }}>Where: {/^https?:\/\//.test(m.location) ? <a href={m.location} target="_blank" rel="noreferrer">{m.location}</a> : m.location}</p>}
          {m.agenda && <p style={{ whiteSpace: 'pre-wrap', margin: '0 0 6px' }}>{m.agenda}</p>}
          <p className="muted" style={{ margin: 0 }}>Called by {m.organiser_name}. Emailed to {m.emailed_uids.length} of {m.invitee_uids.length}.</p>
          <div className="btn-row" style={{ margin: '10px 0' }}>
            <button className="btn ghost small" onClick={() => downloadIcs(m)}>Download .ics</button>
            <button className="btn ghost small" onClick={async () => {
              const emails = m.invitee_uids.map((u) => people.get(u)?.email).filter(Boolean);
              await navigator.clipboard.writeText(emails.join(', ')); setCopied(true); setTimeout(() => setCopied(false), 2000);
            }}>{copied ? 'Copied' : 'Copy invitee emails'}</button>
            {m.status === 'scheduled' && !past && notEmailed > 0 && (
              <button className="btn ghost small" onClick={() => void act(() => updateMeeting(s.user!.uid, m.id, { requestEmail: true }))}>
                Email invitations to {notEmailed} not yet emailed</button>
            )}
            {m.status === 'scheduled' && !past && (
              <button className="btn ghost small" onClick={() => {
                if (confirm(`Cancel "${m.title}"? Everyone already emailed is told.`)) void act(() => updateMeeting(s.user!.uid, m.id, { status: 'cancelled' }));
              }}>Cancel meeting</button>
            )}
          </div>
          {err && <p className="error">{err}</p>}
          <div className="scroll-x">
            <table className="data">
              <thead><tr><th>Invited</th><th>Space</th><th>Answer</th><th>{past ? 'Came' : ''}</th></tr></thead>
              <tbody>
                {m.invitee_uids.map((u) => {
                  const r = rsvps.get(u);
                  const who = roster.get(u);
                  return (
                    <tr key={u}>
                      <td>{who?.name ?? people.get(u)?.name ?? u}</td>
                      <td>{who?.space_name ?? <span className="muted">no longer on the roster</span>}</td>
                      <td>{r?.response ?? <span className="muted">—</span>}</td>
                      <td>{past && m.status === 'scheduled' && (
                        <input type="checkbox" aria-label="Came" checked={!!r?.attended}
                               onChange={(e) => void act(async () => { await setAttended(m.id, u, e.target.checked, r); await reload(); })} />
                      )}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- invitee: my meetings (on the People page) ----------

export function MyMeetings({ roster }: { roster: WithId<RosterEntry>[] | null }) {
  const s = useSession();
  const [meetings, setMeetings] = useState<WithId<Meeting>[]>([]);
  const [rsvps, setRsvps] = useState<Map<string, Map<string, Rsvp>>>(new Map());
  const focus = new URLSearchParams(window.location.search).get('meeting');
  const names = useMemo(() => new Map((roster ?? []).map((r) => [r.id, `${r.name} (${r.space_name})`])), [roster]);

  const load = async () => {
    const ms = (await listMyMeetings(s.user!.uid))
      .filter((m) => m.status === 'scheduled' && (!isPast(m) || m.id === focus));
    setMeetings(ms);
    setRsvps(new Map(await Promise.all(ms.map(async (m) => [m.id, await listRsvps(m.id)] as const))));
  };
  useEffect(() => { void load().catch(() => undefined); }, [s.user?.uid]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!meetings.length) return null;
  return (
    <section style={{ marginBottom: 26 }}>
      <h2 style={{ marginBottom: 8 }}>Your meetings</h2>
      {meetings.map((m) => {
        const mine = rsvps.get(m.id)?.get(s.user!.uid);
        const coming = [...(rsvps.get(m.id) ?? new Map<string, Rsvp>()).entries()]
          .filter(([, r]) => r.response === 'yes').map(([u]) => names.get(u) ?? 'someone not on the roster');
        return (
          <div key={m.id} className={`msg ${m.id === focus || !mine?.response ? 'unread' : ''}`}>
            <div className="meta">{when(m.starts_at)} · {m.duration_min} min · called by {m.organiser_name}</div>
            <div><strong>{m.title}</strong></div>
            {m.location && <p style={{ margin: '6px 0 0' }}>Where: {/^https?:\/\//.test(m.location) ? <a href={m.location} target="_blank" rel="noreferrer">{m.location}</a> : m.location}</p>}
            {m.agenda && <p style={{ whiteSpace: 'pre-wrap', margin: '6px 0 0' }}>{m.agenda}</p>}
            <div className="btn-row" style={{ margin: '10px 0 4px' }}>
              {(['yes', 'maybe', 'no'] as const).map((r) => (
                <button key={r} className={`btn small ${mine?.response === r ? '' : 'ghost'}`}
                        onClick={async () => { await setRsvp(m.id, s.user!.uid, r, mine); await load(); }}>
                  {{ yes: "I'll be there", maybe: 'Maybe', no: "Can't make it" }[r]}
                </button>
              ))}
              <button className="btn ghost small" onClick={() => downloadIcs(m)}>Add to calendar</button>
            </div>
            <p className="muted" style={{ margin: 0 }}>
              {m.invitee_uids.length} invited{coming.length ? `; coming: ${coming.join(', ')}` : ''}.
            </p>
          </div>
        );
      })}
    </section>
  );
}
