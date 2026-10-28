# Current dashboard and public-page work (28 October 2026)

Branch: `fix/major-projects-inbox-ticker`, built on PR118. Both changes belong to the explicitly approved combined release. Production publishing is a separate VPS action.

## New request

1. Restore linked projects on the home restoration page and develop/rename major projects management.
2. Apply the reviewed Turkish page copy.
3. WhatsApp-style images, files, voice recording/playback and unread-only top badge.
4. Registered donor account count above donor management.
5. SEO HTML/JSON failures.
6. Use the actual public-page appearance for editor previews, including drafts.
7. Real paid donation ticker with server-masked names; optional registered-member display without fabricated payment claims.

## Implemented changes

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
- Browser fixtures exercise real components with isolated HTTP and routing adapters. The actual editor preview button preserves unsaved text; image display, native audio playback, downloads and microphone recording are covered. Public phone header controls also remain within the viewport at 320 and 390 pixels in Arabic, English and Turkish.
- Live-source configuration accepts empty legacy lists without accepting malformed values. Unknown-sender timelines remain isolated, and aggregation tests include 127 conversations. The test harness sends no real messages and performs no production writes.

## Deployment boundaries

PR119 is stacked on PR118. The user explicitly approved uploading the branch and merging both PRs once checks and visual review pass. Live provider delivery, bank/recurring collection, Google-account permissions and CMS overrides require production verification after deployment. These isolated checks do not establish that a real donor payment or real WhatsApp delivery succeeded. No bank charge, provider media upload, AI generation or donor communication was executed by these checks.

## Source and privacy boundaries

The approved Turkish source material was reviewed read-only. Private source-document links and identifiers are deliberately excluded from repository documentation. No production DB writes, messages, charges or provider media calls were performed during implementation.

## Release validation

- 1,116 integration tests and 145 content-editor tests: 1,261 total. Integration checks run in GitHub Actions; the content suite also passes locally.
- Whole-repository TypeScript passes. ESLint passes with 183 existing findings, zero critical findings and no increases.
- Dashboard dictionary check: 7,504 active phrases, zero missing translations. All 19 public locale strict audits pass.
- Seven browser suites cover content editors, major projects/private previews/ticker, inbox media, public media, dashboard flows, operations and checkout. Screenshots and per-suite results are retained as GitHub Actions artifacts. Browser success is a merge gate.
- Local content editor browser verification: 23 checks and 84 snapshots. Major-project verification includes Arabic/English/Turkish preview layouts, draft retention, masked ticker sources, a configured 30-second interval surviving ten-second polls, category-fetch failure isolation and phone header bounds.
- Screenshots reviewed for actual desktop/mobile previews, major-project management, Arabic/English/Turkish layouts, Aqsa/Zakat copy, ticker controls, donor-account cards and inbox media/composer. The visual review found a clipped phone menu; compact header spacing and control bounds were fixed and covered by browser assertions.
- Clean Next.js 16.4.3 production builds use isolated dummy constructor credentials, disabled external AI calls and an unreachable loopback database. Expected database-read warnings do not imply a live database check.
- Shell deployment scripts pass syntax checks. Deployment ensures FFmpeg/Opus before activating the build.
- The SEO change handles invalid suggestion responses and preserves drafts; it does not prove that a production provider or reverse-proxy configuration problem has been corrected.

## Combined release authorization

The user explicitly approved uploading `fix/major-projects-inbox-ticker` to `saladin76/minberiaksa` and merging PR118 together with this batch after the remaining checks succeed. This supersedes the earlier hold on PR118 and the repository-transfer block. Browser execution and visual review must complete before the combined merge. Production deployment remains a separate VPS action; no live donor messages, provider media uploads or payments are part of the verification fixtures.
