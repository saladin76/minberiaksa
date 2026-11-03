# Bank statement workspace

The bank-transfer page now has dedicated review, import, statement-history and account views. The review table displays bank names and original currencies; editing, donor contact matching and project assignment happen in a drawer. All 19 donor languages remain available. Filtered counts and approved totals come from the server across all matching records, not just the displayed page. Exports use the applied filters.

## Reading and importing

- XLSX, genuine BIFF XLS and CSV preserve spreadsheet row numbers, worksheet names, Turkish wall-clock date/time, references, channels, movement amounts and running balances. IBAN is extracted from decoded preamble cells, including compressed XLSX. TL/TRY in the amount header overrides the fallback currency without an FX conversion. Per-row currency columns take priority where supplied.
- The two supplied formats were inspected offline. Both yielded their complete 74 / 107 records, account IBAN, TRY, time and balances. They belong to different accounts. No source files, sender data or real account numbers are committed. Test fixtures use invented data only.
- Balances are shown as evidence. A gap between balances never changes a positive incoming export into a debit: exports can omit transactions. The amount column never falls through to the known balance/reference/channel columns.
- Maximum 8 MB; spreadsheets reject more than 5,000 data rows, excessive dimensions or oversized preambles instead of silently truncating. Multiple worksheets require an explicit choice. PDF extraction remains the existing heuristic path and requires careful manual review; scanned PDFs are not OCR-supported.
- Preview performs read-only duplicate/account/currency checks. Import requires a signed, two-hour preview receipt bound to file hash, bank, fallback currency, donor language, worksheet and parser version, plus the operator's confirmation. Import reparses the original bytes and repeats all database checks.
- Import only creates `PENDING_REVIEW` bank-transfer candidates. It never creates donations, charges cards, sends donor messages or transmits statements to an AI provider. Local name/project heuristics are suggestions. Approval is a separate, explicitly confirmed action by one authorized operator.

## Duplicate and failure behavior

V2 identities use account IBAN when available, currency, direction and dated bank reference; reference-less exports use precise timestamp plus balance context. Bank aliases and spreadsheet row order do not change a strong identity. Identical identities within a sheet are held for inspection; excluding a row requires re-preview. Legacy hashes, same-file evidence and nearby account/date/amount records are also checked. Ambiguous historical matches are held as possible duplicates rather than silently imported or discarded. This is conservative matching, not a claim that every arbitrary bank export supplies a globally unique transaction identifier.

Deterministic ObjectIds plus atomic `$setOnInsert` upserts make concurrent imports idempotent. Writes are batched in groups of 100. Counters reflect acknowledged writes and verified duplicates. Partial failures and uncertain acknowledgements are recorded separately; an unconfirmed write must be checked against history before retrying. Statement reads and aggregations use Prisma’s cursor-aware `findRaw` / `aggregateRaw` methods. Invalid replies and excessive result sizes fail closed. Small read-only model adapters map existing Mongo collections; client generation adds no indexes and requires no database migration or `db push`.

A statement previously stored with a different currency blocks re-import for review. Existing financial records are never corrected automatically. Account IBAN-ending mismatches also block import. Where matching metadata is missing the operator is warned and must verify the account manually.

## Approval and history

Approval rejects missing records, invalid/non-credit transactions and missing confirmation. An atomic claim prevents concurrent approvals or edits. Unexpected failures retain the claim for investigation; there is no automatic financial retry. The donation conversion helper uses a deterministic database identity as a concurrency backstop, including historical duplicate statement rows. A failed duplicate/contact lookup cannot be treated as an empty result. A lost commit reply is checked against that exact persisted identity; if the outcome remains unknown the review claim stays held. New donor creation and the donation are in the same transaction. Reviewer intent is retained on the pending statement line without marking it approved. Historical duplicates, mismatched amounts/currencies, or refunded donation evidence require investigation instead of choosing an arbitrary record. A record already linked to a donation (or approved historical record) cannot be deleted, reset, ignored or reassigned through this review endpoint. Financial corrections belong to the linked donation flow.

Statement removal is now archive-only. It never deletes bank-transfer transactions or donations. Archived statements remain visible on demand and their transaction identities continue preventing duplicates.

## Validation

Synthetic tests cover both file shapes, typed dates, currency precedence, amount/balance separation, worksheet/size boundaries, legacy matching, signed preview binding, atomic duplicate suppression, partial/uncertain writes, authorization, approval claims and archive preservation. The real client UI is exercised in Arabic, English and Turkish on desktop and mobile, using fixture HTTP APIs only. Production acceptance and statement import remain separate deployment steps.

## Final review follow-up

Excel export reads the complete filtered result, preserves time, balance and channel, and respects the requested sort. More than 10,000 matching rows returns a visible limit error instead of a partial workbook. A simulated 1,200-row export verifies first-batch truncation is gone. Failed reads cannot return an empty successful spreadsheet.

The reviewer UI refreshes server state after an uncertain or conflicting mutation before offering another approval. Verification covers lost commit acknowledgements, read failures, cross-row races, known rejection rollback, invalid legacy dates and preservation of the approval claim and reviewer intent. Live page inspection on 3 November still served the earlier import interface; no production imports, charges, donations, or messages were executed during this follow-up.

Reference: [Prisma v6 raw MongoDB queries](https://www.prisma.io/docs/orm/v6/prisma-client/using-raw-sql/raw-queries) explains why cursor reads use the dedicated methods instead of database commands.
