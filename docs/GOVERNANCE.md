# Who may edit a record

**Status: specified, scheduled (phase 0b).** The vocabulary and the flows below
are settled and deliberately mirror `~/development/Entrepreneurship-Nexus`,
which has already built this. Nothing here is running yet — today the site is
static and claiming happens by email and pull request. This file exists so that
when the machinery does get built, it is built once and the same way in both
projects.

Revised 2026-09-23 after the network meeting. The original scope was *who may
edit a record*. The meeting added a second purpose that turns out to be the
more important one: **who is at each space, so people can be convened and can
find each other.** See §Roster below.

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
| `space_contact` | One space | Edit their own roster entry; receive invitations; see and contact verified people at other spaces. Cannot edit the listing | — |
| `partner` | One partner organisation | As `space_contact`, at an organisation that works with makerspaces but is not one — see §Ecosystem partners | — |

`space_contact` is the role most people will hold. A board member, a safety
lead or an instructor who wants to be in the loop is not thereby the person who
should be editing the hours. It is also the role that makes succession work:
when the `space_admin` leaves, a `space_contact` is already known to the
network and can be promoted by the steward without starting from zero.

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

Once someone is a `space_admin` they invite colleagues directly, and a steward
may invite anyone in their region. **Built 2026-09-27**; see PEOPLE.md
§Invitations. It departs from the Nexus mechanics below in one place, on
purpose: acceptance already requires signing in with the invited address, so
the link carries no secret — the invitation's id is `{space}~{email}` and
holding it without the mailbox gets you nothing. There is therefore no token to
hash. Expiry is 30 days rather than 14, because the first use is inviting a
whole existing group at once.

The Nexus mechanics, for reference, because these details are where invite
systems leak:

- The token is random, emailed raw as a link, and stored **only** as a SHA-256
  hash plus its last four characters for support. A database dump does not yield
  working invitations.
- Expiry is **14 days**.
- Acceptance requires the authenticated email to equal the invited email.
  Forwarding the link to a colleague does not work; inviting them does.
- A second invitation to the same address for the same space returns the existing
  one rather than creating a duplicate.
- Nobody may invite above their own authority: a `space_admin` can create
  `space_admin`, `space_editor` and `space_contact` at their own space and
  nothing else. A `space_contact` may propose another `space_contact`; the
  space admin or the steward confirms it.
- Every claim, invitation, acceptance and role change writes an audit event.

## Roster

Every active membership row carries a roster entry: what this person does at
the space and how they want to be reached.

| Field | Who edits | Notes |
|---|---|---|
| `functions[]` | the person, the space admin | Controlled list, versioned in `enums.json`: `director`, `board`, `staff`, `safety`, `instruction`, `membership`, `facilities`, `finance`, `youth`, `volunteer`. Several allowed |
| `contact_preference` | the person | `email`, `phone`, `relay` — how other people in the network may reach them. Honoured for organiser roles; `space_contact` is always relayed (see Contact rule) |
| `invitations` | the person | Whether they want meeting invitations at all |
| `status` | lifecycle | Same as the membership row: `invited → pending_acceptance → active → suspended | revoked` |

**Purpose.** Two things, and the second is the one the network asked for:

1. *Convening.* Invitation lists are queries — every active person with
   `invitations` on, at spaces with `size_tier: large`, or in one county, or
   holding the `safety` function. The steward never keeps a separate list.
2. *Interconnection.* A person at one space can find and reach the people at
   another. A youth-programme lead should be able to find the other
   youth-programme leads in the state without going through the steward.

**Visibility.** The roster is never public. Three levels:

| Who | Sees |
|---|---|
| Anyone on the public site | Nothing. The public sees `contact.email` on the space record and no people |
| A **verified person** — an active membership row at a space whose record is `space_confirmed` or `steward_verified` | Name, space, functions, and a way to contact every other verified person **in the whole network, across regions**, honouring their `contact_preference` |
| A region steward | Everything in their region, including status and who invited whom; the verified-person view of other regions |
| `network_admin` | Everything |

