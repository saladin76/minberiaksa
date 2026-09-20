# CERTIFICATES_DOWNLOADS_HANDOFF.md
**أمر جاهز لـ Claude Code** — نظام شهادة الشكر + كل التحميلات في صفحة نجاح التبرع وصفحة مشاريع القدس الوقفية.

---

## الملفات المرفقة (المصدر الحقيقي — اقرأها ولا تعد تصميمها)

| الملف | الدور |
|---|---|
| `شهادة الشكر لوحة.dc.html` | **لوحة الشهادة فقط** (Sheet) — مكوّن مشترك بلا أزرار. يُستورد في الصفحة المستقلة وفي معاينة النجاح. |
| `شهادة الشكر عرضية.dc.html` | **النسخة الأساسية المعتمدة (Primary)** — A4 عرضي + أزرار الطباعة + `@page`. |
| `شهادة الشكر - احتياطي بالطول.dc.html` | نسخة بديلة (Alternate) — طولية، خيار للمشرف فقط. |
| `شهادة الاوقاف.dc.html` | شهادة الوقف الرسمية (سهم/متر) — وجهان، نصوص EN/TR حرفية معتمدة. |
| `إيصال التبرع.dc.html` | الإيصال المحاسبي (مستند مختلف تمامًا عن الشهادة). |
| `نجاح التبرع.dc.html` | صفحة النجاح: معاينات + كل أزرار التحميل. |
| `الأوقاف.dc.html` | مشاريع القدس الوقفية: معاينة الشهادة الحيّة قبل الدفع. |
| `i18n/certificates.json`, `i18n/system.json`, `i18n/common.json`, `i18n/quran.json` | كل نصوص الشهادات ×19 لغة. |
| `assets/cert-*.png`, `assets/waqf-cert-frame-blank.png`, `assets/waqf-logo-full-hq.png` | فنون الشهادات الرسمية. |

---

## الأمر (انسخه كما هو إلى Claude Code)

```
Implement the certificate + downloadable-documents system exactly as designed in the attached HTML files. The visual design is APPROVED AND LOCKED — recreate it faithfully; do not redesign, restyle, or "improve" any layout, spacing, color, or wording.

## 1. THREE DISTINCT DOCUMENTS — never merge them

| Document | When issued | Template |
|---|---|---|
| Thank-you Certificate | EVERY confirmed donation | شهادة الشكر عرضية (landscape A4) = PRIMARY; portrait version = admin-only alternate |
| Donation Receipt | EVERY confirmed donation | إيصال التبرع (accounting document — no emotional copy, no slogans) |
| Waqf Certificate | ONLY when cart contains a waqf item (share/meter) | شهادة الاوقاف (2 faces, official artwork) |

## 2. SERVER-SIDE GENERATION RULES (critical — read DONATION_LOGIC_SPEC.md §2)

- Serial numbers are generated ONLY by the server, ONLY after payment confirmation.
- Reloading the page or re-printing MUST NOT produce a new serial. The record's key is donationId.
- Certificate record: certificateId · serial · donationId · donorId · type (share|meter|thanks) · count · amount · currency · dedicatedTo · issuedAt · locale
- Waqf certificate numbers are per-unit sequences (meter and share have separate counters), reused from the cart item — never regenerate a second number.

## 3. PDF ENDPOINTS to build

GET /api/certificates/thanks/:donationId   -> renders شهادة الشكر عرضية template, returns PDF
GET /api/certificates/waqf/:certificateId  -> renders شهادة الاوقاف template, returns PDF
GET /api/receipts/:donationId              -> renders إيصال التبرع template, returns PDF

Each endpoint:
- authorizes the requester owns the donation (or is admin)
- reads the persisted certificate/receipt record (never recomputes serials)
- renders the SAME HTML template with the donor's real data
- returns application/pdf with a localized filename
- respects the donation's stored `locale` (the document must render in the language the donor used)

Recommended: Puppeteer/Playwright rendering the template route at A4 (landscape for thanks, portrait for waqf/receipt), printBackground: true.

## 4. TEMPLATE PROPS (wire these from the DB — they already exist as DC props)

Thank-you: donorName, title, verse, body, duaVerse, duaText, motto, serial, issuedAt, locale
Waqf: unit (share|meter), count, total, donorName, onBehalf, certNo, certDate, locale
Receipt: receiptNo, donorName, projectTitle, amount, currency, date, paymentMethod, locale

All body copy is dashboard-editable per template and per locale — store it, don't hardcode.

## 5. SUCCESS PAGE (نجاح التبرع) — the download surface

Replace the design-time placeholders with real endpoints:
- receiptHref      -> /api/receipts/:donationId
- certificateHref  -> /api/certificates/thanks/:donationId
- waqfCertHref     -> /api/certificates/waqf/:certificateId   (per waqf item)

Behavior to preserve exactly:
- Live thank-you certificate preview embedded in the page (scaled sheet component, NOT an image).
- donorName prefilled from checkout; the donor can EDIT it on this page and the preview updates live; the final edited name is what the PDF endpoint receives.
- Receipt and thank-you certificate always shown. Waqf certificate button appears ONLY if the cart had a waqf item — one button per waqf item, each with its own number and its own preview panel.
- Separate labels per unit: "تحميل شهادة السهم الوقفي" / "تحميل شهادة المتر الوقفي".

## 6. WAQF PAGE (الأوقاف — مشاريع القدس الوقفية) — live preview BEFORE payment

- Unit picker (share $100 / meter $1,500), quantity stepper (min 1), donor-name field.
- Live HTML/CSS certificate preview (official gold frame drawn in CSS + real tughra/seal/title PNGs — NOT a flat image), updating instantly as unit/count/name change.
- The preview certificate number is a client-side placeholder only. THE REAL NUMBER COMES FROM THE SERVER AFTER PAYMENT. Persist the cart item's assigned number and reuse it — never issue twice.
- On mobile the preview sits behind a toggle button (#waqf-cert-toggle) — keep that behavior.

## 7. EMAIL ATTACHMENTS

On payment success, the confirmation email must ATTACH real generated PDFs (not just links):
- شهادة الشكر.pdf + وصل التبرع.pdf (+ waqf certificate PDF when applicable)
Localized filenames per recipient locale (keys already exist in i18n/email.json: success.attachment0, etc.).

## 8. LOCALIZATION RULES (do not violate)

- All certificate strings come from i18n (certificates/system/common namespaces) — 19 locales.
- EN and TR certificate wording is taken VERBATIM from the association's official printed certificates. DO NOT retranslate or rephrase them.
- Qur'anic verses render in Arabic always, with the meaning translation below; source: i18n/quran.json (RELIGIOUS_LOCKED — never machine-translate).
- Certificate direction follows the donation locale (rtl for ar/ur, ltr otherwise).

## 9. PRINT

Keep the existing @page rules and .no-print class: action buttons never appear in the printed/PDF output.
```

---

## ملاحظتان مهمتان

1. **رقم الشهادة**: كل ما في الواجهة الآن رقم معاينة فقط. الخادم هو المصدر الوحيد بعد تأكيد الدفع — وإعادة التحميل لا تُنتج رقمًا جديدًا.
2. **الوقف قبل الدفع**: المعاينة الحيّة في صفحة الأوقاف مبنية HTML/CSS (لا صورة جامدة) لتتحدث فورًا مع الاسم والعدد — نفس القالب يُصيَّر لاحقًا PDF من الخادم.
