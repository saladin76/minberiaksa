# Integration Settings Production Launch Runbook

This runbook is the controlled release procedure for encrypted Integration Settings and the active Meta WhatsApp, Brevo Email/SMS, and Netgsm runtime. Do not place credentials, webhook tokens, encryption keys, or token-bearing URLs in GitHub, documentation, build logs, tickets, or chat.

## Final Vercel variables

Always required:

- `DATABASE_URL`
- `INTEGRATION_SETTINGS_ENCRYPTION_KEY`
- `CRON_SECRET`
- one canonical application URL used by the deployed system, preferably the existing `NEXTAUTH_URL`; `APP_URL`, `NEXT_PUBLIC_APP_URL`, and `NEXT_PUBLIC_SITE_URL` are accepted only when they intentionally resolve to the same origin

Optional infrastructure variables:

- `BREVO_SMS_DEFAULT_TYPE`
- `NETGSM_SMS_ENDPOINT`

Optional legacy credential fallbacks, used only when the corresponding approved database field is absent or the integration database is completely unavailable:

Meta:

- `META_WHATSAPP_ACCESS_TOKEN`
- `META_WHATSAPP_APP_SECRET`
- `META_WHATSAPP_WEBHOOK_VERIFY_TOKEN`
- `META_WHATSAPP_BUSINESS_ACCOUNT_ID`
- `META_WHATSAPP_PHONE_NUMBER_ID`
- `META_GRAPH_VERSION`

Brevo:

- `BREVO_API_KEY`
- `BREVO_EMAIL_SENDER_NAME`
- `BREVO_EMAIL_SENDER_EMAIL`
- `BREVO_SMS_SENDER`
- `BREVO_SMS_WEBHOOK_SECRET`

Netgsm:

- `NETGSM_USERCODE`
- `NETGSM_PASSWORD`
- `NETGSM_HEADER`

Provider fallback variables are not required after approved values are active in the dashboard. `WHATSAPP_LEGACY_TWILIO_ENABLED`, `TWILIO_LEGACY_ENABLED`, `SENDGRID_FALLBACK_ENABLED`, and `EMAIL_SENDGRID_ENABLED` must not be enabled. Twilio and SendGrid are not active providers and must never be reintroduced as an emergency fallback.

## Encryption key creation and custody

Generate the key once in a secure local terminal, then copy it directly into the Vercel secret field without putting the output in shell history, chat, a ticket, or source control. A safe Node.js command is:

```bash
node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('base64url'))"
```

Create the key once and store a protected recovery copy outside the project. Losing it makes stored encrypted settings unrecoverable. Replacing it directly makes existing ciphertext unreadable. Future rotation requires a separate controlled decrypt-and-re-encrypt operation; changing the Vercel value is not a rotation procedure.

## Phase A — before merge

1. Add `INTEGRATION_SETTINGS_ENCRYPTION_KEY` to Vercel Preview and Production without exposing its value.
2. Confirm the existing `CRON_SECRET`; do not rotate or replace it during this release.
3. Confirm `DATABASE_URL` and the canonical HTTPS production origin.
4. Redeploy the Preview.
5. Run `npm run preflight:integration-settings` against Preview or another safe environment with read access to the intended database.
6. Run `npm run verify:integration-settings-migration` to record the current migration state.
7. Run `npm run test:integration-settings`, `npm run typecheck:communication-runtime`, and `npm run build`.
8. Confirm the Vercel Preview is READY and review the PR-wide diff against the latest `main`.
9. Stop on every `BLOCKED`. Review every `WARNING`; an empty pre-migration collection and read-only uncertainty about transaction support are expected warnings when applicable.

## Phase B — merge

1. Confirm the PR merge base is the current `main` and `behind_by` is zero.
2. Mark the PR Ready for Review only after all release gates pass.
3. Use Squash Merge if repository policy permits, because the development branch contains many incremental commits.
4. Save the resulting merge SHA in the release record.
5. Wait until the Production deployment is READY.
6. Do not enter provider credentials before the migration completes and verifies successfully.

## Phase C — migration

1. Run `npm run verify:integration-settings-migration` before migration.
2. Create a database backup or provider snapshot according to the current MongoDB hosting plan.
3. Confirm there are no duplicate `provider + key` groups and no conflicting index definitions.
4. Run `npm run migrate:integration-settings` once with the Production `DATABASE_URL`.
5. Run `npm run verify:integration-settings-migration` again.
6. Confirm the unique `provider + key` index and every supporting index are present with the expected definitions.
7. Do not continue on `BLOCKED`, partial migration, duplicate keys, or an index definition conflict.

The migration is idempotent: it checks existing indexes and creates only missing expected indexes. It never deletes documents, collections, unknown indexes, donations, users, messages, or delivery records.

## MongoDB transaction readiness

