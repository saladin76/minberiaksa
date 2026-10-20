# Content editors, translation and SEO

## Result

Projects, categories, articles, programme pages and urgent banners share a content editor. Existing edit URLs open it; the original forms remain under `settings/[id]` for media, donation configuration, linked content and ordering. Category navigation is named “التصنيفات”. A category groups projects; a programme is an independent page composed of linked content and sections.

Every section list includes a translation overview with per-language completed/incomplete/reviewed/SEO counts and links to item editors. Counts come from stored fields, including article bodies and nested card/block copy. Arabic fallback does not count as a translation. Arabic-identical target copy is incomplete unless the field is intentionally protected. Reviewed status is a separate hash of the saved source and target; changing either invalidates it.

The enabled locale catalogue remains unchanged: 19 in Minber-i Aksa. Disabled/future locales are not enabled by this work.

## Editing and generation

- One language selection controls content, search metadata and image descriptions.
- Text can be changed manually. Optional category/page copy is collapsed; all fields remain accessible.
- Translation targets the selected fields of the stored Arabic source and one language or missing languages.
- Suggestions include item ID, kind and source revision. They are shown as comparisons. Accepting fills a draft; saving is a separate user action. Existing copy can be replaced only through an explicit draft action.
- A changed draft rejects a pending suggestion. Save failures retain the draft and never show success. Save verifies persistence inside the transaction and reads the saved document again in the UI.
- Qur'anic Arabic fields and religious attribution/meaning fields are excluded from automatic edits. Ornamental Qur'anic quotations are protected tokens. Rich-text structure, URLs, numbers, placeholders and currency values retain the existing adapter's checks. Oversized plain fields fail instead of being silently truncated.
- Banners have translated image descriptions and accessible preview copy, not independent search-page metadata. Banners are previewable at desktop/mobile widths, with their destination, state and Istanbul schedule.
- `OPENAI_API_KEY` and optional `CONTENT_LOCALIZATION_MODEL` are used server-side. No key reaches the browser. The new suggestion route invokes the provider adapter; it does not return sample content when the provider is unavailable.

## API and permissions

| Endpoint | Purpose |
| --- | --- |
| `GET /api/admin/content-editor/[kind]` | Cursor-paged stored translation statistics |
| `GET /api/admin/content-editor/[kind]/[id]` | Own fields for each language, source, revision and review status |
| `PUT /api/admin/content-editor/[kind]/[id]` | Atomic locale save or confirmed category slug change |
| `POST /api/admin/content-editor/[kind]/[id]/suggest` | Revision-bound translation or search/image suggestions, without database writes |

Permissions are checked before protected reads or generation. Projects use `campaigns`, categories use `categories`, articles use `blog`, programmes and banners use `siteContent`. Gözbebekleri adds `siteContent` as an explicit staff grant; ADMIN behavior is unchanged. Generic editor pages and settings layouts enforce their own page guard.

The primary record is version-touched inside the same transaction as locale and child writes. The original settings forms send the version they loaded; their parent updates perform a conditional write, preventing stale settings from overwriting a colleague's work. Category settings now commit parent and locale writes atomically too. An older client that sends no version retains compatibility; reload clients after rollout to use the guard.

## Links, display and storage

- Changing a category's base link requires the new slug twice. Existing and historical links owned by another category are rejected. Every change/restore records from/to/time/actor. Historical slugs resolve directly to the current canonical destination. Existing locale-specific slugs remain intact.
- New category base slugs avoid historical reservations. Category settings cannot bypass the confirmed base-link flow.
- Native project ordering, category priorities, linked-content IDs, amounts, recipients and donation calculations are not rewritten by the content save API.
- Banners reject an end time before the start; datetime-local values are interpreted in Europe/Istanbul. Existing language prefixes are replaced once rather than duplicated, and explicit manual destinations take precedence over project links.
- SEO fields save into the native model/translation fields read by public metadata. Project descriptions are saved into the existing project SEO field names.
- Schema additions are optional editorial fields and category link history. Existing documents are not backfilled or translated automatically.

Existing programme and banner public routes remain in place. Stored project/category/banner image descriptions are connected to their existing public rendering/metadata where applicable.

## Validation

- `npm run test:content-editors`: focused service/provider tests. Includes rollback, stale drafts, child ownership, source-bound review markers, link change/restore/collision, immutable quotations, URL localization and schedule validation. Provider HTTP calls use test responses.
- `npm run test:content-editors:browser`: real React editor in headless Chromium with mocked HTTP and Next framework shims. Covers draft-only application, write failure retention, verified saving, stale suggestions, undo, navigation guard, slug confirmation and mobile overflow. The category fixture does not mount the rich editor. Screenshots are internal test artifacts.
- New tests are included in the build commands. Existing integration suites, TypeScript checks, schema validation and build compilation are recorded in the PR description with their actual results.
- No production content, donor records, amounts or live provider requests were modified by the verification work.

## Follow-up release verification

The complete Minber integration suite now passes 597/597. The prior module failures came from a runtime path alias in the navigation import; the previously hidden audit assertion expected an untranslated label. Regression tests now exercise the current canonical project URL and Arabic/Persian phone digit normalization. Schema validation uses a local placeholder URL only when none is configured; it makes no connection. Full TypeScript and the existing lint ceiling pass.

## Host checks still required

Generate both Prisma clients. Use a replica-set-backed MongoDB database for transactions. Run `npx tsx scripts/ensure-content-editor-indexes.ts` to inspect the additive index plan; `--apply` creates only missing indexes and never drops data or indexes. New Gözbebekleri content units need their unique/lookup indexes before concurrent editing.

On an isolated preview database, verify a save/read round-trip for all five kinds, conflicting edits in two sessions, one live translation, one live SEO request and actual public metadata. Confirm image descriptions and historical category redirects on the rendered pages. These authenticated host checks have not been claimed as completed locally.

For rollback, revert the application commit. Optional editorial fields and new collections can remain without affecting the old application. Preserve historical category redirects if links were changed after rollout.
