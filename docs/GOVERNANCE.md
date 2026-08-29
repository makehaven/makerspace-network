# Who may edit a record

**Status: specified, not built.** The vocabulary and the flows below are settled
and deliberately mirror `~/development/Entrepreneurship-Nexus`, which has already
built this. Nothing here is running yet — today the site is static and claiming
happens by email and pull request. This file exists so that when the machinery
does get built, it is built once and the same way in both projects.

## The problem

A directory dies when nobody has both the knowledge and the standing to correct
it. `docs/INTEROP.md` surveys six makerspace maps that went stale for exactly
this reason: the crowd that populated them had no particular reason to come back,
and the spaces themselves had no way in.

So there are two kinds of authority here, and they are separate on purpose:

- **The space** knows its own hours, prices and equipment, and should be able to
  change them without asking anyone.
- **The region steward** convenes the network, verifies records nobody has
  claimed, and invites spaces in — but does not own their entries.

MakeHaven is Connecticut's steward *and* runs one of the listed spaces. If those
two roles were the same role, the steward could quietly edit its neighbours'
listings. They are not the same role.

## Roles

Four roles, scoped by what they can reach. The names correspond to Nexus's
`SystemRole` enum so a person who exists in both systems has one obvious mapping.

| Role | Scope | Can | Nexus equivalent |
|---|---|---|---|
| `network_admin` | Everything | Anything, including creating regions | `platform_admin` |
| `region_steward` | One region | Verify any record in the region, invite spaces, approve contested claims, edit unclaimed records | `ecosystem_manager` |
| `space_admin` | One space | Edit every field on that record; invite, promote and remove that space's other people | `eso_admin` |
| `space_editor` | One space | Edit every field on that record | `eso_staff` |

A person may hold roles at more than one space — someone on the board of two
makerspaces is normal and should not need two accounts.

**Membership is the authority, not the role.** As in Nexus, the record of who may
do what lives in a membership row (`person_id`, `region_id`, `space_id`,
`role`, `status`, `invited_by`), not in a field on the person. Status follows the
same lifecycle: `invited → pending_acceptance → active → suspended | revoked`.

**Check capabilities, not roles.** Nexus learned this and wrote it down in
`src/domain/auth/capabilities.ts`: code asks whether the actor may
`record.update`, not whether they are a `space_admin`. Roles are a bundle of
capabilities and the bundles will change; the check sites should not.

## Claiming

A space claims its own record. Three cases, matching Nexus's `claimOrganization`:

1. **Unclaimed record, matching domain.** The person signs in with an address at
   the domain on the record's `contact.website` — `jo@sparkmakerspace.org` for
   `spark-makerspace` — and becomes that record's `space_admin` immediately. No
   approval step, because there is nobody yet to approve it and the domain match
   is the evidence.
2. **Already claimed.** The request becomes pending, and the existing
   `space_admin` or the region steward approves or declines it. A listing cannot
   be taken over silently.
3. **No domain match.** Always pending, always human-reviewed. Consumer domains
   (gmail, yahoo, outlook and the rest) never satisfy case 1 — Nexus keeps that
   list in `isCommonEmailDomain` and we should share it rather than write a
   second one.

A record with no `contact.website` cannot be claimed by domain at all. That is a
feature: it makes verifying the website the first step, which is the field a
visitor needs most anyway.

## Invitations

Once someone is a `space_admin` they invite colleagues directly. Mechanics copied
from Nexus rather than reinvented, because these details are where invite systems
leak:

- The token is random, emailed raw as a link, and stored **only** as a SHA-256
  hash plus its last four characters for support. A database dump does not yield
  working invitations.
- Expiry is **14 days**.
- Acceptance requires the authenticated email to equal the invited email.
  Forwarding the link to a colleague does not work; inviting them does.
- A second invitation to the same address for the same space returns the existing
  one rather than creating a duplicate.
- Nobody may invite above their own authority: a `space_admin` can create
  `space_admin` and `space_editor` at their own space and nothing else.
- Every claim, invitation, acceptance and role change writes an audit event.

## What a space controls, and what it does not

A `space_admin` owns the descriptive and operational fields — address, contact,
hours, access model, cost, minor policy, capabilities, logo.

They do **not** get to delete the record's history. `sources[]` and
`verification` are append-only: when a space confirms its own record the status
becomes `space_confirmed` and a source entry records that, alongside whatever it
was imported from. The point of this directory is that every claim can be traced,
and that has to survive the record changing hands.

Nor may a space edit the vocabularies. Adding a capability to
`data/schema/enums.json` is a versioned change affecting every consumer — see the
rules in `CLAUDE.md`.

## When to build it

Not yet. The static site costs nothing to run and has no accounts to breach,
and the current bottleneck is phone calls to seven spaces, not software. Build
this when a space asks to maintain its own listing and a pull request is a real
obstacle for them — that is the signal, and it has not happened yet.

When it does, the stack should be the one Nexus already runs — Firebase Auth for
identity, Firestore for the membership rows, Cloud Functions for the invite and
claim endpoints — so that the two projects share an implementation rather than
two half-tested ones.

One thing to fix rather than copy: Nexus's `PLAN.md` records that its Functions
write custom claims (`nexus_role`, `nexus_org_id`) which its Firestore rules do
not actually read, so enforcement leans on client-side checks in places. Do not
inherit that. Enforce server-side from the first commit.
