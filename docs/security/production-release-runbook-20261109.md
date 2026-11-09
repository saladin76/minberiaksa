# Donation security production release runbook — 2026-11-09

**STATUS: HOLD / DO NOT PROMOTE.** This is an operator checklist, not evidence of a release.

## Deployment environment
External VPS (SSH + PM2); deployment directory /root/minberiaksa; process minberiaksa

## Go/no-go gates
- All expected CI jobs pass on the exact release SHA (including full existing integration suite, TypeScript and production build). No cancelled, skipped-critical or unexamined test failures.
- Run the isolated Prisma Mongo CAS/TTL test with an intentionally dedicated `security_qa_*` database: `DONATION_SECURITY_QA_ALLOW_WRITE=YES node --import tsx scripts/security/verify-mongo-fraud-atomicity.ts` (using ONLY a dedicated QA DATABASE_URL).
- Verify the payment provider's actual SANDBOX credentials / test mode. Never simulate charge attempts against live Stripe, Albaraka or PayFor.
- Test verified one-time 2D/3D payment, FAILED, PENDING/unknown, charge retries, signed callback idempotency and both daily/Friday/monthly subscription renewals.
- Confirm a returning donor exemption only if authenticated + prior PAID and paidAt. Guest impersonating an old donor and spoofed network headers remain subject to fraud restrictions.
- Test emergency dashboard ON/OFF and infrastructure `EMERGENCY_MAINTENANCE_FORCE=true`: public requests 503; administrator recovery and signed provider callbacks continue functioning.
- Prepare institution-specific backup, **restore test**, revert commit SHA and PM2/Vercel rollback instructions.
- Do NOT enable `DONATION_ABUSE_GUARD_ENABLED=true` until all checks above pass and a limited monitored rollout is explicitly approved.

## Deployment activation
- Verify exact production commit and account/shell before making any changes.
- Snapshot the live build, environment metadata (NEVER log secret values), and database backup. Preserve existing PM2 processes and cron settings.
- Check production ingress rewrites trusted IP headers; the client must not be able to set the effective security IP.
- Deploy only the reviewed SHA using existing institution-specific deploy process.
- Perform read-only health checks, then synthetic provider sandbox check (never charge a real card).
- Verify success, error, pending, callback, 2D/3D, new and recurring donations; watch 429, 423, 503 and bank-decline rates.
- On any regression, set abuse guard flag OFF first and roll back only the deployed app code, respecting pending signed webhooks and in-flight bank requests. Do not replay uncertain captures.

## Known limitations
- The payment-test Stripe connection available to the operator must be in test mode; currently only a **live-mode** Stripe account has been observed in the connected app.
- Feature branch CI green does not replace sandbox webhook tests or actual Mongo Prisma command integration checks.
- Do not copy donor data, payment credentials or charity databases between institutions.
