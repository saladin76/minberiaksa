# Donation protection: release and security verification matrix

Status: DRAFT / UNVERIFIED — not deployed. The presence of code or test files is not test evidence.

## Before running tests
- Confirm current production commit, current integration branch, open PRs and all competing edits.
- Never fetch or write donor PII into another institution, share credentials, copy databases or test real cards.
- Confirm Node.js 24, Prisma/Mongo production permissions, required indices and trusted proxy IP source.
- Confirm exact site public origin used by same-origin administrative POST requests.
- Prepare and validate the shared TTL index **before** enabling the fraud limit: `node --import tsx scripts/security/ensure-donation-protection-indexes.ts`. Verify the index exists and that only counter documents expire; do not run this on another institution's database.
- Qurat Al-Uyun: verify Vercel controlled `x-vercel-forwarded-for` is available and maps to the actual requester; client-controlled `x-real-ip` must not take precedence.
- Never add the feature flag to production until the verified-failure connectors and first-payment/renewal/rollback checks are approved.
- Keep `DONATION_ABUSE_GUARD_ENABLED` absent/false until staged checks pass.
- New site-maintenance state defaults to OFF; do not enable on production during tests.

## Automated checks required
- [ ] `npm ci` and Prisma generation
- [ ] `node --import tsx --test tests/integration-settings/donation-abuse-policy.test.ts tests/integration-settings/payment-initiation-budget.test.ts tests/integration-settings/emergency-maintenance-contract.test.ts`
- [ ] Full existing test suites and relevant TypeScript checks
- [ ] Real Next.js production build and server startup
- [ ] MongoDB atomic `findAndModify` feature tests with concurrency and revision conflicts
- [ ] Repeated webhook delivery is idempotent; no duplicate decline.
- [ ] Pending / timeout / unknown / server error do NOT count as confirmed bank declines.
- [ ] Four verified failures cause five-minute cooldown; three later confirmed failures cause manual block.
- [ ] Release only by authenticated administrator, matching revision, explicit reason and same origin.
- [ ] Read-only security GET cannot expose full IP, card, PAN, CVC, email or provider secrets.
- [ ] Feature flag OFF means no restriction on normal payment routes.

## Sandbox payment flow matrix
- [ ] Normal guest and registered donor one-time payments
- [ ] Albaraka 2D/3D and PayFor bank forms if enabled at this institution
- [ ] Stripe PaymentIntent/Checkout/Subscription if enabled
- [ ] PayPal only if configured, including delayed provider callbacks
- [ ] Mixed cart, currencies, team support, waqf and recurring first payment
- [ ] Scheduled daily/Friday/monthly renewal never blocked by visitor attempt limits
- [ ] Callback and signed webhook remain available in emergency maintenance
- [ ] Payment already paid is never recharged as retry
- [ ] Failed and pending payments do not become PAID from security callbacks
- [ ] Anonymous retry cannot clone another donor's payment
- [ ] Public pages and new-payment APIs return 503 + no-store when maintenance enabled
- [ ] Admin login/dashboard/maintenance-toggle remain reachable while maintenance enabled
- [ ] Site reopens promptly when OFF, including cross-instance cache expiry
- [ ] Origin/CSRF rejection, revision races and network/database failures are visible

## Production activation
1. Never merge alongside unrelated open payment PRs without reviewing changed-file intersections.
2. Verify non-production deployment then merge only the reviewed SHA.
3. Inspect first 30 minutes of payment success rate, declines, 429/423/503, conversions and webhook reliability.
4. Turn flag ON only after trusted-IP behavior and Mongo counter load are measured.
5. Confirm manual OFF/recovery from maintenance through browser and backup operator.
6. Maintain explicit rollback SHA, and do not replay uncertain bank charges.

## Known remaining blockers
- No provider-confirmed failure integration across all payment rails yet.
- No end-to-end browser test, CI pass, production deploy or real provider confirmation has been observed in this chat.
- Site maintenance state is stored in database and fails open if the read layer is unavailable; infrastructure-level incident isolation requires separate hosting controls.
