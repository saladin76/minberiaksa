# Certificates and payment confirmation — 2026-10-29

Parent: `1397212a6ffd5c9d81a332da8d39c2e63c2ae6c4` on `fix/dashboard-release-recovery-20261029`.

The attached production log shows four deployment stops at `Unknown tagged value`, including the parent revision. Source availability is distinct from runtime activation.

## Changes

- Use the native MongoDB driver for index metadata/DDL, preserving Mongo `$type` filters and the existing fail-closed custom-index checks. Expected index specifications: 36. No broad schema push or production data backfill.
- Rename Certificates and retain the multilingual copy editor alongside manual issuing and delivery. Four kinds, 19 message languages, immutable issued document snapshots, scoped download tokens, signed preview snapshots, channel-specific delivery state, PDF attachments, archive records, default sender routing and uncertain-response holds.
- Manual receipts require a funds-received attestation and donation-edit permission. Manual documents have a separate annual `MIA-MAN` series and do not create paid donations or increase revenue. Free-text details must be entered in the selected document language.
- Use the existing certificate copy and artwork, fix clipped thank-you layouts, show issue date/serial on manually issued thank-you documents, include waqf project/details, and self-host Cairo/Amiri in standalone document HTML. Hindi/Japanese/Chinese additionally load the appropriate Noto script font from Google Fonts without putting donor data in its URL; PDF delivery fails before provider submission if that script font cannot load.
- Keep the Arabic mobile hero heading on one line at 320–560px. Add conversation history to the donor profile dialog, respecting its existing communication permissions.
- Saved cards in the current checkout are opt-in for authenticated donors. Existing encrypted card storage is reused; this is not a new provider-token vault. Masked card list, expiry validation, owner-bound lookup, exact duplicate comparison, new-card switching and fresh CVC are retained. CVC is never written by the save endpoint or included in its responses.
- Poll unconfirmed online donations every 30 minutes, with per-record leases and a next-check timestamp. Provider-confirmed paid transactions use existing settlement. At 24 hours only authoritative no-sale/unpaid results can expire an attempt. Network uncertainty, changed/missing terminal snapshots, unverified PayFor approval and later recurring cycles remain with their existing review/cycle owner. Manual bank transfers never age out here.
- Recover AUTHENTICATION_ATTEMPT/required 2D responses through inquiry first: settle the original successful sale; hold unknown results; otherwise launch 3DS only after confirmed no-sale. No second direct Sale or automatic reversal. Existing 3DS MAC/order checks and full-authentication policy stay enforced.
- PayPal requests immediate-payment funding, records provider pending reasons, verifies webhook signatures and reads the actual order before settlement. A late completed event can recover a local failure; concurrent events credit once. Register the webhook after deployment.
- Browser/provider failure writes cannot overwrite confirmed or in-flight bank payments. Stripe reconciliation does not falsely count a concurrent webhook settlement/expiry and dispatches the recovered success through the normal notification pipeline.
- Payment return URLs consistently use the public production origin behind the VPS proxy.

## Validation

- Integration suite: **1,324 passed**, 0 failed.
- Content editor suite: **194 passed**, 0 failed, including native Mongo index metadata regression.
- Browser fixture: **29 passed**, 0 browser errors; real components, local mocked API/provider boundaries. Includes AR/EN/TR saved-card checkout, certificate tab preservation, signed-preview reuse across two delivery channels, five Arabic mobile widths, and 16 single-page PDFs including maximum-length detail samples.
- Full baseline TypeScript: 0 errors. Editor/communication/integration-specific gates passed. Next production build also performs its own TypeScript pass.
- Lint baseline: no new findings; targeted lint on final reconciliation/fixture changes passed.
- Dashboard i18n: 7,617 source phrases, 0 missing EN/TR translations.
- Setup scripts in dry-run mode: 0 database writes, provider calls, captures or recipient messages.
- Production build: **passed**, Next.js 16.4.3; TypeScript passed and 152/152 static pages generated. A fresh Turbopack cache was used after an invalid persisted-cache failure on the intermediate rebuild.

Local build uses dummy OAuth/auth/Stripe values and an empty DATABASE_URL; fallback reads log that no database is configured. It does not validate production DB connectivity. Production DDL is a required deployment step and must succeed before activation.

## Deployment

Use the reviewed full commit SHA shown with the delivered command, not a moving branch alone. `scripts/deploy-reviewed-dashboard.sh` verifies the remote head, fast-forwards, builds with lockfile-matched dependencies in isolation, installs the VPS cron schedule, probes public settings and restores the previous runtime if activation fails. The VPS deploy already removes the previous temporary build/cache.

After that command succeeds:

```bash
node scripts/finalize-reviewed-dashboard.mjs --apply --publish --activate-approved
```

This attempts all four metadata steps and reports each outcome separately: PayPal webhook registration, gift templates, notification template upgrade/approved-only activation, and document-delivery templates. A failure in one does not prevent the other metadata checks. It does not run billing, capture payments or message donors. Pending Meta approval remains pending; a template is never fabricated as approved.

## Acceptance still required

No live bank charge, subscription cycle, mass campaign, certificate recipient send or production DDL execution was performed from this environment. Verify the deployed runtime, the webhook registration/events and default-number exact-language approvals before declaring live acceptance. Match incomplete historic bank snapshots against actual merchant reports rather than changing money status from age alone.

The complete request-by-request audit and open work are in [request-traceability-20261029.md](request-traceability-20261029.md). It includes 65 prior requests and today's additions; Google Ads autonomy, recent Clarity sessions, a measured PageSpeed score of 100, destructive category cleanup and several live acceptance flows remain open.
