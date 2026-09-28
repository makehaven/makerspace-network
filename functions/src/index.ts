// The people layer's Cloud Functions. Everything else is browser + Firestore
// rules; these exist only where a browser cannot act: sending and receiving
// email. All optional — without them, messages, meetings, invitations and
// group posts still work on the site. Needs the Blaze plan and Postmark
// (functions/src/postmark.ts for the secrets, docs/GROUPS.md for group mail).

import { initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { onDocumentCreated, onDocumentWritten } from 'firebase-functions/v2/firestore';
import { POSTMARK_FROM_EMAIL, POSTMARK_SERVER_TOKEN, SITE, sendBatch } from './postmark';
import { meetingIcs, type IcsMeeting } from './ics';

initializeApp();
const db = getFirestore();


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

// ---------- meeting invitations ----------

type MeetingDoc = IcsMeeting & {
  organiser_uid: string; organiser_name: string; invitee_uids: string[];
  email_requested_at: string | null; emailed_uids: string[];
};

const when = (m: MeetingDoc) => new Date(m.starts_at).toLocaleString('en-US', {
  timeZone: 'America/New_York', weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
});

async function emailsOf(uids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const refs = uids.map((u) => db.doc(`people/${u}`));
  for (let i = 0; i < refs.length; i += 100) {
    for (const snap of await db.getAll(...refs.slice(i, i + 100))) {
      const e = snap.get('email') as string | undefined;
      if (e) out.set(snap.id, e);
    }
  }
  return out;
}

/** Emails invitations when a convener sets email_requested_at, to every
 *  invitee not already emailed, so adding people and pressing send again
 *  reaches only the new ones. Tells the emailed invitees when a meeting is
 *  cancelled. Replies go to the organiser: conveners are organisers, and
 *  organisers are reachable directly (GOVERNANCE §Roster). */
export const meetingMailer = onDocumentWritten(
  { document: 'meetings/{id}', secrets: [POSTMARK_SERVER_TOKEN, POSTMARK_FROM_EMAIL], region: 'us-central1' },
  async (event) => {
    const before = event.data?.before.data() as MeetingDoc | undefined;
    const after = event.data?.after.data() as MeetingDoc | undefined;
    if (!after || !event.data) return;
    const m: MeetingDoc = { ...after, id: event.params.id };

    const cancelling = after.status === 'cancelled' && before?.status === 'scheduled';
    const requested = after.status === 'scheduled' && !!after.email_requested_at
      && after.email_requested_at !== before?.email_requested_at;
    if (!cancelling && !requested) return;

    const to = cancelling ? after.emailed_uids : after.invitee_uids.filter((u) => !after.emailed_uids.includes(u));
    if (!to.length) return;
    const [emails, organiser] = await Promise.all([emailsOf(to), db.doc(`people/${after.organiser_uid}`).get()]);
    const replyTo = organiser.get('email') as string | undefined;
    const ics = Buffer.from(meetingIcs(m)).toString('base64');
    const link = `${SITE}/?page=people&meeting=${encodeURIComponent(m.id)}`;

    const text = cancelling
      ? [`${m.title}, ${when(m)}, has been cancelled by ${m.organiser_name}.`, '', `Details: ${link}`]
      : [`${m.organiser_name} has invited you to ${m.title}.`, '', `When: ${when(m)} (${m.duration_min} minutes)`,
         ...(m.location ? [`Where: ${m.location}`] : []), ...(m.agenda ? ['', m.agenda] : []), '',
         `Let them know if you can come: ${link}`];
    text.push('', `You are receiving this because you are on the Makerspace Network roster with meeting invitations on. Change that at ${SITE}/?page=join.`);

    const messages = to.filter((u) => emails.has(u)).map((u) => ({
      id: u,
      body: {
        From: POSTMARK_FROM_EMAIL.value(), To: emails.get(u), ...(replyTo ? { ReplyTo: replyTo } : {}),
        Subject: `[Makerspace Network] ${cancelling ? 'Cancelled: ' : ''}${m.title}`,
        TextBody: text.join('\n'), MessageStream: 'outbound',
        Attachments: [{ Name: 'meeting.ics', Content: ics, ContentType: `text/calendar; method=${cancelling ? 'CANCEL' : 'PUBLISH'}` }],
      },
    }));
    const sent = await sendBatch(messages);
    if (!cancelling && sent.length) {
      // This write re-triggers the function; email_requested_at is unchanged, so it returns.
      await event.data.after.ref.update({ emailed_uids: FieldValue.arrayUnion(...sent) });
    }
  },
);

// ---------- invitations ----------

type InvitationDoc = {
  email: string; name: string; space_name: string; role: string; note: string;
  invited_by: string; invited_by_name: string; status: string;
  expires_at: FirebaseFirestore.Timestamp; email_requested_at: string | null;
};

const ROLE_WORDS: Record<string, string> = {
  space_admin: 'as an admin, looking after its listing and its people',
  space_editor: 'on its team',
  space_contact: 'so you are in the loop',
  partner: 'as an ecosystem partner',
};

/** Emails an invitation when an inviter sets email_requested_at. The link
 *  only works for someone signed in with this address, so it is safe to send
 *  in the clear; replies go to the inviter. */
export const invitationMailer = onDocumentWritten(
  { document: 'invitations/{id}', secrets: [POSTMARK_SERVER_TOKEN, POSTMARK_FROM_EMAIL], region: 'us-central1' },
  async (event) => {
    const before = event.data?.before.data() as InvitationDoc | undefined;
    const after = event.data?.after.data() as InvitationDoc | undefined;
    if (!after || !event.data || after.status !== 'pending' || !after.email_requested_at) return;
    if (after.email_requested_at === before?.email_requested_at) return;
    if (after.expires_at.toMillis() < Date.now()) return;

    const inviter = await db.doc(`people/${after.invited_by}`).get();
    const replyTo = inviter.get('email') as string | undefined;
    const link = `${SITE}/?page=join&invite=${encodeURIComponent(event.params.id)}`;
    const text = [
      `Hi ${after.name.split(' ')[0]},`, '',
      `${after.invited_by_name} has invited you to join Makerspace Network at ${after.space_name}, ${ROLE_WORDS[after.role] ?? ''}.`,
      ...(after.note ? ['', after.note] : []), '',
      'Makerspace Network connects the people who run makerspaces, and the organisations that work with them, across every state: who is at each space, how to reach them, and the meetings that concern you.',
      '', `Accept here, signing in with this address (${after.email}): ${link}`,
      '', `We've filled in what ${after.invited_by_name} told us; you can correct it before you accept. The invitation expires on ${after.expires_at.toDate().toDateString()}.`,
      '', 'Nothing about you is shown to anyone until you accept. If this is not for you, ignore it, or reply to let them know.',
    ].join('\n');

    const res = await fetch('https://api.postmarkapp.com/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Postmark-Server-Token': POSTMARK_SERVER_TOKEN.value() },
      body: JSON.stringify({
        From: `${after.invited_by_name} via Makerspace Network <${POSTMARK_FROM_EMAIL.value()}>`, To: after.email,
        ...(replyTo ? { ReplyTo: replyTo } : {}),
        Subject: `${after.invited_by_name} invited you to Makerspace Network`,
        TextBody: text, MessageStream: 'outbound',
      }),
    });
    if (res.ok) await event.data.after.ref.update({ emailed_at: new Date().toISOString() });
  },
);

export { groupMailer, groupInbound, groupUnsubscribe } from './groups';
