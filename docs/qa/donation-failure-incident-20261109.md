# Donation failure incident — 9 November 2026

## Status and scope

**DATA_ACCESS_BLOCKED — no live incident cause or failure rate can be verified.**
This report records an access-limited, read-only investigation. No production
database, gateway dashboard, VPS/PM2, application log, or Clarity recording
access was available through the approved tools in this session. No live query
or payment operation was attempted. Do not interpret unavailable values as zero.

The requested current-day cutoff is the investigation clock supplied with the
task: **2026-11-09 17:17:18.422 UTC / 20:17:18.422 Europe/Istanbul**. Istanbul
was UTC+03:00 on this date.

| Window | Europe/Istanbul | UTC |
| --- | --- | --- |
| Incident day, partial | 2026-11-09 00:00:00–20:17:18.422 | 2026-11-08 21:00:00–2026-11-09 17:17:18.422 |
| Matched daily baseline | Each of 2026-11-02 through 2026-11-08, 00:00:00–20:17:18.422 | 2026-11-01 21:00:00–2026-11-08 17:17:18.422, divided into matching daily windows |
| Previous Monday | 2026-11-02 00:00:00–20:17:18.422 | 2026-11-01 21:00:00–2026-11-02 17:17:18.422 |

These are comparison windows only; no payment counts were retrieved for them.
Production's exact last query time, deployed commit, and runtime configuration
remain unknown.

## Counts and outcome classification

No institution-owned payment attempts, donations, state transitions, verified
callbacks, reconciliation results, or sanitized production logs were available.
Consequently, all requested counts and denominators are **unavailable (N/A), not
zero**. Rates cannot be calculated.

| Gateway/path | Initiations | Bank-confirmed responses | Confirmed issuer declines | Settled | Pending / uncertain / abandoned | Matched baseline |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Albaraka 2D and 3D | N/A | N/A | N/A | N/A | N/A | N/A |
| PayFor / Ziraat Katılım 3DPay | N/A | N/A | N/A | N/A | N/A | N/A |
| Stripe (if enabled in production) | N/A | N/A | N/A | N/A | N/A | N/A |
| PayPal (if enabled in production) | N/A | N/A | N/A | N/A | N/A | N/A |
| Any other configured route or fallback | N/A | N/A | N/A | N/A | N/A | N/A |

There is no verified basis to separate initial card authorizations from daily,
Friday, or monthly renewals; nor to classify user abandonment, 3DS/MPI/ACS
outcomes, callback replay/timeout, issuer decline, or bank settlement. A failure
page, callback timeout, or missing browser return is not evidence of an issuer
decline or a definitive failure. No gateway-specific “Fraud Şüphesi” source,
routing fallback, currency/country/IP/phone pattern, or actual settlement was
verified.

Hourly, country/geo, TRY/USD, device/OS/in-app browser, landing/referral/campaign,
payment rail, first-payment/renewal/one-time, and cart-combination comparisons
are all unavailable. No donor identifiers or raw payment references were
requested or included.

## Deployment, evidence, and scope limits

| Evidence | Verified result | Limit |
| --- | --- | --- |
| GitHub `main` | Commit `9a0c356d2bbab8de76951e9d2bdf2012523614ce` | This is source state, not evidence of the production deployment. |
| Production VPS / PM2 / runtime configuration | Not accessible | Deployed SHA, gateway enablement, routing flags, and runtime environment are unverified. |
| Security PR #165 | Open draft, unmerged; head differs from `main` | Its draft description says signed PayFor handling and synthetic tests are included. The check/status endpoints returned 403, so implementation and test results were not independently verified. Do not treat this PR as deployed. |
| Clarity / PR #182 | No current incident recordings or authorized Clarity project access available | No drop-off, redirect, delay, or success-page observation is claimed. A success-page view would not prove settlement. |
| Incident PR release-gates run `42663060853` | `action_required`; zero jobs listed | The workflow log request returned 404. This supplies no production evidence and no CI test result. |

The available GitHub/source evidence cannot substitute for the institution's
payment records, gateway acknowledgements, production logs, or deployment
inspection. PR #166 and PR #174 were not used as production evidence.

## Timestamped evidence matrix

Evidence snapshot: **2026-11-09 17:17:18.422 UTC** (20:17:18.422
Europe/Istanbul, task investigation clock). This is not a production query
timestamp; no production query was possible.

