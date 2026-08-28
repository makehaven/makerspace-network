# Makerspace Network

Shared infrastructure for state and regional makerspace networks: an open
directory of spaces, tools that build up real data about how makerspaces
operate, and — eventually — a way for a member in good standing at one space to
be recognised at another.

Connecticut is the first region, at
[connecticut.makerspace.network](https://connecticut.makerspace.network).
The platform is built so a second state, or a group of states, can stand one up
without asking anyone's permission.

## Why this exists

There is no shortage of makerspace maps. There are at least six —
[fablabs.io](https://www.fablabs.io), [SpaceAPI](https://spaceapi.io),
[Nation of Makers](https://www.nationofmakers.us) (now faded out),
[The Maker Map](https://themakermap.com),
[Open Know-Where](https://map.internetofproduction.org),
[Maps of Making](https://mapsofmaking.org) — and most of them are going stale,
because a global crowdsourced map has no one whose job it is to keep any
particular corner of it current.

So this is not another map. It is three things the maps don't do:

1. **A regional steward layer.** Each region has a named organisation
   responsible for its records being true. That is a social answer to the
   staleness problem, not a technical one, and it is borrowed directly from
   Nation of Makers' Regional Champion model.
2. **Operational quality, not just inventory.** Existing standards say what a
   space *has* and whether it is *open right now*. None says whether it is
   **well run** — hazard assessment, tool authorisation, a working after-hours
   emergency path, a board that meets. That is
   [Makerspace Standards of Excellence](https://github.com/makehaven/Makerspace-Standards),
   and it is the genuinely new contribution here.
3. **Reciprocity the member carries.** A credential earned at one space should
   work at another. Built on [Open Badges 3.0](https://www.imsglobal.org/spec/ob/v3p0)
   verifiable credentials, so the member holds the claim and no space has to
   integrate with any other — see [`docs/RECIPROCITY.md`](docs/RECIPROCITY.md).
4. **Interoperation rather than competition.** We adopt Open Know-Where's
   vocabulary and provenance model, consume and publish SpaceAPI, and import
   from fablabs.io. See [`docs/INTEROP.md`](docs/INTEROP.md) — it is the most
   useful document in this repository.

## Repository layout

| Path | What it is |
| --- | --- |
| `data/schema/` | The space record schema and controlled vocabularies. A profile of Open Know-Where. |
| `data/regions/` | One record per region. `us-ct.json` is Connecticut. |
| `data/spaces/` | One JSON record per space. The directory *is* this directory. |
| `docs/INTEROP.md` | Survey of every existing makerspace directory and standard, and what we do about each. |
| `docs/RECIPROCITY.md` | How a member's credential travels between spaces — Open Badges 3.0, carried by the member, no space-to-space integration. |
| `scripts/validate.mjs` | Dependency-free validation of every record against the vocabularies. |

## The data

Ten Connecticut spaces so far. Every record carries `sources[]` saying where
each claim came from and `verification` saying who checked it and **what is
still missing** — an incomplete record with honest gaps is publishable; one
that quietly omits them is not.

```bash
node scripts/validate.mjs
```

Two of the ten (Hand Made in Madison, SHU Makerspace in Fairfield) are not on
the current Google Site; they surfaced from fablabs.io during the initial
import.

## Contributing a space

Open a pull request adding or correcting a file in `data/spaces/`. If you run
the space, say so — records confirmed by their own space carry
`verification.status: "space_confirmed"` and outrank anything we inferred.

If your space publishes a [SpaceAPI](https://spaceapi.io) endpoint, put it in
`endpoints.spaceapi` and set `verification.status: "self_managed"`. Your
endpoint then wins over anything stored here, which is how it should be.

## Licensing

Code is [MIT](LICENSE). Data, schema, and written content are
[CC BY-SA 4.0](LICENSE-DATA.md) — permissive enough to fork the whole directory
and run your own, share-alike enough that improvements stay open, and
compatible with Open Know-Where so data can flow both ways.

## Related projects

- **[Makerspace Standards of Excellence](https://github.com/makehaven/Makerspace-Standards)** —
  84-standard self-assessment framework and the browser tool that runs it.
- **[Entrepreneurship Nexus](https://github.com/makehaven/entrepreneur_nexus_bridge)** —
  MakeHaven's coordination layer for entrepreneurial ecosystems. Shares the
  identity, consent, and partner-API compact this project will use for
  cross-space member reciprocity. Two implementations, one compact.
