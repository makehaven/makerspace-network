# Events

**Status: built and tested in the emulator 2026-11-05. Not deployed.** Maker
Bonanza (Friday, January 22, 2027) is the first event. The draft is in
`data/events/maker-bonanza-2027.json`, and its `gaps` list is what still needs a
person's decision.

## Why events belong in the network

The roster connects the people who *run* spaces. Bonanza's audience is the people
who *use* them, plus makers who have no space at all. An event is the first honest
reason for those people to tell the network who they are, so registration is built
to do four things for the network beyond selling a ticket:

1. **Records get claimed.** Someone who says they run an unclaimed space and asks
   to hear from us is the phone call `PLAN.md` calls the highest-value work in
   phase 0. The Network tab lists them.
2. **Spaces get a reason to sign in.** Each space has a referral link. Its staff
   see their counts on Your space, so claiming a listing has an immediate payoff.
3. **Spaces get members.** "Introduce me to a makerspace near me" is the brief's
   second goal, made into a list of people who said yes.
4. **Makers get connected.** The attendee list, and an invitation to the network,
   are both opt-in. This is the brief's promise about peer networking.

Everything a person types is a claim, not a fact. Nothing here writes to
`data/spaces`, and nothing grants a role: an attendee naming a place not in the
directory creates a lead to verify, per the rule on never inventing directory data.

## What it does not do yet

- **The roster is still only for people at an organisation.** Everyone else is
  pointed to a maker profile; see `docs/GOVERNANCE.md` §Makers.
- **One person per checkout.** No buying five tickets on one card, since each
  attendee makes their own opt-ins. A space paying for a group needs a code.
- **Stewards only.** Co-hosts get the CSV rather than a login. Registrants are told
  their details are shared with Redwood Endeavors for this event, and that it may
  follow up about the event.
- **Sponsors are tracked here only as far as the event needs.** Outreach belongs in
  the MakeHaven sponsorship pipeline (`~/development/Sponsorship-Tool`), and CiviCRM
  stays the record of confirmed sponsors. There is no sync between them.
- **The rate limit is a speed bump.** It keys on a header that someone calling the
  Function's own URL could forge. Someone determined could hold seats with fake
  addresses for 31 minutes at a time. If that happens: close the tier, or turn on
  App Check.

## How it works

No account is needed to buy a ticket. Each registration has a private link, emailed
to the person and shown after checkout, for editing opt-ins, paying, cancelling,
refunding, transferring and seeing who else is coming.

**Refunds and transfers take no organiser time.** A person can refund their own paid
ticket until `refund_until` (the end of January 4, when the catering count is set),
through the Stripe API, which frees the seat. After that there are no refunds, but
they can hand the ticket to someone else, whose opt-ins start blank and who gets a
new link. Stripe does not return its fee on a refund, so each costs about $1.75 of a
$50 ticket. A refund in the Stripe dashboard still works and updates the row.

| Status | Meaning | Holds a seat |
|---|---|---|
| `pending_payment` | At Stripe Checkout | Until `hold_expires_at`, 31 minutes |
| `confirmed` | Paid, or free with a code | Yes |
| `waitlisted` | Event was full; not charged | No |
| `offered` | A steward offered a place | Yes, until they pay or cancel |
| `expired`, `cancelled`, `refunded` | | No |

Event statuses: `draft` (stewards only), `announced` (public by address, with
sponsorship and "tell me when tickets open"), `open` (tickets; the rules refuse this
without terms), `closed`, `cancelled`.

### Trust

- **The browser never states a price, a status or a payment.** Rows are created only
  by Functions, which read the price from the event. Rules let a steward check
  someone in or offer a place, and nothing about money.
- **Only a signature-verified webhook confirms a payment.** A redelivery is a no-op.
  Underpayment, wrong currency and a second payment are flagged on the Overview tab,
  not credited. Money that arrives after a hold lapsed is honoured and flagged,
  never dropped. A failure returns 500 so Stripe retries.
- **Seats are counted from the rows** inside a transaction serialised by a lock
  document, so there is no counter to drift and two buyers cannot take one seat.

Trail Team was the starting point for this design. Its pure decision functions,
signature check and manage-link idea are carried over. These were deliberately not:
client-set `amountDue`, capacity checked only in the browser, and a rate limit ahead
of the webhook's signature check, which can lose payments.

### Consent

Six separate opt-ins, all off by default, changeable from the private link:
attendee list, email on that list, sharing with the home space, introduction to
nearby spaces, invitation to the network, future events. Registering implies only
logistics about this event. Sponsors never receive attendee contact details.

