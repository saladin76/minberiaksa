# Donation experience follow-up

This release builds on reviewed recurring source e1aaa3618f6cf07b5bff33db2bb068f4c73f30a2. The owner's production acceptance log confirms three additional Albaraka collections for each of DAILY, FRIDAY and MONTHLY, with every original-sale inquiry returning 0000. Each selected test plan ended PAUSED, with the original normal billing date preserved and its rehearsal lock released. Private donor, plan and payment identifiers remain outside the repository. These accelerated cycles establish acceptance of the recurring worker; ordinary calendar-based scheduler execution still requires observation at its natural due date.

## Changes

- Donation lists, gateway details and donor history show a safe financial summary: full/partial refund, bank void, returned amount and remaining refundable amount. Original payment status, gross revenue and original receipts remain immutable. Pending or contradictory adjustments show a review state. Private ledger, staff reasons, bank references and locks are never serialized by these summaries. Financial changes refresh visible dashboard lists.
- Friday cadence is “تبرع كل جمعة”. Daily and Friday rows cannot use the monthly shortcut. A cart containing different cadences requires separate checkouts, with matching client and order validation before order creation. This prevents the first row's cadence from silently applying to every item.
- Sources show platform/channel, campaign and captured details. Missing historical evidence is explicitly unknown. Native click aliases and contradictory signals are handled consistently; a Meta click alone does not certify paid traffic. A new campaign/native touch clears stale campaign identifiers, updates matching Meta click cookies and retains original landing history. Unresolved revenue remains in total settled revenue, separately from advertising and proven non-ad revenue.
- New renewals inherit the original signup's business acquisition details, labelled as historical signup acquisition. They never copy old click identifiers, IP, user-agent or browser identity. A click-only signup can retain its historical platform/kind without fabricating a new click. Optional source lookup failures cannot block collection. There is no database-wide attribution rewrite or invented reconstruction of unavailable historical data.
- Recurring and main dashboard feeds include signups and all attempt outcomes. Normal renewal numbers count settled ordinary payments; failures do not advance them. Accelerated rehearsal cycles have a separate test label/number. Latest first pages refresh every 30 seconds while visible and on focus, without resetting older pages.
- The two supplied original transparent bank PNGs are used in tables and gateway details.
- `/dashboard/notifications` and the top-bar bell show public-site donor/payment/subscription activity, with account-specific read markers and stable pagination. Explicit SITE origins and real provider-payment records exclude TEAM dashboard activity and accelerated test payments. `/dashboard/logs` remains the staff activity page. Polling is read-only; marking read writes only the actor's internal TEAM marker. Permission checks precede database access.
- Categories and active major pages share dynamic project navigation and the existing revision-protected ordering interface. New entries appear automatically; major pages use their localized public page links. Saved ordering and legacy identity aliases are retained. Unpublished CMS pages do not leave fabricated navigation entries.

Saudi routing, Albaraka's default 2D/optional one-time 3D, payment amounts and normal recurring schedules are unchanged. No new live capture, refund, void, resumed test subscription or donor message was initiated by this implementation. PayFor management operations still require the bank-confirmed API URL and format; absent configuration remains a blocker, not a guessed endpoint.

## Verification

- 438 content/API/CLI tests and 1,538 integration tests pass using synthetic provider/database boundaries.
- Whole-repository TypeScript reports zero errors. Targeted communication, integration-release and content-editor typechecks pass.
- Dashboard translation compilation/check: 8,116 phrases, zero missing translations. Public i18n and locale strict audits pass.
- The dedicated browser fixture passes 30 checks in AR/EN/TR at 390 and 1440 pixels, covering disabled cadence toggles, mixed-cart checkout, financial states/logos and notification pagination/read state. Screenshots were visually reviewed. Provider calls and production writes: zero.
- Existing lint ratchet is enforced; no baseline increases are accepted. The new browser group is included in release gates.

The production build's existing index installer adds three nonunique lookup indexes for notification dates/read markers. It does not drop indexes or alter donation data. No Prisma schema migration or credential change is required.

Deploy only the exact reviewed full commit through the existing VPS release runner/wrapper after its release gates pass. A successful build is not proof that this follow-up is active on production. The paused test plans must remain paused unless the owner independently resumes them.
