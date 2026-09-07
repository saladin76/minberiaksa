# Marketing Operating System Cleanup — Phase 0

> Production safety note: this document is planning and UX consolidation guidance only. It must not change public website UX, checkout, payment flow, live tracking behavior, campaign URLs, slugs, redirects, or existing ad links.

## الهدف

ترتيب نظام الإعلانات والتسويق الحالي قبل بناء Operations & Content Hub وSmart Archive، حتى لا نضيف أنظمة جديدة فوق تجربة معقدة.

النظام الحالي يحتوي بالفعل على نواة قوية:

- Marketing home: `/dashboard/marketing`
- Tracking hub / connections
- Data sync
- Insights
- Quality
- AI Assistant
- Google Ads deep data
- Link Generator / Campaign Builder خارج صفحة التسويق الرئيسية
- Conversion events وtracking/ledger في أجزاء أخرى من النظام

المطلوب في Phase 0 ليس بناء نظام جديد، بل توحيد الرحلة وتوضيح مصادر الحقيقة.

## المشكلة الحالية

الأدوات موجودة، لكن المستخدم لا يرى رحلة تشغيل واضحة من البداية للنهاية. يجب ألا يشعر الفريق أن كل صفحة نظام مستقل.

المشكلة ليست ضعف النظام، بل تداخل مستويات مختلفة:

1. إعدادات وربط.
2. تشغيل الحملات والروابط.
3. قياس التحويلات وسحب البيانات.
4. تحليل الأداء.
5. توصيات وقرارات.

## الرحلة الرسمية المقترحة

يجب أن تقود صفحة `/dashboard/marketing` المستخدم بهذا الترتيب:

```txt
Setup
→ Campaign Builder
→ Conversions
→ Performance
→ Intelligence
```

### 1. Setup

الغرض: التأكد أن المنصات والتتبع جاهزة.

يربط إلى:

- `/dashboard/marketing/tracking-hub`
- `/dashboard/marketing/connections`
- `/dashboard/marketing/data-sync`

يعرض لاحقًا readiness لكل منصة:

- Connected
- Pixel configured
- Server conversion configured
- Reporting sync configured
- Last sync
- Last error
- Ready / Partial / Not ready

### 2. Campaign Builder

الغرض: إنشاء روابط حملات نظيفة وربط المحتوى بالإعلانات لاحقًا.

يربط إلى:

- `/dashboard/link-generator`

لاحقًا يمكن إضافة Campaign Registry بدون كسر Link Generator الحالي.

### 3. Conversions

الغرض: معرفة هل التحويلات وصلت فعلًا للمنصات أم لا.

يربط إلى:

- Conversion Events إن كان المسار موجودًا.
- Marketing quality / missing conversions.
- Retry flows عند الحاجة.

مصدر الحقيقة هنا هو `ConversionEvent` وليس timestamp واحد على Donation.

### 4. Performance

الغرض: قراءة الأداء من مصادر المنصات والتبرعات.

يربط إلى:

- `/dashboard/marketing/insights`
- `/dashboard/marketing/google-ads`
- `/dashboard/marketing/data-sync`
- Ads dashboard إن كان موجودًا خارج marketing namespace.

مصادر الحقيقة:

- Donation DB للمال الحقيقي.
- AdCampaignSnapshot / AdGroupSnapshot / AdSnapshot لبيانات المنصات.
- MarketingCampaignSnapshot للرسائل والقنوات التسويقية.

### 5. Intelligence

الغرض: تحويل الأرقام إلى قرارات.

يعرض لاحقًا:

- Reconciliation
- Recommendations
- Learnings
- Tracking fixes
- Budget actions
- Creative diagnostics

## مصادر الحقيقة الرسمية

يجب تثبيت هذه القاعدة في كل شاشة:

| المجال | مصدر الحقيقة |
| --- | --- |
| الأموال والتبرعات | Donation DB: `PAID` + `paidAt` |
| إرسال التحويلات | `ConversionEvent` |
| ربط المنصات | `MarketingPlatformConnection` |
| بيانات المنصات | `AdCampaignSnapshot`, `AdGroupSnapshot`, `AdSnapshot` |
| الرسائل | `SentMessage`, `EmailTemplate`, `WhatsappTemplate` |
| روابط الحملات | Link Generator الحالي، ثم Campaign Registry لاحقًا |
| المحتوى لاحقًا | `ContentItem` داخل Operations |

## قواعد عدم التكرار

في Phase 0 ممنوع:

- إنشاء Integrations Center جديد.
- إنشاء نظام ربط جديد.
- إنشاء نظام AI settings جديد.
- إنشاء ads performance tables جديدة تكرر snapshots.
- إعادة بناء Link Generator.
- إعادة بناء Blog أو Templates أو Users.
- إضافة صفحات كثيرة في السايدبار.

مسموح:

- تحسين صفحة `/dashboard/marketing` كواجهة قيادة.
- إضافة روابط واضحة للأدوات الموجودة.
- إضافة status labels مثل `جاهز`, `جزئي`, `غير مفعّل`.
- إضافة documentation داخل الريبو.
- إضافة helpers أو constants لتوحيد أسماء المراحل دون تغيير منطق production.

## الشكل المقترح لصفحة `/dashboard/marketing`

بدل عرض أدوات متساوية فقط، تعرض الصفحة:

1. Hero مختصر: `مركز التسويق والنمو`.
2. Quick diagnosis cards:
   - Tracking health
   - Platform readiness
   - Conversion delivery
   - Last data sync
3. Operating flow cards:
   - Setup
   - Campaign Builder
   - Conversions
   - Performance
   - Intelligence
4. Secondary tools:
   - AI Assistant
   - Google Ads deep data
   - Data sync history
5. Notes واضحة عند غياب البيانات:
   - لا تعرض صفرًا مضللًا.
   - استخدم `غير متاح` أو `لم يتم الربط`.

## علاقة Phase 0 بالـ Operations & Archive

لا نبدأ Operations وArchive فوق نظام تسويق مرتبك.

بعد Phase 0 يصبح الربط كالتالي:

```txt
Smart Archive
→ Marketing Picks
→ Operations ContentItem
→ Link Generator / Campaign Builder
→ Publishing / Messaging
→ Marketing Performance
→ Intelligence / Learnings
```

## Acceptance Criteria

تعتبر Phase 0 ناجحة إذا:

1. صفحة التسويق الرئيسية تشرح الرحلة بدل عرض أدوات منفصلة فقط.
2. السايدبار يبقى نظيفًا، ويعرض `نظام التسويق` كرابط واحد.
3. لا يوجد `/dashboard/integrations` جديد.
4. لا يوجد تكرار لـ MarketingPlatformConnection.
5. لا يوجد AI settings جديد.
6. لا يتم تغيير public website UX.
7. لا يتم تغيير checkout أو tracking production behavior.
8. كل شاشة تعرض غياب البيانات بوضوح بدل أرقام مضللة.
9. يوجد أساس واضح لربط Operations وArchive لاحقًا.

## Suggested implementation order

1. Documentation: add this Phase 0 document.
2. Update `/dashboard/marketing` copy and card structure.
3. Add central constants for marketing operating flow if useful.
4. Add non-invasive readiness summaries from existing APIs only.
5. Only after build passes, start Operations Phase 1.
