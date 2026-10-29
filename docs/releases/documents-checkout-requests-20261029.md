# Documents, checkout and subscription requests — 29 October 2026

## Implemented in source

- Thank-you certificates use one opaque light SVG tile in the landscape and portrait sheets, replacing overlapping transparent gradients that appeared darker in the actual downloaded Chromium PDF. Set explicit shared line height/light color scheme and adjust frame/content/footer spacing. Portrait certificates retain the issue date and serial too. Automatic, gift and manual delivery reuse the same sheets and renderer.
- All three card entry surfaces share a compact, keyboard-accessible two/three-column saved-card picker. New-card selection clears CVC; checkout retains its own new-card fields and uses a smaller preview. Include the missing `DonationDialog` namespace in checkout. Saved-card responses deduplicate full decrypted identities plus expiry, never just last four digits, and explicitly whitelist safe returned fields. No stored card or payment reference is removed.
- Template lists derive approval from exact variants on the configured default WhatsApp account. Approval on that account is green and labelled accordingly; missing approval is not relabelled approved. Other accounts do not create a missing-in-all-accounts warning. Publication targets the default sender only. No provider approval is changed by the UI.
- Old receipt URLs reuse the authorized receipt handler directly. This avoids a reverse-proxy localhost redirect. Authorization precedes document issuance. Profile/account downloads require successful PDF content type and `%PDF-` bytes, keep localized filenames and report errors; batch failures no longer report universal success. Account history offers both receipt and thank-you downloads. Its paid-date requirement now matches document issuance; an unconfirmed recurring order is not shown as a paid, downloadable donation.
- Automatic emails have inline Cairo across languages, a 14px body and bounded headings, preserving links/content and smaller footer text. This includes trigger emails, verification, gifts, bank transfers, manual certificates and service-request confirmations. Marketing-builder typography is not globally overwritten.
- Receipt notification summaries contain one total in the saved donor currency and message language, without bank/TRY explanations or component breakdowns. The accounting data is unchanged. Legacy approved Meta amount slots remain numeric so an existing currency slot is not repeated. New notification successors remove redundant amount prefixes and use policy version 2; existing approved content is not edited in place. Activation still requires exact schema approval in every language on the default account.
- `cleanup-retired-templates.mjs` is read-only by default. The reviewed metadata finalizer applies it after deployment. Only explicitly archived templates or verified superseded sources are candidates. All trigger/campaign bindings are retained. History is archived rather than deleted. A genuinely unused retired local row is removed only after a private JSONL backup of the row and variants; reference-read failures stop the operation. It never deletes a Meta provider template or messages a donor.

Repeated release starts for the same commit now return the running job. Status recovers the original job when an older runner left `latest` pointing at a blocked duplicate, including after the original succeeds. This addresses the repeated terminal confusion in the supplied logs; it does not change the outcome of the already-running old runner.

## A3 document follow-up

- Hide the recurring-conversion nudge for a basket already containing an original recurring gift; a donor can still undo their own one-time-to-monthly toggle. The success page already excludes this upsell for recurring payments.
- Active account subscriptions link to donation management instead of starting another plan. Remove lifetime donation amounts from both public account/profile summaries, preserving donation history amounts and staff financial reporting. Correct the English giving heading to “Carry your giving further”. Daily/Friday profile plan amounts use the actual cadence and plan amount.
- Add authenticated, owner-scoped requests for amount change, pause or cancellation. Creating a ticket does not mutate billing. An open request per plan/action is deduplicated by a unique key. Requests appear in the monthly dashboard with New/In progress/Completed status, donor profile and plan links, staff notes and conflict detection. Completion is refused until the recorded plan matches the requested change. New/complete notices use the donor's language, with archived email and configured team notifications. No real request or message was submitted during verification.
- Add explicit daily/monthly/Friday inclusion and exclusion to smart audiences, plus one-time donors. Monthly includes legacy plans without the frequency field. Recurring audiences require confirmed billing evidence; filters compose with existing donation, country, language and exclusion criteria.
- Add a configured team alert for failed/held scheduler outcomes. An exhausted retry remains a payment failure, without incorrectly dispatching a donor cancellation notice.
- The new request collection has three production indexes, including the unique active request key, through the existing index installer. No data migration or historical plan reactivation is included.

## Current live evidence

At **21:49:58 Europe/Istanbul on 29 October**, the production read-only subscription-health endpoint reported a complete scan: **35 scheduled** (Albaraka: 25 monthly, 4 daily, 1 Friday; PayPal: 5 monthly), **37 inactive**, **2 awaiting first payment**, no due or missing-date readiness groups. Three Albaraka daily plans had a failed-charge history. The scheduler's latest audit was **21:45:30**, scanning zero due plans. These are schedule/runner observations, not evidence of bank acceptance. No charge, cron execution, donor send or plan repair was triggered.

A second read at **22:33:04 Europe/Istanbul** exposed the new schedule snapshot on the live site: still 35 scheduled, no overdue date, **5 instalments in the next 24 hours**, nearest date **30 October at 09:00**, scheduler state **recent**, last runner check **22:30:30**. The new response shape shows the updated health code serving live; it does not establish that every provider-metadata step of the owner’s detached release succeeded.

The current certificate page was opened and one existing PDF downloaded. Its darker background was confirmed in the actual PDF, with embedded Cairo/Amiri fonts. This is before/diagnostic evidence, not acceptance of the newly edited design.

## Verification

- 243 content-editor/request tests and 1,332 integration tests pass (1,575 total).
- Coverage includes request ownership, validation, duplicate suppression, no billing writes, refused premature completion, all 19 request-copy languages, cadence composition, safe PDF downloads/legacy URLs, masked card deduplication, default-account approval, restrained email typography and idempotence, and cleanup backup/history/reference failure behavior.
- Specialized editor, communication and release type checks pass. Repository baseline: zero type errors. Lint: 181 pre-existing findings, zero critical, no new findings. Dashboard catalog: 7,692 phrases, zero missing. Standalone metadata import preflight passes without provider calls or database writes.
- Production build compiled, completed TypeScript checking and generated all 153 static pages with dummy credentials and no production database (exit 0).

## Still open

- Visual acceptance of newly generated PDFs and the modified mobile/payment/request interfaces. The cloud browser can use production but cannot reach this workspace's localhost; file-preview navigation is disallowed by browser policy. The local Chromium download also failed. No workaround was used to bypass that policy.
- The comprehensive 115-route manual dashboard matrix remains incomplete. This release must not be described as manually accepted everywhere.
- A3's card-update link requires an authenticated bank-supported card verification/mandate replacement flow. Saving a card in the profile must not silently rebind an existing recurring mandate. No such verification-only bank capability has been demonstrated here; this item is not claimed complete.
- Recurring-page suggested amounts remain the existing fixed presets; project choices follow active dashboard projects. A dedicated recurring-page preset/project selector is not yet implemented. The undefined A3 phrase “معاملة” needs a concrete field/workflow definition.
- The server log supplied by the owner showed the original `479e3997` deployment still running after successful integration tests; duplicate starts were blocked. No `SUCCEEDED` result was provided in that evidence.

Earlier external work and manual gates remain in `manual-dashboard-acceptance-20261029.md`. No production deploy, financial action or outbound donor test was performed from this workspace.
