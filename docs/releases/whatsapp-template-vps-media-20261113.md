# Isolated WhatsApp template media hotfix — 2026-11-13

## Symptom and verified code cause
The WhatsApp template editor always asked for a signed Cloudinary upload and sent the browser file to Cloudinary before calling Meta. The reported browser response is `cloud_name is disabled`, so the template sample never reaches Meta. Cloudinary PDF signature corrections alone cannot resolve a disabled Cloudinary account.

## Scope
This PR adds a VPS-backed path for **public, non-personal WhatsApp template-header assets**. The authenticated admin browser POSTs the original image/video/PDF to `/api/templates/whatsapp/media-upload`; the server validates signature, type, bytes and size; writes a random UUID filename in an independent persistent VPS directory; obtains Meta's resumable **template header sample handle**; and only then responds with both sample handle and stable public media URL. Meta's actual template messages still require a public media URL at send time. The public GET route serves only opaque UUID assets of approved MIME types.

The existing signed Cloudinary flow remains as compatibility fallback **only when the VPS path is explicitly not configured**. If the VPS path returns a storage or Meta error, the editor reports the failure; it does not silently try an unrelated provider or mark a failed upload as successful. When the Meta sample fails, the new local copy is removed. Existing Cloudinary-backed templates are not migrated or changed.

No payment, financial, conversion, donation, provider-message-send, or recurring code touched.

## Required VPS configuration BEFORE deploying this hotfix
Set these on the actual Node/PM2 **runtime**, including after restart (not only as shell exports):
```sh
WHATSAPP_TEMPLATE_MEDIA_DIR=/var/lib/minberiaksa/whatsapp-template-media
WHATSAPP_TEMPLATE_MEDIA_PUBLIC_ORIGIN=https://minberiaksa.org
```
- Create `/var/lib/minberiaksa/whatsapp-template-media` with ownership to the **actual app process user**, directory mode 0750. Avoid a symlink into the worktree/release directory.
- Ensure Nginx permits the largest authorized template media size through the authenticated `/api/templates/whatsapp/media-upload` route only; the application enforces 5MB JPG/PNG, 16MB MP4, and 100MB PDF. A default Nginx `client_max_body_size 1m` will reject even the 1.57MB screenshot before the app gets the request. Scope a `client_max_body_size 100m` or appropriate bounded value carefully to this route; do not globally raise arbitrary API limits. Proxies must time out safely for larger uploads.
- Explicitly BACK UP the directory. Rebuilds/worktree cleanup must not delete it. It must be accessible by the app user after release rollback. External provider fetching requires outbound Meta Graph connectivity and inbound HTTPS GET of `/api/templates/whatsapp/media-public/<uuid>.<ext>`.
- These assets are intentionally public because Meta fetches template-send URLs. Never put donor-specific records or private documents in this folder.
- Uploading a sample is NOT evidence of Meta template approval or delivery. Test with an authorized non-sensitive image on a **test template**. Do not send live campaigns.

## Safe release procedure
1. Inspect exact SHA and wait for **all** required CI checks on that SHA. Keep unrelated draft PRs excluded.
2. Build/test from an isolated deployment clone/worktree with Node.js 24 and mock DB/providers; **do not run `npm run build` against the live checkout**, as that script includes a production index operation. Review any build hooks first.
3. Verify the application PM2 process user, persistent directory and runtime variables before a controlled deploy. Preserve previous release commit and restart/rollback method.
4. Run UI upload of an authorized 1–2MB image. Confirm `POST /api/templates/whatsapp/media-upload` returns HTTP 200, nonempty `handle` and `url`, with zero requests to Cloudinary. Confirm the returned URL is HTTPS 200 with matching MIME and correct binary bytes from a public external client.
5. Optionally confirm PDF/video by test media and Meta acceptance. Do not send to real donors.
6. If CI, image upload, public GET, or Meta handle validation fails: HOLD, rollback only this hotfix release. Never change payments/cron/prod donor data.

## Limitations
- This is not pre-approved for a live merge or deploy. Disk quotas, backups, permissions, Nginx body limits and actual Meta credentials must be verified on VPS.
- Access to Meta cannot be proven by fixtures. Existing multi-WABA template publishing and live message delivery acceptance remain separate.
