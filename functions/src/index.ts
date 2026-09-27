// The one Cloud Function the people layer has: deliver a relayed message by
// email. Everything else is browser + Firestore rules. This is optional —
// without it, messages still appear on the recipient's People page; with it,
// they also get an email. Needs the Blaze plan and a Postmark server token:
//
//   firebase functions:secrets:set POSTMARK_SERVER_TOKEN
//   firebase functions:secrets:set POSTMARK_FROM_EMAIL     # e.g. relay@makerspace.network
//
// Same provider Nexus uses, so one sender signature and one bill.

import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { defineSecret } from 'firebase-functions/params';

initializeApp();
const db = getFirestore();
const POSTMARK_SERVER_TOKEN = defineSecret('POSTMARK_SERVER_TOKEN');
const POSTMARK_FROM_EMAIL = defineSecret('POSTMARK_FROM_EMAIL');

const SITE = 'https://makerspace.network';

export const relayMessage = onDocumentCreated(
  { document: 'messages/{id}', secrets: [POSTMARK_SERVER_TOKEN, POSTMARK_FROM_EMAIL], region: 'us-central1' },
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const m = snap.data() as { from_uid: string; from_name: string; to_uid: string; subject: string; body: string; status: string };
    if (m.status !== 'queued') return;

    const [to, from] = await Promise.all([
      db.doc(`people/${m.to_uid}`).get(),
      db.doc(`people/${m.from_uid}`).get(),
    ]);
    const toEmail = to.get('email') as string | undefined;
    if (!toEmail) { await snap.ref.update({ status: 'failed', error: 'recipient has no email' }); return; }
    const fromSpace = (await db.doc(`roster/${m.from_uid}`).get()).get('space_name') as string | undefined;

    // The sender's address is deliberately not in the email. Replies go back
    // through the site, which is the whole point of a relay.
    const text = [
      `${m.from_name}${fromSpace ? ` (${fromSpace})` : ''} sent you a message through Makerspace Network:`,
      '', m.body, '',
      `Reply on the site: ${SITE}/?page=people`,
      '', `You are receiving this because you are on the network roster. Turn off messages by leaving the roster at ${SITE}/?page=join.`,
    ].join('\n');

    const res = await fetch('https://api.postmarkapp.com/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Postmark-Server-Token': POSTMARK_SERVER_TOKEN.value() },
      body: JSON.stringify({
        From: POSTMARK_FROM_EMAIL.value(), To: toEmail,
        Subject: `[Makerspace Network] ${m.subject || `Message from ${m.from_name}`}`,
        TextBody: text, MessageStream: 'outbound',
      }),
    });
    if (res.ok) {
      await snap.ref.update({ status: 'sent', sent_at: new Date().toISOString() });
    } else {
      await snap.ref.update({ status: 'failed', error: `postmark ${res.status}` });
    }
    void from; // the sender doc is fetched so a future version can CC them; unused today
  },
);
