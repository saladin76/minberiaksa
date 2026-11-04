# Unified donor login and account invitations

Email codes, verified WhatsApp numbers and verified Google emails resolve to one donor account. The linked methods panel supports multiple emails and a verified primary email. Codes expire after ten minutes, allow five attempts, are hashed with the authentication secret and are consumed atomically. A successfully delivered replacement invalidates earlier codes in the same scope. Resend throttles are durable database counters.

Editable checkout phone numbers are contact data, not verified sign-in factors. An established account with an unverified phone must first sign in through email or Google and verify its phone in the account panel. The service does not infer mailbox ownership from a shared phone. Additional mailboxes must each be verified.

When an authenticated donor proves another account's verified sign-in address, the donor records are consolidated transactionally. Guest records matching a newly verified phone can also be consolidated. Financial values, statuses, schedules and provider references are retained; only ownership references change. Retired source records preserve their original contacts for administrative traceability, are hidden from active user lists and cannot retain sessions or credentials. Privileged/closed accounts and accounts currently billing or verifying a card cannot be merged. No payment provider is called by linking. Source communication profiles are stopped to avoid duplicate sends.

Administrators can send or resend an account invitation from the donor profile. A guest becomes a registered member only after verification. Existing accounts are reused. The invitation panel separates accepted, delivered, expired, failed and activated states. WhatsApp recipients use the existing-code option with their international number; email invitations also include the challenge-bound sign-in page. Invitation attempts are audited.

Authentication messages use the configured Elastic Email and default Meta sender. Message archives contain a redacted placeholder, never the code or sign-in URL. Only a provider message ID establishes SENT. Existing signed webhooks establish DELIVERED/READ; provider acceptance alone does not prove arrival.

## Deployment

The build generates Prisma clients and installs the new account-identity lookup and expiry indexes through the existing index setup. The identities and challenges use string `_id` uniqueness; no bulk account migration is performed.

The release metadata step `donor-login-template` prepares `mia_donor_login_v1` in Arabic when metadata publishing is enabled. `DONOR_LOGIN_WHATSAPP_TEMPLATE` and `DONOR_LOGIN_WHATSAPP_LANGUAGE` optionally select another AUTHENTICATION copy-code template. The runtime refuses unapproved or differently categorized templates. Meta approval must be checked on the actual default WABA before live acceptance.

Explicit preparation command, if needed after deployment:

```bash
node --conditions=react-server --import tsx scripts/prepare-donor-login-whatsapp.mjs --apply --publish
```

This command creates/reads provider template metadata and sends no recipient messages. PENDING is not APPROVED. A real recipient code and corresponding authenticated session, followed by a DELIVERED/READ webhook, are required for live acceptance. No live recipient has been selected in this work session.

## Validation

Focused TypeScript, Prisma schema validation and ESLint pass. Twelve authentication service/delivery/boundary tests cover code replay, expiration, attempts, contact throttling, linking, privileged accounts, in-flight billing, invitation activation and redacted message records. Four existing registration/profile regressions pass. Browser fixtures exercised the Arabic mobile code flow, linked addresses and invitation states, plus English rendering, with no mobile overflow or browser exceptions. These tests use synthetic data and mocked provider responses; they do not prove live delivery or production database behavior. Full repository release gates and live acceptance remain required before production approval.
