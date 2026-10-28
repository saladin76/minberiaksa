# Dashboard re-audit: draft suggestions and editorial diagnostics

Implemented and merged in PR118 together with compact revenue cards and the Prisma report timeout repair. Follow-up source fixes are tracked in PR119–121. Production acceptance is separate from source and CI validation.

## Result

- Translation, proofreading, FAQ and content SEO can use validated snapshots of unsaved text drafts. The saved revision and permission checks still precede provider requests. Suggestions never save or publish content.
- Known configuration, access, model, quota, rate and request failures return controlled localized reasons. A shared failure stops remaining language requests; completed proposals remain reviewable. Provider payloads and credentials are not returned or logged.
- Multi-language requests start directly from the selected action. Progress, cancellation, result review and shared-failure batch stops remain available; suggestions do not save or publish content.
- Shared content and page SEO show before/after field comparisons. Page SEO supports accepting individual fields; both editors protect newer draft edits. All-failed batches cannot apply nonexistent proposals. Clean content saves are disabled; empty language searches explain the result.
- Editorial diagnostics summarize saved failure categories, eligible retries, cooldown and jobs requiring individual review. Reason filtering is bounded to the oldest 1,000 failed jobs, explicitly disclosed when truncated. The bulk retry action remains bounded and transient-only. Non-transient individual retries show the cause and require a review acknowledgement before requeueing. AI settings are directly linked.

## Validation

Initial PR118 validation: 1,094 integration tests and 133 content tests passed; complete TypeScript check passed; dashboard translations have no missing entries. Browser fixtures cover unsaved SEO requests, per-field acceptance, newer-edit conflicts, shared quota stops, no writes on generation, failed-batch apply controls, language search, diagnostic filters and individual retry review. Hosted browser/build results are recorded in the PR.

## Operating acceptance still pending

No production content was saved, no job retried, no AI text generated, no donor message sent and no payment charged during this implementation. Historical failures do not diagnose the current connection. Actual provider generation and financial/attribution reports must be verified after the combined release; recurring collection and message delivery are not certified by these fixture tests. The re-audit rechecked nine axes, not all 48 dashboard axes.
