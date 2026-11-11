# Staging acceptance safety gate — PR #191

**Status:** Code safeguards only. NO production rollout, merge, payment or VPS action.
**Candidate:** integration/qa-pr187-pr188-20261110 (resolve latest full SHA from GitHub).
**Owner approvals required:** Financial reviewer + Security reviewer + GitHub Environment reviewer.

## Why the old E2E was unsafe
The release workflow accepted an E2E_BASE_URL **or** DATABASE_URL and could run after
push to main or manual dispatch. Some E2E tests posted to live WhatsApp template
synchronization and trigger activation endpoints. `npm run build` also creates
MongoDB indexes with `--production`. A green CI build/3 synthetic browser
journeys never proves a connected bank settlement.

## Safety controls in this change
1. Full E2E is MANUAL only, not triggered by pushes or PRs. Select
   `run_staging_e2e = APPROVED_STAGING_ONLY` on a non-main branch.
2. GitHub job requests **staging-acceptance** Environment. An administrator
   MUST configure **required reviewers**, restrict deployment branches to the
   reviewed integration ref, prevent self-approval and prevent bypass. GitHub
   creating an unprotected Environment automatically is NOT acceptance.
3. Environment secrets: `E2E_BASE_URL` (reviewed HTTPS-only Staging hostname),
   `STAGING_ATTESTATION_TOKEN` (unique staging-only bearer token),
   `E2E_STAFF_EMAIL`, `E2E_STAFF_PASSWORD` (synthetic accounts).
   Environment vars (non-secret identifiers only):
   `STAGING_APPROVED_BASE_URL`, `STAGING_APPROVED_SHA`,
   `STAGING_APPROVED_INSTANCE_ID`, `STAGING_APPROVED_DB_IDENTITY_SHA256`.
   The runner does **not** receive `DATABASE_URL` or bank credentials.
4. First runner step calls a password-protected, no-store, read-only
   `GET /api/internal/staging-attestation`. It requires the deployed
   `MINBER_BUILD_SHA` to equal the reviewed commit and confirms a dedicated
   MongoDB host+port+database+user fingerprint distinct from the independently
   reviewed `PRODUCTION_DB_IDENTITY_SHA256` and an authenticated
   **readWrite-on-staging-db-only** role. No credentials, URLs, usernames,
   donor records or connection strings are returned.
5. Runtime Staging identity requires `MINBER_RUNTIME_ROLE=staging`,
   `STAGING_DISABLE_CRON=1`, `STAGING_DISABLE_MESSAGES=1`,
   `STAGING_PAYMENT_MODE=mock`,
   `STAGING_PROVIDER_NETWORK_DISABLED=1`,
   `STAGING_EGRESS_POLICY=deny-external`. Set `STAGING_APPROVED_ROOT`
   to the real, isolated staging worktree, `STAGING_APPROVED_PORT` to
   its non-production port, and `PM2_APP` to the approved staging instance.
   The attestation rejects the live `/root/minberiaksa` directory, port 3000,
   or a different running directory/PM2 instance. These flags are necessary but
   **NOT proof of network isolation**. The reviewer MUST inspect firewall,
   outbound policy, DNS, actual provider secrets stored in MongoDB, and
   proxy routing independently before approving the GitHub Environment.
   All live-provider secret variables must be absent in the generic E2E.
6. Central Cron authorization rejects every request in Staging, even with a
   mistakenly copied `CRON_SECRET`. The monthly-billing legacy route is already
   disabled. The staging crontab must contain no financial jobs.
7. The shared Playwright fixture blocks non-staging browser requests and
   unexpected POST/PUT/PATCH/DELETE, including direct Playwright request calls.
   The only generic mutation is NextAuth credentials sign-in using synthetic
   staff. WhatsApp trigger POST and Meta template-sync POST are intercepted
   and answered by local fixtures. They do not verify the live provider and
   MUST NOT be counted as provider acceptance.
8. `npm run build:staging` verifies SHA, DB identity/role and staging-only
   runtime before generating Prisma or compiling. It never applies indexes.
   Historical production `npm run build` retains its normal production
   behavior, but explicitly refuses to run from staging. A separate reviewed
   action `npm run indexes:staging:apply` requires
   `STAGING_INDEX_CHANGE_APPROVED=1` and verified staging DB identity/role
   before any index creation. Never pass production DB config.
9. Mandatory negative checks in Release gates reject production URLs,
   DATABASE_URL-only execution, mismatched SHA/DB identity, broad Mongo roles,
   external credentials, missing reviewer config and unauthorized index paths.

## VPS reconnaissance — executed ONLY by authorized operator
On the external VPS, first verify the source checkout path without changing it:
```sh
test -f /root/minberiaksa/scripts/qa-staging-capability-readonly.sh
bash /root/minberiaksa/scripts/qa-staging-capability-readonly.sh
test -f /root/minberiaksa/scripts/qa-vps-runtime-readonly.sh && bash /root/minberiaksa/scripts/qa-vps-runtime-readonly.sh
test -f /root/minberiaksa/scripts/qa-vps-db-fingerprint-readonly.mjs && node /root/minberiaksa/scripts/qa-vps-db-fingerprint-readonly.mjs
```
The new script is not on the VPS until explicitly checked out in an isolated
worktree; **do not git pull production to obtain it**. Run it from a reviewed
file transfer to a temporary read-only audit directory if needed. It prints
only sanitized status information: PM2 PID/cwd/interpreter/port, Nginx config
validity, listener ports, Cron entry count, disk/memory. It does not assert
a live build SHA from `git rev-parse HEAD`.

