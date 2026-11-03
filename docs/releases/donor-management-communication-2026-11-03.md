# Donor management and communication review — 3 November 2026

## Result

- `/dashboard/subscription-requests` is a separate permission-gated workspace. The sidebar counts NEW and IN_PROGRESS requests, highlights pending work, refreshes every minute and on focus/local updates, and retains the last confirmed count during outages. The recurring dashboard links to this queue; existing request-to-plan consent and revision checks remain enforced.
- Recurring readiness is closed by default. Its summary shows scheduled and due charges plus a visible review flag for incomplete evidence or a non-recent scheduler; provider and 30-day renewal evidence expand on demand. No billing policy or Saudi routing rule changes.
- Both campaign creation paths clearly label the internal name as required, associate the label and explanation with the input, and retain the existing progression/server guards.
- Donors have a Payment cards profile section in all 19 locales. It lists masked owned cards, edits nicknames, changes the default for new donations, adds a replacement card, and removes unused cards with explicit confirmation. A default change never reprices, reschedules or replaces a subscription card.
- Existing Albaraka subscription replacement still requires the donor-owned 3DS authentication flow. No capture is initiated by that flow. Other providers are not silently switched to Albaraka. The result is read from the server, never trusted from a success URL alone.
- Card metadata edits return only explicitly selected safe fields. Card deletion is transactional and blocked for any linked subscription or pending bank verification. CVV is never persisted or returned; no stored PAN or encrypted PAN is returned by metadata edits.
- Outbound WhatsApp text/templates/media, email and SMS reject malformed destinations before provider access. Phone validation checks the country numbering plan and exact canonical identity, so an embedded trunk prefix is rejected rather than guessed into another destination. Historical inbox matching keys remain unchanged.
- Explicit email errors cannot become success merely from HTTP 200. Definite Elastic Email rejection/auth/rate-limit errors are distinguished from transport uncertainty; unknown delivery outcomes remain held.
- The release runner fetches and verifies an absent exact commit under its existing release lock before reading the wrapper. A failed fetch does not activate the runtime.

## Verification

- Integration-settings suite: 1,776 passed.
- Content-editor/operational suite: 444 passed, including 14 isolated release-runner scenarios.
- Donor-management browser fixtures: 378 checks, 19 locales, phone/desktop, including card edits/default/removal protection, adding cards, cleared CVV, failed reads, collapsed health and request queues.
- Existing project/profile/request browser fixtures: 207 checks.
- Existing subscription-card verification browser fixtures: 54 checks.
- Full TypeScript: zero errors. ESLint ratchet: no new findings or critical errors.
- Production compilation/static generation completed with synthetic configuration; no production database access, index writes, financial operations or recipient messages.

## Live evidence and remaining external gates

Read-only inspection of the current WhatsApp dashboard on 3 November showed 25 of 29 local template groups ready, 417 synchronized language variants across 25 groups, some language versions not synchronized, and 13 provider templates without a local counterpart. The dashboard also contains genuine Meta 131026 delivery failures. These are not converted into successful delivery or a fabricated 100% readiness score.

The code fixtures prove local behavior. Completion still requires deployment, reconciliation of the four template groups/language mapping against current Meta approval, and a deliberately selected recipient test with acceptance plus delivery receipts. Existing queued/failed messages were not resent by this review. No automatic bulk retry or donor charge was performed.

## Deploy

Fetch and verify the full reviewed SHA before invoking the reviewed release runner, including when bootstrapping from an older production checkout. Use `start --wait`; only `SUCCEEDED` with runtime activation is deployment evidence. This change has no Prisma schema migration. Do not run a database reset or modify payment routing.
