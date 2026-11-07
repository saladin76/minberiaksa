# Bank payment controls — 2026-11-01

## Checkout

Albaraka one-time checkout starts in direct 2D mode. A donor can select the optional 3D checkbox. Saved cards use compact horizontal rows with masked last four digits. Saudi routing is unchanged; PayFor remains 3D, with the existing Saudi eligibility and currency rules. Recurring signup retains its existing supported Albaraka direct-payment route.

## Administrative operations

Donation details contain bank inquiry, void, full/partial refund, and a durable adjustment history. Only ADMIN can move money or reconcile an uncertain result; authorized finance staff can inspect and inquire. These actions are separate from the original confirmed donation, which stays immutable. Existing gross revenue is not silently rewritten as net revenue. Internal ledger, inquiry and lock fields are omitted from donor donation/history responses and ordinary list queries; they are loaded only by the permission-checked bank endpoint.

- Albaraka: Agreement, Reverse, Return; original ReferenceCode is preferred, otherwise the original bank OrderId (including TDS_ for 3D).
- PayFor: OrderInquiry, Void, Refund; original OrderId/OrgOrderId, original bank currency, and exact minor-unit arithmetic.
- A fresh bank inquiry must verify the original order, amount, currency, authorization and returned balance before every financial action. External bank-console refunds reduce the remaining allowance.
- A durable per-donation lock and idempotency key precede the money request. A lost response or failed final database write freezes further actions. Nothing automatically retries a void/refund or turns a rejected void into a refund.
- Reconciliation records bank evidence only; it never sends money. It requires a newer matching bank inquiry, a two-minute minimum age, and an explicit ADMIN decision.
- The bank decides batch closing and same-day/partial-refund eligibility. Documented API methods do not prove the production terminal is authorized.

## Production configuration

Albaraka uses the matching original 2D, 3D or recurring terminal configuration. A stored terminal/merchant mismatch blocks the action. Old records without sufficient original request evidence cannot be adjusted until their bank references are reviewed.

PayFor operations require two additional, bank-confirmed server variables:

- PAYFOR_API_URL: the HTTPS transaction API endpoint for this Ziraat Katılım merchant, with no credentials/query/hash.
- PAYFOR_API_FORMAT: FORM or XML_PRMSTR, matching the bank-confirmed request encoding.

Existing PAYFOR_MBR_ID, PAYFOR_MERCHANT_ID, PAYFOR_USER_CODE and PAYFOR_USER_PASS are used. MerchantPass (the 3D secret) is never sent to the transaction API. The endpoint is not guessed from the 3D endpoint or from another bank. Missing operation configuration disables these new actions without altering checkout or Saudi routing. Never import credentials belonging to a different organization from an example document.

The supplied Albaraka integration PDF and PayFor API/response-field documents define the request fields. Actual inquiry and a controlled operator-approved adjustment are still necessary to prove terminal capability. No real charge, void, refund or recipient message was executed during implementation tests.

## Monthly renewal evidence

Health separates first-payment success from subsequent subscription-cycle collections. It reports confirmed renewals, bank declines, failures without a confirmed bank refusal, and unresolved results by provider and cadence. A future schedule or active subscription is not bank-collection evidence. Results are bounded to 30 days / 1000 attempts and explicitly marked incomplete when truncated.

Successful new Albaraka collections retain the exact paid bank amount/currency, order and reference; only masked card last four digits enter the summary. Legacy failures are not relabeled paid.

After deployment, this read-only command audits monthly cycles and inquires about at most three Albaraka attempts:

```bash
node --import tsx scripts/verify-monthly-renewals-readonly.ts --bank-check
```

It has no create/update, charge, refund, void, retry or message path. Review its evidence and bankChecks before closing monthly acceptance. The known EUR 107.87 failed attempt remains unresolved operationally until its bank status is established; successful code tests do not turn it into a collection.

## Validation

Real service tests cover exact amounts, terminal identity, repeat partial refunds, refunds outside the dashboard, concurrency, lost bank responses and persistence failures. Browser fixtures exercise actual components against synthetic database and bank adapters in Arabic, English and Turkish on desktop and mobile. CI also checks the default 2D/optional 3D flow, unchanged Saudi routing, compact saved-card dimensions, subscription lifecycle, access controls, production build, lint and type checks.
