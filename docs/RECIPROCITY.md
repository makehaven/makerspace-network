# Reciprocity: how a credential travels between spaces

**Draft, 2026-08-28.** The architecture for the network's phase 3 — recognising
a member in good standing at one space when they walk into another.

This replaces the earlier assumption that reciprocity would ride on the
Entrepreneurship Nexus partner API. It won't, and the reason is worth stating
plainly.

## 1. The problem with the API approach

The obvious design is bilateral sync: every space exposes an API, the network
reconciles member standing, a space queries before granting access. It is how
the Nexus compact handles organisational records, and it works there.

It will not work here. There are ten Connecticut spaces. Most are volunteer-run.
Several have no software staff at all, and at least one is a high school library.
An architecture that requires each of them to stand up, secure, and *maintain* an
authenticated API is an architecture that ships for two spaces and stops.

It also has the wrong failure mode. Bilateral sync means the receiving space
must reach the issuing space at the moment of the decision. That is precisely
the exposure `STANDARDS_GAPS.md` flags in MakeHaven's own door system — *"every
badge tap depends on Drupal being reachable; we have repeatedly hit this failure
mode."* Rebuilding that dependency, across organisations that don't control each
other's uptime, would be a strange thing to do on purpose.

## 2. The member carries the credential

[Open Badges 3.0](https://www.imsglobal.org/spec/ob/v3p0) is a W3C Verifiable
Credential. The issuing space signs an `AchievementCredential`; the member holds
it; the receiving space verifies the signature against the issuer's published
public key and checks a status list for revocation.

```
MakeHaven ──signs──▶ AchievementCredential ──held by──▶ the member
                            │
                            ├── achievement: makerspace.network/achievements/laser-co2-operator/v1
                            ├── issuer: MakeHaven (did:web / hosted JWKS)
                            ├── issued: 2026-03-01, expires: 2028-03-01
                            └── credentialStatus: makehaven.org/badges/status/3#4021

MakerspaceCT verifies the signature and checks the status list.
It has never spoken to MakeHaven. It does not need to.
```

Three properties follow, and each is the answer to a real objection:

- **No bilateral integration.** Neither space has to know the other exists, or
  agree to anything in advance beyond the achievement framework in §3. A space
  with no developers verifies on a hosted verifier page.
- **Offline verification.** A cryptographic proof verifies without reaching the
  issuer. Only revocation checking needs the network, and a cached status list
  degrades gracefully. Contrast the hosted-assertion model in §4.
- **The member consents by presenting.** There is no shared directory of who is
  a member where, no consent flow to build, and no cross-organisational PII
  store to secure. The privacy model is "the person hands you the claim," which
  is both simpler and stronger than anything we would have designed.

This is the Nexus federated position carried one step further: not merely *the
edges own the data*, but *the person owns the claim*.

## 3. The part that is actually ours: shared meaning

**Now specified in full in `docs/ACHIEVEMENTS.md`, with a worked example at
`data/achievements/table-saw-operator.v1.json`.** Summary follows.

Open Badges is an envelope. A signed badge reading "Laser" from one space means
nothing at another unless both share a definition of what laser authorisation
entails — did the issuer test a cut, or watch a video?

Open Badges 3.0 has the hook: `Achievement.alignment`, pointing at an external
framework by stable URL. So the network publishes a **network achievement
framework** — versioned `Achievement` definitions at
`makerspace.network/achievements/<id>/v<n>` — and each space aligns its own local
badges to them.

The pattern is deliberately identical to the capability vocabulary in
`data/schema/enums.json`: **keep your own names, map once, send only what you can
map.** MakeHaven's "Laser Cutter" and another space's "Epilog Certification" both
align to `laser-co2-operator/v1`; neither has to rename anything.

Each definition needs, at minimum: what the holder can do unsupervised, what was
actually assessed (written, demonstrated, supervised hours), and what it
explicitly does *not* cover. Definitions are versioned and never mutated —
`v1` must keep meaning what it meant when credentials were signed against it.

This is the scarce work. 1EdTech settled the credential mechanics; nobody has
written the makerspace achievement vocabulary.

## 4. Spec version: 2.0 now, 3.0 as a second serializer

An earlier draft of this document argued for moving MakeHaven to Open Badges 3.0.
That was wrong on priorities, and `makehaven-website/docs/arch/OPEN_BADGES_2_0_IMPLEMENTATION_PLAN.md`
(2026-08-28) settles it better:

- **2.0 is what consumers actually read.** LinkedIn "Add to Profile", Credly,
  Badgr/Canvas Credentials and ATS parsers all expect 2.0. Nothing a member would
  plug a badge into consumes 3.0 yet. For the résumé use case — which is most of
  the value to members — 3.0 buys nothing.
- **2.0 needs no key management.** Hosted verification means the assertion lives
  at a URL and verifying is fetching it. No DIDs, no JWKS, no key rotation.
- **The plan builds 3.0 as a second serializer over the same data**, so the option
  is preserved at near-zero cost rather than paid for now.

The offline-verification argument in §2 was overstated for the case at hand. A
cross-space credential check is *attended and advisory* — a staff member looks it
up on a phone and exercises judgement — not automated, unattended, and blocking
entry the way MakeHaven's own door system is. Hosted verification is fine there,
and the `STANDARDS_GAPS.md` F3 analogy does not carry.

Two narrower places where 3.0 does eventually matter, neither urgent:

1. **Automated cross-space access.** If a credential ever drives a door rather
   than a staff decision, the reachability dependency returns and matters.
2. **Archival survivability.** Hosted assertions die with the server. If a space
   closes, every credential it issued stops verifying. A signed credential
   outlives its issuer. For a network of small nonprofits this is a real
   long-term argument, and a reason to keep the second serializer on the roadmap.

**What does not depend on any of this:** the achievement framework. `alignment`
exists in 2.0 as well as 3.0, so a BadgeClass can point at a network achievement
definition today. See `docs/ACHIEVEMENTS.md` §7. That framework is the scarce
work, and it is spec-version agnostic.

Everything else in MakeHaven's earlier plan carries over intact: the
`member_credential` ledger, `status` mapping onto revocation, `expires_at`, the
NMIS/WCA certification type, opt-in public transcript, per-credential visibility.
One addition still worth making early — the ledger should record **which
achievement definition and version** a credential was issued against, or the
alignment cannot be reconstructed later.

## 5. Trust: the layer only we have

Open Badges proves a credential is *authentic* — this issuer really signed this,
and hasn't revoked it. It says nothing about whether the issuer's process is any
good. A space that hands out laser authorisations for watching a video produces
credentials that verify perfectly and mean nothing.

The shop manager's actual question is not "is this forged." It is "does the
place that signed this check anything."

That question is what `tools/standards/` already measures. The Standards of
Excellence framework scores a space's tool-authorisation system directly
(S023 — which, notably, scored MakeHaven's own authorisation system honestly
when social trust had substituted for it for nearly two years).

So the network's trust registry is not a whitelist someone maintains by
judgement. It is derived:

> A space is a **recognised issuer** for a given achievement when it has
> completed a Standards assessment and reached at least *Operational* on the
> tool-authorisation and hazard-assessment standards.

This is the piece nobody else in the landscape has, and it is what makes
cross-space reciprocity safe rather than merely possible. It also gives spaces a
concrete reason to do the assessment, which is the adoption problem the
Standards tool otherwise has.

Governance caveat: this makes the Standards framework load-bearing for access
decisions, which raises the stakes on who controls it and how disputes are
handled. That needs settling before the first non-MakeHaven space is asked to
trust it — see `PLAN.md` open decisions.

## 6. What this means for Entrepreneurship Nexus

The earlier position — one shared compact, two implementations — still holds,
but the compact now has two halves with different mechanisms:

| | Mechanism | Used for |
|---|---|---|
| **Organisational** | Nexus partner API: idempotent upsert, `external_ref`, webhooks, OIDC | Org records, referrals, service participation. Between institutions that already run software. |
| **Personal** | Open Badges 3.0 verifiable credentials | Skills, authorisations, membership standing. Carried by the person. |

The dividing line is clean: **if it is a fact about an organisation, sync it;
if it is a claim about a person, let the person carry it.** The second is more
private, needs no integration, and survives either party going offline.

Nexus should adopt this too. A founder's completed accelerator programme is a
credential, not a row to be synced — and a founder who can present it without
the issuing ESO's database being reachable is better served.

## 7. Sequence

1. **Achievement framework v1** — a small set of definitions covering the
   cross-space cases that actually come up: CO2 laser, 3D printing, woodshop
   machines, welding, general shop orientation. Written with two or three CT
   spaces, not by us alone.
2. **MakeHaven issues.** It has the ledger, the badge taxonomy, the issuer
   model, and a plan already. It is the natural first issuer.
3. **A hosted verifier** at `makerspace.network/verify` — paste or scan a
   credential, see issuer, achievement definition, status, and the issuer's
   current Standards level. This is what a space with no developers uses.
4. **A second space accepts one**, manually, at the door. That is the milestone
   that matters; everything before it is preparation.
5. **Issuer registry** derived from Standards assessments, once more than two
   spaces are assessed.

Deliberately not in scope yet: wallets, DIDs beyond `did:web`, the Open Badges
API, and automated access-control integration. All are additive later, and none
is needed for step 4.
