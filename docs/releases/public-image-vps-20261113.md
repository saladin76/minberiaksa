# VPS image upload hotfix — 2026-11-13

## Root cause
`POST /api/upload` is shared by super-categories, categories, project translations, profile avatars, blog and other content editors. It always writes to Cloudinary. Cloudinary returns `cloud_name is disabled` even with a valid signed request. PR #227 changes only WhatsApp template sample upload and **does not fix** these content editors.

## Scope
When configured, `POST /api/upload` now writes approved raster images (JPEG/PNG/WebP/GIF/AVIF) to a persistent directory on the VPS, with an opaque `vps-UUID` ID, an HTTPS public URL and the exact existing `url`/`public_id` response fields. A read-only public GET endpoint serves immutable ID-named images with correct MIME/size. The same route preserves legacy Cloudinary behavior when **not** configured. Existing Cloudinary image URLs remain unchanged and available. Deletion uses the VPS image ID for VPS files and retains the previous Cloudinary behavior for other IDs. No changes to database schema or financial code.

**Security:** SVG is deliberately NOT allowed on VPS (active same-origin content). Request still requires a signed-in site session as before, 8MB size cap is preserved, and the server checks image signatures and 1GB of free disk headroom. The storage directory must live outside the Git deployment worktree, have owner-only write access, and be backed up. The media URL is PUBLIC for website images: do not upload ID documents, donor files, private images or any sensitive data.

## Required production PM2 environment (operator must validate)
```sh
MINBAR_PUBLIC_IMAGE_DIR=/var/lib/minberiaksa/public-images
MINBAR_PUBLIC_IMAGE_ORIGIN=https://minberiaksa.org
```
Create the directory with ownership for the actual PM2 app process user, and 0750 permissions. The app process MUST have directory traversal permissions and file read/write access. Ensure `/api/upload` accepts up to 8MB in Nginx (a 1MB proxy limit will fail first). Disk free space, backups and successful HTTPS GET of newly uploaded assets are hard release gates.

## Test/release
- Run exact-SHA GitHub Actions and at least one browser fixture with a non-sensitive 2MB JPG or PNG. Check response `url`/`public_id`, public GET response bytes, avatar and content editor previews, and delete for a newly uploaded test ID. No donor or live donation operations.
- Combine with the isolated WhatsApp template-media hotfix #227 **only if** both pass exact-SHA CI and the isolated integration candidate passes source/build/runtime tests. Do not merge #227 just for this general media failure.
- Avoid `npm run build` on the production checkout: it runs a production-index mutation. Follow the reviewed isolated-next-build recipe and preserve rollback metadata. Never deploy an unreviewed PR SHA.
- Confirm correct runtime env in PM2 (including after restart), correct Nginx request size policy, stable mounted persistent directories, and basic site health after deploy.
- Existing Cloudinary content is **not migrated**; do not delete or rotate those URLs until separately inventoried and backed up.
