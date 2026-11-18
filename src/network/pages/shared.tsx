import { useId, useState } from 'react';
import { useSession } from '../session';
import { href, navigate } from '../../App';
import enumsJson from '../../../data/schema/enums.json';
import type { EnumEntry } from '../../types';
import { REGIONS } from '../../data';
import type { Stewardship } from '../model';

/** Regions a steward can act for. A network admin acts for every region, so
 *  they are offered all of them rather than only the ones on their record. */
export const stewardRegionIds = (st: Stewardship | null | undefined): string[] =>
  !st ? [] : st.network_admin ? [...new Set([...st.region_ids, ...REGIONS.map((r) => r.id)])] : st.region_ids;

const enums = enumsJson as unknown as Record<string, EnumEntry[]>;
export const FUNCTIONS = enums.PersonFunction ?? [];
export const ROLES = enums.NetworkRole ?? [];
export const PARTNER_TYPES = enums.PartnerType ?? [];
export const partnerTypeLabel = (id?: string | null) => PARTNER_TYPES.find((p) => p.id === id)?.label ?? id ?? '';
export const functionLabel = (id: string) => FUNCTIONS.find((f) => f.id === id)?.label ?? id;
export const roleLabel = (id: string) => ROLES.find((r) => r.id === id)?.label ?? id;

export function PageLink({ page, params, children, className }: {
  page: string; params?: Record<string, string>; children: React.ReactNode; className?: string;
}) {
  return (
    <a className={className} href={href(page, params)}
       onClick={(e) => { if (e.metaKey || e.ctrlKey || e.shiftKey) return; e.preventDefault(); navigate(page, params); }}>
      {children}
    </a>
  );
}

/** Google or an emailed link. No passwords: nothing here is worth a second
 *  password, and a leaked one would be. */
export function SignIn({ why, context = 'maker' }: { why?: string; context?: 'maker' | 'organisation' | 'invitation' | 'event' }) {
  const s = useSession();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const emailId = useId();
  const errorId = useId();
  const advice = {
    maker: 'Use any email address you check regularly. You do not need to belong to a makerspace.',
    organisation: 'If your space or organisation gives you an email address, use it to help verify your connection. You can use another address and ask an admin or steward to confirm you.',
    invitation: 'Use the exact email address your invitation was sent to.',
    event: 'Use the email address on your event registration to find your ticket and connect it to your profile.',
  }[context];
  return (
    <div className="card form-card">
      <h2>Sign in</h2>
      {why && <p className="muted">{why}</p>}
      <p className="muted">{advice}</p>
      <p className="muted">Your network account is free. It is separate from membership at an individual makerspace.</p>
      <div className="btn-row" style={{ marginTop: 6 }}>
        <button className="btn" disabled={busy} onClick={async () => {
          setError(null); setBusy(true);
          try { await s.signInWithGoogle(); }
          catch { setError('Google sign-in did not finish. Try again or use an email link.'); }
          finally { setBusy(false); }
        }}>Continue with Google</button>
      </div>
      <div className="or">or</div>
      {sent ? (
        <div className="notice info" role="status">
          <p>We sent a sign-in link to <strong>{email.trim()}</strong>. Open it on this device. If it hasn't arrived, check your spam folder.</p>
          <button className="linkish" onClick={() => { setSent(false); setError(null); }}>Use a different email or send again</button>
        </div>
      ) : (
        <form onSubmit={async (e) => {
          e.preventDefault(); setError(null); setBusy(true);
          try { await s.sendEmailLink(email.trim()); setSent(true); }
          catch { setError("We couldn't send the sign-in link. Check your email address and connection, then try again."); }
          finally { setBusy(false); }
        }}>
          <label className="field" htmlFor={emailId}><span>Email address</span>
            <input id={emailId} type="email" autoComplete="email" required placeholder="you@example.com" value={email}
              aria-describedby={error || s.error ? errorId : undefined} disabled={busy}
              onChange={(e) => { setEmail(e.target.value); setError(null); }} />
          </label>
          <button className="btn ghost" disabled={busy || !email.trim()}>{busy ? 'Connecting…' : 'Email me a sign-in link'}</button>
        </form>
      )}
      {(error || s.error) && <p id={errorId} className="error" role="alert">{error || s.error}</p>}
    </div>
  );
}

export function StatusPill({ status }: { status: string }) {
  const cls = status === 'active' ? 'ok' : status === 'pending' ? 'flag' : '';
  const text = { active: 'Active', pending: 'Waiting for confirmation', suspended: 'Suspended', revoked: 'Revoked' }[status] ?? status;
  return <span className={`pill ${cls}`}>{text}</span>;
}

export const csvEsc = (v: unknown) => {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export const download = (name: string, text: string, type = 'text/csv') => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};
