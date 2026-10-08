# Gaps in the standards, found by running a process registry against them

**Draft, 2026-08-14. Nothing in `app/index.html` has been changed.**

Method: every row of the MakeHaven Process Registry (`~/development/Process-Registry`,
186 operational processes across 13 groups, roughly half of them answered by
staff rather than inferred) was mapped to the standards it implements. The full
mapping is at `Process-Registry/docs/STANDARDS_CROSSWALK.md`.

Most rows mapped cleanly, and in several cases the standards did their job well —
S009 isolated executive succession as the highest-impact undefined process in
the organisation, and S023 correctly scores a tool-authorisation system that has
been substituted by social trust for almost two years.

What follows is the residue: real operational processes, several of them I5
(safety, legal or existential), that **no standard reaches**.

---

## A. Proposed new standards

Ordered by how much of the registry falls through the hole.

### P1 — Unstaffed and after-hours operation ★ strongest finding

Proposed as a **new conditional module F**, flag: *"Members or users have
unsupervised or after-hours access to the facility."*

Today the entire operating model is one clause — "lone-work" — inside **S017**, a
non-critical tier-2 standard whose framing is "opening, closing… protocols."
MakeHaven's own registry row reframes this exactly: *"there is no opening or
closing."* The space is 24/7, unstaffed, RFID-controlled, and the row is scored I2
only because the standard gave it nowhere better to sit; the safety exposure
belongs at I5.

This is not a MakeHaven peculiarity. Unstaffed member access is the dominant
model for member-based makerspaces, and it changes the meaning of half the
safety domain: S028's "staffing and supervision levels match the hazards
available" has no answer when the staffing level is zero.

Draft standards:

| | Tier | Critical | Standard |
|---|---|---|---|
| F1 | 1 | ✓ | Documented rules define which tools and activities are permitted without staff or a trained peer present, derived from the S015 hazard levels |
| F2 | 1 | ✓ | A person alone in the facility can summon help: posted emergency contacts, a working two-way channel, and a documented response path when no one is on site |
| F3 | 2 | ✓ | Access control fails safe — egress never depends on it — and a documented degraded mode covers network, power, and provider outage |
| F4 | 2 | | Entry and tool-use records are retained and reviewable for incident investigation, under a stated privacy limit |
| F5 | 3 | | Annual review of after-hours incidents, access records, and the permitted-tool list |

**F3 is the one to notice.** MakeHaven's door row reads: *"every badge tap depends
on Drupal being reachable — when the website is down or the internet is out,
nothing opens. We have repeatedly hit this failure mode."* Scored against the
current 84 standards this space looks fine on access control, because no standard
asks what happens when the access system is unreachable. Every space running
cloud-dependent access has this exposure and none of them are being asked.

### P2 — Data protection and information security

Proposed: **two core standards in domain 4**, beside S037.

S037 covers *continuity* of digital services — owners, backups, recovery,
controlled admin access. Nothing in the framework covers *protection of the
personal data those services hold*. The registry makes the exposure concrete:
member PII, payment-processor linkage, door and tool access logs, demographic
data in CiviCRM since Dec 2025, youth-programme records, donor LAI scoring — and
an open critical finding of *"an unauthenticated endpoint exposing door and
member data."*

A space can hold all of that, leak it, and still score Exemplary today.

| | Tier | Critical | Standard |
|---|---|---|---|
| P2a | 2 | ✓ | Personal data collected is inventoried, covered by a published privacy notice, retained under a stated schedule, and accessible only to defined roles |
| P2b | 3 | | Security is reviewed periodically, findings are tracked to closure, and a breach-response procedure names who is notified and when |

MakeHaven already runs the P2b process (quarterly security audit, four of six
dimensions never run) — a case of a space doing more than the framework asks.

### P3 — Instruction and instructors

Proposed: **new conditional module**, flag: *"Runs classes or workshops taught by
instructors."*

The registry's largest group is Education & Instruction — 22 processes — and it
maps to almost nothing. **S058** covers pedagogy (choice, iteration, peer
learning). Nothing covers who is permitted to teach.

Consider the realistic failure: a stipended contract instructor, never
background-checked, never observed, teaches a laser class to twelve strangers
including two 16-year-olds. Every standard in the framework is satisfied.

