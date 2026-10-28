# Dashboard audit: first implementation batch

Source baseline: `43b705d4b7c424727272bf68b09b30a611d952cb`.

This batch addresses dashboard findings from the October 2026 review. Source validation and VPS acceptance are separate: none of the rows below is a claim that a bank renewed a donation, a provider delivered a message, or an advertising platform received a conversion.

## Implemented changes

| Audit axis | Change | Verification |
| --- | --- | --- |
| A60 | Load campaign rows independently from lifetime financial attribution. Bound reads, show unavailable income explicitly, and provide recovery after list/report errors. | Authorized fast-list endpoint tests; stalled body deadline; browser loading, financial failure and recovery in AR/EN/TR. |
| A60 / A73 | Select communication donation IDs in MongoDB before fetching typed financial rows; keep all historical supported media and paginate every matching page. Add a non-unique lookup index. | Historical aliases, settled income, currency precision, shared-UTM ambiguity, complete pagination and malformed-page regressions. |
| A78 | Classify saved editorial failures and show attempts, timestamps and the latest completed/approved task. Batch retry handles known temporary failures only after ten minutes, below three attempts, up to twenty tasks. | Request/access/billing exclusions; cooldown and limits; version-checked requeue; no generation or content publication in retry tests. |
| A43 / A58 | Keep core content languages visible, retain the selected extra language, and provide a searchable expandable list for the remaining languages. Preserve drafts and completeness indicators. | Real editor language switching and retained drafts; existing editor browser suite and narrow-screen screenshots. |
| A39 | Block editing when payment settings cannot be read. Describe Albaraka 2D/3D configuration accurately and distinguish renewal configuration from successful collection. | Browser failure/retry and absence of editable gateway radios during failed reads. |
| A36 | Label filtered user totals according to their actual scope. | Existing donor directory browser scenarios and translation audit. |
| A68 | Describe scheduler configuration on the hosting server and show connection timestamps in the same Istanbul timezone. | Type, lint and translated interface checks; no infrastructure or credential changes. |
| A76 | Describe assistant revenue as attribution within a defined window. | Existing dashboard/analytics checks; attribution calculation unchanged. |

## Remaining dashboard scope

These are outstanding acceptance areas, including partially addressed axes. They are not silently marked complete by this batch.

| Axes | Remaining work |
| --- | --- |
| A31 | Navigation preferences, task discovery and full keyboard review. |
| A32–A35 | Financial scope/precision, recurring reconciliation and renewal evidence, bank import fixtures and receipt approval checks. |
| A36–A38 | Contact normalization and donor matching, bank ownership verification, currency-aware cart suggestions and duplicate exclusion. |
| A39–A41 | Gateway operation evidence, role-based permission checks and correlated audit filters. |
| A42–A46 | Diagnostic denominators, independent draft workflows, per-image metadata, SEO transport checks and project-linked achievements. |
| A47–A50 | Category readiness and recovery, assembled programme/locale checks, article review and story scheduling. |
| A51–A56 | Video source readiness, programme/course links, document metadata, FAQ accuracy, homepage composition and banner lifecycle. |
| A57 | Genuine payment-backed notification design and privacy controls. |
| A58–A59 | SEO proposal comparisons and field selection, certificate preview and variable validation. |
| A60–A64 | Live campaign load acceptance, controlled delivery tests, provider failure classification and trigger eligibility evidence. |
| A65–A70 | Segment boundaries, WhatsApp attachments and ownership, site inbox follow-up, provider readiness, Telegram and approved quick-donation destinations. |
| A71–A77 | Donation funnel/revenue reconciliation, Search connection/planning, attribution transport, referrals, platform-side deduplication and assistant settings/insights. |
| A78 | Verify article/translation generation after provider-side constraints are resolved; review historical failures individually. No bulk production retries were executed. |

## Deployment acceptance

Use the tested merge commit with the existing VPS deployment procedure. Confirm the new additive index exists, measure campaign-list response separately from revenue, and verify error/recovery behavior against that running build. Keep production credentials, donor records and provider response bodies out of release evidence.
