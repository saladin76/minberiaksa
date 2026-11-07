# Explain blocked subscription reductions before confirmation

Base: deployed `e5407e9435b66d26ad94c97ade327971029e811d`.

Opening a reduction previously allowed confirmation even when the plan was already in the protected billing window or retry ladder. The PATCH correctly refused the change, but its raw English response appeared in the Arabic dashboard. This did not apply the donor's requested reduction.

The list and mutation endpoints now share a read-only eligibility projection. It distinguishes a missing schedule, a due/near charge, failed collection attempts awaiting resolution, an active billing lease and an earlier change awaiting reconciliation. The projection includes the recorded charge date, retry count and check time, without exposing lock tokens. Subscription reads are private and uncached.

The dialog reads the exact donor and subscription again when opened or explicitly refreshed. Confirmation remains disabled while checking, on read failure or while blocked. The reason and recorded date appear inside the dialog in Arabic, English or Turkish. If the billing state changes after the read, the PATCH still refuses safely; the dialog preserves the donor request, amount and reference, shows a localized error and requires a refresh before another attempt. Unknown server prose is not displayed as user instructions.

The existing 24-hour window, retry ladder, provider reconciliation and atomic billing/repricing lock remain in effect. This release does not queue a reduction automatically, alter a donation request's status, change a billing date, capture a payment or retry a failed charge.

## Verification

- 372 content/route tests, including the actual reduction endpoint rejecting each blocked state before currency conversion or any write; the stored request and plan amount remain unchanged.
- 1502 integration tests, including the exact 24-hour boundary, expired/active leases, legacy optional fields and unchanged inputs.
- 199 browser checks on the actual management page in Arabic, English and Turkish at 390 and 1440 pixels, including stale table data, all blocking reasons, read failure/recovery and a server-side 409 after a successful preflight.
- TypeScript: zero errors. Dashboard translation extraction: zero missing entries.
- Synthetic browser data and HTTP adapters only; no live financial mutation or recipient message.

Production acceptance requires publishing this follow-up. The underlying bank decline remains a separate operational item; this change makes the protected state visible and actionable without bypassing it.
