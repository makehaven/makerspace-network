# The achievement framework

**Draft, 2026-08-28.** How a badge earned at one space comes to mean something at
another. Companion to `docs/RECIPROCITY.md`, which covers the credential
mechanics; this covers the harder half — the meaning.

## 1. The problem, in one example

MakeHaven issues a **SawStop badge**, not a table saw badge. That is not sloppy.
The shop manager filmed the training on the machine that is actually in the
room, and a video that says "your saw may have a riving knife somewhere around
here" is a worse video. Tool-specific training is *better* training.

But it makes the credential non-portable, and the obvious fixes are both wrong:

- **"SawStop is a subtype of table saw, so it implies the table saw badge."**
  Mostly true and quietly dangerous. Someone trained only on a braked saw may
  have formed habits around a safety net the next shop does not have.
- **"SawStop is its own thing, so you need a separate table saw badge."**
  Wrong in the other direction, and unworkable — it means a badge per brand per
  shop, which is no network at all.

## 2. A badge is two things wearing one name

The resolution is that "SawStop badge" bundles two kinds of knowledge that have
completely different portability:

| | Transfers | Example |
|---|---|---|
| **Competence** | Yes, fully | What kickback is. Why the fence and miter gauge are never used together. Not reaching over a coasting blade. |
| **Site knowledge** | Never | Where this saw's disconnect is. Whether dust collection is required here. Who may change a blade. |

Only the first belongs in a credential. So:

> **The network publishes achievements. A space keeps its own badges. A badge
> aligns to an achievement; it does not become one.**

A network `Achievement` (`data/achievements/`) is a versioned, transferable
competence definition with a testable checklist. A local badge is the space's
own assessment, which *claims alignment* to one or more achievements and also
carries site knowledge that stays home.

The consequence worth stating plainly: **a credential is not a key.** It
substitutes for the competence assessment, never for the local orientation. The
receiving space still walks the person to the machine and shows them the e-stop
— which is what every shop manager was going to do anyway, and is why this model
is acceptable to them.

## 3. Granularity: the hazard boundary

How generic is "table saw"? Not per brand (`sawstop-pcs-3hp` — no transfer), not
per shop, and not "woodshop" (too coarse to mean anything).

> **One achievement per hazard profile.** If two machines can hurt you in the
> same ways, they share an achievement.

A table saw's hazards — kickback, blade contact, binding — are identical across
brands, which is exactly why the competence transfers and the brand does not.
This is recorded as `hazard_class` on every definition, and it is the field to
argue about when someone proposes a new achievement.

Operations beyond the core set get **extension achievements** (`table-saw-dado`,
`table-saw-maintenance`) rather than levels. Levels invite grade inflation —
everyone is a 2 — and the Standards framework already avoids that mistake
elsewhere. Extensions are also how a space that authorises only basic ripping
stays honest without a separate vocabulary.

## 4. The asymmetry, which is the whole point of doing this carefully

Handling SawStop as "a table saw badge, tailored" is right, with one exception
that runs the *opposite* way from what you would expect.

Training on a SawStop **adds** knowledge: the brake cartridge, bypass mode, that
wet or conductive stock will fire it, what an activation costs. Those are the
`brand_deltas` in the definition, and a table-saw-competent person arriving at
MakeHaven needs them — as a five-minute addendum, not another badge.

But training on a SawStop can also **subtract**. A video shot on a braked saw has
little reason to discuss operating without one, and a holder may carry habits
formed with a backstop into a shop that has none. That is a gap in the generic
competence, created by the specificity that made the training good.

So the definition carries **TS12** as a critical competency:

> *Operates safely on a saw with NO blade-brake technology, and states that brake
> technology reduces the severity of blade contact but prevents neither kickback
> nor the contact itself.*

TS12 exists precisely so a SawStop-based assessment can satisfy the generic
achievement — and so that the conversation with the shop manager is not "your
badge is too specific" but "add ninety seconds to the video." That is a request
someone will actually say yes to.

