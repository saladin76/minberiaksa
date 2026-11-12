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
- PAYFOR_API_FORMAT: FORM, XML_PRMSTR or XML_BODY, matching the bank-confirmed request encoding. XML_BODY sends raw PayforRequest XML with text/xml; XML_PRMSTR sends an XML document as form-encoded prmstr. Never automatically retry an uncertain financial request under a different encoding.

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

## Ziraat Katılım / PayFor document review (2026-11-08)

Reviewed merchant-supplied integration guide v1.9, the PayFor error-code guide, 3DPay/3DModel docs, response-field dictionary and merchant console guide. This is the **same PayFor merchant integration**, not the unrelated ZiraatPay v2 payment product.

- **Order inquiry** (integration guide section 6.9/page 16): `TxnType=OrderInquiry`, `SecureType=Inquiry`, `OrderId=<original sale order>`, bank merchant/user credentials, original currency and `Lang=TR`.
- **Void** (section 6.6/page 13): `TxnType=Void`, `SecureType=NonSecure`, `OrgOrderId=<original sale order>`, original currency. Intended for the same open batch; no `PurchAmount` on the minimum request.
- **Refund** (section 6.7/page 14): `TxnType=Refund`, `SecureType=NonSecure`, `OrgOrderId=<original sale order>`, original currency, and `PurchAmount` in major decimal units. Partial refund is permitted after the sale batch has closed.
- The guide does **not** require or specify a newly generated `OrderId` for Void/Refund. A unique local adjustment ID is still maintained in the database for audit/idempotency but is not transmitted as an undocumented field.
- `ProcReturnCode=00` is a success indicator; `V000` means processing is still ongoing, `V020` the transaction has not completed, and system/transport error codes such as `V9196` and `V9199` cannot prove non-execution. Such responses stay **UNKNOWN** and never trigger an automatic resend. Bank-specific `V014` indicates attempting a refund before batch close; the operator should use Void where authorized, **never** an automatic fallback.
- The response-field dictionary defines `RefundedAmount`, `VoidDate`, `AuthCode`, `OrgOrderId`, `OrderId`, `Currency`, `PurchAmount`, and `ProcReturnCode`. It does **not** provide a complete, bank-certified OrderInquiry response envelope. As a result, automatic financial adjustments stay blocked unless a full inquiry with original sale identity, amount, currency and cumulative returned amount verifies successfully.
- The guide says the actual production transaction `HostUrl` and sample connector scripts are provided **by the bank** (page 9; integration guide page 5). None of the supplied documents establishes a live `HostUrl` or confirms whether this merchant accepts `FORM` or `XML_PRMSTR`. Ask the bank for both the endpoint **and** serialization, representative sanitized inquiry/adjustment responses and explicit inquiry/void/full/partial refund permissions. Do **not** infer either from the 3DPay/3DHost/reporting URLs.
- The merchant console guide documents a manual fallback for void/full/partial refunds and reporting, including matching by original `OrderID`. Use this only through the bank's authorized console and reconcile the resulting bank evidence with the immutable original donation; never fabricate an API success.

Checkout, the Saudi routing rules, Albaraka operations, the live gateway configuration, and all financial write permissions remain unchanged by this documentation/adapter hardening. No production bank request, void, refund, payment or new donor message was initiated.

## Transport probe result (2026-11-08, VPS)

- HEAD requests to the merchant's checkout `/MPI/Default.aspx` and candidate `/MPI/XMLGate.aspx` both returned HTTP 200; this only demonstrates reachability/TLS.
- An unauthenticated malformed raw-XML POST to XMLGate returned **302 /MPI/GatewayError.aspx**.
- An unauthenticated empty `prmstr` form POST returned **302 /error/500?aspxerrorpath=/MPI/XMLGate.aspx**.
- These probes do **not** establish that XMLGate is the approved transaction endpoint or that any encoding works with merchant credentials. They contain no financial action but can be logged by the bank. Do not repeat or broaden live probes without bank confirmation.
- Third-party PayFor SDKs implement raw PayforRequest XML; adapter now supports **explicit XML_BODY** for a confirmed integration. The active production configuration is unchanged and remains NOT_CONFIGURED until the bank validates endpoint/transport/permissions and a read-only authenticated OrderInquiry is tested with an approved original sale.
