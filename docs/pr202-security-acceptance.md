# PR #202 — Security / financial staging acceptance handoff

This checklist is **not** evidence that production or authenticated staging has passed.
Branch-level fixture tests use synthetic data only; no live payment is required.

## 1. Donation detail access (security gate)

Endpoint: GET /api/donations/:id

- Reject malformed MongoDB ObjectIds before any database read or PSP call.
- Read only donorId and the guest receipt bearer for initial authorization.
- Unknown donation => 404; anonymous / non-owner without a valid bearer => 403.
- Only after successful authorization may Stripe self-heal run. PayPal reconciliation is additionally restricted to revenue-authorized staff.
- Recheck owner and bearer **after** reconciliation, preventing stale access from exposing a reassigned donation or rotated token.
- Never include accessToken, providerRaw, cardDetails, raw bank reconciliation/lease state or card secrets in details.
- Return Cache-Control: private, no-store.

The authorized GET still performs Stripe self-heal (which can have side effects). Only test this path using fixture payment providers in isolation.

## 1B. Guest-to-account donation claim (security gate)

Endpoint: POST /api/users/link-guest

Donation IDs appear in URLs, receipts, emails, and screenshots; ID alone must NEVER authorize transferring all donations in an anonymous account. A logged-in claimant must provide the donation's valid high-entropy accessToken, verified before the guest merge helper runs. Existing ownership of the same donation is idempotent without a merge.

The success page forwards its incoming guest link token explicitly, not an accessToken embedded in the server-rendered donation summary. Anonymous requests (401), malformed IDs (400), unknown IDs (404), and missing/wrong tokens (403) must produce zero account-merging writes.

A matching receipt token is necessary but not sufficient: existing password/OAuth accounts, verified email/WhatsApp OTP identities, registered accounts, active session records, admin-invited accounts, staff roles, and previously merged accounts must never be classified as unclaimed guests. Test all these scenarios with synthetic accounts.

## 2. Historical payment-card data (count-only; no edits)

One legacy single-cadence recurring checkout persisted Subscription.cardDetails from input before this PR. Historical records may therefore contain PAN/CVV. New subscription creation explicitly persists cardDetails:null; recurring billing uses verified paymentCardId and encrypted saved cards.

Review historical data with the security owner. The audit **does not** read or output card numbers, security codes, names, donor IDs or database documents. Only MongoDB count commands run, reporting:

- Subscription.cardDetails present
- Subscription.cardDetails.cvv nonempty
- Subscription.cardDetails.cardNumber nonempty
- Donation.cardDetails present
- Donation.cardDetails.cvv nonempty
- CreditCard.cvc nonempty

Prerequisites: explicit approval for a named database, a dedicated database user limited to read-only permissions, secure execution host and a query-performance assessment. Prefer a separately approved isolated replica. Do not copy raw PCI data into console output or CI artifacts.

After explicit approval, with approved connection values supplied *securely* to the operator, execute:

CARD_AUDIT_CONFIRM=READ_ONLY_COUNTS_APPROVED CARD_AUDIT_DATABASE=<approved_database> DATABASE_URL=<approved_read_only_mongo_uri> node --import tsx scripts/audit-legacy-card-fields.mjs

The script refuses missing approval and database mismatch, never runs automatically, and cannot modify records. Any nonzero historical CVV count requires escalation to the authorized security/payment team and a separately approved containment and remediation plan. No automatic deletion or reprocessing.

## 3. Isolated authentic staging (not yet run)

Use a staging deployment backed by a nonproduction database, with separate sessions for ADMIN, revenue STAFF, denied STAFF, DONOR and anonymous. Run scripts/dashboard-pr202-staging-acceptance.mjs with exact approved HTTPS hostname and GET-only queries. Test cross-Istanbul-midnight paid settlement, FAILED and PENDING attempts, whole-pagination finance reconciliation and donor isolation. Use preapproved **synthetic donors**, not real card data.

Separately run critical Playwright E2E with a sandbox gateway and nonproduction database. An intentionally skipped PR workflow is not a pass.

## 4. Release decision

- All automated Release Gates and SEO acceptance must be green on the **same latest SHA**.
- Authenticated isolated staging finance/role acceptance and controlled historical PCI audit must be recorded separately.
- The product owner must acknowledge KPI card scope and mixed-status sorting behavior.
- Explicit release authorization is required before merge, production deployment, any historical-data repair or live financial operation.
- Keep PR #202 Draft until the operational gates are satisfied.
