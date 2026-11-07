# SEO and translation center — 2026-10-29

## Observed failures

- The owner's editor screenshots showed a wide two-row section menu, an overlapping sticky header, a stopped translation batch, and the generic save error `حقول غير صالحة`.
- A review-only German translation requested through the production editor for project `6aa2ed7a817054fc3dd6b5f1` returned `seoDescription` with **208 UTF-16 characters**, exceeding the persistence limit of **170**. The proposal was closed without applying or publishing it.
- The browser batch started three workers after its first-language probe. The durable task queue allows two active tasks per operator. The batch could therefore reject its own third request and stop the remaining languages.
- Open Graph fields used different browser and server limits. Saving full locale snapshots also revalidated unchanged legacy metadata against current limits.

## Changes

- Replace the campaign/category/blog diagnostic entry with an SEO and translation workspace. The full center covers projects, categories, major projects and articles, with language selection, search, readiness filters and direct links into the selected locale and editor section.
- Readiness uses the editor's actual content contracts, includes all 19 languages, identifies copied Arabic, missing SEO and invalid saved fields, and never returns article bodies or donation data. Each request checks that section's permission and returns at most 50 items with a cursor. Metrics explicitly describe the current page rather than claiming whole-site totals.
- Keep public-page SEO and the editorial planner in separate tabs. Preserve mounted drafts when changing tabs. Project/category editors can enter the center; each tool and API continues checking its own permission.
- Put editor sections in a sidebar from medium viewport widths, alongside language controls, translation tools and editing fields. Use horizontal scrolling on small screens. Remove the overlapping sticky header, add a sidebar save action, and place short content/SEO fields alongside each other.
- Share metadata limits between validation, translation prompts, suggestion review and inputs. A translation gets one bounded metadata-only repair if needed. It never silently truncates text or regenerates the formatted document. Still-invalid metadata is omitted with a review warning while valid proposals remain available.
- Save actual text changes, preserving unchanged historical metadata. Report the failing language, named field and character budget; the editor opens and focuses the affected field before saving.
- Match batch concurrency to the durable queue's capacity of two while retaining cancellation, partial results, authorization and provider failure handling.
- Add English and Turkish dashboard copy for the new interface.

## Validation

- 214 content-editor tests and 1,332 integration tests pass (1,546 total).
- Regression coverage includes eighteen-language queue capacity, real translation-adapter metadata repair with formatting preservation, rejection of still-overlong metadata, preservation of legacy fields, bounded readiness responses and permission isolation.
- Content-editor, communication-runtime, integration-release and repository baseline type checks pass.
- Lint ratchet: 181 existing findings, zero critical, no new findings.
- Dashboard translation catalog check passes with no missing phrases.
- Production build compiles, type-checks and generates all 152 static pages using dummy build credentials and no production database.

## Deployment and verification boundary

Source is prepared for the existing reviewed release branch. This work does not deploy to the VPS, send donor messages, capture payments or trigger cron routes.

The supplied terminal log ends with a second release job blocked by the first job's lock. It does not establish the first job's final result.

The German proposal was verified in the live editor. Opening the separate local fixture in the cloud browser timed out, so the new layout has not been visually verified in that browser or on the live server. Production build and automated checks are separate from post-deployment browser acceptance.
