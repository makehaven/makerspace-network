# Makerspace Network — Roadmap

**Status as of 2026-08-28.** What actually exists and what comes next. Keep this
file accurate; it is the starting point for "what is real here."

## Thesis

Be the **regional steward layer** for makerspace data, and the only project that
measures whether a space is *well run* rather than merely what it owns.
Everything else — the directory, the map, the schema — is in service of those
two, and should interoperate with the existing standards rather than replace
them. See `docs/INTEROP.md` for the survey that produced this position.

Connecticut first, but multi-region in the data shape from day one:
`<region>.makerspace.network`, `region_ids` on every record.

## Current state

| Area | Status |
|---|---|
| Space schema + vocabularies (`data/schema/`) | **Built** — OKW profile, 42 capabilities, 14 space kinds, provenance model |
| CT directory records | **10 records, mixed verification** — 3 with addresses and contact, 7 descriptive only |
| Validator (`scripts/validate.mjs`) | **Built** — dependency-free, enum + gap checking, passes clean |
| Interop survey (`docs/INTEROP.md`) | **Built** |
| Website | **Not started** |
| Standards of Excellence tool | **Built, lives in `makehaven/Makerspace-Standards`** — hosting and repo location undecided |
| fablabs.io importer | **Run once by hand**, not scripted |
| SpaceAPI consume / publish | **Not started** |
| OKW export | **Not started** |
| Accounts, reciprocity, Maker Passport | **Not started** — phase 3 |

## Phases

### Phase 0 — Replace the Google Site *(in progress)*

The current site is a Google Site with eight spaces grouped by county and no
structured data behind it. County alone is a weak filter; the fields people
actually choose on — what can I make here, can I get in at 2am, what does it
cost, can my kid come — were never captured.

- [x] Repository, licences, schema, vocabularies, validator
- [x] Ten CT space records with explicit provenance and gaps
- [ ] **Verify the seven incomplete records** — street address, coordinates,
      website, access model, membership cost. This is the highest-value
      remaining work in phase 0 and it is phone calls, not code.
- [ ] Static site: directory with capability / access / cost / youth filters,
      map, and per-space pages. Vite + React + TS, matching the Nexus stack so
      code and patterns move between them.
- [ ] Publish `makerspace.network` and point `connecticut.makerspace.network`
      at the CT region
- [ ] Script the fablabs.io import; add a Nation of Makers import

### Phase 1 — Host the Standards tool

The assessment tool is a single self-contained HTML file with `localStorage` and
no backend, so hosting it costs nothing.

- [ ] Decide where the code lives (see Open decisions)
- [ ] Serve it at `makerspace.network/tools/standards`
- [ ] Link participating spaces from their directory records via `standards.level`,
      published only with explicit consent

### Phase 2 — Annual data and the network benchmark

- [ ] Align the Annual Data questions with `makethedata.org`'s national Survey
      of Makerspaces **before** collecting a second incompatible CT dataset
- [ ] Aggregate share files into a published per-region benchmark — level
      counts, medians, ranges, never attributed to a named space
- [ ] Publish an Open Know-Where conformant export so CT data reaches the
      global map

### Phase 3 — Accounts and reciprocity

The point where a member in good standing at one space can be recognised at
another. This is the piece that needs real infrastructure, and it is
deliberately last.

- [ ] Extract the shared compact (data standards, partner API contract, OIDC
      identity linking, consent) from Entrepreneurship Nexus so both systems
      consume one spec
- [ ] Align with the IoPA Maker Passport / People and Skills Specification, and
      offer CT as its first real implementation
- [ ] Use SpaceAPI's existing `linked_spaces` and `spacefed` rather than
      inventing a parallel primitive

### Later — second region

Nothing here should require a code change to add a state. The test: a Rhode
Island steward can add `data/regions/us-ri.json`, a folder of spaces, and get a
working site.

## Open decisions

1. **Where the Standards tool lives.** `makehaven/Makerspace-Standards` exists
   and is public. Options: leave it standalone and embed the built file here;
   bring it in as a git subtree and archive the standalone repo; or add it as a
   submodule. Leaning toward subtree — its Network Benchmark half is inherently
   a network function — but this restructures an existing public repo, so it
   needs a deliberate call.
2. **Data licence.** Currently CC BY-SA 4.0, chosen for Open Know-Where
   compatibility. ODbL is the other defensible choice for a directory dataset.
3. **Whether to carry live open/closed state.** Real value, real operational
   burden. Probably: surface it only for spaces that already publish a SpaceAPI
   endpoint, never ask a space to maintain one for us.
4. **Governance for multi-state.** Nation of Makers already runs a Regional
   Champion model. Do we mirror it, or formally partner with them?

## Outreach owed

- Maps of Making — schema, licence, and whether federating beats listing
- `makethedata.org` — can the CT Annual Data instrument serve as their CT
  collection instrument?
- Internet of Production Alliance — is Standards of Excellence welcome as a
  candidate companion spec to OKW, and can CT pilot the Maker Passport?
- SpaceAPI — PR the CT spaces into the directory (there are currently none)
