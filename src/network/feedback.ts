// Feedback from anywhere on the site. Loaded only when someone sends some, so
// the public directory still never loads Firebase just by being looked at.

import { addDoc, collection, getDocs, orderBy, query, limit } from 'firebase/firestore';
import { auth, db } from './firebase';

export interface Feedback {
  message: string;
  email: string | null;
  page: string;
  uid: string | null;
  created_at: string;
  user_agent: string | null;
}

export async function sendFeedback(message: string, email: string) {
  const user = auth.currentUser;
  const f: Feedback = {
    message: message.trim().slice(0, 4000),
    email: (email.trim() || user?.email || '').slice(0, 200) || null,
    page: (window.location.host + window.location.pathname + window.location.search).slice(0, 500),
    uid: user?.uid ?? null,
    created_at: new Date().toISOString(),
    user_agent: navigator.userAgent.slice(0, 300),
  };
  await addDoc(collection(db, 'feedback'), f);
}

export async function listFeedback(): Promise<(Feedback & { id: string })[]> {
  const s = await getDocs(query(collection(db, 'feedback'), orderBy('created_at', 'desc'), limit(200)));
  return s.docs.map((d) => ({ id: d.id, ...(d.data() as Feedback) }));
}
