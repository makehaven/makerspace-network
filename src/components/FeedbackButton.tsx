import { useState } from 'react';

/** A corner button on every page. Early users are the ones who find what is
 *  broken; make telling us the easiest thing on the page. */
export default function FeedbackButton() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

  if (!open) {
    return <button type="button" className="feedback-fab" onClick={() => { setOpen(true); setState('idle'); }}>Feedback</button>;
  }
  return (
    <form className="feedback-panel" onSubmit={async (e) => {
      e.preventDefault(); setState('sending');
      try {
        const { sendFeedback } = await import('../network/feedback');
        await sendFeedback(message, email);
        setState('sent'); setMessage('');
      } catch { setState('error'); }
    }}>
      <div className="feedback-head">
        <strong>Tell us what you think</strong>
        <button type="button" className="linkish" onClick={() => setOpen(false)} aria-label="Close">Close</button>
      </div>
      {state === 'sent' ? (
        <p>Thank you — it reached the people building this. <button type="button" className="linkish" onClick={() => setState('idle')}>Send more</button></p>
      ) : (
        <>
          <p className="muted">What's confusing, missing or broken? What would make this worth your time? We read every one.</p>
          <textarea required rows={5} maxLength={4000} value={message} onChange={(e) => setMessage(e.target.value)} autoFocus />
          <label className="field"><span>Your email <em>optional, if you'd like a reply</em></span>
            <input type="email" maxLength={200} value={email} onChange={(e) => setEmail(e.target.value)} /></label>
          {state === 'error' && <p className="error">That didn't send. Try again, or email directory@makerspace.network.</p>}
          <button className="btn" disabled={state === 'sending' || !message.trim()}>{state === 'sending' ? 'Sending…' : 'Send feedback'}</button>
        </>
      )}
    </form>
  );
}
