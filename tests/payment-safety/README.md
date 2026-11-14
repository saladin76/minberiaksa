# Payment safety acceptance fixtures

Run the selected synthetic regression tests with:

```sh
npm ci --ignore-scripts
npx prisma generate
npm run test:payment-safety
```

`npm run test:payment-safety` compiles the existing integration-test TypeScript
fixtures and runs them alongside the matching content-editor fixtures. The
fixtures cover mixed once/recurring records and Albaraka 2D/3D routing; initial
versus renewal charges, daily/Friday/monthly scheduling, time zones, retries,
leases and overlapping cron runs; confirmed-only Donate/Purchase events;
settlement/reconciliation and pending/failed outcomes; and donor summary
filtering. All database and provider calls are synthetic mocks. The command
does not create reports or persist fixture donor data; test output is TAP on
stdout, and generated clients/build output are ignored.

## Proven scope gap

`lib/minbar/account.ts` returns an `activeSubscriptions` count filtered to
`status: "ACTIVE"`; it does not expose separate canceled or failed subscription
counts. The profile suite can verify the active count and lifecycle
classification, but separate donor-profile status totals cannot be accepted
against an API that does not return them. A follow-up product/API change would
need to add the explicit counts to `MinbarAccountSummary`, then test the query
and profile display. That production change is outside this test-only scope.

## Blocked checks

Live Albaraka/Stripe/PayPal sandbox calls, real-card testing, provider logs,
production-database inspection or writes, refunds, and deployment checks are
**BLOCKED**. They require credentials or release-owner authorization and are
not part of this fixture command. No provider request, money movement, or
production access is attempted.
