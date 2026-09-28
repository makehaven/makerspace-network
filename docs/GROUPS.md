# Groups: the Google Group replacement

**Status: built 2026-09-27, not yet switched on.** The code, rules and tests
are in place; what remains is Postmark and DNS setup (below), which only the
account owner can do.

## Why

The network already runs on Google Groups — `ct-maker-spaces@`,
`large-makerspaces@` — and they work because they are email. What they do
badly is what the roster already does well: who is in them, from which space,
with what standing; notes that reach only the organiser; people added by hand
under two or three addresses; replies that go to one person instead of the
list. A group here is the same thing people already use — one address, email
in and out — with membership that comes from the roster, and an archive on
the site.

## What a group is

- **An address**, `{slug}@lists.makerspace.network`. Mail to it from a member
  starts a thread.
- **Members**, who are verified people. A group is either *open* (any verified
  person joins from the Groups page) or *by invitation* (managers add people
  from the roster, a steward adds a filtered set from the Steward page, or an
  invitation names the group and the person joins on accepting).
- **Posting**: every member (a discussion list) or managers only (an
  announcement list).
- **Managers**: the region's stewards, network admins, and anyone listed in
  `manager_uids`. They manage members and settings and release held posts.
- **Delivery**, per member: every post by email, or site only. Every email
  carries a one-click unsubscribe that switches to site only, never removes
  the member.

## How mail flows

**Out.** A post (from the site, or from email) is written with status
`queued`. The `groupMailer` Function sends one message per member who takes
email, except the author:

- From: `"Jo Maker via CT Makerspaces" <ct-makerspaces@lists.makerspace.network>`.
  The list's own domain, signed by Postmark, so DMARC passes whatever the
  author's domain — the same thing Google Groups does.
- Reply-To: `reply+{key}@lists.makerspace.network`, a personal address. The key
  is an HMAC of group, thread and recipient; `reply_keys/{key}` maps it back.
- `List-Id`, `List-Post`, `List-Archive`, `List-Unsubscribe` (+ `-Post` for
  one-click), `Precedence: list`, and a shared `References` so mail clients
  thread it.

**In.** Postmark receives everything for `lists.makerspace.network` and posts it
to the `groupInbound` Function, which:

1. Drops automated mail — auto-replies, out-of-office, bounces, other lists, and
   our own mail coming back — and anything empty. Never bounces, never replies:
   refusing silently is how you avoid backscatter.
2. Works out who sent it:
   - **A reply** to `reply+{key}` belongs to the key's person. It is posted if
     it came from that person's address, and **held** if it came from anywhere
     else (a forwarded email answered by someone else).
   - **A new thread** to `{slug}@` is matched to a person by the From address.
     It is posted if the sender's domain passes SPF (Postmark's
     `Received-SPF` header), otherwise **held**.
   - Unknown senders, non-members and people not allowed to post are dropped,
     and a line goes to `audit`.
3. Uses Postmark's `StrippedTextReply` so quoted history is not re-posted, and
   notes any attachment it did not carry.

Held posts wait on the thread page for a manager to **Approve and send** or
**Reject**. Only managers see them.

## Turning it on

In this order, by the Postmark and DNS account owners:

1. **Postmark server** "Makerspace Network" (the same account as Nexus is fine).
2. **Sender domains**: add and verify `makerspace.network` *and*
   `lists.makerspace.network` — DKIM TXT and Return-Path CNAME records for each,
   as Postmark shows them.
3. **Message streams**: the default transactional stream `outbound` carries
   invitations, meeting mail and relayed messages. Add a **Broadcast** stream
   with id `broadcast` for group mail. For its unsubscribe handling choose
   "I'll handle unsubscribes" — every group email already carries
   `List-Unsubscribe` — or let Postmark add its own link; either works.
4. **Inbound**: on the inbound stream set the inbound domain to
   `lists.makerspace.network`, add an **MX record** for
   `lists.makerspace.network` → `inbound.postmarkapp.com` (priority 10), and
   set the webhook URL to
   `https://us-central1-makerspace-net.cloudfunctions.net/groupInbound` with the
   header `x-postmark-webhook-secret: <secret>` (or `?secret=<secret>` on the
   URL if headers are not available). Tick "include stripped text reply".
5. **Secrets** (Blaze plan required):

   ```sh
   firebase functions:secrets:set POSTMARK_SERVER_TOKEN
   firebase functions:secrets:set POSTMARK_FROM_EMAIL              # network@makerspace.network
   firebase functions:secrets:set GROUP_REPLY_KEY_SECRET           # openssl rand -hex 32
   firebase functions:secrets:set POSTMARK_INBOUND_WEBHOOK_SECRET  # openssl rand -hex 24
   ```

6. `npm run deploy:rules && firebase deploy --only functions`.
7. **Test**: create a group, join it with two addresses you control, post on the
   site, reply to the email, then email the group address directly.

Changing `GROUP_REPLY_KEY_SECRET` later invalidates every reply address and
unsubscribe link already sent. Don't, except after a leak.

## Moving a Google Group over

1. Create the group here with the same purpose, by invitation.
2. Invite the Google Group's members (Steward → Invitations, paste the list,
   tick the group). Those already on the roster, add from the Steward page.
3. Post in the Google Group that the list is moving, with the group's page.
4. Run both for a meeting cycle. When most active people are here, set the
   Google Group to announcements only, with a pointer to the new address.

## Not built yet

- **Digests** (one email a day or week). Delivery is every post or none.
- **Attachments.** Noted in the post, not carried. Needs Cloud Storage.
- **HTML email.** Posts are plain text both ways.
- **Rate limits.** Watch `audit`; managers can archive a group that is abused.
- **Several addresses per person.** A member mailing from an address the network
  doesn't know is treated as a stranger. They should reply from the address
  they joined with, or add it when account linking exists.
