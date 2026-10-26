# Donation dashboard summary and payment evidence

The home dashboard has five fixed-period measures and a neighboring average: today's confirmed gross revenue, this month's confirmed gross revenue, this month's team support, this month's approved/imported incoming bank transfers, this month's failed donation attempts, and the average confirmed gross donation this month. Each measure includes its count where applicable. The previous all-time summary band and duplicate top cards are removed.

## Definitions

- Calendar boundaries use Europe/Istanbul. Confirmed donation revenue uses `status=PAID` and `paidAt`; failed attempts use `status=FAILED`, no `paidAt`, and `createdAt`.
- Gross donation totals include team support. Support is shown separately as its share of the stored USD total; it is not added to revenue again. Missing historical conversion data displays an unavailable value rather than a guessed conversion. Counts remain available.
- Bank transfers use statement `transactionDate`, incoming direction, and APPROVED/IMPORTED status. This is a separate measure and is not added to online donation revenue. Existing all-time API callers retain their period behavior.
- The average divides this month's confirmed gross USD amount by its confirmed donation count. It is unavailable if conversion evidence is incomplete.
- The refresh control reloads the summary, chart and donation table without clearing filters.

## Donation review

Referral and acquisition source share a single table column. The final eye action opens donor and project details, gross amount, team support, stored locale/country/device/IP where available, and the existing gateway inspection view.

Payment badges show 2D/3D only from stored evidence. PayFor is 3D; Albaraka renewal transactions are 2D. Historical Albaraka checkouts without a stored mode remain unknown. Renewal transaction evidence also prevents a failed renewal from being labelled a first subscription payment. Nested Albaraka sale response codes can be displayed when the legacy top-level code is absent. No historical rows are rewritten.

The legacy donation popup now allows submission with incomplete fields so it can show a localized error, focus the first invalid field and announce it accessibly. Validation occurs before profile, donation or provider requests. Existing payment selection, request payloads and gateway navigation remain unchanged.

## Diagnostics and verification boundaries

The standalone payment audit reports mode, aggregate response codes and their first/last occurrence. It compares current environment configuration roles using source names and boolean equality only; it prints no terminal, key, card, donor or order identifiers. Environment presence is not proof of bank permissions or the running process environment. Diagnostics never charge, reconcile or send donor messages.

Regression coverage includes summary authorization/pagination, timestamp and conversion boundaries, evidence-based mode labels, nested response codes, and popup validation. Browser fixtures use the actual client components with synthetic API/auth/settings boundaries in Arabic, English and Turkish at mobile and desktop widths. Provider navigation is intercepted. Production payment acceptance and delivery of donor messages require separate production verification after the combined release.