Provider candidate activation uses an atomic MongoDB transaction. The read-only preflight checks whether the server advertises logical sessions plus replica-set or mongos topology. This is a prerequisite signal, not a data-changing transaction test. If preflight reports a transaction warning, verify in the MongoDB provider console that the Production connection targets an Atlas/replica-set or mongos deployment that supports transactions before the first live candidate activation. Do not test by changing Production data.

## Phase D — enter and activate provider settings

Configure providers in this order:

1. Meta WhatsApp.
2. Brevo.
3. Netgsm.

For each provider:

1. Enter values in the Integration Settings UI.
2. Save the candidate.
3. Run the candidate connection test. Connection tests do not send messages.
4. Activate the exact successfully tested candidate version.
5. Wait at least 30 seconds, the maximum in-memory runtime cache window, or use the active configuration health check.
6. Confirm the active configuration test succeeds.
7. Confirm no secret value appears in browser storage, URL, API response, audit metadata, or logs.

Pending values never affect sending or webhook verification. Provider disablement blocks new outbound sends but does not stop status webhooks for messages sent previously.

## Phase E — webhooks

### Meta WhatsApp

1. Copy the official Meta webhook URL shown by the application.
2. Configure the same approved Verify Token in Meta.
3. Complete Meta webhook verification.
4. Confirm the first valid event is received and stored in sanitized form.
5. Confirm invalid signatures fail closed without logging raw payloads, full signatures, or App Secret.

### Brevo

1. Generate the protected webhook URL from the UI.
2. Copy it immediately; never paste the token-bearing URL into GitHub, documentation, or logs.
3. Test and activate the Brevo candidate.
4. Add the complete generated URL in Brevo.
5. Confirm a later real event updates an existing matching `CommunicationDelivery`; the webhook must not create a new delivery.

## Phase F — limited live test

Use only team-owned destinations and send in this order:

1. One email to a team-owned mailbox.
2. One approved WhatsApp template to a team-owned number.
3. One Turkish SMS to a team-owned `+90` number.
4. One international SMS to a team-owned non-Turkish number.
5. Review `CommunicationDelivery` for every attempt.
6. Confirm the selected provider and `providerMessageId` or Netgsm job ID.
7. Confirm the webhook delivery status where supported.
8. Do not run a bulk campaign during this phase.

## Phase G — small internal campaign

1. Use a very small internal recipient list.
2. Confirm the runtime configuration is resolved once per batch, not once per recipient.
3. Review successful, failed, skipped, and provider-rejected records.
4. Review provider events and safe failure reasons.
5. Permit real campaigns only after the internal run is accepted.

## Rollback procedures

### Production deployment failure

- Keep the PR or merge record unchanged.
- Roll back or promote the last known-good Vercel deployment according to the existing deployment policy.
- Do not run the migration until the intended Production deployment is READY.

### Migration failure

- Stop the release.
- Run the read-only migration verifier and record only safe status codes and index names.
- Restore from the database snapshot only when the database provider and incident review require it.
- Do not delete the collection, bulk-delete settings, or remove unknown indexes.

### Encryption failure

- Disable the affected provider for new sends.
- Verify that the original encryption key is still configured in the intended Vercel environment.
- Restore the original key from secure custody if it was accidentally changed.
- Never generate a new key as a quick fix and never fall back silently to ENV when an active encrypted database value exists but cannot be decrypted.

### Meta, Brevo, or Netgsm failure

- Disable only the affected provider to prevent new sends.
- Preserve delivery and provider-event records.
- Correct settings by staging, testing, and activating a new candidate.
- Do not route to Twilio, SendGrid, or another provider outside the established routing rules.
- Netgsm failures for Turkish numbers must not reroute to Brevo.

### Incorrect webhook configuration

- Keep the provider disabled for new sends if outbound behavior is uncertain.
- Correct or rotate only the webhook secret/verify token through a new tested candidate.
- Webhooks for previous messages remain enabled while valid active secrets are present.
- Do not log or share the complete signature or token-bearing URL.

### Incorrect active candidate

- Stage the last known-good values as a new candidate, test them, and activate that exact version.
- Where an explicit administrative delete/reset operation is available, removing a specific active database field may restore its ENV fallback; perform this only with an audit record and never delete all provider settings at once.
- Do not change the encryption key.

### Old configuration still used by cache

- Wait at least 30 seconds.
- Re-run the active health/configuration check.
- Redeploy only if a specific stale Vercel instance remains observable after the documented cache window.

### Integration settings database unavailable

- The runtime may use existing ENV fallbacks only when the database is completely unavailable and the ENV values are valid.
- Do not claim database candidates or disablement changes are immediately effective during the outage.
- Restore database connectivity, run preflight, and verify the active configuration before resuming campaigns.

## Release acceptance record

Record only:

- latest `main` SHA
- reviewed branch SHA
- merge SHA
- Vercel deployment ID and non-tokenized Preview/Production URL
- preflight overall status
- migration verification state before and after migration
- test counts and build result
- operator names and timestamps

Never record secret values, masked suffixes, Authorization headers, raw provider responses, full signatures, or token-bearing webhook URLs.
