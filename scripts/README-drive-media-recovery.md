# Google Drive recovery for inaccessible Cloudinary images

This tool is deliberately independent of application release/deploy. It does not edit the database.

## Evidence and boundaries

- The old `z9drzccl` Cloudinary image URLs return HTTP 401.
- 33 historical Google Drive source IDs are documented in `lib/minbar/content/media.ts`.
- The server's read-only download produced `SOURCE_IMAGES: 33`, `RECOVERED_IMAGES: 33`, `FAILED_IMAGES: 0` in `/root/minber-media-recovery/from-drive`.
- **These are not certified copies of the old Cloudinary objects.** Some historical slug associations reuse the same photo across unrelated projects; no automated gallery replacement is permitted.

## Read-only audit

From `/root/minberiaksa`, on the existing production server (no ZIP needed), after fetching this branch:

```bash
git fetch --no-tags origin ops/drive-media-recovery-20261107
git show FETCH_HEAD:scripts/recover-drive-media.cjs > /root/minber-media-recovery/recover-drive-media.cjs
node --check /root/minber-media-recovery/recover-drive-media.cjs
node --env-file-if-exists=.env --env-file-if-exists=.env.production --env-file-if-exists=.env.production.local /root/minber-media-recovery/recover-drive-media.cjs audit
```

The audit verifies the 33 images against `manifest.json`, the historical source IDs and SHA-256, then scans only active campaign images and per-locale covers. Outputs `recovery-audit.json` under the recovery directory and a concise terminal summary.

## Staging to the NEW Cloudinary account

Stage only the limited groups that have relevant documentary photographs (meal distribution, parcel distribution, bread distribution and transport):

```bash
node --env-file-if-exists=.env --env-file-if-exists=.env.production --env-file-if-exists=.env.production.local /root/minber-media-recovery/recover-drive-media.cjs upload --groups=GAZA_BREAD,GAZA_PARCELS,GAZA_MEALS,TRAVEL
```

On the server the tool uses only already-configured, **new** `CLOUDINARY_*` credentials. Uploads into `minberiaksa/drive-recovery-20261107`, checks that each resulting delivery endpoint returns an image, writes private per-file receipts to `/root/minber-media-recovery/from-drive/cloudinary-receipts` (mode 0600) and skips verified files on re-run. This **does not update campaign records**.

The tool intentionally does not automatically upload `GAZA_WATER`, `QUDS_CITY` or `QUDS_IFTAR`; some retrieved files do not visibly depict the activities implied by their historical labels.

## Before any publication

1. Inspect `recovery-audit.json` alongside images and original project context.
2. Preserve a separate backup of `Campaign.images` and each translation `image` field.
3. Match photos individually, never by region labels alone, and never use a photo of an unrelated activity.
4. Verify all new URLs including non-Arabic covers and galleries.
5. Apply a dedicated, independently reviewed database migration with idempotency and rollback. **This PR has no such migration and must not be treated as site image repair.**

No payment, recurring charge, donor, messaging, SEO, app deployment, or CMS data is changed by this PR.
## Four-project recovery migration (review required)

The independent `scripts/apply-reviewed-drive-media.cjs` provides three modes:

- `plan`: compare the 16 verified Cloudinary upload receipts against exact project slugs; verify all media URLs and original dataset fields; write `four-project-recovery-plan.json` with a content hash, **no database writes**.
- `apply <PLAN_HASH>`: **only after reviewing the full plan and checking photos belong to each project**. Rechecks the current data, validates the exact plan hash, writes a private 0600 backup, then transactionally updates ONLY `Campaign.images`, `Campaign.ogImage`, `CampaignTranslation.image`, `CampaignTranslation.ogImage` for the four exact matches. Keeps existing nonlegacy gallery photos and replaces old Cloudinary links.
- `rollback <BACKUP_FILE_BASENAME> <BACKUP_HASH>`: restores the previous media fields in a transaction, but refuses any intervening manual changes.

The plan is **not blanket approval**. Since historical photos can be miscategorized, inspect `GAZA_MEALS`, `GAZA_PARCELS`, `GAZA_BREAD`, and `TRAVEL` carefully. No payment, donor, marketing or recurrence fields are changed. The migration has an isolated mock-DB test of plan -> apply -> rollback; **production apply has not been executed**.

### Commands from /root/minberiaksa

```bash
git fetch --no-tags origin ops/drive-media-recovery-20261107
git show FETCH_HEAD:scripts/apply-reviewed-drive-media.cjs > /root/minber-media-recovery/apply-reviewed-drive-media.cjs
node --check /root/minber-media-recovery/apply-reviewed-drive-media.cjs
node --env-file-if-exists=.env --env-file-if-exists=.env.production --env-file-if-exists=.env.production.local /root/minber-media-recovery/apply-reviewed-drive-media.cjs plan
```

Only plan is the next safe step. The terminal prints project names, old image counts, new image counts and localized cover/OG image replacement counts. Review this output before considering the apply operation.

Caveat: Existing `updatedAt` values are guarded during apply. Backup is made before the transaction. The rollback checks media fields but not unrelated changes; only use it after verifying no image edits have happened in the interim. The optional `ogImage` changes are constrained to old Cloudinary URLs.

