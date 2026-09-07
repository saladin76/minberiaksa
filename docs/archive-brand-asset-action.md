# Archive Asset to Brand Assets

Date: 2026-06-22

## What changed

- Added a guarded archive action that saves an approved `ArchiveAsset` into Brand Center as an audit-backed `BrandAsset`.
- Added an `Add to Brand Assets` action on archive asset cards.
- Added clear disabled reasons when an asset is not yet safe for Brand Center.

## Runtime behavior

- The archive asset must be human-approved for marketing or documentation.
- Rejected assets and `DO_NOT_USE` assets are blocked.
- Sensitive assets and assets that need blur are blocked.
- The saved Brand Asset is marked `TO_VERIFY` and is not downloadable by default.
- Existing Brand Asset records are reused when the same ArchiveAsset or URL was already saved.

## Safety

- No payment changes.
- No tracking runtime changes.
- No Google Drive sync.
- No file upload.
- No file download.
- No external platform calls.
- No AI generation.
- No auto-publish or auto-send.
- No frontend secrets.
