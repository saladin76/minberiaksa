# Certificates, receipts and the success-page downloads

Implements `handoff-certificates/CERTIFICATES_DOWNLOADS_HANDOFF.md` and `DONATION_LOGIC_SPEC.md §2`.

## The three documents

| Document | Issued | Template component | PDF endpoint | Page |
|---|---|---|---|---|
| Thank-you certificate (A4 landscape, primary) | every confirmed donation | `components/minbar/certificates/ThanksCertificate.tsx` | `GET /api/certificates/thanks/:donationId` | `/{locale}/certificates/thanks/:donationId` |
| Thank-you certificate, portrait (admin-only alternate) | — | `ThanksCertificatePortrait.tsx` | same, `?layout=portrait` (revenue permission) | same, `?layout=portrait` |
| Waqf certificate (share / metre, two panels on one A4 landscape) | one per waqf line | `WaqfCertificateSheet.tsx` | `GET /api/certificates/waqf/:certificateId` | `/{locale}/certificates/waqf/:certificateId` |
| Donation receipt (A4 portrait, donor language + Turkish copy) | every confirmed donation | `ReceiptSheet.tsx` | `GET /api/receipts/:donationId` (old `/api/donations/:id/receipt` redirects) | `/{locale}/receipt/:donationId` |

## Server-side issuing (`lib/certificates/issue.ts`)

- `issueDonationDocuments(donationId)` runs from `dispatchDonationPaid` (every confirmation path: Stripe webhook, PayFor, Albaraka, bank-transfer confirm) and lazily from the success page / endpoints. Idempotent: existing records are returned; the unique indexes catch races.
- Eligibility = `status PAID && paidAt set`. Before that: endpoints answer 409, previews render without serials.
- Serials: `DocumentSequence` atomic counters — `thanks-<year>` → `MIA-THX-2026-000001`, `receipt-<year>` → `MIA-RCP-2026-000001`, `waqf-share` (starts 76543) / `waqf-meter` (starts 9876) → the bare number printed on the waqf face (`serial` = `MIA-WQF-S-076543`).
- Records: `Certificate` (serial · number · type · donationId · donorId · waqfItemId · count · amount · currency · donorName · dedicatedTo · issuedAt · locale), `DonationReceipt` (receiptNo · verifyCode), `DonationWaqfItem` (the waqf line; priced server-side from `lib/minbar/waqf.ts`).
- The donor's edited name on the success page is sent as `?name=` and stored on the certificate, so re-downloads and the emailed copy match.

**After pulling this change run `npx prisma db push`** to create the unique indexes (`Certificate.serial`, `Certificate.waqfItemId`, `DonationReceipt.donationId/receiptNo/verifyCode`). The code works without them (app-level checks), but the indexes are the race guarantee.

## Rendering (`lib/certificates/render.tsx`, `pdf.ts`)

The React sheets are rendered to static HTML with the handoff's `@page`/print rules and Google Fonts (Amiri, Cairo), then printed by headless Chromium: `@sparticuz/chromium` + `puppeteer-core` on Vercel/Lambda, a local Chrome/Edge otherwise (`PUPPETEER_EXECUTABLE_PATH` to pin one). Artwork is fetched from the site's own origin.

## Wording (`lib/certificates/copy-defaults.ts`, `copy.ts`)

Every printed line is an i18n string (`certificates` namespace, 19 locales; EN/TR waqf wording verbatim from the printed certificates). The dashboard page `/dashboard/certificates` (`siteContent`) stores overrides per template and per locale in `GlobalSettings.certificateCopy`. Qur'anic verses come from `quran` (locked) and are not editable; the meaning follows beneath in non-Arabic editions.

## Email

`dispatchEvent("DONATION_PAID")` generates the PDFs once and attaches them (`email.success.attachment0/1` filenames + one waqf PDF per line) to every EMAIL trigger; Elastic Email v4 `Content.Attachments` (`BinaryContent` base64). A rendering failure is logged and the email still goes out.

## Waqf flow

`الأوقاف` → cart row `{ typeKey: "waqf", waqf: { unit, count, donorName, onBehalf } }` (no number in the basket) → `POST /api/cart/payment` `waqfItems` → `DonationWaqfItem` → certificate per line at confirmation. Preview on the waqf page shows a marked placeholder number and today's date; on phones it sits behind `#waqf-cert-toggle`. Monthly waqf plans: only the first charge carries waqf lines (renewal donations are plain).