To establish the source SHA **actually served by PM2**, an authorized
dashboard operator must read `/api/admin/build-info` (requires siteContent
permission), record `sourceSha` and compare with `git rev-parse HEAD`,
the PM2 app cwd and the Nginx proxy target. Collect only a scrubbed summary.
The configured fingerprint is non-secret and is compared with the approved
Staging fingerprint; it does not itself prove which MongoDB connection a running
PM2 process holds. Staging approval also requires checking the process and the
database's authenticated scoped roles. Never use `pm2 env`, `cat .env`, SSH output of secrets, live donor data,
`git pull`, `npm run build`, or `pm2 restart` for this audit.

## Staging provisioning checklist (still pending)
- Prefer a dedicated VM if same-VPS isolation/firewall/resources cannot be proven.
- Dedicated deployment root, port, unprivileged OS user, PM2 instance, and
  protected hostname; deny production and donor sessions/cookies.
- MongoDB separate cluster/project or independently restricted account +
  distinct staging database, no live donor copies. Review roles, connection
  host, user, database and fingerprint without disclosing secrets.
- Build exact reviewed SHA and check returned build-info SHA.
- No Cron, campaign/email/WhatsApp queues, live providers, refunds, production
  callbacks, ad conversion sending, or outbound unrestricted network.
- Use fully fabricated people/projects and bank/payment fixture adapters.
- Bank SANDBOX trials are a **separate** gate; require test merchant IDs/cards,
  signed webhook callbacks and explicit finance approval. This generic E2E
  workflow is MOCK-ONLY, not connected bank testing.
- Review GA4/Meta test data-source isolation and enforce fake identities.
- Disposable DB snapshot/reseed procedure, synthetic receipt purge, and
  teardown command. Practice rollback in Staging only.

## Read-only operational evidence request — 11 Nov 2026

**Not executed from ChatGPT**: no SSH/VPS access or GitHub Environment administrator API was available. These are operator-run inspection steps, not authorization to change production. Only return sanitized status and SHA/identity hashes; never paste environment variables, secrets, MongoDB URIs, payment logs or donor details.

1. **PM2 actual process**: from the authorized VPS run the existing `scripts/qa-vps-runtime-readonly.sh` (from reviewed read-only audit directory if not present), record process name/PID/PM2 cwd/script/interpreter/PORT/restart status. Resolve running process cwd via `/proc/<PID>/cwd` with operator-approved permissions; `git rev-parse HEAD` from unrelated directories is insufficient. Cross-check authenticated `/api/admin/build-info` source SHA and build identity with the running process; report mismatches only.
2. **Nginx**: approved operator reviews `nginx -t` and sanitized server_name -> upstream port mapping, including staging vs production TLS hosts and any redirects. Never print private config directives or secrets. Compare `ss -ltn` listener ports with PM2 service ports; require separate service and firewall boundaries.
3. **MongoDB**: independent staging project/cluster or formally isolated tenancy, DB and account; verify user scope through read-only authenticated role inspection, exact host+port, identity fingerprints and clear inequality from production. Do not copy donor data or make write probes. Inspect the effective database connection for the running staging process, not only a dotenv file on disk.
4. **Redis / queues / sessions**: inspect sanitized host/port/database namespace, encryption/session-secret identities (fingerprint only), queue names, workers, dedupe key prefixes and scheduled jobs; compare to production for any shared cache, sessions, locks, subscriptions or payment jobs. Shared Redis or queues blocks approval even when MongoDB is separate.
5. **Cron and messaging**: inspect `crontab -l`, system timers, PM2 workers and app schedulers without printing tokens; prove no staging renewal/receipt/email/WhatsApp events can reach live recipients. Confirm outgoing-deny **at network/firewall layer** rather than trusting `STAGING_EGRESS_POLICY` alone.
6. **GitHub Environment**: repository administrator verifies `staging-acceptance` exists, Required Reviewers include an independent approver, self-approval/bypass are disabled, branch allowlist matches exact reviewed staging ref, environment secrets are isolated and the attested SHA matches deployed build. Screenshots of non-secret controls are sufficient.
7. **Acceptance evidence**: record date, approved reviewer, redacted command outputs, process↔port↔proxy↔build-SHA correspondence, database and Redis fingerprint comparisons, negative network egress tests in an isolated service, and independent finance/security signatures.

**Mandatory outcome:** any missing evidence yields `STAGING_NOT_VERIFIED`. This PR is QA ONLY and must never be merged as a production release.

## Acceptance matrix — separate evidence required
| Domain | Required proof |
| --- | --- |
| UI | Chromium desktop/mobile, ar/tr/en/fr, multiple projects, cart, currencies |
| API | test user auth, create/retry flows, 401/403, no real provider requests |
| MongoDB | raw ledger/PAID/FAILED/paidAt/counters/exports unchanged when recovery marker changes |
| Payment gateway | authorized TEST 2D/3DS approvals/declines/delays/replay with provider references |
| Webhooks | signed test payloads, replay/duplicate/out-of-order and failure controls |
| Recurring | daily, Friday, monthly renewal and mixed cart single capture + split rows |
| Meta CAPI | test Events Manager, token redaction, UTM/click IDs, Purchase after paidAt, dedup |
| Permissions | staff/donor/guest isolation and receipt token access |

**Release decision:** NO-GO until Staging isolation, full E2E, sandbox payments,
ledger reconciliation, and independent finance/security signoffs are supplied.
PR #191 stays Draft. Never run a payment/cron/write probe against Production.
