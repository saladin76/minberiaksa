# Current dashboard and public-page work (28 October 2026)

Branch: `fix/major-projects-inbox-ticker`, built on PR118. Both changes belong to the combined release; production publishing is deferred pending release authorization.

## New request

1. Restore linked projects on the home restoration page and develop/rename major projects management.
2. Apply the reviewed Turkish page copy.
3. WhatsApp-style images, files, voice recording/playback and unread-only top badge.
4. Registered donor account count above donor management.
5. SEO HTML/JSON failures.
6. Use the actual public-page appearance for editor previews, including drafts.
7. Real paid donation ticker with server-masked names; optional registered-member display without fabricated payment claims.

## Implemented in working tree; validation and review still in progress

- The reserved `/bagislar/al-quds-home-restoration` route previously rendered a separate static page with a different region filter and six-project limit. It now delegates to the normal CMS project route, including canonical URLs, publication checks and metadata. Deletion/unpublishing no longer resurrects that static landing page.
- A super-category with linked projects and no configured CAMPAIGNS block gets a fallback project grid. Explicit hidden grids remain hidden. Public readers still filter unpublished/deleted projects.
- Rename visible dashboard terminology to major projects; listing search/status filters, retry/error state and prevent global reordering while filtered.
- Registered account counter uses the existing MEMBER evidence contract, independent of donor list filters.
- Safe suggestion JSON reader stops a batch on HTML/timeouts/session redirects and preserves drafts without leaking proxy HTML.
- Read acknowledgements are based on an actual displayed inbound event and do not resolve the separate needs-reply state. Badge now reads unread count.
- Ticker source settings, recent settled payment feed and optional member feed. Only masked first/last-word names cross public boundary; no contact info or record ids. Member entries have no invented amount. Five-second server cache and ten-second client polling; paid entries deduplicated per page view.
- Turkish copy applied to aqsa, recurring, waqf, zakat and achievements namespaces. Payment pricing/configuration is unchanged.

## Media, previews and validation

- Authenticated conversation media proxy scopes each image/audio/video/document to its business number and contact. Provider download hosts are allowlisted, redirects are refused, responses are private/no-store and tokens never reach the browser.
- Multipart attachments, browser microphone recording, bounded server FFmpeg conversion to OGG/Opus, provider media upload and archive-before-send flow. Blocked contacts, unknown/disabled business senders, policy read failures and expired reply windows prevent outbound calls. Ambiguous provider acceptance is kept unresolved, never falsely labelled failed or confirmed sent. Deployment checks install the Opus encoder before replacing the build when necessary.
- Private POST previews use the actual project, major-project, category, Aqsa/Zakat template and article components in an iframe. Unsaved text/settings are validated in memory. The preview does not publish drafts or permit donation/message actions. Other library item types retain their existing media previews.
- Read markers persist only after a real scoped inbound event is found; failed persistence returns 503 and remains retryable. Opening does not mark a conversation answered. Mongo aggregation now uses Prisma aggregateRaw rather than a first cursor batch; the official Prisma documentation warns against runCommandRaw for aggregation because cursor sessions are not guaranteed: https://www.prisma.io/docs/orm/v7/prisma-client/using-raw-sql/raw-queries .
- English and Turkish dashboard phrases compiled; all 19 public locales include the community supporter label.
- Local tests, typecheck, lint and locale audits have passed. A clean Next.js production build passed using dummy constructor credentials, disabled external AI calls and an unreachable loopback database.
- Browser execution and visual review are incomplete: the browser download was truncated, and transfer of the new branch is blocked pending authorization. The isolated browser fixtures compile but are not reported as passing.
- Live-source configuration accepts empty legacy lists without accepting malformed values. Unknown-sender timelines remain isolated, and aggregation tests include 127 conversations. The test harness sends no real messages and performs no production writes.

## Deployment boundaries

This is a local review branch; a remote PR for this batch has not been created. PR118 is still unmerged and is its prerequisite. Live provider delivery, bank/recurring collection, Google-account permission and CMS overrides need production verification after an explicitly approved release. No bank charge, provider media upload, AI generation or donor communication was executed by these checks.

## Source and privacy boundaries

The approved Turkish source material was reviewed read-only. Private source-document links and identifiers are deliberately excluded from repository documentation. No production DB writes, messages, charges or provider media calls were performed during implementation.

## Final local validation

Validated implementation commit: `341a4a7782d79a32f3f4487ef182d230b5b9ec5b` (source tree `2dc5c4c1a5d3a5d3fb560dd28b385319341053cd`).

- 1,116 integration tests and 139 content-editor tests passed: 1,255 total.
- Whole-repository TypeScript passed. ESLint passed with 183 existing findings, zero critical findings and no increases.
- Dashboard dictionary check: 7,504 active phrases, zero missing translations. Public i18n and locale strict audits passed.
- Both affected browser fixture bundles compile. Browser execution and visual review remain incomplete because Chromium installation failed with a truncated archive. No new browser check is counted as passed.
- Clean Next.js 16.4.3 production build passed, including 150 static pages, using isolated dummy build settings and an unreachable loopback database.
- Shell deployment scripts passed syntax checks.

## Combined release authorization

The user explicitly approved uploading `fix/major-projects-inbox-ticker` to `saladin76/minberiaksa` and merging PR118 together with this batch after the remaining checks succeed. This supersedes the earlier hold on PR118 and the repository-transfer block. Browser execution and visual review must complete before the combined merge. Production deployment remains a separate VPS action; no live donor messages, provider media uploads or payments are part of the verification fixtures.
