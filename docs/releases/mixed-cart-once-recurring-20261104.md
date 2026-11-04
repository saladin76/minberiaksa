# One-time and recurring gifts in one checkout

The Minbar basket accepts one-time rows alongside a daily, Friday or monthly plan. The first payment includes every row. The subscription stores only the recurring campaign/category lines and their server-converted principal; later charges use that subscription principal, its recurring team support and its own fees. One-time waqf certificate lines remain on the initial donation.

Example without extra support/fees: a 10 USD one-time gift plus a 5 USD monthly gift produces one initial payment of 15 USD and a monthly plan for 5 USD. Each project's initial allocation remains on the paid donation. One-time rows are absent from the subscription's later allocation list.

Line-frequency metadata is serialized in campaign/category/waqf order rather than visual basket order, validated before any order writes, and preserved on the initial donation attribution. Legacy homogeneous API clients keep their existing behavior when metadata is absent. Different recurring cadences still require separate checkouts; a bank transfer cannot authorize recurring collection.

Stripe Elements already separates the signup invoice amount from its recurring price. Hosted Stripe Checkout now uses a recurring line and an optional first-invoice-only line. Albaraka and PayPal continue to read the full initial amount from the donation and later amounts from the subscription. Existing plans and paid donations are not migrated.

Cart and checkout show a localized notice that the full basket is charged today and only periodic gifts renew. No payment provider configuration or live charge was executed.

Validation: 13 focused tests execute the actual order route with synthetic persistence/provider mocks, including all three cadences, campaign/category isolation, one-time waqf, currency conversion, support/fees, metadata rejection, legacy behavior, serialized line ordering, Stripe signup/hosted pricing and PayPal plan creation. Together with the existing schedule contract suite, 33 tests passed. The new dependency-free helpers passed a focused TypeScript check. Edited files passed ESLint with zero errors and the pre-existing checkout image warning. Full repository build/release gates and live end-to-end payment acceptance remain required.

## Mixed Albaraka verification and profile presentation

Mixed recurring-plus-once initial payments now require 3D authentication of the full first amount, including TRY. The server derives this from the server-written recurring/one-time principal snapshot and ignores a client request to downgrade to 2D. The future billing plan retains only its recurring amount and uses the existing 2D renewal path. Recurring-only signup keeps its current 2D mode. Missing 3D configuration stops a mixed attempt before a claim, card write or bank request.

The recurring card is linked (or encrypted without a stored CVC) before returning the 3D form. No Sale is sent until the signed bank callback passes its existing linkage and authentication checks. Callback settlement already activates recurring plans; replay, decline and uncertain-capture behavior remain covered. These are synthetic tests, not proof of bank acceptance of a live 3D signup followed by a 2D renewal.

The account donation history now spans the available content width, with stable amount placement and a separate document-action row. Long project names no longer squeeze receipt/certificate controls. Profile details and recurring-plan management follow the history in a responsive grid. Charged currencies and document URLs remain unchanged.

Public category chips use localized short labels in the requested order: all, Gaza, Al-Aqsa Mosque, Jerusalem, Zakat, Waqf, restoration, recurring. The Ibadan programme chip is omitted from this public row; its programme, direct route and historical hash registry remain available. CMS records and their saved ordering are not overwritten.

Current validation: 58 schedule, mixed checkout, Albaraka authentication/callback, filter-order and verification-mode tests passed. Focused typechecks passed for the new mode/filter helpers. Edited files passed ESLint with zero errors and two existing image warnings. A server render exercised Arabic long donation titles, both document controls and the original charged currency. Full release gates, responsive browser review and live bank acceptance remain required; the previous GitHub run failed before assigning runners or executing job steps.