**The people graph is national; regions are how it is stewarded.** The
2026-09-23 meeting had spaces from several states, and the connections people
wanted were between a youth lead in Connecticut and one in Ohio, not only
between neighbours. So visibility and contact never stop at a region boundary.
Regions decide *who verifies a record* and *how a meeting is sliced*
("Connecticut only", "all large spaces nationally"), nothing more.

**Contact rule, settled 2026-09-23.** How another verified person reaches you
depends on your role, not only your preference:

| Role | Reachable by other verified people via |
|---|---|
| `region_steward`, `space_admin`, `space_editor`, `partner` | Direct email address shown, if `contact_preference` is `email` or `phone`. These are the organisers and vetted partners; being reachable is part of the job |
| `space_contact` | Relay only, whatever the preference says. The network passes the message on and never exposes the address |

The split exists because `space_contact` is the door through which ordinary
members will join, and a members' directory with visible email addresses is
harvestable. Organisers are few and already public on their own sites.

**No hiding.** A person on the roster is visible to every other verified person
in the network. There is no invitations-only mode that keeps someone off the
roster; if that is what they want, the steward keeps them on a plain mailing
list outside this system. Being findable is the point of joining.

**Continuity.** A space with fewer than two active people is a space one
departure away from going dark. The steward view flags those, and a space admin
is prompted to invite a second person at claim time.

**Size tier.** Convening by size needs a `size_tier` on the space record
(`small`, `medium`, `large`), set by the space admin or the steward. This is a
minor bump to `data/schema/enums.json`. Thresholds are a network decision, not a
schema one; the field records the tier, the region record documents the rule.

## Ecosystem partners

Added 2026-09-27. The groups this network grew out of were never only
makerspaces: the Connecticut list carries state agency staff, legislative
staff, Forge and the Entrepreneurship Foundation, and the national calls have
included the Urban Manufacturing Alliance. They are convened alongside the
spaces and should be reachable the same way.

- A **partner organisation** is an entry in the sign-up index with
  `kind: partner` and a `PartnerType` (`government`, `funder`, `support_org`,
  `education`, `industry`, `network`, `other`), crosswalked to Nexus's
  `OrganizationRole` / `OrganizationType` in `enums.json`. It is **not** a
  directory record: the public directory stays makerspaces only.
- A steward adds partner organisations for their region; anyone may propose
  one, and the network admin reviews proposals.
- People there join with the `partner` role, the only role a partner
  organisation has. **A steward always confirms a partner.** An email at the
  organisation's domain is not enough: a `ct.gov` address says you work for
  the state, not that you speak for the office that funds makerspaces.
- Once confirmed, a partner is a verified person like any other: they see the
  roster and are seen on it, receive invitations, and can be filtered for
  ("Connecticut partners: government"). Like organisers, they may choose to
  show their address, since a steward has vetted them and they are usually
  public-facing already.
- A partner never edits a space's listing and never claims one.

## The network first, regions on request

Sign-in, the roster and the people view live at **makerspace.network**, the
apex, not under any state. A space belongs to the network first. `region_ids`
becomes optional: a space in a state with no region record simply has none,
and its address carries the state. Its record is verified by `network_admin`
until a region exists.

A region is created when a state, or a group of states, asks for one and names
a steward. That is a data change — one region record, `region_ids` added to
the spaces already there, a hostname if they want one — and the existing
records and people become the steward's. Nothing about joining waits on it.

Convening never needed regions to exist: "all large spaces", "everyone in
Ohio", and "the youth leads" are queries over the roster and the space
records, and the state comes from the address.

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

Now. The earlier position was to wait until a space asked to maintain its own
listing. At the 2026-09-23 network meeting the spaces asked for something
broader — sign up as connected to a space, update what your role allows, be
invited to the right meetings, and leave someone behind who can carry on. That
is the signal, and it is a stronger one than a listing edit.

When it does, the stack should be the one Nexus already runs — Firebase Auth for
identity, Firestore for the membership rows, Cloud Functions for the invite and
claim endpoints — so that the two projects share an implementation rather than
two half-tested ones.

One thing to fix rather than copy: Nexus's `PLAN.md` records that its Functions
write custom claims (`nexus_role`, `nexus_org_id`) which its Firestore rules do
not actually read, so enforcement leans on client-side checks in places. Do not
inherit that. Enforce server-side from the first commit.
