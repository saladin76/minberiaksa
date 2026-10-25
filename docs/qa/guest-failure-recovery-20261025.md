# Guest failure recovery — 25 October 2026

## Evidence and limits

The donor supplied a screenshot reporting a black screen followed by back navigation.
It does not identify a timestamp, browser or which checkout stage failed.

After explicit user authorization, Google sign-in to Clarity completed and the
Minberi Aksa project and actual recording event lists were inspected.

- Export `07 38 AM`, row 12: Android/Facebook waqf visit. Page hidden at 00:23,
  postMessage error at 00:53. This recording contains no payment submission.
- Export `07 36 AM`, row 41: Android/Facebook. Two checkout submissions at
  05:59 and 11:41, followed by failure pages at 06:11 and 11:57. No postMessage
  error appeared in the inspected event list. At the first failure page the
  rendered UI reported no specific reason and could not find the donation.
- The same export, row 58: Instagram. Submission at 03:52 followed by failure
  at 04:00. The event sequence does not establish why the provider returned.

These are inspected timeline positions and selected rendered states, not a claim
that every second of each recording was watched. Clarity does not show the
external bank's authentication page here. The screenshot has not been matched
to a particular recording. The black-screen root cause is still unconfirmed.

No visitor identifiers, recording links, bank details, card values or real order
IDs are included in this repository document.

## Confirmed code defects and repair

1. Failure-page detail loading omitted the guest credential required by the
   existing donation GET authorization. A legitimate anonymous donor therefore
   lost their own details/reason/retry entry after a bank callback without `t`.
   The credential returned by creation is now retained in sessionStorage for
   the matching last attempt, at most 24 hours. A supplied link token takes
   precedence. No credential is minted or recovered from a donation ID.
2. Legacy popup status polls also omitted their already-known token. Their
   authenticated read requests now carry that same token; both legacy dialogs
   remember it before opening a bank window.
3. Primary checkout preserved its basket only for bank/PayPal handoffs, leaving
   Stripe recovery inconsistent. It now preserves online baskets after order
   creation. Recovery restores the original local basket before preparing any
   clone. A card flow with no saved basket returns to project selection rather
   than preparing an unusable legacy Stripe session.
4. The legacy retry API treated an anonymous donation ID as sufficient proof
   and could clone a donation without its credential. It now requires the
   original guest token. Existing owner/admin access and signed-in non-owner
   denial remain. Already-paid and subscription guards remain before creation.
5. Opening an old failure link for a settled donation now sends its authorized
   viewer to the receipt. It never offers another payment for that settled row.
6. Failed detail requests have a 15-second bound and are aborted on unmount.
   Axios error objects containing token-bearing URLs are not logged.

## Financial boundary

Gateway selection, amount computation, currencies, provider forms, MAC/hash
checks, 3DS approval, capture, callbacks, reconciliation, recurring charges and
financial state transitions are unchanged. No financial endpoints were invoked
against production during this work. Unit tests use synthetic orders and mocked
providers/database boundaries only. No real donation or retry clone was created.

The local basket remains display intent. Restoring it navigates to the existing
checkout; it neither charges a card nor declares success. The server still prices
and verifies every later order normally. No token is added to the donor-facing
callback URL merely from an unverified provider response.

## Validation

Regression results and current CI outcomes are recorded in the pull request.
Tests execute the actual order driver, failure-page effect/retry handler and
retry API with fake browser/network/database boundaries, plus token expiry,
storage denial and authorization cases. They are not a real Android in-app bank
authentication test or proof that the reported black screen is fixed.

Remaining diagnosis: correlate the donor's approximate timestamp/browser/stage
with the server's stored provider result and callback logs, without card or
donor PII. Read-only provider-code evidence is needed before changing gateway
logic.
