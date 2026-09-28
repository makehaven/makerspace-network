// Group mail: the part of a Google Group a website cannot do on its own.
//
//   groupMailer       a queued post → one email per member who takes email,
//                     each with a personal Reply-To
//   groupInbound      Postmark's inbound webhook → a post (a reply, or a new
//                     thread sent to the group's address)
//   groupUnsubscribe  the one-click List-Unsubscribe endpoint
//
// Addresses live on LIST_DOMAIN, whose MX points at Postmark:
//   {slug}@lists.makerspace.network        start a thread
//   reply+{key}@lists.makerspace.network   reply; the key names group, thread and person
//
// Who sent an email is the hard question. A reply to a personal address is
// trusted when it comes from that person's address; mail to the bare group
// address is trusted when the sender's domain passes SPF. Anything else from a
// member is held for a manager, never posted and never bounced. See
// docs/GROUPS.md.

import { createHmac, timingSafeEqual } from 'node:crypto';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { POSTMARK_SERVER_TOKEN, SITE, sendBatch } from './postmark';

const LIST_DOMAIN = 'lists.makerspace.network';
/** The Functions' own host. Not a Hosting rewrite: the site's CSP forbids
 *  form posts, which the unsubscribe confirmation needs. */
const FUNCTIONS_URL = 'https://us-central1-makerspace-net.cloudfunctions.net';
/** Signs reply keys, so they cannot be guessed from a group, thread and uid. */
const REPLY_KEY_SECRET = defineSecret('GROUP_REPLY_KEY_SECRET');
/** Shared with Postmark's inbound webhook settings (sent as a header or ?secret=). */
const INBOUND_SECRET = defineSecret('POSTMARK_INBOUND_WEBHOOK_SECRET');
/** Group mail is list mail; Postmark wants it on a broadcast stream. */
const GROUP_STREAM = process.env.POSTMARK_GROUP_STREAM || 'broadcast';

const db = () => getFirestore();
const now = () => new Date().toISOString();

type Group = { name: string; description: string; manager_uids: string[]; posting: 'members' | 'managers'; archived: boolean };
type Thread = { subject: string; created_at: string; post_count: number };
type Post = { author_uid: string; author_name: string; body: string; created_at: string; source: string; status: string };
type Member = { name: string; delivery: 'each' | 'none' };

const replyKey = (gid: string, tid: string, uid: string) =>
  createHmac('sha256', REPLY_KEY_SECRET.value()).update(`${gid}/${tid}/${uid}`).digest('hex').slice(0, 24);

const threadLink = (gid: string, tid: string) => `${SITE}/?page=group&g=${encodeURIComponent(gid)}&t=${encodeURIComponent(tid)}`;

// ---------- out ----------

export const groupMailer = onDocumentWritten(
  { document: 'groups/{gid}/threads/{tid}/posts/{pid}', secrets: [POSTMARK_SERVER_TOKEN, REPLY_KEY_SECRET], region: 'us-central1' },
  async (event) => {
    const before = event.data?.before.data() as Post | undefined;
    const after = event.data?.after.data() as Post | undefined;
    // Created queued, or released from held. Our own status write re-triggers and stops here.
    if (!after || !event.data || after.status !== 'queued' || before?.status === 'queued') return;
    const { gid, tid } = event.params;

    const [gSnap, tSnap, mSnap, rosterSnap] = await Promise.all([
      db().doc(`groups/${gid}`).get(), db().doc(`groups/${gid}/threads/${tid}`).get(),
      db().collection(`groups/${gid}/members`).where('delivery', '==', 'each').get(),
      db().doc(`roster/${after.author_uid}`).get(),
    ]);
    const g = gSnap.data() as Group | undefined;
    const t = tSnap.data() as Thread | undefined;
    if (!g || !t) return;
    const recipients = mSnap.docs.map((d) => d.id).filter((u) => u !== after.author_uid);
    if (!recipients.length) { await event.data.after.ref.update({ status: 'sent', sent_count: 0 }); return; }

    const people = await db().getAll(...recipients.map((u) => db().doc(`people/${u}`)));
    const emails = new Map(people.filter((p) => p.get('email')).map((p) => [p.id, p.get('email') as string]));
    const authorSpace = rosterSnap.get('space_name') as string | undefined;
    const first = t.created_at === after.created_at;
    const subject = `${first ? '' : 'Re: '}[${g.name}] ${t.subject}`;
    const threadId = `<thread-${tid}@${LIST_DOMAIN}>`;

    // Record every reply key before any mail goes out, so a fast reply finds it.
    const keys = new Map(recipients.map((u) => [u, replyKey(gid, tid, u)]));
    const batch = db().batch();
    for (const [u, k] of keys) batch.set(db().doc(`reply_keys/${k}`), { gid, tid, uid: u, created_at: now() });
    await batch.commit();

    const messages = recipients.filter((u) => emails.has(u)).map((u) => {
      const key = keys.get(u)!;
      const unsubscribe = `${FUNCTIONS_URL}/groupUnsubscribe?k=${key}`;
      const text = [
        after.body, '', '-- ',
        `${after.author_name}${authorSpace ? ` (${authorSpace})` : ''} in ${g.name}`,
        `Reply to this email to answer the whole group. Read the thread: ${threadLink(gid, tid)}`,
        `Stop email from this group (you can still read it on the site): ${unsubscribe}`,
      ].join('\n');
      return {
        id: u,
        body: {
          From: `"${after.author_name.replace(/"/g, '')} via ${g.name.replace(/"/g, '')}" <${gid}@${LIST_DOMAIN}>`,
          To: emails.get(u), ReplyTo: `reply+${key}@${LIST_DOMAIN}`,
          Subject: subject, TextBody: text, MessageStream: GROUP_STREAM,
          Headers: [
            { Name: 'List-Id', Value: `${g.name.replace(/[<>]/g, '')} <${gid}.${LIST_DOMAIN}>` },
            { Name: 'List-Post', Value: `<mailto:${gid}@${LIST_DOMAIN}>` },
            { Name: 'List-Archive', Value: `<${SITE}/?page=group&g=${gid}>` },
            { Name: 'List-Unsubscribe', Value: `<${unsubscribe}>` },
            { Name: 'List-Unsubscribe-Post', Value: 'List-Unsubscribe=One-Click' },
            { Name: 'Precedence', Value: 'list' },
            // Every message in a thread points at one root id, so mail clients group them.
            { Name: 'References', Value: threadId },
            ...(first ? [] : [{ Name: 'In-Reply-To', Value: threadId }]),
          ],
        },
      };
    });
    const sent = await sendBatch(messages);
    await event.data.after.ref.update({ status: sent.length || !messages.length ? 'sent' : 'failed', sent_count: sent.length });
  },
);

