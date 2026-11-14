# Donation-abuse guard: source contract and brand migration checklist

**Status: HOLD / NO-GO.** This is a review contract for the separate draft tracks, not evidence of production readiness or permission to merge, deploy, enable flags, or contact a payment provider.

## Reviewed tracks

| Track | Reviewed head | Scope |
| --- | --- | --- |
| Minberi Aksa [PR #165](https://github.com/saladin76/minberiaksa/pull/165) | `453f2ae76b6b28b20c6ab75974c514b14d33dfee` | Source implementation; leave its branch unchanged. |
| Gözbebekleri [PR #197](https://github.com/AdhamRef/gozbebekleri/pull/197), based on finance [PR #195](https://github.com/AdhamRef/gozbebekleri/pull/195) | `2a8b4120687fc1e468081c511de5b19e6fe656f4` | Separate finance/security integration; retain finance settlement and refund changes. |
| YediCihan [PR #3](https://github.com/AdhamRef/yedicijan/pull/3) | `a2025480dfc49ff0b05181ad995e57b0a290e497` | Separate security track; its ingress gate is `proxy.ts`. |

These are institution-specific systems. Do not copy donor records, credentials, signing keys, databases, logs, or operational assumptions between them. The identical module names do not make their databases, gateways, trusted-proxy configuration, legal obligations, or rollback procedures interchangeable.

## Required security contract

### Switches, availability, and recovery

- `DONATION_ABUSE_GUARD_ENABLED` is opt-in and must remain absent or `false` by default. The dashboard maintenance state starts OFF. `EMERGENCY_MAINTENANCE_FORCE=true` is a separate infrastructure lock; only an operator removing that environment setting can release it.
- The emergency dashboard/API is administrator-only, same-origin, revision-checked, reasoned, and audited. Callbacks needed to finish or reconcile an existing payment and the admin recovery path must remain reachable; new public payment initiation must not.
- Manual-review restrictions return `423 Locked`; initiation-store failures must not allow a payment attempt through. Maintenance and read failures must fail closed with the agreed `423` response and `Cache-Control: no-store`; donor-facing recovery is a separate flow and must not imply a charge or ask a donor to pay twice.
- **Observed release blockers:** at the reviewed heads, `lib/site-security/request.ts` (Minberi/Göz) and Yedi's `proxy.ts` catch emergency-maintenance read errors and continue; when maintenance is enabled they return `503`, not `423`. The current admin route returns `423` when the force flag prevents a dashboard change, but this does not repair the public gate. The initiation budget also skips IP accounting when its trusted-IP resolver returns `null`, and the intake budget then allows the request through. Do not enable the guard until ingress identity is verified and the no-trusted-IP case is safely handled. Do not describe maintenance as fail-closed until its read-error and response behavior match the contract and synthetic tests cover them.

### Identity, budgets, and state

- Obtain request identity only from the institution's documented trusted ingress. Minberi/Göz's `policy.ts` reads `x-real-ip` first and only uses Vercel's `x-vercel-forwarded-for` when `VERCEL` is set; Yedi's initiation-budget module reads `x-real-ip` or the last `x-vercel-forwarded-for` value. These headers are trustworthy only if the corresponding ingress overwrites them. An unknown IP is not permission to trust a spoofed header. Verify behind-proxy behavior independently for each deployment.
- Store anonymous actor identity as a versioned HMAC keyed by an institution-local secret; never persist or report a raw IP as the abuse actor ID. Do not derive identity from donor names, email, cards, or other PII.
- Keep independent initiation budgets for source-IP, donation, and intake scopes. The reviewed policy uses 8 IP and 3 donation attempts per five-minute bucket, plus 12 intake attempts per five minutes. These limits are distinct from the decline state machine and must not gate callbacks, browsing, or scheduled renewals.
- Count only deduplicated, verified failures. The reviewed policy transitions after four verified failures to a five-minute cooldown; three further failures during probation create a manual-review block with a 24-hour recorded review deadline. Because `manualRelease` is enabled, expiry alone does not release the block; an operator must release it. A clean 30-minute observation window resets probation. A successful, pending, unknown, or transport-error result is not a failure.
- Persist updates with Mongo atomic compare-and-swap on actor/revision and deduplicate provider event IDs. Provision TTL only for the intended initiation-budget records. Verify actual CAS behavior, index scope, expiry, concurrency, and backup/restore using an isolated, institution-specific QA database—not production.
- Release from manual review only through the authenticated operator route with same-origin validation, current revision, explicit reason, and audit record. Preserve event deduplication across release so callback replay cannot recreate the block.

### Payment evidence and settlement

- **Stripe:** abuse failure evidence is only a Stripe-signature-verified `payment_intent.payment_failed` linked to the matching unpaid donation and confirmed card decline. Exclude invoice/renewal events and all browser assertions, pending outcomes, provider errors, and unknown outcomes.
- **PayFor:** every success or failure state mutation must require a valid bank `ResponseHash`, the exact server-issued order ID, the matching donation, and the expected amount where the request snapshot exists. A signed approval is never a failure. A failed, forged, unsigned, missing-order, or mismatched-order response must not set either `PAID` or `FAILED`. Only explicit issuer-decline codes (`05`, `51`, `54`, `57`, `59`) from an authenticated, linked response can count toward abuse; MPI/3DS, timeout, and ambiguous replies remain unresolved.
- **Albaraka:** count only an explicit issuer decline from the verified server-side `Sale` response for the matching order and unpaid donation. Do not count transport failures, MPI/3DS outcomes, authentication requests, generic processing errors, `00`, `91`, or `96`. A 3D callback must verify MAC, order/amount linkage, and full 3DS result before `Sale`; an ambiguous/lost `Sale` result remains pending for reconciliation and must not trigger recapture.
- **Observed PayFor parity gaps:** in the reviewed Minberi `app/api/payfor/3dpay/ok/route.ts`, the amount-mismatch, order-mismatch, and non-success branches can write `status: "FAILED"` before `verifyPayForResponseHash` is called; the order-mismatch check also only rejects when both stored and returned order IDs are truthy. Göz's `/ok` route checks signature and exact order before mutation, but no comparison with the server-snapshotted request amount was found. Yedi's `/ok` route checks signature/order, a required initiation amount snapshot, and its 3DS result before mutation. The separate `/fail` handlers' checks do not repair a different unsafe `/ok` path. Require authentication, exact order binding, and the snapshotted amount before *any* financial status update, then add synthetic unsigned-failure, missing-order, wrong-order, tampered-signature, amount-mismatch, and signed-approval-on-fail-URL regressions. Until Minberi and Göz gaps are fixed, PayFor settlement integrity is **not verified across the tracks**.

### Logging, returning donors, and recurring charges

- Logs and audit metadata must never contain PAN, CVV/CVC, card payloads, access tokens, signature inputs, provider secrets, full raw callbacks, or donor PII. Log only allowlisted status/code, opaque event references, and the minimum operational context. Synthetic redaction tests are not a substitute for checking each route's actual log statements.
- A returning-donor exception requires an authenticated account and a prior donation in that same institution's database with `status=PAID` and non-null `paidAt`; retries also require ownership of that donation. Name, email, IP, browser input, and a guessed donation ID are not proof. Such donors may bypass only the progressive decline cooldown/review rule, not velocity budgets, access restrictions, or maintenance.
- Scheduled daily/Friday/monthly renewals must bypass visitor initiation budgets. A failed first recurring payment must not activate a plan or create an unintended renewal; a retry, callback replay, or concurrent worker must not double-charge. The recurring-lifecycle suite is synthetic evidence only; authorized sandbox QA must independently verify each enabled rail and schedule.
- Keep the feature disabled until false-positive checks cover verified returning donors and renewal paths. Rollback must be a human-controlled flag-off and, if needed, app rollback; preserve in-flight callback reconciliation. Do not replay an uncertain charge.

## Differential migration checklist

Check each item independently in each institution. A matching source file or passing source-repository test is not proof that the target deployment has the same ingress, provider, Mongo, or recovery behavior.

### Minberi Aksa — source PR #165

- [x] Reviewed Stripe webhook evidence path, PayFor callback adapters, and Albaraka 2D/3D routes at the referenced head.
- [x] Synthetic tests exist for abuse policy, initiation budget, maintenance, persistence, verified gateway declines, PayFor authentication, and trusted-donor eligibility.
- [ ] Fix and test the PayFor `/ok` unsigned-failure and exact-order-binding gap described above.
- [ ] Change emergency-maintenance public gate to fail-closed `423`; test enabled state and database/read failure, while preserving administrator and signed-callback recovery.
- [ ] Reconcile the older `docs/security/donation-protection-verification.md` and `docs/security/production-release-runbook-20261109.md` with the current connector state and this contract. The former still says PayFor is unwired and that maintenance fails open/returns `503`; those statements are not current verification evidence.
- [ ] Authorized independent QA: trusted proxy identity, isolated Mongo CAS/TTL and backup/restore, sandbox signatures, first-payment/renewal lifecycle, admin/staff/donor access, rollback, and donor-facing recovery.

### Gözbebekleri — PR #197 + finance PR #195

- [x] Reviewed PR #197's own security and emergency-maintenance modules; do not copy finance code from an older security-only branch over PR #195.
- [ ] Preserve the canonical finance settlement/refund behavior while integrating security. Verify enabled payment rails and their signed callback paths in this institution; do not infer Albaraka coverage from Minberi.
- [ ] Apply the same maintenance `423`/read-failure correction. PayFor `/ok` currently verifies signature/order before mutation but must also match the server-snapshotted amount; add the synthetic amount-mismatch regression if PayFor is enabled.
- [ ] Confirm Göz-specific trusted proxy, HMAC key, Mongo collection/index, operator permissions, audit and recovery independently.
- [ ] Resolve the current transferred-systems CI failure before claiming this integration verified.

### YediCihan — PR #3

- [x] Reviewed the Yedi-specific `proxy.ts` gate and Albaraka 3D route; the API tree has an Albaraka 3D path, not Minberi's 2D result path.
- [ ] Keep provider scope at Albaraka 3D unless an independently approved Yedi integration adds another rail. Test MAC, order/amount binding, full 3DS, server-side Sale, issuer decline allowlist, and ambiguous response handling.
- [x] Confirmed a synthetic verified-gateway wiring test exists.
- [ ] Add/confirm a Yedi-specific assertion that only its Albaraka 3D payment path can record a decline, and that MPI, transport, and unknown results do not count; a shared test passing is not proof of Yedi's provider-mode parity.
- [ ] Apply the same maintenance `423`/read-failure correction in `proxy.ts`; do not transplant Minberi/Göz's `request.ts` assumptions into Yedi's proxy.
- [ ] Verify PayFor route presence and signed/order-bound settlement locally in this repository before enabling its connector.
- [ ] Confirm Yedi-specific trusted ingress, HMAC key, Mongo TTL/CAS, admin audit, operator rollback and donor recovery independently. Do not share Minberi or Göz operational data.

## Test evidence and remaining blockers

The security checks are synthetic/read-only with respect to payment providers. The reviewed source security workflow installs with `npm ci --ignore-scripts --no-audit --no-fund`, then invokes:

```sh
node --import tsx --test \
  tests/integration-settings/donation-abuse-policy.test.ts \
  tests/integration-settings/payment-initiation-budget.test.ts \
  tests/integration-settings/emergency-maintenance-contract.test.ts \
  tests/integration-settings/donation-fraud-persistence-contract.test.ts \
  tests/integration-settings/verified-gateway-decline-wiring.test.ts \
  tests/integration-settings/payfor-authentication.test.ts \
  tests/integration-settings/trusted-donor-exemption.test.ts
```

The Minberi Release gates workflow also runs `npm run test:integration-settings`, `npm run test:content-editors`, and `npm run lint:ci`; its production-build fixture uses generated Prisma clients and `npx --no-install next build` against an isolated fixture database, followed by `node --import tsx scripts/public-style-build-test.mjs`. It deliberately does not run production index writes.

Observed CI at the reviewed heads:

- Minberi `453f2ae`: Release gates run [42623774656](https://github.com/saladin76/minberiaksa/actions/runs/42623774656) completed successfully; security-guard run [42623765299](https://github.com/saladin76/minberiaksa/actions/runs/42623765299) completed successfully. The release-gate run reports the critical-journeys Playwright job as skipped. An earlier run [42622701283](https://github.com/saladin76/minberiaksa/actions/runs/42622701283) failed on a five-minute FFmpeg setup timeout and a browser timeout; the later run used the updated timeout and passed. PR #165's Vercel check was reported as an error. Passing CI does not clear the PayFor or maintenance blockers above.
- Göz `2a8b412`: security-guard run [42649312185](https://github.com/AdhamRef/gozbebekleri/actions/runs/42649312185) passed; transferred-systems run [42649312205](https://github.com/AdhamRef/gozbebekleri/actions/runs/42649312205) failed. Its job log shows the isolated Stripe HTTP QA importing `server-only` in a Node test context and exiting before test completion. A later bootstrap run [42656840126](https://github.com/AdhamRef/gozbebekleri/actions/runs/42656840126) is also marked failed but exposes no jobs/logs through Actions; it is not evidence of a passing build.
- Yedi `a202548`: security-guard run [42631663368](https://github.com/AdhamRef/yedicijan/actions/runs/42631663368) passed. Bootstrap run [42631653586](https://github.com/AdhamRef/yedicijan/actions/runs/42631653586) is marked failed with no job records/logs available; it remains unresolved.

Still **BLOCKED** pending authorized, institution-specific operations: bank sandbox signing and MPI response validation; live-behind-proxy identity verification; actual isolated Mongo CAS/TTL, index-scope and backup/restore checks; enabled-rail settlement and recurring QA; role-based browser/mobile tests; and tested human rollback/recovery. No production migration/index creation, flag change, real payment/refund/chargeback, real provider message, deploy, or donor-data/secret transfer is authorized by this review. Keep all drafts and flags OFF; this is **not production GO**.
