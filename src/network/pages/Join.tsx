import { useEffect, useMemo, useState } from 'react';
import { useSession } from '../session';
import { SPACES, spaceById } from '../../data';
import { navigate } from '../../App';
import {
  domainOfEmail, domainOfUrl, isCommonEmailDomain, US_STATES, stateName, ORGANISER_ROLES, STAFF_ROLES,
  type ContactPreference, type SpaceRole, type Membership, type PartnerType, type SpaceIndex,
} from '../model';
import {
  joinSpace, updateProfile, updateRosterSettings, bootstrapNetworkAdmin, getSpaceIndex, listSpaceIndex, type JoinOutcome,
} from '../db';
import { can } from '../capabilities';
import { PendingInvitations } from './Invitations';
import { getListingSubmission, getSpaceMetrics, reportingYear } from '../spaceData';
import { FUNCTIONS, PARTNER_TYPES, PageLink, SignIn, StatusPill, partnerTypeLabel, roleLabel } from './shared';

const BOOTSTRAP = ['jrlogan@makehaven.org'];

export default function Join({ spaceId }: { spaceId?: string }) {
  const s = useSession();
  const [joining, setJoining] = useState(false);
  const inviteId = new URLSearchParams(window.location.search).get('invite');
  const [accepted, setAccepted] = useState(0);
  const [invited, setInvited] = useState(0);

  if (s.status === 'loading') return <div className="wrap" style={{ paddingTop: 40 }}><p>Loading…</p></div>;

  return (
    <>
      <section className="hero">
        <div className="wrap narrow">
          <p className="eyebrow">People</p>
          <h1>{s.person ? 'Your place in the network' : 'Join the network'}</h1>
          <p className="lede">
            Sign up as someone connected to a makerspace, or to an organisation that works with
            them — an agency, funder, support organisation, school or network. You'll be reachable
            for the meetings that concern you, you'll be able to find your counterparts in any
            state, and when you move on, someone else can pick up where you left off.
          </p>
        </div>
      </section>
      <div className="wrap narrow" style={{ paddingTop: 30, paddingBottom: 60 }}>
        {s.status === 'signed_out' && <SignIn why={inviteId ? 'You have been invited. Sign in with the email address the invitation was sent to.' : undefined} />}
        {s.status === 'signed_in' && <BootstrapAdmin />}
        {s.status === 'signed_in' && <PendingInvitations key={accepted} focusId={inviteId} onAccepted={() => setAccepted((n) => n + 1)} onLoaded={setInvited} />}
        {s.status === 'signed_in' && invited > 0 && !s.person && !joining && (
          <p className="muted">Not right? <button type="button" className="linkish" onClick={() => setJoining(true)}>Join a different space or organisation instead</button></p>
        )}
        {s.status === 'signed_in' && !(invited > 0 && !s.person && !joining) && (!s.person || joining || (spaceId && !s.memberships.some((m) => m.space_id === spaceId)))
          ? <JoinForm presetSpaceId={spaceId} onDone={() => { setJoining(false); void s.refresh(); }} />
          : s.status === 'signed_in' && <Profile onJoinAnother={() => setJoining(true)} />}
      </div>
    </>
  );
}

// The first network admin has to exist before the directory can be synced into
// the index, and nobody can join a directory space until it is — so this sits
// above the join form, not behind having joined something.
function BootstrapAdmin() {
  const s = useSession();
  const [error, setError] = useState<string | null>(null);
  if (!BOOTSTRAP.includes((s.user?.email ?? '').toLowerCase()) || s.stewardship) return null;
  return (
    <div className="notice">
      <p style={{ margin: 0 }}>
        This address is the network's bootstrap admin and no stewardship exists yet.
        Set it up, then open the Steward page and sync the directory into the index.
      </p>
      <div className="btn-row">
        <button type="button" className="btn" onClick={async () => {
          try { await bootstrapNetworkAdmin(s.user!.uid); await s.refresh(); navigate('steward'); }
          catch (e) { setError(e instanceof Error ? e.message : String(e)); }
        }}>Set up network admin</button>
      </div>
      {error && <p className="error">{error}</p>}
    </div>
  );
}

// ---------- the join form ----------

