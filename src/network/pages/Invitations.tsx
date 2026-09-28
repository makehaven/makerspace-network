// Invitations (GOVERNANCE §Invitations). An inviter names a person, their
// organisation, role and functions; the person signs in with that address,
// sees it filled in, corrects it and accepts. Bulk import is a pasted CSV, so
// an existing list — a Google Group's members, a meeting's attendees — becomes
// a set of invitations in one step without anyone being added unasked.

import { useEffect, useMemo, useState } from 'react';
import { useSession } from '../session';
import { can } from '../capabilities';
import { acceptInvitation, createInvitations, listInvitations, listSpaceIndex, myInvitations, updateInvitation, type InvitationDraft } from '../db';
import { invitationId, ORGANISER_ROLES, type ContactPreference, type Invitation, type SpaceIndex, type SpaceRole } from '../model';
import { FUNCTIONS, csvEsc, download, functionLabel, partnerTypeLabel, roleLabel } from './shared';

type WithId<T> = T & { id: string };
const SITE = 'https://makerspace.network';
export const inviteLink = (id: string) => `${SITE}/?page=join&invite=${encodeURIComponent(id)}`;
const expired = (i: Invitation) => i.expires_at.toMillis() < Date.now();

// ---------- CSV ----------

/** RFC 4180-ish: quoted fields, doubled quotes, commas and newlines inside quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim())) rows.push(row);
  return rows;
}

const ROLE_WORDS: Record<string, SpaceRole> = {
  admin: 'space_admin', space_admin: 'space_admin', editor: 'space_editor', space_editor: 'space_editor',
  team: 'space_editor', contact: 'space_contact', space_contact: 'space_contact', member: 'space_contact', partner: 'partner',
};

type Row = { line: number; draft?: InvitationDraft; org?: SpaceIndex & { id: string }; problem?: string; note?: string };

function matchOrg(text: string, orgs: (SpaceIndex & { id: string })[]) {
  const q = text.trim().toLowerCase();
  if (!q) return undefined;
  return orgs.find((o) => o.id === q)
    ?? orgs.find((o) => o.name.toLowerCase() === q)
    ?? (() => { const hits = orgs.filter((o) => o.name.toLowerCase().includes(q)); return hits.length === 1 ? hits[0] : undefined; })();
}

// ---------- steward / space admin tab ----------

export function InvitationsTab() {
  const s = useSession();
  const steward = !!s.stewardship && (s.stewardship.network_admin || s.stewardship.region_ids.length > 0);
  const adminSpaceIds = s.memberships.filter((m) => m.status === 'active' && m.role === 'space_admin').map((m) => m.space_id);
  const [orgs, setOrgs] = useState<(SpaceIndex & { id: string })[]>([]);
  const [invs, setInvs] = useState<WithId<Invitation>[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const load = async () => {
    try {
      const [o, i] = await Promise.all([listSpaceIndex(), listInvitations({ steward, adminSpaceIds })]);
      // An inviter may only invite to organisations they can act for.
      setOrgs(o.filter((x) => !x.proposed && (s.stewardship?.network_admin
        || (x.region_id && s.stewardship?.region_ids.includes(x.region_id)) || adminSpaceIds.includes(x.id))));
      setInvs(i);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };
  useEffect(() => { void load(); }, [s.user?.uid]); // eslint-disable-line react-hooks/exhaustive-deps

  const me = { uid: s.user!.uid, name: s.person?.name ?? s.user!.email ?? 'A steward' };
  const act = async (f: () => Promise<void>) => { setError(null); try { await f(); await load(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } };
  const pending = (invs ?? []).filter((i) => i.status === 'pending' && !expired(i));

  return (
    <>
      <ImportPanel orgs={orgs} existing={invs ?? []} steward={steward} onDone={load} />
      {error && <p className="error">{error}</p>}
      <div className="btn-row">
        <button className="btn ghost small" disabled={!pending.length} onClick={() => download('invitation-links.csv',
          [['Name', 'Email', 'Organisation', 'Role', 'Link'], ...pending.map((i) => [i.name, i.email, i.space_name, roleLabel(i.role), inviteLink(i.id)])]
            .map((l) => l.map(csvEsc).join(',')).join('\n'))}>
          Download {pending.length} pending link{pending.length === 1 ? '' : 's'} (for mail merge)</button>
      </div>
      {invs && !invs.length && <p className="muted">No invitations yet.</p>}
      {invs && invs.length > 0 && (
        <div className="scroll-x">
          <table className="data">
            <thead><tr><th>Invited</th><th>Organisation</th><th>Role</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {invs.map((i) => {
                const state = i.status === 'pending' && expired(i) ? 'expired' : i.status;
                return (
                  <tr key={i.id} className={state === 'pending' ? '' : 'muted-row'}>
                    <td><strong>{i.name}</strong><br /><span className="muted">{i.email}</span></td>
                    <td>{i.space_name}<br /><span className="muted">by {i.invited_by_name}</span></td>
                    <td>{roleLabel(i.role)}{i.functions.length > 0 && <><br />{i.functions.map((f) => <span key={f} className="tag">{functionLabel(f)}</span>)}</>}</td>
                    <td><span className={`pill ${state === 'accepted' ? 'ok' : state === 'pending' ? 'flag' : ''}`}>{state}</span>
                      {state === 'pending' && <><br /><span className="muted">{i.emailed_at ? `emailed ${new Date(i.emailed_at).toLocaleDateString()}` : i.email_requested_at ? 'email requested' : 'not emailed'}</span></>}</td>
                    <td className="actions">
                      {state === 'pending' && <>
                        <button className="btn ghost small" onClick={async () => {
                          await navigator.clipboard.writeText(inviteLink(i.id)); setCopied(i.id); setTimeout(() => setCopied(null), 2000);
                        }}>{copied === i.id ? 'Copied' : 'Copy link'}</button>
                        <button className="btn ghost small" onClick={() => void act(() => updateInvitation(me, i, { requestEmail: true }))}>
                          {i.emailed_at ? 'Email again' : 'Email it'}</button>
                        <button className="btn ghost small" onClick={() => void act(() => updateInvitation(me, i, { status: 'revoked' }))}>Revoke</button>
                      </>}
                      {(state === 'expired' || state === 'revoked') && (
                        <button className="btn ghost small" onClick={() => void act(() => updateInvitation(me, i, { status: 'pending', renew: true }))}>Renew</button>
                      )}
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

function ImportPanel({ orgs, existing, steward, onDone }: {
  orgs: (SpaceIndex & { id: string })[]; existing: WithId<Invitation>[]; steward: boolean; onDone: () => Promise<void>;
}) {
  const s = useSession();
  const [text, setText] = useState('');
  const [note, setNote] = useState('');
  const [sendEmail, setSendEmail] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const known = useMemo(() => new Map(existing.map((i) => [i.id, i])), [existing]);

  const rows: Row[] = useMemo(() => {
    const table = parseCsv(text);
    if (!table.length) return [];
    const head = table[0].map((h) => h.trim().toLowerCase());
    const hasHead = head.includes('email');
    const col = (name: string, fallback: number) => (hasHead ? head.indexOf(name) : fallback);
    const [cName, cEmail, cOrg, cRole, cFns, cNote] = [col('name', 0), col('email', 1), col('organisation', 2) >= 0 ? col('organisation', 2) : col('organization', 2), col('role', 3), col('functions', 4), col('note', 5)];
    return table.slice(hasHead ? 1 : 0).map((r, k): Row => {
      const line = k + (hasHead ? 2 : 1);
      const get = (c: number) => (c >= 0 ? (r[c] ?? '').trim() : '');
      const email = get(cEmail).toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { line, problem: `no valid email (“${get(cEmail)}”)` };
      const name = get(cName) || email.split('@')[0];
      const org = matchOrg(get(cOrg), orgs);
      if (!org) return { line, problem: `organisation “${get(cOrg)}” not found — add it first, or use its exact name` };
      const roleWord = get(cRole).toLowerCase();
      let role: SpaceRole = org.kind === 'partner' ? 'partner' : (ROLE_WORDS[roleWord] ?? 'space_contact');
      if (org.kind !== 'partner' && role === 'partner') role = 'space_contact';
      const functions = get(cFns).split(/[;|]/).map((f) => f.trim().toLowerCase()).filter(Boolean)
        .map((f) => FUNCTIONS.find((x) => x.id === f || x.label.toLowerCase().startsWith(f))?.id).filter(Boolean) as string[];
      const prior = known.get(invitationId(org.id, email));
      if (prior) return { line, org, problem: `already ${prior.status === 'pending' && !expired(prior) ? 'invited' : prior.status} — ${prior.status === 'accepted' ? 'nothing to do' : 'renew it below'}` };
      return { line, org, draft: { email, name, space_id: org.id, role, functions: [...new Set(functions)], note: get(cNote) }, note: roleWord && !ROLE_WORDS[roleWord] ? `role “${roleWord}” not recognised, using contact` : undefined };
    });
  }, [text, orgs, known]);

  const good = rows.filter((r) => r.draft);
  const spaces = useMemo(() => new Map(orgs.map((o) => [o.id, o])), [orgs]);

  return (
    <details className="card form-card" style={{ marginTop: 14 }} open={!existing.length}>
      <summary><strong>Invite people</strong> <span className="muted">— one per line, or paste a list</span></summary>
      <p className="muted">
        Columns: <code>name, email, organisation, role, functions, note</code>. A header row is optional.
        Organisation is the name as listed (or its id); role is admin, editor or contact (partners are always partner);
        functions are separated by semicolons, e.g. <code>director; safety</code>.
        {!steward && ' You can invite people to your own space.'}
      </p>
      <label className="field"><span>People</span>
        <textarea rows={6} value={text} onChange={(e) => setText(e.target.value)}
                  placeholder={'name,email,organisation,role,functions\nJo Maker,jo@example.org,MakeHaven,editor,director; safety'} /></label>
      <label className="field"><span>A line from you <em>optional; shown with every invitation that has none of its own</em></span>
        <textarea rows={2} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} /></label>
      {rows.length > 0 && (
        <div className="scroll-x">
          <table className="data">
            <thead><tr><th>Line</th><th>Person</th><th>Organisation</th><th>Role</th><th></th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.line} className={r.problem ? 'warn-row' : ''}>
                  <td>{r.line}</td>
                  <td>{r.draft ? <><strong>{r.draft.name}</strong><br /><span className="muted">{r.draft.email}</span></> : '—'}</td>
                  <td>{r.org?.name ?? '—'}{r.org?.kind === 'partner' && <><br /><span className="muted">{partnerTypeLabel(r.org.partner_type)}</span></>}</td>
                  <td>{r.draft ? roleLabel(r.draft.role) : '—'}{r.draft?.functions.map((f) => <span key={f} className="tag">{functionLabel(f)}</span>)}</td>
                  <td className="muted">{r.problem ?? r.note ?? 'ready'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <label className="check standalone"><input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} /> Email the invitations now
        <span className="muted"> (needs the mailer; otherwise copy the links or download them for your own emails)</span></label>
      {msg && <p className="muted">{msg}</p>}
      <div className="btn-row">
        <button className="btn" disabled={busy || !good.length} onClick={async () => {
          setBusy(true); setMsg(null);
          try {
            const n = await createInvitations({ uid: s.user!.uid, name: s.person?.name ?? s.user!.email ?? 'A steward' },
              good.map((r) => ({ ...r.draft!, note: r.draft!.note || note })), spaces, { sendEmail });
            setMsg(`Created ${n} invitation${n === 1 ? '' : 's'}.`); setText('');
            await onDone();
          } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
          setBusy(false);
        }}>{busy ? 'Creating…' : `Create ${good.length} invitation${good.length === 1 ? '' : 's'}`}</button>
      </div>
    </details>
  );
}

// ---------- the invitee: accept on the join page ----------

/** Pending invitations for the signed-in address, prefilled and correctable.
 *  Renders nothing when there are none. */
