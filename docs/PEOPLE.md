# The people layer — how it is built

**Status: built 2026-09-23, awaiting project setup (see §Turning it on).**
The policy is in `GOVERNANCE.md`; this is the implementation, and the map
from the Nexus modules it was ported from.

## Shape

Browser → Firestore, with the security rules as the whole server. There is no
Cloud Function in any write path. Nexus's `PLAN.md` records that its Functions
write custom claims its rules never read, so enforcement leaked to the client;
here the rules read the documents directly and the client is untrusted.

| Collection | One document per | Who writes it |
|---|---|---|
| `people/{uid}` | signed-in person: name, email, phone, `primary_space_id`. Read by the person, stewards, and the admin of their primary space — **never by verified peers**, because it holds the address the roster withholds | the person; a confirmer may set the primary space |
| `memberships/{uid}_{space_id}` | a person's standing at one space: role, status, functions, contact preference, invitations | the person on join and for their own settings; space admin, steward or network admin for standing |
| `stewardships/{uid}` | region steward or network admin | network admin; the bootstrap address once |
| `spaces_index/{space_id}` | every organisation a person can join: the mirror of `data/spaces` the rules can read (name, domain, state, region), proposed spaces, and **partner organisations** (`kind: partner`, never in the directory). The name is historical | network admin syncs; stewards add partners in their region; anyone proposes; a claim flips `claimed` |
| `roster/{uid}` | what verified people see about each other | the person or a confirmer; rules refuse a projection that disagrees with its sources |
| `messages/{id}` | a relayed message | verified sender; recipient marks read; the optional Function emails it |
| `invitations/{space~email}` | a named person invited to one organisation in one role, prefilled with name and functions | stewards in the region, network admins, and a space's admin for their own space; the invitee flips it to accepted; `emailed_at` only by the mailer |
| `groups/{slug}` (+ `members/`, `threads/`, `threads/*/posts/`) | mailing lists with an archive — see GROUPS.md | stewards create; managers run; members post from the site; `groupInbound` writes email posts |
| `reply_keys/{key}` | map from a personal reply address to group, thread, person | the `groupMailer` Function only; no client reads it |
| `meetings/{id}` | a convened meeting: when, where, the audience in words, and the invitee uids frozen at creation | stewards in the meeting's region, network admins; `emailed_uids` only by the mailer Function |
| `meetings/{id}/rsvps/{uid}` | one invitee's answer and whether they came | the invitee writes `response`; the convener writes `attended` |
| `audit/{id}` | append-only | anyone about themselves; stewards read |

"Verified" is an active membership at the person's primary space. That is
what opens the roster and the People page.

**Primary space is set on request.** `joinSpace()` points `primary_space_id`
at the space being joined even while the membership is pending, so that
space's admin can read who is asking before confirming them. An active
primary is never displaced; a pending one gives way to an active join.

The document id `{uid}_{space_id}` is not decoration: it lets the rules find a
membership with `get()` instead of a query, which rules cannot run.

## The join decision

Made in `src/network/db.ts` `joinSpace()` so the form can say what will happen
before the click, and enforced again in `firestore.rules` so it cannot be
faked. The two must agree; the rules tests pin the rules side.

| Verified email at the space's domain? | Space | Wants | Gets |
|---|---|---|---|
| yes | unclaimed | admin | **admin, active**, and claims the space in the same batch |
| yes | claimed | admin | admin, **pending** (existing admin or steward confirms) |
| yes | any | editor or contact | **active** at once |
| no | any | anything | **contact, pending** |
| — | proposed (not in directory) | anything | **contact, pending**, network admin confirms |
| any | partner organisation | — | **partner, pending**, steward confirms; domain never counts |

Consumer email domains (`gmail.com` and the rest, list in `model.ts`) never
count as a match. A space with no website cannot be claimed by domain at all.

## What the client must keep consistent

Two documents describe one fact, and the rules check them together with
`getAfter()` so the batch is atomic:

- **Claim.** `memberships` create as active admin ⇔ `spaces_index.claimed`
  false → true in the same batch.
- **Roster.** `roster/{uid}` must equal the projection of `people` +
  `memberships` after the batch: same name, role, functions, state, region;
  `email` only if the role is an organiser role *and* the preference is
  `email`. `rosterFrom()` in `db.ts` is the only place the projection is built.

A contact's email can therefore never reach the roster, whatever the client
sends. That is the "relay for members, direct for organisers" rule from
GOVERNANCE, held by the database rather than by good behaviour.

## Invitations

How an existing group becomes people on the roster without anyone being added
unasked. On the Steward page, **Invitations**, paste a list — `name, email,
organisation, role, functions, note` — and each line becomes an invitation
visible only to the inviters. The preview flags unknown organisations (add
partner organisations first) and people already invited.

