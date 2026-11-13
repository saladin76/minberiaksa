# Minber Al-Aqsa — Cloudinary-only upload recovery (2026-11-13)

**Decision:** Use the existing Cloudinary upload and delivery architecture. Do NOT merge VPS-storage PRs #227/#228/#229 solely to address `cloud_name is disabled`. Previous Cloudinary account replacement is documented in #140.

## Root-cause verification, before any code deploy

1. Check the Cloudinary product environment from the account console; confirm verified/enabled, quota and billing status.
2. On the production VPS, inspect the **running PM2 process environment** and the application's deployment environment without printing key/secret values. Confirm the three `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` values belong to the same currently enabled product environment. Check and resolve conflicting `CLOUDINARY_URL` if present.
3. From the application directory with exactly the environment used by PM2, run `node scripts/check-cloudinary-upload.mjs` for non-mutating configuration validation.
4. With operator authorization to create and delete one disposable Cloudinary asset, run `node scripts/check-cloudinary-upload.mjs --probe`. This checks upload, public image delivery and cleanup; it does NOT touch donor/CMS files. Do not call PASS if cleanup fails.
5. If variables changed, use the reviewed PM2 reload procedure with environment refresh (`--update-env`) and compare pre/post process health. Do not run `npm run build` on production.
6. On an authenticated staging or explicitly approved test workflow, test:
   - Super-category, category, project and blog raster uploads via `/api/upload`; save, reopen, render, verify HTTPS delivery.
   - WhatsApp template IMAGE and DOCUMENT/PDF through signed Cloudinary upload plus authorized Meta sample verification. Verify Arabic and Turkish media remain independent; never send donor campaigns.
   - Existing media URLs from the previous Cloudinary environment must not be overwritten or assumed to migrate automatically.
   - Confirm errors and audit logs without exposing tokens, filenames with personal data, or donor records.

## Acceptance gate

Same Cloudinary environment across PM2 runtime, /api/upload and WhatsApp signature endpoint; image upload + public delivery PASS; WhatsApp image/PDF sample recognized by Meta; category/project content persists and previews after reload; no payment/tracking/donor changes; exact-head CI and browser QA complete.

## Rollback

Restore previous validated environment configuration securely and reload PM2 using the approved release process if the fresh configuration causes a regression. Preserve historical Cloudinary media references. This runbook does not modify current runtime configuration or deploy anything.