export function PendingInvitations({ focusId, onAccepted, onLoaded }: {
  focusId?: string | null; onAccepted: () => void; onLoaded?: (n: number) => void;
}) {
  const s = useSession();
  const email = (s.user?.email ?? '').toLowerCase();
  const [invs, setInvs] = useState<WithId<Invitation>[] | null>(null);
  useEffect(() => {
    if (!email) return;
    myInvitations(email).then((x) => { setInvs(x); onLoaded?.(x.length); }).catch(() => { setInvs([]); onLoaded?.(0); });
  }, [email]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!invs) return null;
  const missing = focusId && !invs.some((i) => i.id === focusId);
  if (!invs.length) {
    return missing ? (
      <p className="notice">
        There's no open invitation for <strong>{email}</strong> at that link. It may have been accepted,
        revoked or expired — or it was sent to another address, in which case sign out and sign in with that one.
      </p>
    ) : null;
  }
  const ordered = [...invs].sort((a, b) => (a.id === focusId ? -1 : b.id === focusId ? 1 : 0));
  return <>{ordered.map((i) => <AcceptCard key={i.id} inv={i} onAccepted={onAccepted} />)}</>;
}

function AcceptCard({ inv, onAccepted }: { inv: WithId<Invitation>; onAccepted: () => void }) {
  const s = useSession();
  const [name, setName] = useState(s.person?.name ?? inv.name);
  const [phone, setPhone] = useState(s.person?.phone ?? '');
  const [functions, setFunctions] = useState(inv.functions);
  const organiser = ORGANISER_ROLES.includes(inv.role);
  const [pref, setPref] = useState<ContactPreference>(organiser ? 'email' : 'relay');
  const [invitations, setInvitations] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  return (
    <form className="card form-card" onSubmit={async (e) => {
      e.preventDefault(); setBusy(true); setErr(null);
      try {
        await acceptInvitation({
          uid: s.user!.uid, email: s.user!.email ?? inv.email, inv, name, phone: phone.trim() || null,
          existingPerson: s.person,
          primaryStatus: s.memberships.find((m) => m.space_id === s.person?.primary_space_id)?.status ?? null,
          functions, contact_preference: pref, invitations,
        });
        await s.refresh();
        onAccepted();
      } catch (x) { setErr(x instanceof Error ? x.message : String(x)); }
      setBusy(false);
    }}>
      <h2>{inv.invited_by_name} invited you to join at {inv.space_name}</h2>
      <p className="muted">As {roleLabel(inv.role).toLowerCase()}. Check what they filled in, correct anything, and accept.
        Nothing about you is shown to anyone until you do.</p>
      {inv.note && <blockquote className="note">{inv.note}</blockquote>}
      <div className="inline-fields">
        <label className="field"><span>Your name</span><input required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label className="field"><span>Phone <em>optional</em></span><input maxLength={40} value={phone} onChange={(e) => setPhone(e.target.value)} /></label>
      </div>
      <h4>What you do there</h4>
      <div className="checks">
        {FUNCTIONS.map((f) => (
          <label key={f.id} className={`check ${functions.includes(f.id) ? 'on' : ''}`}>
            <input type="checkbox" checked={functions.includes(f.id)}
                   onChange={(e) => setFunctions(e.target.checked ? [...functions, f.id] : functions.filter((x) => x !== f.id))} />
            {f.label}
          </label>
        ))}
      </div>
      <h4>How verified people reach you</h4>
      {organiser ? (
        <div className="radios compact">
          <label className="radio"><input type="radio" checked={pref === 'email'} onChange={() => setPref('email')} /> Show my email address</label>
          <label className="radio"><input type="radio" checked={pref === 'relay'} onChange={() => setPref('relay')} /> Relay messages, never show my address</label>
          <label className="radio"><input type="radio" checked={pref === 'phone'} onChange={() => setPref('phone')} disabled={!phone.trim()} /> Show my phone number</label>
        </div>
      ) : <p className="muted">By relay. Verified people can message you through the network; your address is never shown.</p>}
      <label className="check standalone">
        <input type="checkbox" checked={invitations} onChange={(e) => setInvitations(e.target.checked)} /> Invite me to network meetings that concern me
      </label>
      {err && <p className="error">{err}</p>}
      <div className="btn-row"><button className="btn" disabled={busy || !name.trim()}>{busy ? 'Accepting…' : 'Accept'}</button></div>
      {can(s, 'roster.read') && <p className="muted">You're already verified elsewhere; this adds {inv.space_name} to your memberships.</p>}
    </form>
  );
}