Nexus's `ConsentPolicy` is about one *organisation* viewing another, so it does not
fit a person's opt-ins, but the record is kept the same way: every change appends a
row to `audit` saying what changed and who decided. Worth converging if the shared
compact ever specifies person-level consent. Stewards can see everything for
logistics; the Network tab names people for follow-up only if they opted in.

### Privacy

Attendee data is in Firestore only, never in this repository, which is CC BY-SA.
The same goes for the budget and sponsor prospects. `data/events/` holds only what
the public page will say.

## Why the numbers make sponsors the point

From the brief's figures (coffee $9, lunch $26, supplies $6.50 a head, four
facilitators at $1,000) and Stripe's standard 2.9% + 30¢: a $50 ticket adds **$6.75**
after food and fees, and a $25 scholarship ticket loses about $17.50. Going from 100
people to 200 adds under $700. Selling out will not cover the fixed costs; sponsors
have to. The Overview tab keeps this live once the budget is typed in.

## Connecting Stripe

The money goes straight into MakeHaven's account, as MakeHaven is the fiduciary.
Everything is in test mode until the live key goes in.

1. **Restricted key** (Developers → API keys → Create restricted key), starting with
   write on *Checkout Sessions* and *Refunds*. This has not been tried against real Stripe: if the
   test purchase is refused, Stripe's error names the permission to add. Do not use
   the account's secret key: this project should hold no more power over MakeHaven's
   account than it needs.
2. **Webhook endpoint**: `https://makerspace.network/api/events/stripe-webhook`,
   events `checkout.session.completed`, `checkout.session.expired`, `charge.refunded`.
3. **Secrets**:
   ```sh
   firebase functions:secrets:set STRIPE_KEY_MAKEHAVEN
   firebase functions:secrets:set STRIPE_WEBHOOK_SECRET_MAKEHAVEN
   ```

MakeHaven's Stripe account also serves the material store and lending library. Our
webhook ignores any payment without `mn_kind` metadata. As read from their code on
2026-11-05, their handlers ignore payments they do not recognise too. Payments show
in Stripe with `mn_event` metadata and the `MAKER BONANZA` statement suffix, for
Xero reconciliation.

**Later, when a second region sells tickets:** a restricted key per host does not
scale. Move to Stripe Connect Standard as Trail Team does, so each host connects its
own account and the network holds no keys at all. `payment_host` on the event is
where that hangs. It is not worth building for one account.

## Turning it on

1. Blaze plan on `makerspace-net`, and Postmark as in `docs/GROUPS.md`. The event
   mailers need `POSTMARK_SERVER_TOKEN` and `POSTMARK_FROM_EMAIL` to deploy.
2. Stripe, as above, with test keys first.
3. Deploy the event and maker Functions by name, which avoids needing the group mail
   secrets yet, using `--account jrlogan@makehaven.org`:
   ```sh
   firebase deploy --only functions:eventRegister,functions:eventManage,functions:eventInterest,functions:eventSponsor,functions:eventStripeWebhook,functions:eventRegistrationChanged,functions:eventSponsorChanged,functions:eventChanged,functions:makerCreated,functions:makerDeleted,functions:makerWorkChanged
   ```
   Photo uploads also need Storage switched on once: Firebase console → Storage →
   Get started. Then `firebase deploy --only storage`.
4. As a network admin or the CT steward: Steward tools → Maker Bonanza → **Create
   the draft**. Settle the gaps, fill in the terms, type in the budget.
5. **Test purchase**: card `4242 4242 4242 4242`, then a refund. Check the row flips
   each time and the email arrives. Then swap in the live key and live webhook secret.
6. Set status to `announced` to share the page with spaces and sponsors. It is public
   by address only until you add this to `data/regions/us-ct.json` and deploy:
   ```json
   "featured_event": { "id": "maker-bonanza-2027", "title": "Maker Bonanza", "date_label": "January 22, 2027", "blurb": "A day for Connecticut's makers." }
   ```
7. Set status to `open` on December 1.

Sponsor logos: put the file in `public/sponsors/`, deploy, and enter its path on the
Sponsors tab. The site's CSP allows images from its own origin only.

The short address `/bonanza` is an alias in `src/App.tsx`; any event also answers at
`/events/<id>`. `?ref=<space-id>` credits a space, `?code=X#register` fills in a code.

## Tests

```sh
npm run test:events        # money and capacity decisions, no emulator
npm run test:events:rules  # who can read and write what
npm run test:events:e2e    # real Functions, Firestore emulator, a stand-in for Stripe
```

None of these reach real Stripe. The first live check is step 5 above.
