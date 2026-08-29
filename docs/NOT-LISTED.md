# Things deliberately not in the directory

A directory is defined as much by what it declines to list. Without writing the
declines down, the same candidate gets re-proposed every time someone imports a
new source, and eventually somebody says yes to it.

So: anything considered and rejected goes here, with the reason and the evidence.
This is not a judgement on the organisations — several are excellent at what they
actually do.

## The test

A record belongs in `data/spaces/` if **people can go there and make things with
tools they do not own**. Shared access to equipment is the whole point.

That excludes places that sell what makers made, teach about making without a
shop, or convene makers without premises.

## Rejected

| | Why | Checked |
|---|---|---|
| **The Bristol Bazaar** — Bristol and Milford | A retail marketplace, not a workshop. Vendors rent shelf space from $20/month and bring in finished stock; the venue supplies "shelves, tables, carts, wall accessories" and a central register, and vendors are "not required to be present in order to sell". Nothing is made on site. | [thebristolbazaar.com/makers](https://www.thebristolbazaar.com/makers), 2026-08-29 |

## Nearly, but not here

Out-of-region spaces that CT directories list because they are a reasonable drive
away — Artisan's Asylum (Somerville MA), Technocopia (Worcester MA), New Vestures
(Lowell MA), Tech Valley Center of Gravity (Troy NY), Tinker (Bristol RI). They
are real makerspaces and belong in the network; they belong in *their own*
regions, listed by a steward who knows them. That is the federation working as
intended, not a gap. See `docs/INTEROP.md`.

## Closed, but kept

Spaces that shut are not deleted. They stay in `data/spaces/` with
`status: "closed"`, which drops them from the directory while preserving the
record — so the old name still resolves, and nobody re-imports them in a year
from a source that outlived the space.

Three of the twenty records here are closed, and **not one of the closures was
visible on the open web**:

| Space | What the web said | What was true |
|---|---|---|
| **CT Hackerspace**, Watertown | A current-looking site advertising a weekly open night, no closure notice | Shut |
| **MakeHartford**, Hartford | Listed as current by MakerspaceCT's own directory | Wound down when MakerspaceCT opened |
| **Mad Hatter Hackers**, Danbury | A separate pin on the old CT map, 4km from Danbury's | Became Danbury Makerspace |

All three were caught by the regional steward in a single conversation, and none
by research. The MakeHartford case is the sharpest: it was added to this
directory *because* a peer directory listed it, and that peer is the space that
displaced it.

This is the argument for the whole project in three rows. A directory does not go
stale because its software is bad. It goes stale because nobody whose job it is
to know has a reason to come back — which is why `docs/INTEROP.md` puts a named
regional steward at the centre of the design, and why `docs/GOVERNANCE.md` is
about getting the spaces themselves editing their own records.