This generalises. Every brand delta gets an `asymmetry` field: not just what this
machine adds, but where training on it may leave a hole against the generic
competence.

## 5. The alignment conversation

`data/alignments/<space>.json` is the working document, and the process is
deliberately the same one that produced `STANDARDS_GAPS.md`: map the real thing
against the framework and read off the residue.

1. Take the achievement's competency checklist to the shop manager.
2. For each item, ask **where** it is covered — video timestamp, quiz question,
   checkout step — and **how** it is assessed.
3. Mark `yes` / `partial` / `no`. Anything unasked stays `unknown`.
4. The `no` and `partial` rows become `actions`: a short concrete list.
5. `status: "aligned"` requires every **critical** competency covered, at or
   above its `min_assessment`, confirmed by the space.

Two rules keep this honest:

- **The space never renames anything.** MakeHaven's badge stays "SawStop Table
  Saw". Mapping is our job. This is the same discipline as the capability
  vocabulary and the Nexus data standard: *keep your own vocabulary internally,
  map once, send only what you can map.*
- **Do not fill in coverage on the space's behalf.** `data/alignments/makehaven.json`
  currently reads `unknown` for all fourteen items because nobody has watched the
  video against the checklist. Guessing here is worse than guessing a street
  address.

## 6. Coverage and rigour are different questions

MakeHaven's Open Badges plan adds `field_badge_claim_scope` —
`training_only` / `training_and_checkout` / `class_completion` / `stewardship` —
so a badge says how thoroughly it assessed. That is the missing half of this
framework, and the two are orthogonal:

|  | **What** was assessed | **How well** it was assessed |
|---|---|---|
| Answered by | network achievement alignment | claim scope |
| Lives in | `data/achievements/` | the issuing space |

A complete claim needs both: *"completed MakeHaven's training materials and quiz
and demonstrated safe operation to a facilitator in person, against
`table-saw-operator/v1`."* Either half alone is uninterpretable.

MakeHaven's wording discipline applies to us too, and it is the right instinct:
the credential says **"completed our training"**, never **"is competent to
operate unsupervised."** An achievement definition describes what was assessed.
It confers no authority at any space, and `excludes` says so explicitly.

## 7. How this rides on Open Badges

`alignment` is present in **Open Badges 2.0** as well as 3.0 —
`AlignmentObject` with `targetName`, `targetUrl`, `targetFramework`,
`targetCode` on the BadgeClass. So a MakeHaven BadgeClass can point at
`https://makerspace.network/achievements/table-saw-operator/v1` today, in the 2.0
implementation already planned, with no dependency on the 3.0 migration.

That is the useful conclusion: **the achievement framework is spec-version
agnostic, and it is the part that is actually scarce.** 1EdTech settled the
envelope. Nobody has written the makerspace competency vocabulary.

Incidental but relevant: MakeHaven has 145 badge terms and **32 with a
description**. Alignment cannot proceed without knowing what a badge covers, so
this framework supplies both the reason and the template for writing the other
113 — and the checklist means the shop manager is answering questions rather than
facing a blank field.

## 8. Open questions

1. **Who governs the namespace.** The namespace itself is settled
   (`makerspace.network/achievements/`). What is not settled is who may publish
   a definition, who may deprecate one, and what happens to credentials already
   issued against a superseded version. This needs an answer before the first
   credential is signed, not after.
2. **How many achievements for v1.** Suggest five, chosen by what actually comes
   up when a member visits another space: table saw, CO2 laser, 3D printing
   (FDM), MIG welding, general shop orientation.
3. **Whether `min_assessment` is enforceable.** A space can claim
   `observed_demonstration` for something it assesses with a quiz. The Standards
   trust layer is the backstop, but it is indirect.
4. **Expiry.** Competence decays with disuse. Does an achievement carry a
   recommended currency period, or is that each space's call?
