# The landscape, and what we do about it

**Draft, 2026-08-28.** A survey of the existing makerspace directories, mapping
projects, and data standards, and the decisions this project takes as a result.

The short version: **we are not building another map.** Six people have already
built the map, and two of them have since stopped maintaining it. What nobody has built is a *state-level steward* with a data
standard underneath it and an operational-quality layer on top. That is the gap
we fill, and everything below is chosen to interoperate rather than compete.

---

## 1. What exists

### SpaceAPI — `spaceapi.io`

The best philosophical match, and the one to integrate with first.

~400 hacker/makerspaces publish a JSON document **at their own URL, on their own
server**. The "directory" is nothing but a list of those URLs, maintained by pull
request at `github.com/SpaceApi/directory`. There is no central database. A space
that leaves takes its data with it, because it always had it.

Schema v15 requires only `api_compatibility`, `space`, `logo`, `url`, `contact`.
Optional but interesting: `location` (address, lat/lon, timezone), **`state`**
(open/closed *right now*, with timestamps), `sensors`, `feeds` (RSS/iCal),
`membership_plans`, `projects`, and two federation primitives —
**`linked_spaces`** (affiliated spaces plus their endpoints) and **`spacefed`**
(flags for federated login).

Zero Connecticut spaces are in the directory today.

**What we take:** the architecture. This is precisely the "edges are the source
of truth" stance already argued in the Nexus
`docs/centralized-vs-federated-comparison.md`, and SpaceAPI has been running it
in production for over a decade. Note that `linked_spaces` and `spacefed` are a
reciprocity primitive that already exists — we should extend rather than invent.

**What we do:** consume `state` for live open/closed on the directory (something
the Google Site structurally cannot do), publish a conforming endpoint for any CT
space that wants one, and PR the CT spaces into the directory.

### fablabs.io

The Fab Foundation's registry — Ruby on Rails, open source (`fablabbcn/fablabs.io`),
JSON:API with OAuth2, and a flat dump at `api.fablabs.io/0/labs.json`
(2,851 labs, 313 in the US). 24 fields per lab: name, `kind_name`
(`fab_lab` / `mini_fab_lab` / `mobile`), address, lat/lon, contact,
`activity_status`, and `capabilities`.

**The `capabilities` field is a cautionary tale.** The entire global vocabulary
is six values — `three_d_printing`, `cnc_milling`, `circuit_production`,
`laser`, `precision_milling`, `vinyl_cutting` — and in practice every lab checks
all six. All three Connecticut labs have byte-identical capability arrays. As a
discriminator for "where can I get this made," it carries zero information.

**What we take:** the three CT records it holds, and the lesson. Our capability
vocabulary has to be granular enough that two spaces actually differ, or the
directory's filters are decoration.

**What we found:** two CT spaces that are *not* on the current Google Site —
**Hand Made** (Daniel Hand High School, Madison) and **SHU Makerspace** (Sacred
Heart University, Fairfield). Immediate directory value on day one.

### Open Know-Where (OKW) — Internet of Production Alliance

The actual *standard* in this space, published 2020, now at Release 2, CC BY-SA.
Purpose: "know where something can be made."

Entities: `ManufacturingFacility`, `ManufacturingEquipment`,
`ManufacturingService`, `ManufacturingSkill`, `FindableProject`, plus
`Address`, `Contact`, `DistributedResource`, `DataVerificator`, and
`DatabaseSourceMetadata`. Serialized as JSON Schema, OpenAPI, SQL, DBML, and
RDF/Wikidata Turtle. There is a companion machine catalog of common makerspace
equipment brands and models (`iop-alliance/okw_machines_catalog`).

**The design worth stealing is provenance.** Every record carries `source_id`,
`verification`, and `verificator_id`; sources carry license, version, publisher,
and update date. OKW assumes from the outset that the data is aggregated from
many places of varying trustworthiness, and makes each record say where it came
from and who checked it. Our directory aggregates from fablabs.io, SpaceAPI,
Nation of Makers, and manual entry — we have exactly that problem, and OKW has
already solved it.

**What we do:** adopt OKW as the base vocabulary for facility and equipment
rather than inventing one, and adopt its provenance model wholesale. Publish an
OKW-conformant export so CT data flows into the global map.

### Maker Passport / People and Skills Specification — IoP Alliance

`iop-alliance/maker-passport`. A "Mutual Recognition and Data specification" so
that a maker's skills and experience travel across roughly 500 Digital
Innovation Hubs in the pan-African mAkE project.

