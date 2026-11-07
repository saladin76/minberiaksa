# Checkout payment-result recovery

The reported four 1 TRY donations were recorded as successful while checkout displayed a generic technical error. The supplied terminal log proves the preceding 1bab47a release succeeded; it does not contain a request exception or browser network trace proving the exact production exception. Reproduced client failure paths include a www/apex result-URL mismatch and browser storage throwing after payment.

## Changes

- Result navigation accepts only the current origin or its matching www/apex alias, matching protocol/port and approved result paths. Credentials, other sites, arbitrary local API routes and protocol changes remain rejected. Navigation uses the current browser origin, retaining its session.
- Cart-storage errors cannot prevent the result handoff. The checkout holds a synchronous submission lock before any await.
- Once an Albaraka initiation starts, network errors, 5xx replies and the specific already-processing response lead to the existing order's read-only result. Card-validation/permission/rate-limit errors remain editable. No recovery sends another Sale.
- A read-only result watcher checks the same donation while initiation is pending and on the processing page. Only persisted paidAt or FAILED permits navigation; a PAID status without paidAt remains processing. It polls at 2.5-second intervals after each response, at most 40 times, with an 8-second read timeout and cancellation on unmount. Initiation itself has a 90-second client deadline and then resolves the same order.
- JSON result checks require the guest token or the owning session, return only paid/failed/processing, and are private/no-store. They perform no gateway call, reconciliation, write or notification.
- TRY-to-TRY and USD-to-USD collection skip unnecessary exchange-rate reads. Actual cross-currency conversion is unchanged. An immediate processing spinner makes the pending button state visible.

## Validation

144 focused tests passed across handoff, cart/order grouping, Albaraka initiation/callback, payment settlement, daily/Friday/monthly schedules and legacy recurring billing. New cases cover www/apex handoff, rejected destinations, cart-storage failure after capture, lost/server-error replies, authenticated read-only status, polling through pending to confirmed success, and no FX read for a 4 TRY checkout. Strict TypeScript checking passes for the handoff helper and its tests. Changed-file unused-variable/no-explicit-any and React hook lint passes.

Local provider calls are synthetic. No real donor payment, refund, database mutation or message was performed. The exact production browser exception and bank response duration still need production request evidence. The full Next build and a post-release authenticated checkout verification remain server release checks; bank response time is not promised to disappear.
