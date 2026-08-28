# Deployment

Firebase Hosting, project **`makerspace-net`**, under the `jrlogan@makehaven.org`
Google account — the same pattern as Entrepreneurship Nexus and the other
MakeHaven apps.

Two hosting sites in one project:

| Site | Serves | Build |
|---|---|---|
| `makerspace-net` | `makerspace.network`, `connecticut.makerspace.network` | `dist/` |
| `makerspace-standards` | `standards.makerspace.network` | `dist-standards/` |

One site serves both the apex and the region host because the app resolves its
region from the hostname (`src/data.ts` → `resolveRegion`). **Adding a state is a
data change plus one DNS record — never a new deploy target.**

The Standards tool gets its own host on purpose: the framework is not
Connecticut's and should not live under a region's URL. `/tools/standards/**` on
the main site 301s to it, so there is exactly one canonical home.

## Commands

```bash
npm run deploy             # check, build both, deploy both
npm run deploy:site        # main site only
npm run deploy:standards   # Standards tool only
```

`npm run deploy` runs `npm run check` first — data validation and typecheck —
so a malformed record cannot reach production.

Note `scripts/clean-public.mjs`: the dev server serves the Standards tool from
`public/tools/standards/` for convenience, and the production build strips that
copy so the deployed bundle does not ship a second, shadowed copy of it. (The
sibling Nexus repo has a known bug where two hosting targets point at the same
`dist` directory and which build lands where depends on shell env at deploy
time. The split builds and explicit targets here exist so that cannot happen.)

## DNS

Authoritative nameservers are **Hover** (`ns1.hover.com`, `ns2.hover.com`).

> **There is a wildcard `*.makerspace.network` → `216.40.34.41`** (Hover
> parking). Explicit records take precedence over it, so the records below work
> — but be aware the wildcard means a missing or misspelled record shows a
> parking page rather than failing outright, which makes a DNS mistake harder to
> notice. Consider removing it.

### Records to set

| Host | Type | Value | Action |
|---|---|---|---|
| `connecticut` | CNAME | `makerspace-net.web.app` | **replace** — currently `ghs.googlehosted.com` (the old Google Site) |
| `standards` | CNAME | `makerspace-standards.web.app` | add |
| `@` (apex) | A | `199.36.158.100` | **replace** — currently `216.40.34.41` |
| `@` (apex) | TXT | `hosting-site=makerspace-net` | add, alongside the existing records |

The two existing `google-site-verification=` TXT records at the apex are already
in place and **must be kept** — Firebase lists them because it reports the
desired final state of the record set, not because they need re-adding.

Certificates provision automatically once DNS resolves; allow up to 24 hours,
though it is usually minutes. Until `connecticut` is repointed, ACME validation
fails with a 404 because the old Google Site answers the challenge path.

### Checking progress

```bash
TOKEN=$(gcloud auth print-access-token)
curl -s "https://firebasehosting.googleapis.com/v1beta1/projects/makerspace-net/sites/makerspace-net/customDomains/connecticut.makerspace.network" \
  -H "Authorization: Bearer $TOKEN" -H "x-goog-user-project: makerspace-net" | jq '.state, .cert.state, .issues'
```

The `x-goog-user-project` header is required; without it the API returns 403
about a missing quota project.

## The old Google Site

`connecticut.makerspace.network` currently points at Google Sites. Repointing
the CNAME is what cuts over. **Do not delete the Google Site until the new host
has served for a while** — the DNS change is the reversible step, deleting the
content is not.

GCP project `makerspace-network-243918` ("Makerspace Network", created 2019) is
unrelated to hosting — it has only the Maps APIs enabled and presumably backs
the old site's embedded map. Left alone.

## Not yet set up

- **CI deploys.** A GitHub Actions workflow deploying on push to `main` needs a
  service-account key in repository secrets. Worth doing; deliberately not done
  from a terminal session.
- **Preview channels** (`firebase hosting:channel:deploy`) for reviewing a
  change before it is live.
