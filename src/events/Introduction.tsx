import { useEffect, useRef, useState } from 'react';
import { SPACES } from '../data';
import { href } from '../App';
import Logo from '../components/Logo';
import { US_STATES } from '../network/model';
import SpacePicker from './SpacePicker';
import { LOOKING_FOR_WORDS, RELATIONSHIP_WORDS, type Answers, type Consents, type EventDoc } from './model';
import { DISCIPLINES } from '../makers/model';

export function FoodAndAccess({ event, answers: a, set }: { event: EventDoc; answers: Answers; set: (p: Partial<Answers>) => void }) {
  return <details className="fold"><summary>Food and access needs <span className="muted">(optional)</span></summary>
    <p className="muted">Only the organisers see these details.</p>
    <label className="field"><span>Dietary needs</span><input maxLength={200} value={a.dietary} placeholder="Anything we should know for lunch?" onChange={(e) => set({ dietary: e.target.value })} /></label>
    <label className="field"><span>Access needs</span><input maxLength={300} value={a.access_needs} placeholder="What would help you take part?" onChange={(e) => set({ access_needs: e.target.value })} /></label>
    {event.asks_over_21 && <label className="check"><input type="checkbox" checked={a.over_21 === true} onChange={(e) => set({ over_21: e.target.checked })} /><span>I'm 21 or older (for the evening social)</span></label>}
  </details>;
}

export function Introduction({ event, answers: a, consents, set, save, sharing, children }: {
  event: EventDoc; answers: Answers; consents: Consents; set: (p: Partial<Answers>) => void;
  save: () => Promise<void>; sharing: React.ReactNode; children: React.ReactNode;
}) {
  const hasAnswers = a.relationship.length > 0 || a.looking_for.length > 0 || !!a.excited || !!a.makes || (a.disciplines ?? []).length > 0;
  const [step, setStep] = useState(hasAnswers ? -1 : 0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const heading = useRef<HTMLHeadingElement>(null);
  const first = useRef(true);
  useEffect(() => { if (first.current) { first.current = false; return; } heading.current?.focus(); }, [step]);
  const advance = async (next: number) => {
    setBusy(true); setError('');
    try { await save(); setNotice(next === -1 ? 'Saved. Come back any time using the link in your email.' : 'Progress saved.'); setStep(next); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not save. Your answers are still here; try again.'); }
    finally { setBusy(false); }
  };
  const toggle = (list: string[], v: string) => list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
  const goal = a.looking_for[0];
  const leader = a.relationship.includes('space_leader');
  const newMaker = a.relationship.includes('curious');
  const prompt = goal === 'tool_access' ? 'What would you like to make, and which tools would help?'
    : goal === 'learning' ? 'What would you like to learn or try making?'
    : goal === 'customers' ? 'What are you making, and who is it for?'
    : goal === 'fabricators' ? 'What are you trying to get made?'
    : goal === 'teaching_opportunities' ? 'What could you help other people learn?'
    : goal === 'cofounders_funding' ? 'What are you building, and what help would move it forward?'
    : goal === 'collaborators' ? 'What would you like to make with someone else?'
    : newMaker ? 'What are you curious about trying?'
    : leader ? 'What is your space working on that excites you?'
    : 'What are you excited about making or doing right now?';
  return <section className="card form-card event-form intro-card">
    <p className="eyebrow">Your connection to the network · optional</p>
    <h2 ref={heading} tabIndex={-1}>{step === -1 ? 'Make the most of your day' : ['What would make this day valuable for you?', 'A little more about you', 'Choose what you share'][step]}</h2>
    {notice && <p className="muted" role="status">{notice}</p>}
    {step === -1 ? <>
      {hasAnswers && <p>{a.looking_for.map((v) => LOOKING_FOR_WORDS.find(([k]) => k === v)?.[1]).filter(Boolean).join(' · ')}</p>}
      {children}
      <button type="button" className="btn ghost" onClick={() => { setStep(0); setNotice(''); }}> {hasAnswers ? 'Edit your introduction' : 'Introduce yourself'}</button>
    </> : <>
      <ol className="intro-progress" aria-label="Introduction progress">{['Your goals', 'Your story', 'Your choices'].map((label, i) => <li key={label} aria-current={step === i ? 'step' : undefined}>{i + 1}. {label}</li>)}</ol>
      <p className="muted">Your ticket is already confirmed. Skip any question; save and return whenever you like.</p>
      <form onSubmit={(e) => { e.preventDefault(); void advance(step === 2 ? -1 : step + 1); }}>
        <fieldset disabled={busy} className="intro-fields">
        {step === 0 && <>
          <fieldset className="event-fieldset"><legend>Start with your main goal</legend><div className="goal-options">
            {LOOKING_FOR_WORDS.map(([key, label]) => <label key={key} className={`goal-choice ${goal === key ? 'on' : ''}`}>
              <input type="radio" name="network-goal" checked={goal === key} onChange={() => set({ looking_for: [key] })} /><span>{label}</span>
            </label>)}
          </div></fieldset>
          <fieldset className="event-fieldset"><legend>Which of these sound like you? Choose any.</legend><div className="checks">
            {RELATIONSHIP_WORDS.map(([key, label]) => <label className="check" key={key}><input type="checkbox" checked={a.relationship.includes(key)} onChange={() => set({ relationship: toggle(a.relationship, key) })} /><span>{label}</span></label>)}
          </div></fieldset>
        </>}
        {step === 1 && <>
          <p className="muted">These answers help the organisers shape the day. They aren't shown to other attendees.</p>
          <label className="field"><span>{prompt}</span><textarea rows={3} maxLength={800} value={a.excited} onChange={(e) => set({ excited: e.target.value })} /></label>
          <label className="field"><span>{leader ? 'What challenge would you like to compare notes on with other organisers?' : 'Where are you getting stuck, or what help would make a difference?'}</span><textarea rows={2} maxLength={800} value={a.challenged} onChange={(e) => set({ challenged: e.target.value })} /></label>
          <SpacePicker value={a.home_space_id} other={a.home_space_other} onChange={(home_space_id, home_space_other) => set({ home_space_id, home_space_other })} />
          {!a.home_space_id && !a.home_space_other && <label className="check"><input type="checkbox" checked={a.looking_for_space} onChange={(e) => set({ looking_for_space: e.target.checked })} /><span>I'd like help finding a makerspace</span></label>}
          <label className="field"><span>Your town and state <span className="muted">(optional)</span></span><input maxLength={80} placeholder="For example, New Haven, CT" value={a.town} onChange={(e) => set({ town: e.target.value })} /></label>
          {(leader || a.relationship.includes('entrepreneur') || a.relationship.includes('partner') || a.organization) && <label className="field"><span>Your organisation or business</span><input maxLength={160} value={a.organization} onChange={(e) => set({ organization: e.target.value })} /></label>}
          {event.tracks.length > 0 && <fieldset className="event-fieldset"><legend>Which conversations interest you?</legend><div className="checks">{event.tracks.map((t) => <label className="check" key={t.id}><input type="checkbox" checked={a.tracks.includes(t.id)} onChange={() => set({ tracks: toggle(a.tracks, t.id) })} /><span>{t.label}</span></label>)}</div></fieldset>}
          <label className="field"><span>Is there a session you'd lead, or a question you'd put to the room? <span className="muted">(optional)</span></span>
            <textarea rows={2} maxLength={500} placeholder="For example: a 20-minute demo of my laser jig, or 'how do small shops price classes?'" value={a.offer_session} onChange={(e) => set({ offer_session: e.target.value })} /></label>
          <fieldset className="event-fieldset"><legend>Have you been to an unconference before?</legend><div className="btn-row">{[true, false].map((v) => <label className="check" key={String(v)}><input type="radio" name="unconference" checked={a.unconference_before === v} onChange={() => set({ unconference_before: v })} /><span>{v ? 'Yes' : 'No'}</span></label>)}</div></fieldset>
        </>}
        {step === 2 && <>
          <fieldset className="event-fieldset"><legend>What do you work with? Choose any.</legend><div className="checks">
            {DISCIPLINES.map((d) => <label className="check" key={d.id}><input type="checkbox" checked={(a.disciplines ?? []).includes(d.id)} onChange={() => set({ disciplines: toggle(a.disciplines ?? [], d.id) })} /><span>{d.label}</span></label>)}
          </div></fieldset>
          <label className="field"><span>Your short maker introduction</span><textarea maxLength={500} rows={3} placeholder="What do you make, or want to make?" value={a.makes} onChange={(e) => set({ makes: e.target.value })} /></label>
          <p className="muted">If you join the attendee list, people see your name, space, what you work with, this introduction, your conversation choices and any session offer. Your goals, challenges, food and access needs stay with the organisers.</p>
          {sharing}
          {consents.attendee_list && <div className="intro-preview"><strong>Your attendee introduction</strong><p>{a.makes || 'You can add an introduction later.'}</p>{a.offer_session && <p>Could offer: {a.offer_session}</p>}</div>}
        </>}
        </fieldset>
        {error && <p role="alert" className="error">{error}</p>}
        <div className="btn-row">
          {step > 0 && <button type="button" className="btn ghost" disabled={busy} onClick={() => void advance(step - 1)}>Back</button>}
          <button className="btn" disabled={busy}>{busy ? 'Saving…' : step === 2 ? 'Save and see connections' : 'Save and continue'}</button>
          <button type="button" className="linkish" disabled={busy} onClick={() => void advance(-1)}>Save and finish later</button>
        </div>
      </form>
    </>}
  </section>;
}

export function Connections({ a, event, regId }: { a: Answers; event: EventDoc; regId: string }) {
  const own = SPACES.find((s) => s.id === a.home_space_id);
  const parts = a.town.split(',').map((v) => v.trim().toLowerCase());
  const town = parts[0];
  const state = parts.length > 1 ? US_STATES.find(([code, name]) => [code.toLowerCase(), name.toLowerCase()].includes(parts[parts.length - 1]))?.[0] : null;
  const local = town ? SPACES.filter((s) => s.status !== 'closed' && s.id !== own?.id && s.address?.locality?.toLowerCase() === town && (parts.length === 1 || (state && s.address?.region === state))).slice(0, 3) : [];
  const leader = a.relationship.includes('space_leader');
  const wantsSpace = a.looking_for_space || a.looking_for.includes('tool_access') || a.looking_for.includes('learning');
  return <div className="connection-cards">
    {own && <article className="connection-card"><Logo space={own} /><div><h3>{own.name}</h3><p>{leader ? 'Connect with your space’s network roster and check its listing.' : 'Your home base: explore its listing and ways to get involved.'}</p><a href={leader ? href('join', { space: own.id }) : href('space', { space: own.id })}>{leader ? 'Connect with your space' : 'Explore your space'}</a></div></article>}
    {wantsSpace && <article className="connection-card"><div><h3>{local.length ? `Spaces in ${a.town.split(',')[0]}` : 'Find a place to make'}</h3>
      {local.length ? <><p>These directory listings share the town you entered. Check their access details before visiting.</p><ul>{local.map((s) => <li key={s.id}><a href={href('space', { space: s.id })}>{s.name}</a></li>)}</ul></> : <><p>{town ? 'No additional exact town match in our directory yet. Explore the regional map for other options.' : 'Browse spaces by location and the tools you want to use.'}</p><a href={href('directory', event.region_id ? { region: event.region_id } : {})}>Explore makerspaces</a></>}
    </div></article>}
    {a.tracks.length > 0 && <article className="connection-card"><div><h3>Conversations for you</h3><p>You chose these threads through the day:</p><ul>{event.tracks.filter((t) => a.tracks.includes(t.id)).map((t) => <li key={t.id}>{t.label}</li>)}</ul><a href="#event-attendees">Find attendees with shared interests</a></div></article>}
    {a.looking_for.length > 0 && <article className="connection-card"><div><h3>Meet people coming to the event</h3><p>Explore what other attendees make and the sessions they could offer. Only people who chose to be listed appear.</p><a href="#event-attendees">Explore attendees</a></div></article>}
    <article className="connection-card"><div><h3>Keep your introduction growing</h3><p>Use your name, town, makerspace and short maker introduction to start a profile. Review it after sign-in; nothing is published automatically.</p><a href={href('maker-edit', { registration: regId })}>Review a maker profile draft</a></div></article>
  </div>;
}