| | Tier | Critical | Standard |
|---|---|---|---|
| P3a | 1 | ✓ | Instructors are vetted and demonstrably qualified on the equipment they teach, and hold the same credentials required of independent users |
| P3b | 1 | ✓ | Written instructor agreements define role, conduct expectations, safety duty, participant supervision, and IP |
| P3c | 2 | ✓ | Paid instructors are lawfully classified and compensated under a written agreement (see also the S046 flag problem below) |
| P3d | 2 | | Class operations define capacity, prerequisites, per-class safety briefing, cancellation and refunds |

MakeHaven scores D0–D1 across almost all 22 of these rows, with a quiz that
*"contradicts our own docs"* and an orientation video switched off. Not a
MakeHaven failing so much as an unmeasured area for everyone.

### P4 — Financial accessibility

Proposed: **one core standard, domain 6, tier 2.**

The app already collects need-based dues (count and dollars) as an impact
metric. There is no standard behind the metric. Given the stated design
position — modern access means supervised public events plus accessible
membership rather than the dated free-weekly-hours measure — the framework
currently asserts that position in its metrics and nowhere in its standards.

> A documented and published pathway lets people participate regardless of
> ability to pay, with clear eligibility, a process that does not impose undue
> disclosure, and tracked take-up reviewed against the community served.

MakeHaven's row scores well and would demonstrate the standard: self-certified
on the join form with an online signature, no approval queue by design.

### P5 — Member voice and transparency

Proposed: **one standard in the member module, tier 2.**

S002 requires governing documents to define elections. S004 requires minutes be
retained. Nothing requires that **members can see or influence any of it**.

For membership organisations this is the classic sector failure mode, and the
registry has it live: a member comment that the board *"fails every transparency
test I can think of,"* with the executive director agreeing a stronger feedback
loop is needed. That row is `degraded`, I3, and maps to no standard at all.

> Members can access governance outputs appropriate to the organisation's form
> (meeting summaries, annual financial summary, leadership roster), have a
> defined channel to raise concerns to the board, and — where the governing
> documents provide it — a real role in selecting leadership.

### P6 — Acceptance and disposal of equipment

Proposed: **one core standard, domain 4, tier 2.**

S032 inventories equipment once it exists. S039 plans replacement. Nothing
governs how a machine *arrives* or *leaves*.

Donated equipment is a defining makerspace hazard: a free machine with no
manual, unknown maintenance history, missing guarding, a disposal cost larger
than its value, and floor space that then cannot be used for something better.
The registry has an Asset Disposal Policy document and a commissioning process
that runs on budget-then-wishlist-then-expert-consult — both real practices with
no standard to evidence against. Planned giving makes the same problem sharper:
bequests of equipment.

> Equipment accepted by donation, transfer or bequest passes a documented review
> of condition, safety, space and lifecycle cost before acceptance. Disposal
> follows a documented policy covering data removal, valuation, and hazardous
> components.

### P7 — Premises, occupancy and jurisdictional compliance

Proposed: **one core standard, domain 2, tier 1, critical.**

S018 covers insurance. S035 says the lease should be backed up. Nothing asks
whether the organisation is **lawfully occupying the building for the activities
it conducts** — certificate of occupancy, zoning, permits for welding, spray
finishing, dust collection, chemical storage, and the relationship with the
authority having jurisdiction (fire marshal, building department).

This is the single most common way a makerspace is shut down, and the framework
does not mention it. MakeHaven's landlord row is I4 and maps nowhere.

> Occupancy rests on a written lease or deed; required certificates, permits and
> jurisdictional inspections for the activities conducted are current, and
> findings are tracked to closure.

### P8 — Reaching users, and being reachable

Proposed: **one core standard, domain 2, tier 2.**

Four registry rows, all `degraded` or fragile, share one root: whether the
organisation can actually get a message to its community, and whether the
community can get a message back to a person.

- Mailing list hygiene — *"hand-fed feeder groups silently freeze; three have
  needed repair"*
- Inbound phone and voicemail — *"this is a weak point,"* an unanswered Google
  voicemail box
- Lead handling — a shared inbox staff *"struggle to keep up with"*
- Tool status communication

This looks like comms until it is a safety recall, a tool taken out of service,
a building closure, or an incident notification. Then it is S016 and S033 with
no delivery mechanism underneath them.

> The organisation can promptly reach all current users with safety-critical
> notices and verifies that capability; users and the public can reach a
> responsible person through a monitored channel and receive a response within a
> stated time.

### P9 — Policy and procedure register

Proposed: **one core standard, domain 1, tier 2.** The keystone.

S006 requires that certain policies *exist*. Nothing requires that the
organisation knows **what policies it has, who owns them, or when they were last
reviewed**.

