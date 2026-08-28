# Makerspace Standards of Excellence

A self-assessment framework and benchmarking tool for makerspaces, and for networks
of makerspaces that want a shared way to talk about operational maturity.

It is modeled on the way other nonprofit sectors have done this — the Standards for
Excellence Institute and the Land Trust Alliance's accreditation program — adapted
to the realities of community workshops: shared hazardous equipment, member access
outside staffed hours, volunteer-run operations, and very uneven budgets.

**Status:** draft. The framework is being stress-tested against real operations and
is expected to change.

## What's here

| Path | What it is |
| --- | --- |
| `app/index.html` | The assessment tool. A single self-contained HTML file — open it in a browser, no server or build step. |
| `Makerspace_Standards_of_Excellence_Tool(1).xlsx` | The source framework workbook the app was built from. |

## The framework

**84 standards** across six core domains — Governance, Safety & Risk, User Access,
Facility & Assets, Finance & People, Community & Impact — plus conditional
extensions for Tool Lending, Youth, Incubation, Circular Repair, and Workspace
Rentals.

Standards apply conditionally. A space answers a short profile questionnaire
(formal membership? paid staff? serves minors? lends tools?) and only the relevant
standards are activated, so a volunteer-run space is not graded against employment
practices it does not have.

Each standard is scored **0–3**:

| | |
| --- | --- |
| **0** | Absent |
| **1** | Foundational — basic practice exists, may be informal or inconsistent |
| **2** | Operational — written, assigned, consistently implemented, evidenced |
| **3** | Sustained and review-ready |

Every standard carries four behaviorally anchored examples, one per score, so the
numbers mean the same thing across different spaces and different assessors.

### Recognition levels

| Level | Average | Evidence | Critical standards | Records |
| --- | --- | --- | --- | --- |
| Foundational | ≥ 1.0 | — | critical tier-1 ≥ 1 | — |
| Operational | ≥ 2.0 | ≥ 80% | critical tier 1–2 ≥ 2 | — |
| Exemplary | ≥ 2.7 | ≥ 95% | all critical = 3 | 3 years retained |

Unscored applicable standards count as 0.

## The app

Seven tabs: Start Here, Profile, Assessment, Annual Data, Dashboard, Action Plan,
and Network Benchmark.

Everything is stored in the browser's `localStorage`. There is no backend and
nothing is transmitted anywhere.

**Annual Data** implements the Connecticut Makerspace Network's data-collection
standards — staffing, finances, revenue mix, square footage, member volume and
churn, engagement, and a capability referral checklist — reported on the calendar
year and due January 31.

### Privacy model

A space's own assessment is nobody else's business, and a benchmarking tool that
leaks per-standard scores to funders is a tool that quietly teaches everyone to
inflate their scores. So there are two separate exports:

- **Full assessment JSON** — private. All scores, all evidence, all actions.
  For the space's own board and staff.
- **Network share file** — profile, operating metrics, capabilities, and a
  *summary* readiness picture (level, domain averages, health check). No
  per-standard data, no evidence, never notes.

A network coordinator imports share files into the **Network Benchmark** tab,
which reports readiness only in aggregate — level counts, medians, ranges — never
attributed to a named space. The CSV export from that tab is the shareable dataset.

Evidence items may individually be flagged "share as resource," which contributes
them to a shared resource library so spaces can borrow each other's policies and
templates. Notes are never shareable.

## Using it

Open `app/index.html` in a browser. Start on the Profile tab to activate the right
standards, then work through the Assessment tab.

## License

Not yet chosen.
