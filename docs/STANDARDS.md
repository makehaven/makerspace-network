# Standards of Excellence

A self-assessment framework for makerspaces, and for networks of makerspaces that
want a shared way to talk about operational maturity. It asks the question the
other makerspace standards do not: not what a space has, but whether it is well
run.

Modelled on how other nonprofit sectors have done this — the Standards for
Excellence Institute, the Land Trust Alliance's accreditation — and adapted to
community workshops: shared hazardous equipment, member access outside staffed
hours, volunteer-run operations, very uneven budgets.

**Status: draft.** Expected to change as it meets real operations; see
`docs/STANDARDS_GAPS.md` for the holes found so far.

## Where it lives

Moved here on 2026-10-08 from the standalone `makehaven/Makerspace-Standards`
repository and its single-file browser tool, so that a space has one home for
its listing, its annual data and its assessment.

| Path | What it is |
|---|---|
| `data/standards/framework.v1.json` | The framework: standards, scoring anchors, domains, modules, levels, health check |
| `data/standards/source-workbook.xlsx` | The workbook the framework was first written in |
| `src/standards/framework.ts` | The arithmetic: which standards apply, the level, the shareable summary |
| `src/network/pages/StandardsAssessment.tsx` | The assessment, under Your space |
| `test/standards.test.mjs` | Checks the arithmetic against the original tool on random assessments |
| `tools/standards/` | The original tool, kept as the reference the test runs against |

`scripts/extract-standards.mjs` produced v1 from the original tool. It is not
part of the build.

## The framework

84 standards across six core domains — Governance, Safety & Risk, User Access,
Facility & Assets, Finance & People, Community & Impact — and optional modules
for Member Access, Public Access, Paid Staff, Volunteer Operations, Tool Lending,
Youth, Incubation, Circular Repair and Workspace Rentals.

A space says how it operates and only the standards that fit are activated, so a
volunteer-run space is not graded against employment practice it does not have.
The answers are pre-filled from the space's listing and annual data.

Each standard scores 0–3, and each score has its own anchor describing what it
looks like in practice, so the numbers mean the same thing across spaces and
assessors.

| Level | Average | Evidence | Critical standards | Records |
|---|---|---|---|---|
| Foundational | ≥ 1.0 | — | critical tier 1 ≥ 1 | — |
| Operational | ≥ 2.0 | ≥ 80% | critical tier 1–2 ≥ 2 | — |
| Exemplary | ≥ 2.7 | ≥ 95% | all critical = 3 | 3 years retained |

Unscored applicable standards count as 0. Below Foundational is Emerging.

## Privacy

Enforced in `firestore.rules`, not only in the page:

- **The assessment** (`assessments/{space}`) — every score, evidence and plan —
  is readable and writable by the space's own admins and editors. Not the
  regional steward, not the network admin.
- **The summary** (`assessment_summaries/{space}`) — level, domain averages,
  health check — exists only if the space presses *Share*, and is gone when it
  presses *Withdraw*. The steward reads it. The network publishes only counts,
  medians and ranges across spaces, never a named space's level.

A benchmark that leaks per-standard scores teaches everyone to inflate them.

## Changing the framework

A framework version is immutable once assessments exist against it. To reword a
standard, add or remove one, or move a threshold, write `framework.v2.json` and
leave v1 in place; assessments record the version they were made against.
`node scripts/validate.mjs` checks every framework file, and
`npm run test:standards` must still pass for v1.

## Not carried over yet

From the original tool: evidence file uploads (evidence is now links and notes),
the "share as resource" library of policies and templates, CSV export of the
action plan, and the Network Benchmark view. The benchmark becomes a steward
view over shared summaries once enough spaces have shared.
