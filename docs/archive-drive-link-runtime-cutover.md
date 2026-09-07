# ArchiveDriveLink Runtime Cutover Notes

Status: planned next package
Last updated: 2026-06-22

## Goal

The next package should append only the ArchiveDriveLink runtime model to the main Prisma schema and then verify Prisma generation and Vercel build.

This package must not implement Google Drive sync. It is only about storing Drive link metadata in a dedicated runtime collection.

## Current safe state

- Archive Drive link creation is protected in the UI.
- The API validates required fields.
- The API rejects non-Google-Drive links.
- The API validates that the selected archive project exists.
- Current persistence is audit-backed through ArchiveDriveLink AuditLog records.
- Archive repository can read runtime delegates when available and otherwise reads the audit-backed overlay.
- No external Drive calls are performed.
- No file download is performed.
- No AI analysis is performed.

## Required runtime model fields

The runtime model should include:

- id
- projectId
- title
- driveUrl
- driveFolderId
- driveFileId
- sharedDriveId
- linkType
- syncStatus
- lastSyncedAt
- lastError
- totalFiles
- totalImages
- totalVideos
- totalOther
- createdBy
- createdAt
- updatedAt

Required indexes:

- projectId
- linkType
- syncStatus
- driveFolderId
- driveFileId

## Required checks

After the schema change, run Prisma generation and the production build.

If the dashboard schema validation script is available, run it as well.

## Safety boundaries

Do not include any of the following in this package:

- Google Drive sync
- Google Drive API access test
- Google Picker
- file download
- thumbnail fetching
- image or video analysis
- AI metadata generation
- ArchiveAsset runtime writes
- ArchiveVideoFrame runtime writes
- automatic content creation
- automatic publishing or sending
- payment changes
- tracking runtime changes
- frontend secrets

## Acceptance criteria

- Build is green.
- Prisma Client exposes the archiveDriveLink delegate.
- New Drive links are written to the dedicated runtime model.
- Existing audit-backed Drive links remain visible.
- Invalid Drive URLs are rejected.
- Unknown project IDs are rejected.
- The UI still makes clear that no external sync happens.
