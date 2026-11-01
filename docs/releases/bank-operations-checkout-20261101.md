# Checkout, bank adjustments and monthly renewal evidence

The saved-card selector now uses compact horizontal rows. Albaraka one-time checkout starts in 2D, with an unchecked 3D Secure opt-in below the card fields. The existing Saudi routing files and settings are unchanged; PayFor keeps its fixed 3D route, and recurring Albaraka checkout keeps 2D.

## Financial operations

An admin opens a donation's gateway details to query the bank, void a sale, or refund the full remaining amount/a partial amount. The displayed amount and currency come from the original bank request snapshot (including its original FX conversion), never today's exchange rate. A missing snapshot or changed terminal blocks money actions for reconciliation.

- Albaraka: `/Agreement`, `/Reverse`, `/Return`; documented MAC field orders. 20-character 3D orders use `TDS_` for bank inquiry/secondary actions when no ReferenceCode is available. The original terminal/key is selected by recorded mode; new recurring attempts also record their terminal.
- Ziraat Katılım PayFor: `OrderInquiry`, `Void`, `Refund`; `OrgOrderId` links secondary actions to the original sale. No card/CVC or MerchantPass is sent by these operations. Inquiry responses are parsed as bounded XML/JSON/form fields, and only safe fields are retained.
- Primary references: supplied Albaraka integration PDF sections 7–9.2 (pages 32–40), supplied PayFor API integration guide sections 6.6–6.9, supplied response field workbook. These establish operation fields, not merchant permissions.

PayFor financial API traffic requires the bank-confirmed `PAYFOR_API_URL` and `PAYFOR_API_FORMAT` (`FORM` for form fields, or `XML_PRMSTR` for the bank's XML-in-prmstr encoding), in addition to the existing MBR/Merchant/User credentials. The supplied guide explicitly refers merchants to the bank's endpoint/sample script; it does not contain the exact API endpoint or HTTP envelope. No endpoint is guessed from the 3D URL. Until confirmed/configured, inquiry/void/refund remain disabled with an explanation; public PayFor checkout is unaffected. Albaraka uses its existing service configuration. Neither bank's merchant permissions have been proved by a real refund/void in this release.

The default Prisma client globally omits the internal ledger, lock and bank-inquiry evidence from ordinary results; only the authorized financial endpoint explicitly selects them. Staff reasons and identities therefore cannot leak through generic donor-response spreads.

Each action requires an amount/reason and explicit confirmation. Admin permission and same-origin JSON are enforced server-side. A transaction atomically acquires the donation lock and records a pending operation before contacting the bank. Idempotency keys, integer minor units and the persisted operation ledger prevent duplicate/over-limit refunds. A lost provider response or failure to save an approval retains a durable lock; it cannot trigger an automatic retry. After a new bank inquiry, an admin can record the bank reference/evidence to reconcile an uncertain result, without sending another financial operation. Voids are full-only, disabled after a confirmed refund; the bank decides batch-close eligibility. A declined void never falls back to a refund.

The immutable original sale, original paid status/date, original receipts and historical gross reporting remain separate from financial adjustments. The new ledger displays confirmed returned funds and the remaining amount. Existing dashboard revenue totals are **gross receipts**, not net-of-refund reports. Bank-portal actions outside this ledger require reconciliation; this release does not silently import or infer external adjustments. Returning a donation does not cancel its recurring plan. Operators must manage future recurring charges separately when requested by the donor.

## Monthly correctness

The monthly filter previously used negative comparisons against a required cadence field. Prisma's Mongo filters exclude undefined fields, so older monthly subscriptions/payments disappeared from a monthly-only view. The schema now represents the actual nullable legacy field, and the shared monthly scope explicitly includes MONTHLY/null/missing. Daily and Friday stay separate. Scheduling and card replacement use the same legacy-monthly semantics; no existing cadence, amount, billing date or retry policy is rewritten.

The health panel and read-only recurring audit now separate settled automatic renewals from paid signups, declined renewals and unresolved attempts over the latest 30 days. A maximum sample of 1,000 is disclosed. Configuration/scheduler liveness alone never establishes successful recurring bank collection. Production inspection found rejected renewal attempts (`Onaylanmadi`); no extra charge or forced retry was executed in this work. A live bank-accepted automatic monthly renewal remains an acceptance item.

## Verification and release

Automated tests use local provider/DB boundaries, never donor funds. Covered cases include the two checkout modes, existing Saudi preview/correction, partial/repeated refunds, concurrency, duplicate keys, lost replies, post-approval DB failure, bank declines, financial permissions/CSRF, reconciliation evidence, masking, the legacy monthly scope, and signup versus renewal evidence. Browser fixtures cover AR/EN/TR at 320/390/1440px; the new bank suite is a release gate.

After the pinned release succeeds on the VPS, run `node --conditions=react-server --import tsx scripts/audit-bank-operations.ts` and `node --conditions=react-server --import tsx scripts/audit-recurring-health.ts`. Both are read-only and print no donor/card/credential identifiers. Confirm bank permissions and the exact PayFor API contract before accepting live financial operations. Do not treat a successful build as bank acceptance.
