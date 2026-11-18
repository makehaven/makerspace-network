// A space's staff answer two sets of questions here: the public listing (a
// submission the steward merges into data/spaces, with the space as source)
// and the network's annual data (private to the space and its stewards; the
// network publishes aggregates only). Anyone with standing at the space can
// come back and continue — the page always opens on what is already saved.

import { useEffect, useState } from 'react';
import { useSession } from '../session';
import { CAPABILITIES, CAPABILITY_DOMAINS, VOCAB, spaceById } from '../../data';
import { STAFF_ROLES } from '../model';
import { getListingSubmission, listingFromRecord, submitListing, upgradeListing, type ListingAnswers, type ListingSubmission } from '../spaceData';
import { PageLink, SignIn } from './shared';
import StandardsAssessment from './StandardsAssessment';
import AnnualData from './AnnualData';
import NumberInput from './NumberInput';

const options = (vocab: keyof typeof VOCAB) => [...VOCAB[vocab].values()].filter((v) => v.id !== 'unknown' && !v.deprecated);
const day = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

export default function SpaceData({ spaceId }: { spaceId?: string }) {
  const s = useSession();
  type Tab = 'listing' | 'annual' | 'standards';
  const [tab, setTab] = useState<Tab>(() => {
    const t = new URLSearchParams(window.location.search).get('tab');
    return t === 'annual' || t === 'standards' ? t : 'listing';
  });
  // A tab once opened stays mounted (hidden), so switching away never throws
  // away a listing that hasn't been sent or a save that is about to happen.
  const [seen, setSeen] = useState<Set<Tab>>(() => new Set([tab]));
  const show = (t: Tab) => { setTab(t); setSeen((x) => (x.has(t) ? x : new Set([...x, t]))); };

  // Arriving straight from the join form ("Answer now"), the session still
  // holds the memberships from before the join. Reload them once on arrival.
  const [fresh, setFresh] = useState(false);
  useEffect(() => {
    if (s.status !== 'signed_in' || fresh) return;
    s.refresh().finally(() => setFresh(true));
  }, [s.status, fresh]); // eslint-disable-line react-hooks/exhaustive-deps

  if (s.status === 'loading' || (s.status === 'signed_in' && !fresh)) return <div className="wrap" style={{ paddingTop: 40 }}><p>Loading…</p></div>;
  if (s.status === 'signed_out') return <div className="wrap narrow" style={{ paddingTop: 30 }}><SignIn context="organisation" /></div>;

  const space = spaceId ? spaceById(spaceId) : undefined;
  const mine = s.memberships.find((m) => m.space_id === spaceId && m.status === 'active' && STAFF_ROLES.includes(m.role));
  const steward = !!s.stewardship && (s.stewardship.network_admin
    || (!!space?.region_ids?.[0] && s.stewardship.region_ids.includes(space.region_ids[0])));
  const here = s.memberships.find((m) => m.space_id === spaceId);
  // Where a colleague sent by "Ask a colleague" should come back to after joining.
  const q = new URLSearchParams(window.location.search);
  const back: Record<string, string> = { ...(spaceId ? { space: spaceId } : {}), ...(q.get('tab') ? { tab: q.get('tab')! } : {}), ...(q.get('section') ? { section: q.get('section')! } : {}) };

  return (
    <>
      <section className="hero">
        <div className="wrap narrow">
          <p className="eyebrow">Your space</p>
          <h1>{space?.name ?? 'Space data'}</h1>
          <p className="lede">
            Three parts. The <strong>listing</strong> is what the public directory says about you.
            The <strong>annual data</strong> is how the network understands its spaces — never shown
            attributed to you, only in totals and ranges. The <strong>Standards self-assessment</strong> is
            for your own improvement and stays with your staff. Answer what you can and come back for
            the rest — anyone on your staff can pick it up.
          </p>
        </div>
      </section>
      <div className="wrap narrow" style={{ paddingTop: 24, paddingBottom: 60 }}>
        {!space && <p className="notice">That space isn't in the directory.</p>}
        {space && !mine && !steward && (
          <div className="notice">
            <p style={{ margin: 0 }}>Only {space.name}'s admins and editors can answer these.</p>
            {!here ? (
              <p style={{ margin: '8px 0 0' }}>
                If you work there, join {space.name} first. With an email address at the space's own domain you can
                start straight away. <PageLink className="btn small" page="join" params={back}>Join {space.name}</PageLink>
              </p>
            ) : here.status === 'pending' ? (
              <p style={{ margin: '8px 0 0' }}>You've asked to join and are waiting for {space.name}'s admin or the regional steward to confirm you. <PageLink page="join">Your profile</PageLink></p>
            ) : (
              <p style={{ margin: '8px 0 0' }}>You're listed there as a contact. Ask {space.name}'s admin or the regional steward to make you an editor. <PageLink page="join">Your profile</PageLink></p>
            )}
          </div>
        )}
        {space && (mine || steward) && (
          <>
            <div className="tabs" role="tablist">
              <button role="tab" aria-selected={tab === 'listing'} className={tab === 'listing' ? 'on' : ''} onClick={() => show('listing')}>Public listing</button>
              <button role="tab" aria-selected={tab === 'annual'} className={tab === 'annual' ? 'on' : ''} onClick={() => show('annual')}>Annual data — members, sq ft, finances</button>
              <button role="tab" aria-selected={tab === 'standards'} className={tab === 'standards' ? 'on' : ''} onClick={() => show('standards')}>Standards self-assessment</button>
            </div>
            {seen.has('listing') && <div role="tabpanel" hidden={tab !== 'listing'}><ListingForm spaceId={space.id} canEdit={!!mine} /></div>}
            {seen.has('annual') && <div role="tabpanel" hidden={tab !== 'annual'}><AnnualData spaceId={space.id} canEdit={!!mine} /></div>}
            {seen.has('standards') && <div role="tabpanel" hidden={tab !== 'standards'}>{mine
              ? <StandardsAssessment spaceId={space.id} canEdit />
              : <p className="notice">A space's self-assessment is private to its staff. Stewards only see a summary if the space shares one.</p>}</div>}
          </>
        )}
      </div>
    </>
  );
}

// ---------- the public listing ----------

function ListingForm({ spaceId, canEdit }: { spaceId: string; canEdit: boolean }) {
  const s = useSession();
  return <ListingEditor spaceId={spaceId} canEdit={canEdit} load={() => getListingSubmission(spaceId)}
    submit={(f) => submitListing(spaceId, s.user!.uid, s.person?.name ?? s.user!.email ?? '', f)} />;
}

/** The listing form itself, given how to load and send it (the browser tests pass fakes). */
export function ListingEditor({ spaceId, canEdit, load, submit }: {
  spaceId: string; canEdit: boolean;
  load: () => Promise<ListingSubmission | null>; submit: (f: ListingAnswers) => Promise<void>;
}) {
  const [f, setF] = useState<ListingAnswers | null>(null);
  const [meta, setMeta] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // The listing is sent as a whole, not saved as you type, so say when there
  // is something unsent and ask before the page is left with it.
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    load().then((sub) => {
      setF(upgradeListing(sub?.listing ?? listingFromRecord(spaceById(spaceId))));
      if (sub) setMeta(`Last submitted by ${sub.submitted_name} on ${day(sub.updated_at)}${sub.status === 'merged' ? ' — merged into the directory' : ' — waiting for the steward to merge'}.`);
    }).catch((e) => setMsg(e instanceof Error ? e.message : String(e)));
  }, [spaceId]);

  useEffect(() => {
    if (!dirty) return;
    const onLeave = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', onLeave);
    return () => window.removeEventListener('beforeunload', onLeave);
  }, [dirty]);

  if (!f) return <p>{msg ?? 'Loading…'}</p>;
  const set = (patch: Partial<ListingAnswers>) => { setF({ ...f, ...patch }); setMsg(null); setDirty(true); };
  const toggle = (key: 'capabilities' | 'membership_models', id: string, on: boolean) => {
    const next: Partial<ListingAnswers> = { [key]: on ? [...(f[key] ?? []), id] : (f[key] ?? []).filter((x) => x !== id) };
    // A capability taken away takes its level with it.
    if (key === 'capabilities' && !on && f.capability_levels?.[id]) {
      const { [id]: _gone, ...rest } = f.capability_levels;
      next.capability_levels = rest;
    }
    set(next);
  };
  const setLevel = (id: string, level: string) => {
    const { [id]: _old, ...rest } = f.capability_levels ?? {};
    set({ capability_levels: level ? { ...rest, [id]: level } : rest });
  };

  return (
    <form className="card form-card" onSubmit={async (e) => {
      e.preventDefault(); setBusy(true);
      try {
        await submit(f);
        setMsg('Sent. The steward will merge it into your listing, with your space recorded as the source.');
        setDirty(false);
        setMeta(`Last submitted by you just now — waiting for the steward to merge.`);
      } catch (x) { setMsg(x instanceof Error ? x.message : String(x)); }
      setBusy(false);
    }}>
      <fieldset disabled={!canEdit} style={{ border: 0, padding: 0, margin: 0 }}>
      <p className="muted">Pre-filled from your current listing. Correct anything that's wrong; leave blank what you'd rather not say — a blank is shown as unknown, never guessed.</p>
      {meta && <p className="notice info">{meta}</p>}

      <label className="field"><span>One-line summary</span>
        <input maxLength={300} value={f.summary ?? ''} onChange={(e) => set({ summary: e.target.value })} /></label>

      <h3>What can people make here?</h3>
      <div className="notice info level-key">
        <p style={{ margin: '0 0 6px' }}>Tick what you have, then say how much of it, if you like:</p>
        <ul>{options('CapabilityLevel').map((o) => <li key={o.id}><strong>{o.label}</strong>: {o.description}</li>)}</ul>
      </div>
      {CAPABILITY_DOMAINS.map((d) => {
        const caps = CAPABILITIES.filter((c) => (c as { domain?: string }).domain === d.id);
        if (!caps.length) return null;
        return (
          <div key={d.id}>
            <h4>{d.label}</h4>
            <div className="checks">
              {caps.map((c) => {
                const on = !!f.capabilities?.includes(c.id);
                return (
                  <span key={c.id} className={`check-with-level ${on ? 'on' : ''}`}>
                    <label className={`check ${on ? 'on' : ''}`}>
                      <input type="checkbox" checked={on} onChange={(e) => toggle('capabilities', c.id, e.target.checked)} />
                      {c.label}
                    </label>
                    {on && (
                      <select className="level" aria-label={`How much ${c.label}`} value={f.capability_levels?.[c.id] ?? ''} onChange={(e) => setLevel(c.id, e.target.value)}>
                        <option value="">How much?</option>
                        {options('CapabilityLevel').map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                      </select>
                    )}
                  </span>
                );
              })}
            </div>
          </div>
        );
      })}

      <h3>Access and cost</h3>
      <label className="field"><span>How members get in</span>
        <select value={f.access_model ?? ''} onChange={(e) => set({ access_model: e.target.value })}>
          <option value="">Not saying / unknown</option>
          {options('AccessModel').map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select></label>
      <label className="field"><span>Hours, in your words</span>
        <input maxLength={300} value={f.hours_note ?? ''} placeholder="e.g. Staffed Tue–Sat 10–6; members 24/7" onChange={(e) => set({ hours_note: e.target.value })} /></label>
      <div className="radios compact">
        <span>Can the public visit or take a class without becoming a member?</span>
        <label className="radio"><input type="radio" checked={f.public_access === true} onChange={() => set({ public_access: true })} /> Yes</label>
        <label className="radio"><input type="radio" checked={f.public_access === false} onChange={() => set({ public_access: false })} /> No</label>
        <label className="radio"><input type="radio" checked={f.public_access == null} onChange={() => set({ public_access: null })} /> Not saying</label>
      </div>
      <h4>How people get access <span className="muted">(pick any)</span></h4>
      <div className="checks">
        {options('MembershipModel').map((o) => (
          <label key={o.id} className={`check ${f.membership_models?.includes(o.id) ? 'on' : ''}`}>
            <input type="checkbox" checked={!!f.membership_models?.includes(o.id)} onChange={(e) => toggle('membership_models', o.id, e.target.checked)} />
            {o.label}
          </label>
        ))}
      </div>
      <div className="radios compact">
        <span>Who can use it?</span>
        {options('Eligibility').map((o) => (
          <label key={o.id} className="radio"><input type="radio" checked={f.eligibility === o.id} onChange={() => set({ eligibility: o.id })} /> {o.label}</label>
        ))}
        <label className="radio"><input type="radio" checked={!f.eligibility} onChange={() => set({ eligibility: '' })} /> Not saying</label>
      </div>
      <div className="inline-fields">
        <label className="field"><span>Monthly cost from ($)</span>
          <NumberInput value={f.monthly_cost_min} onChange={(v) => set({ monthly_cost_min: v })} /></label>
        <label className="field"><span>Monthly cost up to ($)</span>
          <NumberInput value={f.monthly_cost_max} onChange={(v) => set({ monthly_cost_max: v })} /></label>
        <label className="field"><span>Day pass ($)</span>
          <NumberInput value={f.day_pass_usd} onChange={(v) => set({ day_pass_usd: v })} /></label>
      </div>
      <label className="field"><span>Young people</span>
        <select value={f.minor_policy ?? ''} onChange={(e) => set({ minor_policy: e.target.value })}>
          <option value="">Not saying / unknown</option>
          {options('MinorPolicy').map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select></label>

      <h3>Public contact</h3>
      <div className="inline-fields">
        <label className="field"><span>Email</span><input type="email" value={f.email ?? ''} onChange={(e) => set({ email: e.target.value })} /></label>
        <label className="field"><span>Phone</span><input value={f.phone ?? ''} onChange={(e) => set({ phone: e.target.value })} /></label>
      </div>
      <label className="field"><span>Anything else the steward should know</span>
        <textarea rows={3} maxLength={2000} value={f.notes ?? ''} onChange={(e) => set({ notes: e.target.value })} /></label>

      {msg && <p className="muted">{msg}</p>}
      {canEdit && <div className="btn-row"><button className="btn" disabled={busy}>{busy ? 'Sending…' : 'Send listing'}</button>
        {dirty && !busy && <span className="std-save" role="status">Not sent yet — this part isn't saved until you send it.</span>}</div>}
      </fieldset>
    </form>
  );
}