Send each invitation in one of three ways: **Email it** (the
`invitationMailer` Function, replies to the inviter), **Copy link**, or
**Download pending links** for a mail merge or personal emails. The link opens
the join page; the invitee signs in with that exact address, sees what the
inviter filled in, corrects it and accepts. They are active at once, in the
role they were invited to, and an admin invitation claims an unclaimed space.
A signed-in person sees their open invitations on the join page whether or not
they came by the link.

## Meetings

Convening, GOVERNANCE §Roster purpose 1. On the Steward page, filter the
People tab to who should come and press **Invite these to a meeting**. The
invitation list is the filtered, active people with invitations on — one seat
per person — and it is saved on the meeting, so the record shows who was asked.

Invitees see the meeting on their People page, answer yes / maybe / no, see
who else is coming, and download an `.ics`. After the meeting the steward ticks
who came; the Meetings tab reports how many spaces were represented.

Email is optional. With the mailer deployed, **Email invitations** sends each
invitee not yet emailed a message with the `.ics` attached (`METHOD:PUBLISH`,
so calendars add it without an accept button — answers are given on the site),
and cancelling tells everyone already emailed. Replies go to the steward who
called it. Without the mailer, **Copy invitee emails** and **Download .ics**
cover it by hand. The `.ics` builder is `functions/src/ics.ts`, imported by
both sides so they cannot disagree.

## Nexus → Network

| Nexus | Here | Change |
|---|---|---|
| `SystemRole` enum | `NetworkRole` in `enums.json` | `space_contact` added, the role most people hold |
| `capabilities.ts`, `role_capability_map.ts` | `src/network/capabilities.ts` | same pattern; `can(session, cap, scope)` |
| `people` + `person_memberships` | `people` + `memberships` | id is `{uid}_{space}` so rules can `get()` it |
| `claimOrganization` (Function; no server-side domain check) | membership create rule | domain checked in rules, client cannot bypass |
| `isCommonEmailDomain` (hardcoded Set) | `COMMON_EMAIL_DOMAINS` in `model.ts` | same list |
| custom claims | none | rules read documents |
| `audit_logs` written by Functions | `audit` written by clients | weaker; fine until there is a Function to write it |
| invites (token, SHA-256, 14 days) | **not ported yet** | join is self-service; invites come with listing editing |
| Postmark via `sendNotice` | `functions/src/index.ts` `relayMessage` | one trigger, optional |

## Where things are

- `src/network/` — `firebase.ts` (init), `model.ts` (shapes), `session.tsx`
  (who is signed in), `capabilities.ts`, `db.ts` (every write), `pages/`
  (Join, People, Steward). Lazy-loaded from `App.tsx`; the public directory
  never loads the SDK.
- `firestore.rules`, `test/rules.test.mjs` — `npm run test:rules` runs the
  suite in the emulator. Every row of the join table above has a test.
- `functions/` — the mailers: `relayMessage` and `meetingMailer`. Not required.
- `data/schema/enums.json` 0.3.0 — `NetworkRole`, `MembershipStatus`,
  `PersonFunction`, `ContactPreference`, `SizeTier`.
- `data/schema/space.schema.json` — `region_ids` optional, `size_tier` added.

## Turning it on

Done by hand in the Firebase console, once, under `jrlogan@makehaven.org`:

1. **Firestore**: create the database (`nam5`, production mode). The CLI cannot
   enable the API. Then `npm run deploy:rules`.
2. **Authentication → Sign-in method**: enable **Google** and **Email link
   (passwordless)**.
3. **Authentication → Settings → Authorized domains**: add
   `makerspace.network` (and `connecticut.makerspace.network`). The app uses
   `makerspace.network` as `authDomain` so the sign-in popup stays first-party.
4. `npm run deploy:site` — the CSP in `firebase.json` now admits the Firebase
   endpoints and the auth iframe.
5. Sign in at `makerspace.network/?page=join` as the bootstrap address, press
   **Set up network admin**, then on the Steward page **Sync directory into
   the index**. Until that sync, nobody can join a directory space.
6. Optional, later: Blaze plan, `firebase functions:secrets:set` for
   `POSTMARK_SERVER_TOKEN` and `POSTMARK_FROM_EMAIL`, then
   `firebase deploy --only functions` (it builds `functions/` first).

## Not built yet, on purpose

- Editing the listing from the site (`listing.update` is in the capability
  table, nothing calls it). Pull requests still work.
- Invitations by email. Self-service join covers the meeting's ask.
- Server-written audit. Client-written for now.
- Rate limits on proposals and messages. Watch the audit collection.