This is *literally the reciprocity idea* — a maker authorized on a tool at one
space carrying that standing to another. Status: early. The repo contains a
README and one JSON schema (`pss-user-schema.json`, adapted from the FOLIO
library user schema). Right problem, unfinished answer.

**What we do:** align with it and offer CT as the first real implementation.
This is a contribution opportunity, not a competitor.

### Nation of Makers — *faded out*

The US convener, and **no longer operating in any meaningful way** (confirmed by
MakeHaven, 2026-08). The website still stands and `makethedata.org` currently
returns HTTP 520. Do not plan around them and do not send data to them.

They are still worth studying for two reasons:

1. **Their governance model is the one we need.** Their crowdsourced map was
   "populated and maintained by Regional Champions and State Representatives" —
   named geographic stewards, each responsible for their own patch. That
   structure is the right answer to the staleness problem and we should adopt
   it. It is also worth noticing *what actually failed*: the model was sound,
   the national backbone funding it was not. A federation of self-funded state
   networks has no single point of failure to lose.
2. **`makethedata.org` ran an annual Survey of Makerspaces** that overlapped
   the Annual Data tab in our Standards tool. With it gone, there is now **no
   national makerspace dataset being collected at all.** That converts an
   alignment problem into an opportunity: the CT instrument has no incumbent to
   defer to, and a set of state networks running the same instrument is the
   most plausible route to a national picture returning.

### Open Badges 3.0 — 1EdTech

**The most consequential standard in this survey**, and the one that changes how
cross-space reciprocity should be built.

