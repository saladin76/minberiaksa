# Seed package — بيانات الموقع جاهزة للبذر في قاعدة البيانات

مولَّد من مصادر الموقع الفعلية (لا بيانات وهمية): `projects-data.js` + `projects-i18n.js` + `blog-articles-data.js` + `blog-i18n.js`.

## الملفات
| الملف | المحتوى |
|---|---|
| `seed-data.json` | كل البيانات بشكل مطابق لمخطط Prisma |
| `seed.ts` | سكربت البذر (upsert على الـslug — idempotent) |

## الأعداد
| الجدول | العدد | ملاحظة |
|---|---:|---|
| `Category` | 24 | 19 منطقة (`region:*`) + 5 أنواع تبرع (`type:*`) |
| `CampaignTranslation` | 134 × 18 لغة | ترجمات كاملة (en/tr/fr/de/es/id/pt/ur/sq/it/nl/sv/no/da/ms/ja/zh/hi) |
| `Campaign` | 134 | كل مشاريع الموقع، العربية master |
| `PostCategory` | 29 | تصنيفات المدونة مترجمة ×18 |
| `Post` | 258 | كل المقالات، المتن HTML، **258/258 لها غلاف** |
| `PostTranslation` | 258 × 18 | العنوان والوصف مترجمان (المتن عربي فقط) |

## الصور — خطوة مطلوبة قبل البذر
**مقالات المدونة** تشير إلى ملفات محلية. انسخ مجلد الصور إلى مشروعك ثم ابذر:
```bash
cp -r assets/blog  public/assets/blog     # أغلفة 179–258
cp assets/blog-cover-*.jpg public/assets/  # أغلفة 1–178
```
ثم — إن كان مسار الصور في مشروعك مختلفًا — بدّل البادئة داخل `seed-data.json` قبل التشغيل:
```bash
sed -i 's#"assets/#"/assets/#g' seed-data.json      # أو أي بادئة CDN
```
**صور الحملات** روابط Drive مباشرة تعمل كما هي؛ يُفضَّل نقلها لاحقًا إلى CDN المشروع.

## التشغيل
```bash
cp seed/seed-data.json prisma/seed-data.json
cp seed/seed.ts       prisma/seed.ts
npx prisma generate
npx tsx prisma/seed.ts
```
> `seed.ts` يستورد `./seed-data.json` — ضع الملفين في نفس المجلد. لو مشروعك يمنع `resolveJsonModule` أضف في `tsconfig.json`: `"resolveJsonModule": true`.

## قرارات المطابقة مع المخطط
- **`targetAmount` / `currentAmount` / `baselineAmount` = 0** عمدًا، و`goalType: "OPEN"` — لا أرقام أهداف أو محصّلات غير موثقة رسميًا. حوّلها إلى `FIXED` بهدف حقيقي من الداشبورد.
- **`fundraisingMode`**: `SHARES` تلقائيًا لـ24 مشروعًا يحمل سعر وحدة (مثل «$15 للمقعد») مع `sharePriceUSD` مستخرجًا من النص؛ الباقي `AMOUNT`.
- **`Campaign.images`**: روابط Google Drive الحقيقية من `media.js` — **34 من 134 حملة** لها صورة ميدانية خاصة. الـ100 الباقية تُترك فارغة عمدًا (لا تُستعار صورة من منطقة أخرى) وتُرفع من الداشبورد — انظر `REMAINING_MEDIA_CONTENT.md`.
- **`Post.image`**: مسار محلي مثل `assets/blog/179-....jpg` — **كل 258 مسارًا تم التحقق من وجود ملفه فعليًا**.
- **`isActive`** = `false` للمشاريع المؤرشفة فقط.
- **`Post.content`** = HTML مبني من متن المقالة (`<p>` / `<h2>`) مع تهريب الرموز.
- **`Post.campaignIds`** فارغة: حقل `relatedProject` في المصدر نصّ وصفي لا slug — ربطه يدوي من الداشبورد لتفادي روابط خاطئة.

## حقول مرجعية للمحرر (خارج المخطط — يتجاهلها السكربت)
`unitLabelAr` (نص وحدة التسعير) · `sourceStatus` (active/seasonal/archived) · `relatedProjectLabelAr` · `externalKey` / `categoryKeys` (لربط الفئات أثناء البذر فقط).

## غير مشمول
- `Slide` (الهيرو): نصوص تصميم ثابتة في ملفات i18n وليست صفوف CMS.
- ترجمات **متون** المقالات: `NATIVE_LANGUAGE_REVIEW_REQUIRED` — تُدار من الداشبورد.
- أي بيانات متبرعين/تبرعات/مستخدمين: لا توجد بيانات حقيقية للبذر.
