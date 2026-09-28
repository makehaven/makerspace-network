// Postmark plumbing shared by every mailer. Same provider as Nexus, so one
// account, one sender reputation and one bill. Secrets, set once:
//
//   firebase functions:secrets:set POSTMARK_SERVER_TOKEN
//   firebase functions:secrets:set POSTMARK_FROM_EMAIL     # e.g. network@makerspace.network

import { defineSecret } from 'firebase-functions/params';

export const POSTMARK_SERVER_TOKEN = defineSecret('POSTMARK_SERVER_TOKEN');
export const POSTMARK_FROM_EMAIL = defineSecret('POSTMARK_FROM_EMAIL');

export const SITE = 'https://makerspace.network';

/** Postmark's batch endpoint takes up to 500 messages. Returns the ids of the
 *  messages Postmark accepted. */
export async function sendBatch(messages: { id: string; body: Record<string, unknown> }[]): Promise<string[]> {
  const sent: string[] = [];
  for (let i = 0; i < messages.length; i += 500) {
    const chunk = messages.slice(i, i + 500);
    const res = await fetch('https://api.postmarkapp.com/email/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Postmark-Server-Token': POSTMARK_SERVER_TOKEN.value() },
      body: JSON.stringify(chunk.map((c) => c.body)),
    });
    if (!res.ok) continue;
    const results = await res.json() as { ErrorCode: number }[];
    results.forEach((r, j) => { if (r.ErrorCode === 0) sent.push(chunk[j].id); });
  }
  return sent;
}
