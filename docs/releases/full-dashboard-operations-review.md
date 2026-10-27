# Dashboard operations review — 27 October 2026

This release follows merged PR 112. Source validation and browser fixtures are separate from real provider acceptance, payment settlement and VPS deployment.

## Implemented

- Retired the active Twilio SDK, template import UI, connection catalog, live checks and scheduled sync. The retired import endpoint returns 410. Historical attribution keys remain readable so prior financial reports retain their meaning.
- Email delivery replaces institution base64 logos with the public official horizontal PNG, makes relative asset links absolute, and applies Cairo to Arabic HTML. Other project images are preserved. Clients that block web fonts use the fallback stack.
- Unified editor provides saved/error feedback; translation, proofreading, FAQ and SEO use one task/scope/review workflow. Public-page SEO has search, sharing and advanced tabs with effective search preview.
- Project images use a compact sortable gallery: drag, touch, keyboard, arrow controls, direct primary selection and preview. Existing project slug redirects preserve incoming tracking parameters; the guarantee is visible in the editor.
- Video library associates achievements with projects. Supported Facebook iframe input is reduced to a safe URL, never rendered as pasted HTML. Public super-category video rendering uses the same provider parser. Facebook short-link resolution validates every redirect against an exact host allow-list.
- Creating an achievement video in project history creates its canonical library record in the same transaction and refreshes the library immediately, even when the parent project revision is unchanged. Unified video edits keep the original update context synchronized; public project feeds suppress duplicate or unpublished canonical videos.
- Cart settings add donor/currency preview, ordering, unsaved state and read-after-write confirmation. Initial load failure blocks editing/saving default values over existing settings.
- Statement bank registry no longer creates default documents on GET in the institution BankAccount collection. Legacy registry entries remain available for historical statements while public bank accounts require canonical fields.
- Contact, partnership, volunteering and concierge support require login on the server. Drafts survive the sign-in round trip and require explicit submission. Inbox explains that messages are stored internally; email/WhatsApp reply links open their respective applications.
- Recurring charges acquire a cycle lease shared with amount changes. Concurrent Albaraka/PayPal workers cannot charge the same daily, Friday or monthly cycle twice. Readiness and provider decline reasons are visible; an active status alone does not establish payment authorization.
- WhatsApp cooldown also reserves the normalized phone across separate donor accounts. Confirmed unsent attempts release only their own reservation. Accepted marketing deliveries remain part of recent-contact history after a later delivery failure. Future Meta webhook errors preserve code and diagnostic details.
- Google Analytics navigation moves under Marketing. Google Search manager supports native multi-account OAuth connections, selected projects/languages/countries, Keyword Planner/account evidence, durable per-language AI planning, exact budget/currency approvals, Google validation, atomic paused creation, explicit activation, reconciliation and scoped paid-ledger reporting.
- Optional Google monitoring reviews owned keywords every six hours and may pause at most five zero-conversion keywords that exceed explicitly approved click/cost thresholds. It never increases budgets or deletes other campaigns. Creative and expansion suggestions remain proposals; Google manages conversion bidding within the approved budget. This is not unrestricted autonomous campaign management.

## Live checks completed before this release

- Previous release's all-time revenue band and six period metrics are visible on production.
- Super-category `6acf2f891a07e7e6f8396dca`: edited subtitle, saved, verified public change, restored exact original and verified restoration. A stored Facebook share link was incorrectly embedded as a YouTube ID; this release corrects rendering.
- Public-page SEO: changed image-alt override, saved, verified public `og:image:alt`, restored the original empty override and verified the public default returned.
- WhatsApp failure preview showed **Message undeliverable** without a stored Meta code. The historical exact cause cannot be inferred from that text. No retry was sent.
- One recurring payment attempt showed **Limit Yetersiz** (insufficient available limit). This is evidence for that attempt, not proof that all renewal failures have the same cause. No charge was triggered.
- An automatic email template contained an inline base64 institution logo. The replacement public logo URL was loaded and its 2603 × 633 image decoded successfully. No test email was sent to a donor.
- Read-only connected Google discovery found two accounts and existing Search/Performance Max campaigns. Some campaigns have policy/disapproval limitations. Their account identifiers and credentials are not embedded in public source.