| Timestamp | Gateway / path | Verified failed rate and denominator | Matched baseline | Sanitized evidence and observable symptom | Safest next check / fix | Synthetic test and rollback/check |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-11-09 17:17:18.422 UTC | Albaraka 2D/3D | N/A; attempts and bank-confirmed responses unavailable | N/A; prior seven days and prior Monday unavailable | No production callbacks, settlements, logs, or route configuration. Source inspection only: the 3D handler verifies the MAC and has a pending path for a capture transport failure; runtime behavior is unknown. | Authorized operator: correlate signed bank outcome, app state, and reconciliation before classifying a decline. Do not retry an uncertain capture. | Synthetic MAC tampering, issuer/MPI outcome, capture timeout, duplicate callback, and reconciliation cases; verify no duplicate capture. Roll back only a reviewed code change if synthetic checks fail; no live rollback/action from this report. |
| 2026-11-09 17:17:18.422 UTC | PayFor / Ziraat Katılım 3DPay | N/A; attempts and verified responses unavailable | N/A; prior seven days and prior Monday unavailable | No production callback or bank evidence. `main` source can write `FAILED` on mismatch/non-success before checking `ResponseHash`; this is not a measured failure or a verified incident cause. | In the separate security PR, verify callback signature and exact order linkage before any state mutation; leave unverifiable outcomes unconfirmed. | Synthetic signed/unsigned approvals and declines, tampered fields, mismatch, MPI-stage error, and replay. Do not deploy unless tests and safety review pass; verify deployed SHA before release. |
| 2026-11-09 17:17:18.422 UTC | Stripe, if enabled | N/A; attempts and provider-confirmed responses unavailable | N/A; prior seven days and prior Monday unavailable | No production webhook, settlement, configuration, or application-log evidence. | Confirm production enablement, signed event outcome, and donation-to-payment linkage using authorized read-only evidence. | Synthetic signed webhook, decline, duplicate/replay, and delayed reconciliation cases; check idempotent settlement and pending recovery before release. |
| 2026-11-09 17:17:18.422 UTC | PayPal, if enabled | N/A; attempts and provider-confirmed responses unavailable | N/A; prior seven days and prior Monday unavailable | No production webhook, settlement, configuration, or application-log evidence. | Confirm production enablement and provider-confirmed order/capture state; do not treat a browser return as settlement. | Synthetic approved/cancelled/pending returns, duplicate webhook, and capture reconciliation cases; check idempotency before release. |
| 2026-11-09 17:17:18.422 UTC | Routing, recurring dispatch, and all other routes | N/A; no shared initiation denominator or confirmed outcomes | N/A; prior seven days and prior Monday unavailable | Runtime routing flags, country/currency/device/cart segments, recurring dispatch, cron results, and fallback events unavailable. | First verify deployed routes/configuration and separate one-time authorizations from renewals; compare same-hour denominators before proposing mitigation. | Exercise synthetic routing boundaries and renewal/one-time isolation without provider charges; confirm no live flag, cron, retry, or routing change is part of validation. |

## Ranked findings

### P0 — Actual incident cause: not determined

No live evidence is available to establish an affected gateway, elevated failure
rate, or cause. No production mitigation or routing change is justified by this
investigation.

### P1 — PayFor callback can write `FAILED` before signature verification

**Confirmed source behavior; production exposure and incident relationship are
unverified.** At the `main` commit above, `/home/runner/work/minberiaksa/minberiaksa/app/api/payfor/3dpay/ok/route.ts`
writes `status: "FAILED"` for amount mismatch (lines 73–89), order mismatch
(lines 92–108), and any non-success response (lines 110–125). It checks
`ResponseHash` only afterward (lines 128–142), and only on the approval path.
Thus, callback fields that have not passed signature verification can determine
that a donation is marked failed. This is a source-level financial-state
integrity risk, not evidence that a forged response occurred or that this caused
today's reported failures.

**Safest follow-up:** handle this through the separate security work, not by
changing payment behavior in this incident report. Before any callback-derived
state mutation, verify the provider signature and exact server-issued order
linkage using the bank's documented/validated rules for approvals, declines, and
MPI-stage errors. Invalid or unverifiable outcomes must remain unconfirmed for
reconciliation, not be converted into a decline or approval. Keep anti-fraud,
amount, currency, idempotency, and settlement checks intact.

**Synthetic test criteria:** unsigned and tampered approval/decline callbacks,
signature-valid linked outcomes, wrong order/amount, duplicate delivery, and
MPI-stage responses must prove that only valid, correctly linked evidence can
change financial state; uncertain outcomes must remain pending/unconfirmed.
PR #165's draft description reports callback regression tests, but their code
and passing status could not be verified from this session.

### P2 — Operational diagnosis and safe mitigation are blocked

No matched initiation or bank-confirmed denominator, reconciliation state,
gateway status, or deployed SHA is available. The next safe action is for an
authorized operator to perform the read-only, privacy-minimizing checks below.
Do not retry charges, activate cron, change provider/routing configuration,
restart services, or declare declines from app/UI errors.

## Authorized read-only handoff and release checks

1. An authorized operator should record the production SHA and relevant
   redacted runtime gateway/routing configuration; query institution-owned
   attempts, donation state transitions, verified callbacks, reconciliation
   outcomes, and sanitized PM2/Next.js logs. Share only aggregate counts and
   source timestamps, never donor identifiers or raw callback payloads.
2. For each gateway and matched time window, report initiation count, bank-
   confirmed response count, issuer-confirmed declines, settled payments, and
   pending/uncertain outcomes separately. Include counts and denominators before
   rates; split initial authorizations from recurring renewals.
3. Use the same timezone and elapsed hours for hourly and seven-day/previous-
   Monday comparisons. Segment only where authorized and privacy-safe. Confirm
   each gateway and routing rule is actually enabled before reporting it.
4. Reconcile callbacks and settlements before any donor contact or operational
   action. Never retry or recapture an uncertain transaction solely because a
   browser returned to a failure page.
5. Validate any callback fix with synthetic tests and a safety review in an
   isolated environment. Require explicit approval and an independently
   verified release/deployment SHA before any production change.

**Release recommendation:** keep this as an investigation-only draft. No
production change, traffic-routing adjustment, retry, refund, cron action, or
deployment is recommended from the evidence currently available.