[Open Badges 3.0](https://www.imsglobal.org/spec/ob/v3p0) re-bases Open Badges
on the W3C Verifiable Credentials Data Model 2.0. An `AchievementCredential` is
a JSON-LD document, cryptographically signed by the issuer (JWT or Linked Data
proof), naming an `Achievement` (name, description, criteria, and — critically —
`alignment` to an external framework) and an `AchievementSubject` (the earner,
identified by email, URL, or DID). Revocation is a `credentialStatus` pointing
at a hosted status list. There is an Open Badges API with OAuth2 for wallets,
and an `EndorsementCredential` type that lets a third party vouch for someone
else's credential.

**Why this matters more than the partner API.** The reciprocity problem — a
member authorized on the laser at one space walking into another — looked like
it needed bilateral integration: every space running an API, syncing member
standing. Across ten Connecticut spaces, most volunteer-run and several with no
software staff at all, that was never going to happen.

With Open Badges the member is the carrier. MakeHaven signs "authorized on CO2
laser." The member holds it. The receiving space verifies the signature against
MakeHaven's published key and checks the status list. **No integration between
the two spaces is required, and neither has to know the other exists.** A space
with no developers can verify a credential on a hosted verifier page.

That is strictly more federated than a partner API, and it is the same argument
already made in the Nexus `centralized-vs-federated-comparison.md`, carried to
its conclusion: not just "the edges own the data" but "the person owns the
claim."

**What the standard does not give us.** Open Badges is an envelope. A signed
badge reading "Laser" from one space means nothing at another unless both share
a definition of what laser authorization *entails*. That shared meaning is the
`alignment` property's job, and publishing it is our work, not 1EdTech's.

Nor does Open Badges answer the question a shop manager actually has. It proves
a credential is *authentic* — this issuer really signed this. It says nothing
about whether the issuer's process is any good. Which is exactly what
`tools/standards/` measures. See `docs/RECIPROCITY.md`.

**Note on the sibling project.** MakeHaven's
`docs/arch/PUBLIC_BADGE_TRANSCRIPT_AND_OPEN_BADGES_FRAMEWORK_PLAN.md` (in
`makehaven-website`) already plans a credential ledger, opt-in public
transcript, and Open Badges projection — a very good fit. It is written against
**Open Badges 2.0 vocabulary** (Badge Class / Issuer / Assertion, recipient
identity hashing, hosted assertion endpoints). Worth moving to 3.0; the reason
is in `docs/RECIPROCITY.md` §4 and it is not pedantry.

### The Maker Map / makerspace.com / Nesta

- **The Maker Map** (DiResta & Pinkston) — open-source crowdsourced global map,
  now largely dormant, with regional forks that outlived the parent (Jordan's
  Crown Prince Foundation runs one).
- **makerspace.com/directory** — Make: magazine's directory.
- **Nesta's open dataset of UK makerspaces** (2015, Sleigh & Stewart) — the best
  prior art for the *dataset* we want: 97 spaces with location, space, tools,
  membership, amenities, external relationships, legal structure, founders,
  aspirations and challenges, plus *anonymised* turnover, income and
  expenditure. Published as documented CSV, built against the ODI's Open Data
  Self Assessment Questionnaire.

**The lesson from all three is the same one, and it is the most important
finding in this document:** crowdsourced global maps go stale. Nesta's snapshot
is a decade old. The Maker Map is dormant. fablabs.io needs an
`activity_status` field because its records rot. The thing that keeps a
directory alive is not better software — it is a named local steward with a
reason to care. Connecticut has one. That is the actual product.

### Maps of Making — `mapsofmaking.org`

v0.2 demo, in active development. Federates over *contributed endpoint URLs*
with natural-language querying over live SPARQL endpoints — the SpaceAPI
pattern with a semantic-web layer and an agent interface on top. Tracks records
as Unclaimed → Claimed → Live, which is a good model for our own verification
ladder. Team, license, and schema are not documented on the site yet; worth
contacting directly rather than inferring.

---

## 2. Decisions

| Decision | Rationale |
|---|---|
| **Do not build another global map.** Be the state/regional steward layer. | Six exist. None has a steward in CT. Stewardship is the scarce input, not software. |
| **Adopt OKW as the base facility/equipment vocabulary.** | It is the real standard, it is CC BY-SA, and it was designed for exactly this. Inventing a seventh vocabulary would be indefensible. |
| **Adopt OKW's provenance model wholesale.** | We aggregate from four sources of differing reliability. Every record must state its source and who verified it, or funders can't trust the aggregate. |
| **Extend the capability vocabulary well past fablabs.io's six values.** | Their six do not discriminate — all three CT labs have identical arrays. Ours must let a woodshop differ from a metal shop. |
| **Consume and publish SpaceAPI.** | Live open/closed status is real user value, and `linked_spaces`/`spacefed` are the reciprocity primitive we would otherwise have invented. |
| **Run the Annual Data instrument without waiting for a national partner.** | `makethedata.org` has gone dark; there is no national makerspace dataset being collected. Design the instrument so other state networks can adopt it verbatim. |
| **Propose Maker Passport as an Open Badges 3.0 profile plus an achievement framework.** | IoPA is solving the right problem but re-deriving credential mechanics that 1EdTech and W3C already settled. |
| **Copy Nation of Makers' Regional Champion model** for multi-state governance, but not their funding shape. | The steward structure was sound; the single national backbone that funded it was the thing that failed. |
| **Build reciprocity on Open Badges 3.0, not on a bilateral partner API.** | The member carries the credential; no space-to-space integration is required. Ten mostly-volunteer CT spaces will never all run an API. |
| **Publish a network achievement framework** that local badges align to. | Open Badges carries the envelope; shared *meaning* is the part nobody else provides. Same pattern as the capability vocabulary. |
| **Use Standards of Excellence as the issuer trust layer.** | Open Badges proves a credential is authentic. It cannot tell you whether the issuer checks anything. |

## 3. What is genuinely ours

Everyone above answers one of three questions: *what does a space have* (OKW,
fablabs.io), *is it open right now* (SpaceAPI), or *did this person really earn
this* (Open Badges). Nobody answers **is it well run** — whether the space has a
documented hazard assessment, a tool authorization system that anyone audits, a
working after-hours emergency path, a board that meets.

That last question is not academic once credentials start crossing between
spaces. Open Badges makes a laser authorization from another space verifiable;
it cannot make it *meaningful*. The shop manager's real question is whether the
issuing space checks anything before it signs.

That is what `tools/standards/` does, and as far as this survey found, it does
not exist anywhere else. It is the contribution, and it sits as a layer *above*
OKW rather than competing with it.

## 4. Open questions

1. Contact Maps of Making — schema, license, and whether federating with them
   beats maintaining a directory listing.
2. With `makethedata.org` dark, decide whether to approach other state networks
   directly about running the same Annual Data instrument.
3. Ask IoPA whether the Standards of Excellence framework is welcome as a
   candidate companion spec to OKW, and propose that Maker Passport be
   specified as an Open Badges 3.0 profile rather than a new credential format.
4. Decide who operates the network achievement framework namespace, and what
   the amendment process is. A shared vocabulary with no governance is a fork
   waiting to happen.
5. Decide whether `state` (live open/closed) is worth the operational burden for
   CT spaces, or whether we only surface it for spaces that already publish it.