## Category cleanup scope and outstanding production work

The screenshot's 17 archived labels are: سوريا، السودان، اليمن، لبنان، بنغلاديش، توغو وبنين، تشاد، إثيوبيا، البوسنة، ألبانيا، مقدونيا الشمالية، صربيا، الكاميرون، بوركينا فاسو، الصومال، عام، صدقة. Production UI reports **210 relationships**, which is not a count of distinct projects. Archived وقف and أضاحي are outside this scope.

`scripts/audit-retired-category-cleanup.mjs` is read-only. It reports exact IDs, distinct/shared projects, financial/subscription references, related content and a review hash without donor details. Permanent cleanup has not been executed: the current environment cannot connect to the VPS/database, and shared projects and financial references must be established before a concrete deletion can be prepared. No donation, receipt or subscription ledger was erased.

VPS installation and provider verification still require running the pinned release there. The site's native Google Ads OAuth/developer token must be configured for each account; a connection in an external analysis tool does not supply this site's credentials. No new advertising budget has been supplied, so no live advertising mutation or spending was performed. Search Console access was previously reported as denied and requires property access outside source changes.

## Validation

See the commit's release gates for type checks, integration tests, content-editor tests and browser artifacts. Added behavioral coverage includes normalized-phone concurrency, recurring-worker concurrency, protected support endpoints, safe embeds/redirects, canonical project-video publication, Google atomic/uncertain outcomes, optimizer scope, restoring the selected account when reopening a plan, legacy zero FX placeholders and timezone-aligned financial reporting. Operations browser fixtures cover AR/EN/TR at desktop, 390px and 320px; they do not establish real bank acceptance or message delivery.

## Follow-up: WhatsApp template sync diagnostics

A successful live catalogue sync exposed a misleading “last sync” date: the dashboard labelled the oldest saved template/variant timestamp as the latest sync. The API now returns the latest and oldest saved timestamps separately while preserving the existing complete-coverage field. The dashboard displays the actual latest date and time, an independently labelled oldest saved sync, and an incomplete-coverage notice. A successful manual sync also exposes the exact unmatched Meta template names in an expandable list for review, without automatically importing them or sending messages. Failed sync requests report an accessible status instead of leaving an unhandled rejection.

Behavioral timestamp tests cover mixed dates, timezone offsets, invalid/missing values and input preservation. The operations browser suite exercises catalogue synchronization, refreshed timestamps, partial coverage, unmatched names and absence of message-sending requests in Arabic, English and Turkish at desktop, 390px and 320px widths. These tests do not prove production deployment, bank acceptance or delivery of a new message.

## Follow-up: recover saved template sync outcomes

When a sync response is lost or replaced by a non-JSON gateway response, the browser cannot conclude that synchronization failed. The WhatsApp dashboard now reads the latest completed catalogue result from the audit ledger, exposing only its timestamp, counts and unmatched template names. Failed or malformed records never become a successful result. After any manual-sync outcome the client refreshes saved state with a database-only GET; it does not retry Meta automatically or send messages. Known JSON failures remain distinct from uncertain network/HTTP outcomes. An additive audit lookup index supports this read path.

Template freshness is computed over every template before the dashboard limits the visible preview to eight rows. Browser coverage exercises a connection failure without a completed sync, a non-JSON HTTP 504 after the server saved a successful sync, read-only recovery and persistence across reload, an ordinary successful response and a known Meta failure. The same checks run in Arabic, English and Turkish at desktop and narrow widths. Payment payloads and subscription activation are unchanged.
