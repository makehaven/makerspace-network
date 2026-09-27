// Who is signed in, and what the network knows about them. Mirrors the shape
// of Nexus's AuthSession (status, person, memberships) but reads Firestore
// directly — there is no Cloud Function between the browser and the rules.

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  GoogleAuthProvider, isSignInWithEmailLink, onAuthStateChanged, sendSignInLinkToEmail,
  signInWithEmailLink, signInWithPopup, signOut as fbSignOut,
} from 'firebase/auth';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { auth, db } from './firebase';
import type { Membership, Person, Stewardship } from './model';

export type SessionStatus = 'loading' | 'signed_out' | 'signed_in';

export interface Session {
  status: SessionStatus;
  user: User | null;
  person: Person | null;
  memberships: (Membership & { id: string })[];
  stewardship: Stewardship | null;
  /** An active membership at the person's primary space — what the rules call isVerified(). */
  verified: boolean;
  primary: (Membership & { id: string }) | null;
  refresh: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  sendEmailLink: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
  error: string | null;
}

const EMAIL_KEY = 'msn-signin-email';

const Ctx = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<SessionStatus>('loading');
  const [person, setPerson] = useState<Person | null>(null);
  const [memberships, setMemberships] = useState<(Membership & { id: string })[]>([]);
  const [stewardship, setStewardship] = useState<Stewardship | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (u: User | null) => {
    if (!u) {
      setPerson(null); setMemberships([]); setStewardship(null);
      setStatus('signed_out');
      return;
    }
    try {
      const [p, ms, st] = await Promise.all([
        getDoc(doc(db, 'people', u.uid)),
        getDocs(query(collection(db, 'memberships'), where('person_id', '==', u.uid))),
        getDoc(doc(db, 'stewardships', u.uid)),
      ]);
      setPerson(p.exists() ? (p.data() as Person) : null);
      setMemberships(ms.docs.map((d) => ({ id: d.id, ...(d.data() as Membership) })));
      setStewardship(st.exists() ? (st.data() as Stewardship) : null);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setStatus('signed_in');
  }, []);

  useEffect(() => {
    // Finish an email-link sign-in if this load is one.
    (async () => {
      if (isSignInWithEmailLink(auth, window.location.href)) {
        let email = '';
        try { email = localStorage.getItem(EMAIL_KEY) ?? ''; } catch { /* private window */ }
        if (!email) email = window.prompt('Confirm the email address you used to request the sign-in link') ?? '';
        if (email) {
          try {
            await signInWithEmailLink(auth, email, window.location.href);
            try { localStorage.removeItem(EMAIL_KEY); } catch { /* ignore */ }
            // Drop the one-time link parameters from the address bar.
            const q = new URLSearchParams(window.location.search);
            for (const k of ['apiKey', 'oobCode', 'mode', 'lang', 'continueUrl']) q.delete(k);
            const qs = q.toString();
            window.history.replaceState({}, '', qs ? `/?${qs}` : '/');
          } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
          }
        }
      }
    })();
    return onAuthStateChanged(auth, (u) => { setUser(u); void load(u); });
  }, [load]);

  const value = useMemo<Session>(() => {
    const primary = person?.primary_space_id
      ? memberships.find((m) => m.space_id === person.primary_space_id) ?? null
      : null;
    return {
      status, user, person, memberships, stewardship,
      primary,
      verified: primary?.status === 'active',
      error,
      refresh: () => load(auth.currentUser),
      signInWithGoogle: async () => {
        setError(null);
        try { await signInWithPopup(auth, new GoogleAuthProvider()); }
        catch (e) { setError(e instanceof Error ? e.message : String(e)); }
      },
      sendEmailLink: async (email: string) => {
        setError(null);
        const url = `${window.location.origin}/?page=join`;
        await sendSignInLinkToEmail(auth, email, { url, handleCodeInApp: true });
        try { localStorage.setItem(EMAIL_KEY, email); } catch { /* ignore */ }
      },
      signOut: () => fbSignOut(auth),
    };
  }, [status, user, person, memberships, stewardship, error, load]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): Session {
  const s = useContext(Ctx);
  if (!s) throw new Error('useSession outside SessionProvider');
  return s;
}