// ---------- in ----------

type Inbound = {
  From?: string; FromFull?: { Email?: string; Name?: string };
  ToFull?: { Email?: string }[]; CcFull?: { Email?: string }[]; BccFull?: { Email?: string }[];
  OriginalRecipient?: string; Subject?: string; TextBody?: string; StrippedTextReply?: string;
  Headers?: { Name: string; Value: string }[];
  Attachments?: { Name?: string }[];
};

function secretOk(given: string, expected: string) {
  const a = Buffer.from(given); const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Out-of-office replies, bounces, other lists and our own mail coming back. */
function automated(h: Map<string, string>, from: string, subject: string) {
  const auto = h.get('auto-submitted');
  if (auto && auto.toLowerCase() !== 'no') return true;
  if (h.has('x-autoreply') || h.has('x-autorespond') || h.has('x-auto-response-suppress') && /oof|autoreply/i.test(h.get('x-auto-response-suppress')!)) return true;
  if (/^(bulk|junk|list|auto_reply)$/i.test(h.get('precedence') ?? '')) return true;
  if ((h.get('list-id') ?? '').includes(LIST_DOMAIN)) return true;
  if (from.endsWith(`@${LIST_DOMAIN}`) || /^(mailer-daemon|postmaster)@/i.test(from)) return true;
  return /^(auto(matic)?[ -]?reply|out of (the )?office|undeliverable|delivery status)/i.test(subject);
}

const cleanSubject = (s: string) => s.replace(/^\s*((re|fwd?|aw):\s*)+/i, '').replace(/^\[[^\]]{1,120}\]\s*/, '').trim().slice(0, 200) || '(no subject)';

async function audit(action: string, details: Record<string, unknown>) {
  await db().collection('audit').add({ actor: 'groupInbound', action, details, created_at: now() });
}

