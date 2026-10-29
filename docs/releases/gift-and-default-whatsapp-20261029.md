# Gift delivery, localized receipts and default WhatsApp identity — 29 October 2026

This release follows the TRY return-URL correction. It changes gift processing,
template sender selection and the donor-currency receipt copy approved after the
owner reviewed the proposed wording and requested full language consistency.

## Gift recovery

The previous gift lookup matched explicit Mongo null, omitting legacy records
where giftDeliveredAt was absent. It also completed the entire gift after just
one channel succeeded. Gift processing now reads paidAt before sending, includes
missing fields, claims a per-item lease, re-reads after the claim and persists
separate email/WhatsApp outcomes. Accepted channels are skipped on retry. A
lost provider response remains held for review rather than being sent twice.
The existing delivery-archive retry delegates gifts to this same item lease.

Gift WhatsApp formerly sent business-initiated free text regardless of the
recipient's service window. It now uses text only within the actual number's
open window, or an exact-language approved mia_gift_donation_v1 variant on the
default WABA. Missing approval is archived as a skip; it never pretends delivery.
No environment sender can override a routing refusal. International 00 prefixes
and Arabic/Persian digits normalize; local numbers without a country code fail
validation. The project panel blocks incomplete/invalid gifts rather than
silently dropping their details. Its validation is localized in all 19 languages.

A paid gift has its own certificate link and donor-side download button. A
recipient's HMAC token is scoped to that donation item; it cannot open the donor's
receipt or other gifts. Generating the recipient certificate renders a copy and
does not rename the donor's stored certificate. Gift email retains Cairo support.
New Mongo gift-state/lease columns are optional; no destructive data migration is
required. Prisma generation in the existing deployment supplies the updated client.

## One template identity

Campaigns, automatic triggers, gifts, retries and Smart WhatsApp template choices
select only the saved default number. Other active numbers remain available to
their own direct conversations. A disabled/incompatible/missing default does not
silently fall back to an ordinary number. Routing preview uses this same policy.
The sender UI explains it in Arabic, English and Turkish.

scripts/prepare-gift-whatsapp.mjs is read-only without flags. With --apply it
creates the dedicated 19-language gift family if absent. Adding --publish submits
only to the default WABA. It never sends a recipient message; Meta must approve
each language. Existing templates and historical messages are not deleted.

## Original-currency receipts and localized templates

The focused receipt context now includes receiptSummary and displayDate. The
summary starts with the stored total in the donor's currency (including support
and covered fees), using localized currency names and the currency's precision.
The canonical amount/amountUSD fields remain unchanged for accounting and manual
campaigns. Zero support/fees do not clutter the new summary. Dates use the message
language and Istanbul time, while the original ISO createdAt remains available.

A confirmed foreign-currency order may additionally show the TRY charge for that
same payment. This requires a valid paidAt, PAID status when supplied, the matching
provider/order id and a positive stored TRY bank request. Albaraka one-time and
recurring requests use integer minor units; PayFor uses decimal amounts in code
949. The recurring cycle's own snapshot is used. Missing/mismatched data, failed
payments, non-TRY bank charges, cash, PayPal and Stripe never acquire a fabricated
TRY equivalent. Native TRY is shown once. No current FX rate is fetched. Raw bank
payloads are fetched only for the focus receipt, never large audience histories,
and are not placed in the rendered/archived template context.

Email and SMS human-readable money fields are upgraded without changing URLs,
HTML attributes, accounting values or explicit custom breakdowns. The known old
bilingual footer is localized. Automatic messages require the exact recipient
language; missing translations are archived as skipped rather than sent in a
different language. Archive retries cannot bypass that refusal. Meta mapping and
retries require exact-language approval on the selected default WABA.

Approved Meta templates cannot acquire a changed footer or body merely by changing
local render values. `upgrade-notification-templates.mjs` therefore reads the
actual installed trigger templates, preserving each locale's greeting, thanks,
prayer, account link and document buttons. It stages a content-addressed family
with one full receipt-summary slot, a localized date and a single-language footer.
Subscription signup/cancellation amounts remain future instalment scalars. Missing
locale/button/header translations, mixed receipt/future triggers and unsupported
amount patterns are reported for review instead of silently rewritten.

The default CLI run is a read-only plan. `--apply --publish` creates drafts and
submits them only to the one active default WABA, sending no recipient messages.
The existing authenticated template-sync cron switches the relevant triggers only
after all 19 exact provider schemas are approved, and only if both source and
staged copy are unchanged. This switch is transactional and audited. Old templates
and historical deliveries remain available. This source work has not submitted
these new templates to Meta or established approval on the production account.

After deploying the reviewed source, run from `/root/minberiaksa`:

```bash
node --conditions=react-server --import tsx scripts/upgrade-notification-templates.mjs
node --conditions=react-server --import tsx scripts/prepare-gift-whatsapp.mjs --apply --publish
node --conditions=react-server --import tsx scripts/upgrade-notification-templates.mjs --apply --publish
```

Read the first command's REVIEW_REQUIRED entries before submission. Meta approval
remains necessary; periodic sync activates only a complete unchanged approved
replacement. For a manual approval-state check/activation after sync:

```bash
node --conditions=react-server --import tsx scripts/upgrade-notification-templates.mjs --apply --activate-approved
```

These commands never call a payment/charge/cron-send endpoint or send old receipts.

## Evidence and limits

The live review found a TRY 3 attempt rejected at bank 3D enrollment and a
separate confirmed TRY 2 attempt; that rejection is not evidence of a gift-code
failure. The owner's existing certificate downloaded successfully from production.
The saved default number had a recent thread with an open reply window, composer,
file attachment, voice recording and send controls. No donor message or payment
was sent. An administrative Meta verification attempt returned only a generic
failure in the currently deployed UI; it is not reported as a passed health test.

No dedicated gift family was visible among active service templates. Its provider
approval remains an operational prerequisite outside the service window. Source
preparation does not establish approval or delivery to a new gift recipient.

Validation: 1,274 integration tests, 193 content tests, all three release type
gates, a zero-error type baseline, no new lint findings and zero missing dashboard
translations. Six isolated browser cases cover real project/dedication components
in AR/EN/TR at 390px/1440px, including invalid contacts, preserved gift payloads,
guest certificate links and no donor sends. Gift drafts additionally exercise
the actual Meta publish/send schema builders for every public locale. The Next
production build passed TypeScript and all 151 static pages using dummy build
credentials and an empty database URL; caught datasource warnings are not evidence
of production DB/provider connectivity. No production index installer was run.

The live comparison read the existing donation-success template in all 19
languages and the Arabic recurring-payment template. The existing body strength,
date/reference and certificate/receipt/account actions are retained. All success
footers were the same Arabic/English closing; the new drafts localize them. The
currency release adds provider-unit/order proof, all-locale summary/date/schema,
no-mutation staging, pending/editorial-change activation and archived language-
refusal tests. It does not claim all automatic families have been submitted or
re-approved live.

Other open operational work from the conversation audit remains open: permanent
archived-category cleanup, a 19-language greeting family, full autonomous Google
Ads scope, a measured PageSpeed 100, recent Clarity acceptance and final live
dashboard/payment acceptance. This release is not a declaration those are complete.
