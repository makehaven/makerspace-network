import { useState } from 'react';
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
export function SignIn({ why }: { why?: string }) {
  const s = useSession();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <div className="card form-card">
      <h2>Sign in</h2>
      {why && <p className="muted">{why}</p>}
      <p className="muted">
        If your makerspace gives you an email address, use it. We match the address's domain
        to the space's website to know you belong there.
      </p>
      <div className="btn-row" style={{ marginTop: 6 }}>
        <button className="btn" onClick={() => void s.signInWithGoogle()}>Continue with Google</button>
      </div>
      <div className="or">or</div>
      {sent ? (
        <p className="notice info">Check your email for a sign-in link. Open it on this device.</p>
      ) : (
        <form className="inline-form" onSubmit={async (e) => {
          e.preventDefault(); setBusy(true);
          try { await s.sendEmailLink(email.trim()); setSent(true); }
          catch (err) { alert(err instanceof Error ? err.message : String(err)); }
          setBusy(false);
        }}>
          <input type="email" required placeholder="you@yourmakerspace.org" value={email}
                 onChange={(e) => setEmail(e.target.value)} />
          <button className="btn ghost" disabled={busy || !email}>Email me a sign-in link</button>
        </form>
      )}
      {s.error && <p className="error">{s.error}</p>}
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
