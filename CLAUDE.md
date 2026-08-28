# CLAUDE.md

Guidance for AI assistants working in this repository.

## Project overview

Makerspace Network is shared infrastructure for state and regional makerspace
networks — an open directory, tools that collect real operating data about
makerspaces, and eventually cross-space member reciprocity. Connecticut is the
first region; the platform is multi-region by design.

Read `PLAN.md` for what actually exists, and `docs/INTEROP.md` for the position
this project takes relative to the six existing makerspace directories and
standards. INTEROP is not background reading — it contains the decisions.

## The rules that matter

- **Never invent directory data.** Every claim in a `data/spaces/*.json` record
  must trace to a `sources[]` entry, and anything unconfirmed goes in
  `verification.gaps`. A record with honest gaps is publishable; a plausible
  guess is not. Stale and fabricated data is precisely what killed the maps
  surveyed in `docs/INTEROP.md`.
- **Vocabularies are versioned.** Adding a value to `data/schema/enums.json` is
  a minor bump; removing or renaming one is a major bump and breaks consumers.
- **Don't invent a seventh standard.** Where Open Know-Where, SpaceAPI, or the
  Nexus compact already define a field, map onto it and record the crosswalk in
  the enum's `okw` / `fablabs_io` / `nexus` keys.
- **`node scripts/validate.mjs` must pass** before any commit touching `data/`.
  It is dependency-free on purpose — the data layer stays checkable with nothing
  but node installed.
- **Space-published endpoints outrank stored data.** If a record has
  `endpoints.spaceapi`, that endpoint is authoritative for anything it carries.

## Relationship to Entrepreneurship Nexus

`~/development/Entrepreneurship-Nexus` is the sibling project — a coordination
layer for entrepreneurial ecosystems. The two share a compact (data standards,
idempotent partner API with `external_ref`, OIDC identity linking, consent) but
are deliberately separate applications: different tenancy (regions vs.
ecosystems), different nouns, and a different privacy centre of gravity
(org-level operating data here, person-level PII there).

When adding anything identity-, consent-, or federation-shaped, check how Nexus
already does it before designing something new — that logic is meant to converge
on one spec, not fork.

## Visual style

The canonical MakeHaven brand colour is red `#8b1919`, display headings in
Roboto Condensed, body in Montserrat. Note that this is a *network* property,
not a MakeHaven property — MakeHaven is the steward of one region, and the
design should not imply the network belongs to it.

## Licensing

Code MIT, data and content CC BY-SA 4.0. Keep new files on the right side of
that line and don't import third-party data without recording its licence in
the `SourceSystem` vocabulary.