Every evidence-based standard in this framework silently assumes document
control that no standard asks for. The registry's own row is blunt: the
operations index *"is the current answer and it is drifting."*

> A maintained register lists policies and procedures with owner, approval date
> and next review date, under a defined review cadence.

This is the standard the Process Registry itself satisfies — which is the
cleanest argument for the crosswalk existing at all.

---

## B. Existing standards to strengthen rather than replace

Cheaper than new standards and each one traces to a specific registry row.

| Standard | Change | Evidence from the registry |
|---|---|---|
| **S011 / S019** | Require the emergency procedure to be **practised**, not just written | "Emergency drills remain unaddressed" — the space's own noted gap. No standard anywhere requires a drill |
| **S016** | Require the reporter to be told the outcome | "The reporter is never told what happened." Silence is why reporting rates fall |
| **S023** | Add **expiry and periodic re-verification**, not only prompt suspension | Facilitator six-month renewal runs twice a year and cannot be automated because the profile has no term-date field. Suspension is covered; lapse is not |
| **S023** | Add fail-safe / degraded-mode behaviour | Or leave it to P1-F3 if the module is adopted |
| **S037** | Split continuity from protection, or explicitly scope it to continuity | Otherwise P2 looks redundant when it is not |
| **S046 + staff flag** | Broaden the flag from *"Paid employees?"* to *"Paid personnel, including contractors?"* and extend classification to contractors | **A space that pays only contractors activates no staff standards at all.** MakeHaven pays contractors for cleaning, data entry, scheduling, outreach and instruction. Worker misclassification is the most common legal exposure in the sector and is currently unassessed for exactly the spaces most likely to have it |
| **S055** | Add a periodic **physical** accessibility audit with a findings-to-closure loop | "The audit happens, but there is no defined review-and-improvement loop after it" |
| **S003 / S010** | Require director orientation | Board onboarding is a real process at MakeHaven and matches no standard |
| **S041** | Name reconciliation of **entitlements against payments**, not only cash controls | 24 active storage assignments, ~$565/month uncollected, because nothing feeds subscription state back. Generic segregation-of-duties language does not reach this |
| **S043 / S061** | Give core the subsidy-and-mission-alignment review that S074 and S083 already require of modules | The main programme lines get less scrutiny than the incubator |

---

## C. What the registry says should **not** become standards

Roughly a third of the inventory is `— exec` in the crosswalk: conversion
funnels, retention interventions, advertising, feature planning, the deploy
pipeline. Fitness to operate, not competitiveness.

Naming this explicitly matters for adoption. The registry is 186 rows and grew
out of one space's specific stack; if the standards try to absorb that shape,
every space in the network is asked to build a registry to comply, which will
not happen. The standards stay at 84-plus-a-few and gain optional depth; the
registry stays private, local, and one space's business.

---

## D. Calibration question the crosswalk raises

Of the 18 tier-3 standards that gate **Exemplary**, about half have no matching
process at MakeHaven, and most of the rest are partial. The recurring form is
*"three annual reviews of X"* — and no space has a process for conducting an
annual review of anything. The reviews that do happen are calendar events with
no findings-to-closure loop.

Add the retention finding — no records-retention rule of any kind exists, which
blocks the three-years-of-evidence test outright — and Exemplary is currently
unreachable for the most systems-mature space in the network, for reasons that
have nothing to do with the substance of any individual standard.

Two ways to read that, and it is worth deciding which on purpose:

1. **Exemplary is meant to be rare** and this is the framework working. Fine —
   but then say so in the tool, so a space at Operational does not read the gap
   as failure.
2. **Tier 3 is over-weighted toward annual-review ritual.** If so, the fix is not
   to lower the bar but to change its shape: fewer "three annual reviews of X"
   standards, more "X changed as a result of evidence" standards — which is what
   S061 already does, and it is the best-designed tier-3 standard in the set.

---

## Suggested order

1. **S046 flag widening** — one-line change, closes a hole that silently exempts
   contractor-only spaces from an entire domain.
2. **P1 (unstaffed operation)** — largest safety exposure, most spaces affected.
3. **P7 (occupancy and AHJ)** and **P2a (data protection)** — both tier-1/2
   critical, both currently absent, both routine to evidence.
4. **Section B strengthenings** — cheap, each traceable to a real finding.
5. **P3 (instruction)** as a module — largest volume, needs the most drafting.
6. **P4, P5, P6, P8, P9** — real but less urgent; P9 is the one that makes the
   rest sustainable.
