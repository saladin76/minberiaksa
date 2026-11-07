# TRY PayFor result redirect recovery — 29 October 2026

The owner supplied a successful-payment return URL whose origin was
`https://localhost:3000`. PayFor's initiation honored APP_URL, but its OK and
failure callbacks independently reconstructed the origin from the internal
Next request. Behind the VPS proxy, that sends the donor to their own loopback.
The submitted transaction's public success page was inspected read-only and
showed a confirmed TRY 1 donation. No payment was retried.

Initiation and both callbacks now use one public-origin resolver. It prefers a
valid configured APP_URL, then NEXT_PUBLIC_SITE_URL, with the canonical HTTPS
Minberi domain as the production fallback. Production never inherits the
request/forwarded host or accepts a configured loopback or HTTP origin.
Explicit development/test environments retain local origins. Locale values
must belong to the public locale registry so they cannot replace the URL host.
Callback redirects use 303, converting the bank POST into a GET result page.

Payment amounts, currencies, bank signatures, settlement decisions, guest-token
authorization and existing duplicate-settlement protection are unchanged.
The helper is intentionally scoped to the PayFor flow in this urgent fix.

Regression coverage exercises the actual initiation/OK/failure handlers with
isolated dependencies: signed form URL/hash agreement, Turkish locale and TRY
amount, guest-token preservation, decline/missing-ID/error paths, malformed
public settings and locale parameters, unverified approvals and paid replays.
The 21 focused tests make no bank request or live database write.

Production activation requires the reviewed VPS deployment. A POST to the OK
route without a donation ID is a read-only redirect probe: it must return 303
with the public `/tr/donation-failed` URL and must not create or charge a donation.