export const groupInbound = onRequest(
  { secrets: [INBOUND_SECRET, REPLY_KEY_SECRET], region: 'us-central1', invoker: 'public' },
  async (req, res) => {
    if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return; }
    // Prefer the header: query-string secrets land in request logs.
    const given = (req.get('x-postmark-webhook-secret') || (req.query.secret as string) || '').trim();
    if (!secretOk(given, INBOUND_SECRET.value())) { res.status(401).json({ error: 'bad secret' }); return; }
    // From here on always 200: Postmark retries anything else, and a sender we
    // refuse should not learn why (no bounces, no backscatter).
    const done = (outcome: string) => { res.json({ ok: true, outcome }); };

    const p = req.body as Inbound;
    const h = new Map((p.Headers ?? []).map((x) => [x.Name.toLowerCase(), x.Value]));
    const from = (p.FromFull?.Email ?? p.From ?? '').trim().toLowerCase();
    const subject = p.Subject ?? '';
    if (!from || automated(h, from, subject)) { done('automated'); return; }

    const ours = [p.OriginalRecipient, ...(p.ToFull ?? []), ...(p.CcFull ?? []), ...(p.BccFull ?? [])]
      .map((x) => (typeof x === 'string' ? x : x?.Email) ?? '').map((x) => x.toLowerCase())
      .find((x) => x.endsWith(`@${LIST_DOMAIN}`));
    if (!ours) { done('not for us'); return; }
    const [box, hash] = ours.split('@')[0].split('+');

    const text = (p.StrippedTextReply?.trim() || p.TextBody?.trim() || '').slice(0, 19000);
    if (!text) { done('empty'); return; }
    // Attachments are not carried (yet); say so rather than lose them silently.
    const dropped = (p.Attachments ?? []).map((a) => a.Name).filter(Boolean);
    const body = dropped.length ? `${text}\n\n[Attachment${dropped.length > 1 ? 's' : ''} not carried by the group: ${dropped.join(', ')}. Share a link instead.]` : text;
    const spfPass = /^\s*pass\b/i.test(h.get('received-spf') ?? '');

    let gid: string; let tid: string | null = null; let uid: string; let trusted: boolean;
    if (box === 'reply' && hash) {
      const k = await db().doc(`reply_keys/${hash}`).get();
      if (!k.exists) { await audit('group_inbound_unknown_key', { from }); done('unknown key'); return; }
      ({ gid, tid, uid } = k.data() as { gid: string; tid: string; uid: string });
      const person = await db().doc(`people/${uid}`).get();
      // The key is personal; the address it came back from should be too. A
      // forwarded email replied to by someone else is held, not posted as them.
      trusted = (person.get('email') as string | undefined)?.toLowerCase() === from;
    } else {
      gid = box;
      const found = await db().collection('people').where('email', '==', from).limit(1).get();
      if (found.empty) { await audit('group_inbound_unknown_sender', { gid, from }); done('unknown sender'); return; }
      uid = found.docs[0].id;
      trusted = spfPass;
    }

    const [gSnap, mSnap, rSnap] = await Promise.all([
      db().doc(`groups/${gid}`).get(), db().doc(`groups/${gid}/members/${uid}`).get(), db().doc(`roster/${uid}`).get(),
    ]);
    const g = gSnap.data() as Group | undefined;
    // Verified (on the roster), a member, and allowed to post here.
    if (!g || g.archived || !mSnap.exists || !rSnap.exists
        || (g.posting === 'managers' && !g.manager_uids.includes(uid))) {
      await audit('group_inbound_refused', { gid, uid, from });
      done('not allowed'); return;
    }
    const name = (rSnap.get('name') as string) || (mSnap.get('name') as string);
    const t = now();
    const post = {
      author_uid: uid, author_name: name, body, created_at: t, source: 'email',
      status: trusted ? 'queued' : 'held', sent_count: 0,
    };
    const batch = db().batch();
    if (tid) {
      const threadRef = db().doc(`groups/${gid}/threads/${tid}`);
      if (!(await threadRef.get()).exists) { done('thread gone'); return; }
      batch.set(threadRef.collection('posts').doc(), post);
      batch.update(threadRef, { last_post_at: t, last_author_name: name, post_count: FieldValue.increment(1) });
    } else {
      const threadRef = db().collection(`groups/${gid}/threads`).doc();
      batch.set(threadRef, {
        subject: cleanSubject(subject), started_by: uid, started_by_name: name,
        created_at: t, last_post_at: t, last_author_name: name, post_count: 1,
      });
      batch.set(threadRef.collection('posts').doc(), post);
    }
    await batch.commit();
    done(trusted ? 'posted' : 'held');
  },
);

// ---------- unsubscribe ----------

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const page = (title: string, body: string) => `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>body{font:16px/1.5 system-ui,sans-serif;max-width:34rem;margin:3rem auto;padding:0 1rem;color:#1b1d21}
button{font:inherit;padding:.5rem 1rem;border-radius:6px;border:1px solid #10696f;background:#10696f;color:#fff;cursor:pointer}
a{color:#10696f}</style></head><body>${body}</body></html>`;

/** GET shows a confirm button (link scanners must not unsubscribe people);
 *  POST — the button, or a mail client's one-click List-Unsubscribe — does it. */
export const groupUnsubscribe = onRequest({ region: 'us-central1', invoker: 'public' }, async (req, res) => {
  const key = String(req.query.k ?? '').replace(/[^a-f0-9]/g, '').slice(0, 24);
  const k = key ? await db().doc(`reply_keys/${key}`).get() : null;
  if (!k?.exists) { res.status(404).send(page('Not found', '<p>That unsubscribe link is not valid any more.</p>')); return; }
  const { gid, uid } = k.data() as { gid: string; uid: string };
  const g = (await db().doc(`groups/${gid}`).get()).data() as Group | undefined;
  const name = esc(g?.name ?? gid);
  if (req.method === 'POST') {
    const ref = db().doc(`groups/${gid}/members/${uid}`);
    if ((await ref.get()).exists) await ref.update({ delivery: 'none', updated_at: now() });
    res.send(page('Unsubscribed', `<h1>Done</h1><p>You won't get email from <strong>${name}</strong> any more. You're still a member and can read it on the <a href="${SITE}/?page=group&g=${gid}">group's page</a>, where you can also turn email back on.</p>`));
    return;
  }
  res.send(page('Unsubscribe', `<h1>Stop email from ${name}?</h1><p>You'll stay a member and can still read and post on the site.</p>
<form method="post"><button>Stop email</button></form>`));
});
