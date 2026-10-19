# WhatsApp donation delivery repair - 2026-10-19

## Fixed behavior

- Certificate and receipt URL buttons resolve their own component-scoped `donation.id` binding before any legacy global numeric parameter. A donor name in body position 1 can no longer replace a donation ID in button position 1.
- A missing scoped value fails with the exact binding name; it never borrows an unrelated body parameter. Imported templates without scoped metadata retain their legacy numeric fallback.
- All template context loaders now read campaign, category and waqf donation lines. Category-only and waqf-only donations no longer produce an empty project parameter merely because they have no campaign lines.
- Legacy donations with no usable project label get a general-donation label in the recipient's language (19 supported locales), without inventing financial lines or changing amounts.
- The canonical delivery archive now records the parameter builder's detail, not just `TEMPLATE_PARAMETER_MISSING`.
- The donor Smart WhatsApp picker now reads exact WABA/language approvals for the sender routed to each purpose, rather than the conservative cross-account aggregate. It uses the same locale fallback resolver as sending and groups templates by Meta's current category, including templates Meta reclassified.
- Template sending rechecks approval, actual provider category and archive status. Database failures in the picker surface as failures rather than an empty successful list.
- Opening conversation history closes both the sender dialog and the donor-profile overlay. A donor-history deep link searches across business numbers and updates an already mounted inbox; stale list responses cannot overwrite newer searches.
- Empty template choices have an explanatory state, and switching Utility/Marketing clears the previous purpose's selection.

## Validation

- 27 focused Node 24 source tests passed, including publisher-to-send button mapping, missing scoped values, legacy compatibility, mixed donation lines, all 19 fallback languages, exact WABA isolation, Meta recategorization and shared locale fallback.
- Re-running the parameter regression suite against the previous implementation reproduces three failures; the fixed implementation passes them.
- Focused strict TypeScript check covers the pure parameter builder, publisher component builder, project projection and locale modules.
- Focused strict TypeScript checks passed for the pure parameter, project and template-choice/readiness modules. The initial PR checks passed TypeScript, ESLint and i18n. Its full integration job reported failures outside the changed paths (dashboard removal, marketing structure, page access, project security, guest phone validation and route mappings); it must not be described as fully green.
- The changed UI and Prisma-backed picker have not been run on the production host. Run the repository release gates and normal build on the deployment checkout.
- Read-only production inspection confirmed that the root URL redirected to `/ar`. No root-opening failure was reproduced, so routing was not changed. An existing reply on the secondary business number was visibly marked READ, supported by delivered/read callbacks; no test message was sent.

## Host handoff

1. Review/merge the fix, pull the resulting commit on the host, install according to the existing lockfile and run the normal build/restart procedure.
2. No database migration, environment change or Meta template republication is required for this repair: it changes send-time values, not approved template schemas.
3. Verify one approved test recipient with a normal project donation, a category-only donation and a waqf donation. Confirm provider acceptance and delivery, and that each button points to the intended donation. Existing certificate authentication rules still apply.
4. Historical failed/skipped rows are not rewritten or automatically resent. Old snapshots containing an empty project value need a newly rendered attempt from the corrected context before any authorized resend. Existing uncertain-outcome/duplicate protections are not bypassed.

Marketing consent, opt-outs, recipient eligibility and campaign delivery controls remain unchanged. Provider category enforcement uses Meta's current exact variant and rejects unknown categories. No messages, campaigns, database writes, template publication or host deployment were executed as part of this source change.
