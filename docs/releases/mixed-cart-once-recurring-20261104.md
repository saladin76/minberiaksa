# One-time and recurring gifts in one checkout

The Minbar basket accepts one-time rows alongside a daily, Friday or monthly plan. The first payment includes every row. The subscription stores only the recurring campaign/category lines and their server-converted principal; later charges use that subscription principal, its recurring team support and its own fees. One-time waqf certificate lines remain on the initial donation.

Example without extra support/fees: a 10 USD one-time gift plus a 5 USD monthly gift produces one initial payment of 15 USD and a monthly plan for 5 USD. Each project's initial allocation remains on the paid donation. One-time rows are absent from the subscription's later allocation list.

Line-frequency metadata is serialized in campaign/category/waqf order rather than visual basket order, validated before any order writes, and preserved on the initial donation attribution. Legacy homogeneous API clients keep their existing behavior when metadata is absent. Different recurring cadences still require separate checkouts; a bank transfer cannot authorize recurring collection.

Stripe Elements already separates the signup invoice amount from its recurring price. Hosted Stripe Checkout now uses a recurring line and an optional first-invoice-only line. Albaraka and PayPal continue to read the full initial amount from the donation and later amounts from the subscription. Existing plans and paid donations are not migrated.

Cart and checkout show a localized notice that the full basket is charged today and only periodic gifts renew. No payment provider configuration or live charge was executed.

Validation: 13 focused tests execute the actual order route with synthetic persistence/provider mocks, including all three cadences, campaign/category isolation, one-time waqf, currency conversion, support/fees, metadata rejection, legacy behavior, serialized line ordering, Stripe signup/hosted pricing and PayPal plan creation. Together with the existing schedule contract suite, 33 tests passed. The new dependency-free helpers passed a focused TypeScript check. Edited files passed ESLint with zero errors and the pre-existing checkout image warning. Full repository build/release gates and live end-to-end payment acceptance remain required.
