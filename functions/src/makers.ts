// Maker profiles (docs/GOVERNANCE.md §Makers). The browser and the rules do most
// of this; these exist for what a client must not decide about itself: whether it
// came to an event, which of its photos a moderator approved, and tidying files.

import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { logger } from 'firebase-functions/v2';
import { onDocumentCreated, onDocumentDeleted, onDocumentWritten } from 'firebase-functions/v2/firestore';
import { POSTMARK_FROM_EMAIL, POSTMARK_SERVER_TOKEN, SITE } from './postmark';

const REGION = 'us-central1';
const db = () => getFirestore();
const MODERATION_TO = 'info@makehaven.org';

async function notifyModerator(subject: string, line: string) {
  try {
    const res = await fetch('https://api.postmarkapp.com/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Postmark-Server-Token': POSTMARK_SERVER_TOKEN.value() },
      body: JSON.stringify({
        From: POSTMARK_FROM_EMAIL.value(), To: MODERATION_TO, Subject: `[Makers] ${subject}`, MessageStream: 'outbound',
        TextBody: `${line}\n\nLook it over: ${SITE}/?page=steward&tab=makers`,
      }),
    });
    if (!res.ok) throw new Error(`postmark ${res.status}`);
  } catch (e) { logger.error('moderation notice failed', { e: String(e) }); }
}

/** Connects a registration to a profile with the same verified address. Paying
 *  for a ticket is reason enough to skip review of the profile itself; their
 *  photos still get a look. */
export async function linkAttendance(email: string, eventId: string, attended: boolean) {
  let uid: string;
  try {
    const user = await getAuth().getUserByEmail(email);
    if (!user.emailVerified) return;
    uid = user.uid;
  } catch { return; } // no account with this address, which is normal
  await applyAttendance(uid, [{ id: eventId, attended }]);
}

async function applyAttendance(uid: string, found: { id: string; attended: boolean }[]) {
  const ref = db().doc(`makers/${uid}`);
  await db().runTransaction(async (tx) => {
    const m = (await tx.get(ref)).data();
    if (!m) return;
    const merged = new Map<string, { id: string; title: string; attended: boolean }>(
      ((m.events ?? []) as { id: string; title: string; attended: boolean }[]).map((e) => [e.id, e]),
    );
    for (const f of found) {
      const title = ((await tx.get(db().doc(`events/${f.id}`))).get('title') as string | undefined) ?? f.id;
      merged.set(f.id, { id: f.id, title, attended: f.attended });
    }
    tx.update(ref, {
      events: [...merged.values()],
      // A moderator's decision to hide someone is not undone by buying a ticket.
      ...(m.review === 'pending' ? { review: 'approved' } : {}),
    });
  });
}

export const makerCreated = onDocumentCreated(
  { document: 'makers/{uid}', secrets: [POSTMARK_SERVER_TOKEN, POSTMARK_FROM_EMAIL], region: REGION },
  async (e) => {
    const uid = e.params.uid;
    const user = await getAuth().getUser(uid).catch(() => null);
    const email = user?.emailVerified ? user.email?.toLowerCase() : undefined;
    const regs = email
      ? await db().collection('event_registrations').where('email_lower', '==', email).where('status', '==', 'confirmed').get()
      : null;
    if (regs && !regs.empty) {
      await applyAttendance(uid, regs.docs.map((d) => ({ id: d.get('event_id') as string, attended: d.get('attended') === true })));
      return;
    }
    await notifyModerator(`New profile: ${e.data?.get('display_name')}`, `${e.data?.get('display_name')} made a maker profile and has no event ticket, so it waits for you before anyone else can see it.`);
  },
);

/** Keeps the numbers the directory shows in step with what a moderator approved,
 *  and deletes the file of anything rejected or removed. */
export const makerWorkChanged = onDocumentWritten(
  { document: 'makers/{uid}/work/{id}', secrets: [POSTMARK_SERVER_TOKEN, POSTMARK_FROM_EMAIL], region: REGION },
  async (e) => {
    const before = e.data?.before.data();
    const after = e.data?.after.data();
    const uid = e.params.uid;
    if (before?.status === after?.status) return;

    const gone = !after || after.status === 'rejected';
    const path = (after?.path ?? before?.path) as string | undefined;
    if (gone && path) await getStorage().bucket().file(path).delete({ ignoreNotFound: true }).catch((err) => logger.error('could not delete photo', { path, err: String(err) }));

    const makerRef = db().doc(`makers/${uid}`);
    const maker = await makerRef.get();
    if (!maker.exists) return;
    const all = await makerRef.collection('work').orderBy('created_at').get();
    const approved = all.docs.filter((d) => d.get('status') === 'approved');
    await makerRef.update({
      work_count: approved.length,
      work_pending: all.docs.filter((d) => d.get('status') === 'pending').length,
      cover_url: (approved[0]?.get('url') as string | undefined) ?? null,
    });
    if (after?.status === 'pending' && !before) {
      await notifyModerator(`New photo from ${maker.get('display_name')}`, `${maker.get('display_name')} added a photo. It shows to no one else until you approve it.`);
    }
  },
);

/** Leaving means leaving: the work and its files go too. */
export const makerDeleted = onDocumentDeleted({ document: 'makers/{uid}', region: REGION }, async (e) => {
  const uid = e.params.uid;
  await db().recursiveDelete(db().collection(`makers/${uid}/work`));
  await getStorage().bucket().deleteFiles({ prefix: `makers/${uid}/` }).catch((err) => logger.error('could not delete files', { uid, err: String(err) }));
});