function JoinForm({ presetSpaceId, onDone }: { presetSpaceId?: string; onDone: () => void }) {
  const s = useSession();
  const user = s.user!;
  const email = (user.email ?? '').toLowerCase();
  const emailDomain = domainOfEmail(email);

  const [name, setName] = useState(s.person?.name ?? user.displayName ?? '');
  const [phone, setPhone] = useState(s.person?.phone ?? '');
  const [search, setSearch] = useState('');
  const [chosen, setChosen] = useState<string | null>(presetSpaceId ?? null);
  const [proposing, setProposing] = useState(false);
  const [proposal, setProposal] = useState({ name: '', website: '', city: '', state: '', partner_type: '' as PartnerType | '' });
  // A makerspace comes from the public directory; a partner organisation only
  // exists in the index, so partner mode searches that instead.
  const [mode, setMode] = useState<'makerspace' | 'partner'>('makerspace');
  const [partners, setPartners] = useState<(SpaceIndex & { id: string })[]>([]);
  const [role, setRole] = useState<SpaceRole>('space_contact');
  const [functions, setFunctions] = useState<string[]>([]);
  const [pref, setPref] = useState<ContactPreference>('relay');
  const [invitations, setInvitations] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<JoinOutcome | null>(null);
  const [indexed, setIndexed] = useState<boolean | null>(null);

  const partnerOrg = mode === 'partner' && chosen ? partners.find((p) => p.id === chosen) : undefined;
  const space = mode === 'makerspace' && chosen ? spaceById(chosen) : undefined;
  const spaceDomain = domainOfUrl(space?.contact?.website);
  const domainOk = !!space && !!spaceDomain && spaceDomain === emailDomain
    && !isCommonEmailDomain(emailDomain) && user.emailVerified;
  const organiser = mode === 'partner' || ORGANISER_ROLES.includes(role);

  useEffect(() => {
    if (mode !== 'partner') return;
    listSpaceIndex().then((xs) => setPartners(xs.filter((x) => x.kind === 'partner'))).catch(() => setPartners([]));
  }, [mode]);

  useEffect(() => {
    if (!chosen || proposing) { setIndexed(null); return; }
    getSpaceIndex(chosen).then((x) => setIndexed(!!x)).catch(() => setIndexed(false));
  }, [chosen, proposing]);
  useEffect(() => { if (!domainOk) setRole('space_contact'); }, [domainOk]);
  useEffect(() => { if (!organiser) setPref('relay'); }, [organiser]);

  const partnerMatches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return partners.filter((p) => p.name.toLowerCase().includes(q) || (p.state ?? '').toLowerCase() === q).slice(0, 8);
  }, [search, partners]);

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return SPACES.filter((sp) => sp.status !== 'closed' && (
      sp.name.toLowerCase().includes(q) || (sp.address?.locality ?? '').toLowerCase().includes(q)
      || (sp.address?.region ?? '').toLowerCase() === q)).slice(0, 8);
  }, [search]);

  const slug = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  const proposedId = proposing && proposal.name && proposal.state
    ? `proposed-${slug(proposal.name)}-${proposal.state.toLowerCase()}` : null;

  const submit = async () => {
    setBusy(true); setError(null);
    try {
      const target = proposing ? proposedId! : chosen!;
      const out = await joinSpace({
        uid: user.uid, email, emailVerified: user.emailVerified,
        name, phone: phone.trim() || null, existingPerson: s.person,
        primaryStatus: s.memberships.find((m) => m.space_id === s.person?.primary_space_id)?.status ?? null,
        spaceId: target,
        proposal: proposing ? {
          name: proposal.name, website: proposal.website.trim() || null,
          city: proposal.city.trim() || null, state: proposal.state,
          partner_type: mode === 'partner' && proposal.partner_type ? proposal.partner_type : undefined,
        } : undefined,
        wantsRole: role, functions, contact_preference: pref, invitations,
      });
      setOutcome(out);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
  };

  if (outcome) {
    const spaceName = proposing ? proposal.name : (space?.name ?? partnerOrg?.name);
    return (
      <div className="card form-card">
        <h2>{outcome.kind === 'active' ? "You're in" : 'Request sent'}</h2>
        {outcome.kind === 'active' ? (
          <p>
            You're now {outcome.role === 'space_admin' ? 'the admin of' : 'listed at'} <strong>{spaceName}</strong>
            {outcome.claimed && ' and have claimed its listing'}. You can see and reach verified people
            across the network on the <PageLink page="people">People</PageLink> page.
          </p>
        ) : outcome.role === 'partner' ? (
          <p>
            You're listed as a partner at <strong>{spaceName}</strong>, waiting for confirmation by{' '}
            {outcome.reason === 'proposed' ? 'the network admin, who will also add the organisation' : 'the regional steward'}.
            Once confirmed you'll see and reach people across the network and receive the meeting invitations meant for you.
          </p>
        ) : (
          <p>
            You're listed at <strong>{spaceName}</strong> as a contact, waiting for confirmation by{' '}
            {outcome.reason === 'proposed' ? 'the network admin, who will also add the space to the directory'
              : outcome.reason === 'already_claimed' ? "the space's existing admin or the steward"
              : "the space's admin or the regional steward"}. You'll get meeting invitations once confirmed.
          </p>
        )}
        {outcome.kind === 'active' && STAFF_ROLES.includes(outcome.role) && space
          ? <StaffNext spaceId={space.id} onDone={onDone} />
          : <div className="btn-row"><button className="btn" onClick={onDone}>Continue</button></div>}
      </div>
    );
  }

  return (
    <form className="card form-card" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
      <h2>About you</h2>
      <p className="muted">Signed in as {email}. <button type="button" className="linkish" onClick={() => void s.signOut()}>Not you?</button></p>
      <label className="field"><span>Your name</span>
        <input required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} /></label>
      <label className="field"><span>Phone <em>optional</em></span>
        <input maxLength={40} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Only shown if you choose to" /></label>

      <h2>{mode === 'partner' ? 'Your organisation' : 'Your space'}</h2>
      {!chosen && !proposing && (
        <div className="radios compact">
          <label className="radio"><input type="radio" checked={mode === 'makerspace'} onChange={() => { setMode('makerspace'); setSearch(''); }} /> I'm part of a makerspace</label>
          <label className="radio"><input type="radio" checked={mode === 'partner'} onChange={() => { setMode('partner'); setSearch(''); }} /> I'm at an organisation that works with makerspaces — an agency, funder, support organisation, school, company or network</label>
        </div>
      )}
      {mode === 'partner' && !proposing && !partnerOrg && (
        <>
          <label className="field"><span>Find your organisation</span>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name or state code" /></label>
          {partnerMatches.length > 0 && (
            <ul className="picker">
              {partnerMatches.map((p) => (
                <li key={p.id}><button type="button" onClick={() => { setChosen(p.id); setSearch(''); }}>
                  <strong>{p.name}</strong> <span className="muted">{[partnerTypeLabel(p.partner_type), p.city, p.state].filter(Boolean).join(' · ')}</span>
                </button></li>
              ))}
            </ul>
          )}
          <p className="muted" style={{ marginTop: 10 }}>
            Not there?{' '}
            <button type="button" className="linkish" onClick={() => setProposing(true)}>Add your organisation</button>
          </p>
        </>
      )}
      {partnerOrg && !proposing && (
        <div className="chosen">
          <div><strong>{partnerOrg.name}</strong> <span className="muted">{[partnerTypeLabel(partnerOrg.partner_type), partnerOrg.state].filter(Boolean).join(' · ')}</span></div>
          <button type="button" className="linkish" onClick={() => setChosen(null)}>change</button>
        </div>
      )}
      {mode === 'makerspace' && !proposing && !space && (
        <>
          <label className="field"><span>Find your makerspace</span>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, town or state code" autoFocus /></label>
          {matches.length > 0 && (
            <ul className="picker">
              {matches.map((sp) => (
                <li key={sp.id}><button type="button" onClick={() => { setChosen(sp.id); setSearch(''); }}>
                  <strong>{sp.name}</strong> <span className="muted">{[sp.address?.locality, sp.address?.region].filter(Boolean).join(', ')}</span>
                </button></li>
              ))}
            </ul>
          )}
          <p className="muted" style={{ marginTop: 10 }}>
            Not listed? The directory is Connecticut so far, and the network is not.{' '}
            <button type="button" className="linkish" onClick={() => setProposing(true)}>Add your space</button>
          </p>
        </>
      )}
      {space && !proposing && (
        <div className="chosen">
          <div><strong>{space.name}</strong> <span className="muted">{[space.address?.locality, space.address?.region].filter(Boolean).join(', ')}</span></div>
          <button type="button" className="linkish" onClick={() => setChosen(null)}>change</button>
        </div>
      )}
      {proposing && (
        <div className="subform">
          {mode === 'partner' && (
            <label className="field"><span>What kind of organisation</span>
              <select required value={proposal.partner_type} onChange={(e) => setProposal({ ...proposal, partner_type: e.target.value as PartnerType })}>
                <option value="">Choose</option>
                {PARTNER_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select></label>
          )}
          <label className="field"><span>{mode === 'partner' ? 'Organisation name' : 'Space name'}</span>
            <input required maxLength={160} value={proposal.name} onChange={(e) => setProposal({ ...proposal, name: e.target.value })} /></label>
          <label className="field"><span>Website</span>
            <input type="url" value={proposal.website} onChange={(e) => setProposal({ ...proposal, website: e.target.value })} placeholder="https://" /></label>
          <div className="two">
            <label className="field"><span>City</span>
              <input value={proposal.city} onChange={(e) => setProposal({ ...proposal, city: e.target.value })} /></label>
            <label className="field"><span>State</span>
              <select required value={proposal.state} onChange={(e) => setProposal({ ...proposal, state: e.target.value })}>
                <option value="">Choose</option>
                {US_STATES.map(([c, n]) => <option key={c} value={c}>{n}</option>)}
              </select></label>
          </div>
          <p className="muted">
            {mode === 'partner'
              ? <>You'll be a pending partner until the network admin confirms the organisation and you.{' '}</>
              : <>You'll be a pending contact until the network admin adds the space to the directory.{' '}</>}
            <button type="button" className="linkish" onClick={() => setProposing(false)}>{mode === 'partner' ? 'Pick a listed organisation instead' : 'Pick a listed space instead'}</button></p>
        </div>
      )}

      {(space || partnerOrg || proposedId) && (
        <>
          {indexed === false && !proposing && mode === 'makerspace' && (
            <p className="notice">This space isn't in the sign-up index yet. The network admin needs to sync the directory before you can join it — try again shortly.</p>
          )}
          <h2>Your role there</h2>
          {mode === 'partner' ? (
            <p className="muted">
              You'll join as an ecosystem partner. A steward confirms every partner — an email at the
              organisation's domain isn't enough on its own — and once confirmed you can see and reach
              people at makerspaces across the network, and they can reach you.
            </p>
          ) : domainOk ? (
            <div className="radios">
              {([
                ['space_admin', 'I look after this space\'s listing', 'Edit the record, confirm and invite other people at the space.'],
                ['space_editor', 'I\'m on the team', 'Edit the record. Your email or phone can be shown to verified people.'],
                ['space_contact', 'Keep me in the loop', 'Meeting invitations and the people directory. Messages reach you by relay.'],
              ] as const).map(([r, title, body]) => (
                <label key={r} className={`radio ${role === r ? 'on' : ''}`}>
                  <input type="radio" name="role" checked={role === r} onChange={() => setRole(r)} />
                  <span><strong>{title}</strong><br /><span className="muted">{body}</span></span>
                </label>
              ))}
              <p className="muted">Your email is at <code>{spaceDomain}</code>, which matches {space?.name}'s website, so no approval is needed.</p>
            </div>
          ) : (
            <p className="muted">
              {space && spaceDomain
                ? <>Your email isn't at <code>{spaceDomain}</code>, so you'll join as a contact and {space.name}'s admin or the regional steward will confirm you. If you have an address at the space's domain, sign in with that instead.</>
                : <>You'll join as a contact, confirmed by the space's admin or the regional steward.</>}
            </p>
          )}

          <h3>{mode === 'partner' ? 'What you do' : 'What you do at the space'}</h3>
          <div className="checks">
            {FUNCTIONS.map((f) => (
              <label key={f.id} className={`check ${functions.includes(f.id) ? 'on' : ''}`}>
                <input type="checkbox" checked={functions.includes(f.id)}
                       onChange={(e) => setFunctions(e.target.checked ? [...functions, f.id] : functions.filter((x) => x !== f.id))} />
                {f.label}
              </label>
            ))}
          </div>

          <h3>How other verified people reach you</h3>
          {organiser ? (
            <div className="radios compact">
              <label className="radio"><input type="radio" checked={pref === 'relay'} onChange={() => setPref('relay')} /> Relay messages through the network, never show my address</label>
              <label className="radio"><input type="radio" checked={pref === 'email'} onChange={() => setPref('email')} /> Show my email address</label>
              <label className="radio"><input type="radio" checked={pref === 'phone'} onChange={() => setPref('phone')} disabled={!phone.trim()} /> Show my phone number</label>
            </div>
          ) : (
            <p className="muted">By relay. Verified people can message you through the network; your address is never shown.</p>
          )}
          <label className="check standalone">
            <input type="checkbox" checked={invitations} onChange={(e) => setInvitations(e.target.checked)} />
            Invite me to network meetings that concern {mode === 'partner' ? 'my work' : 'my space'}
          </label>

          {error && <p className="error">{error}</p>}
          <div className="btn-row">
            <button className="btn" disabled={busy || !name.trim() || (indexed === false && !proposing && mode === 'makerspace')
              || (proposing && mode === 'partner' && !proposal.partner_type)}>
              {busy ? 'Joining…' : 'Join'}
            </button>
          </div>
        </>
      )}
    </form>
  );
}

// Staff who have just joined are asked about their space — unless a colleague
// already answered, in which case it is a link they can come back to.
function StaffNext({ spaceId, onDone }: { spaceId: string; onDone: () => void }) {
  const [started, setStarted] = useState<boolean | null>(null);
  useEffect(() => {
    Promise.all([getListingSubmission(spaceId), getSpaceMetrics(spaceId, reportingYear())])
      .then(([l, m]) => setStarted(!!l || !!m)).catch(() => setStarted(true));
  }, [spaceId]);
  if (started === null) return null;
  return started ? (
    <>
      <p className="muted">Your space's listing and annual data have been started by a colleague. You can review or add to them any time from your space card.</p>
      <div className="btn-row">
        <button className="btn" onClick={onDone}>Continue</button>
        <PageLink className="btn ghost" page="space-data" params={{ space: spaceId }}>Review your space's data</PageLink>
      </div>
    </>
  ) : (
    <>
      <h3>Next: tell the network about your space</h3>
      <p>Two short sets of questions — your public listing, and the network's annual data, which is private to your space and the steward and only ever published in totals. Ten minutes now, or come back later.</p>
      <div className="btn-row">
        <PageLink className="btn" page="space-data" params={{ space: spaceId }}>Answer now</PageLink>
        <button className="btn ghost" onClick={onDone}>Later</button>
      </div>
    </>
  );
}

// ---------- signed in and already a member ----------

function Profile({ onJoinAnother }: { onJoinAnother: () => void }) {
  const s = useSession();
  const person = s.person!;
  const [name, setName] = useState(person.name);
  const [phone, setPhone] = useState(person.phone ?? '');
  const [saved, setSaved] = useState(false);

  // Partner organisations and proposals are only in the index, not the directory.
  const [indexNames, setIndexNames] = useState<Map<string, string>>(new Map());
  useEffect(() => { listSpaceIndex().then((xs) => setIndexNames(new Map(xs.map((x) => [x.id, x.name])))).catch(() => undefined); }, []);
  const spaceName = (m: Membership) => spaceById(m.space_id)?.name ?? indexNames.get(m.space_id)
    ?? m.space_id.replace(/^(proposed|partner)-/, '').replace(/-/g, ' ');

  return (
    <>
      <div className="card form-card">
        <h2>You</h2>
        <form className="inline-fields" onSubmit={async (e) => {
          e.preventDefault();
          await updateProfile(s.user!.uid, person, { name, phone: phone.trim() || null }, s.primary, s.primary ? spaceName(s.primary) : null);
          setSaved(true); void s.refresh();
        }}>
          <label className="field"><span>Name</span><input required maxLength={120} value={name} onChange={(e) => { setName(e.target.value); setSaved(false); }} /></label>
          <label className="field"><span>Phone</span><input maxLength={40} value={phone} onChange={(e) => { setPhone(e.target.value); setSaved(false); }} /></label>
          <button className="btn ghost" disabled={saved}>{saved ? 'Saved' : 'Save'}</button>
        </form>
        <p className="muted" style={{ marginTop: 10 }}>
          {person.email} · <button type="button" className="linkish" onClick={() => void s.signOut()}>Sign out</button>
        </p>
      </div>

      {s.memberships.map((m) => <MembershipCard key={m.id} m={m} spaceName={spaceName(m)} />)}

      <div className="btn-row">
        <button className="btn ghost" onClick={onJoinAnother}>Join another space or organisation</button>
        {(s.verified || s.stewardship) && <PageLink page="people" className="btn">People across the network</PageLink>}
        {can(s, 'steward.view') && <PageLink page="steward" className="btn ghost">Steward tools</PageLink>}
      </div>
    </>
  );
}

function MembershipCard({ m, spaceName }: { m: Membership & { id: string }; spaceName: string }) {
  const s = useSession();
  const [functions, setFunctions] = useState(m.functions);
  const [pref, setPref] = useState<ContactPreference>(m.contact_preference);
  const [invitations, setInvitations] = useState(m.invitations);
  const [saved, setSaved] = useState(true);
  const organiser = ORGANISER_ROLES.includes(m.role);
  const dirty = () => setSaved(false);

  return (
    <form className="card form-card" onSubmit={async (e) => {
      e.preventDefault();
      await updateRosterSettings(s.user!.uid, s.person!, m, spaceName, { functions, contact_preference: organiser ? pref : 'relay', invitations });
      setSaved(true); void s.refresh();
    }}>
      <div className="card-top">
        <h2 style={{ fontSize: '1.25rem' }}>{spaceName}</h2>
        <span className="pill">{roleLabel(m.role)}</span>
        <StatusPill status={m.status} />
        {m.state && <span className="muted">{stateName(m.state)}</span>}
      </div>
      {m.status === 'active' && STAFF_ROLES.includes(m.role) && spaceById(m.space_id) && (
        <p><PageLink page="space-data" params={{ space: m.space_id }}>Your space's listing and annual data →</PageLink></p>
      )}
      {m.status === 'pending' && (
        <p className="muted">{m.role === 'partner'
          ? "Once a steward confirms you, you'll appear to other verified people and receive meeting invitations."
          : "Once the space's admin or the steward confirms you, you'll appear to other verified people and receive meeting invitations."}</p>
      )}
      <h4>What you do here</h4>
      <div className="checks">
        {FUNCTIONS.map((f) => (
          <label key={f.id} className={`check ${functions.includes(f.id) ? 'on' : ''}`}>
            <input type="checkbox" checked={functions.includes(f.id)}
                   onChange={(e) => { dirty(); setFunctions(e.target.checked ? [...functions, f.id] : functions.filter((x) => x !== f.id)); }} />
            {f.label}
          </label>
        ))}
      </div>
      <h4>How verified people reach you</h4>
      {organiser ? (
        <div className="radios compact">
          <label className="radio"><input type="radio" checked={pref === 'relay'} onChange={() => { dirty(); setPref('relay'); }} /> Relay only</label>
          <label className="radio"><input type="radio" checked={pref === 'email'} onChange={() => { dirty(); setPref('email'); }} /> Show my email</label>
          <label className="radio"><input type="radio" checked={pref === 'phone'} onChange={() => { dirty(); setPref('phone'); }} disabled={!s.person?.phone} /> Show my phone</label>
        </div>
      ) : <p className="muted">By relay. Contacts' addresses are never shown.</p>}
      <label className="check standalone">
        <input type="checkbox" checked={invitations} onChange={(e) => { dirty(); setInvitations(e.target.checked); }} />
        Invite me to network meetings that concern this space
      </label>
      <div className="btn-row"><button className="btn ghost" disabled={saved}>{saved ? 'Saved' : 'Save'}</button></div>
    </form>
  );
}
