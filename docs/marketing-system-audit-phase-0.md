# Marketing System Audit — Phase 0

## ملخص سريع

النظام الحالي ليس ضعيفًا؛ المشكلة أنه يحتاج تثبيت رحلة تشغيل واضحة داخل `/dashboard/marketing` قبل إضافة Operations وArchive.

السايدبار حاليًا جيد لأنه يعرض التسويق كرابط واحد فقط: `/dashboard/marketing`. لذلك لا نحتاج زيادة روابط في السايدبار.

## خريطة الصفحات الحالية

| الصفحة | الدور الحالي | الحكم | الإجراء المقترح |
| --- | --- | --- | --- |
| `/dashboard/marketing` | مدخل النظام | جيد لكن يحتاج رحلة تشغيل أوضح | اجعله مركز قيادة للخطوات الخمس |
| `/dashboard/marketing/tracking-hub` | مدخل الإعدادات | جيد ومختصر | يبقى كـ Setup entry point |
| `/dashboard/marketing/connections` | ربط المنصات | أساسي | لا يكرر ولا ينقل |
| `/dashboard/marketing/data-sync` | تشغيل سحب البيانات | جيد | يبقى كأداة تشغيل داخل Performance/Setup |
| `/dashboard/marketing/quality` | جودة التتبع والإصلاح | مهم جدًا | يبقى مصدر Conversions quality |
| `/dashboard/marketing/insights` | التحليل والتوصيات | جيد كبداية | يصبح Performance + Intelligence مختصر |
| `/dashboard/marketing/ai-assistant` | إعداد AI | أداة مساعدة | يبقى Secondary tool |
| `/dashboard/marketing/google-ads` | Google deep data | أداة متخصصة | يبقى Secondary tool |
| `/dashboard/link-generator` | إنشاء الروابط | مهم جدًا | يربط داخل Campaign Builder بدل بناء صفحة جديدة |
| `/dashboard/conversion-events` | سجل التحويلات | مصدر حقيقة | يستخدم من Quality/Conversions |

## الرحلة المعتمدة

```txt
Setup → Campaign Builder → Conversions → Performance → Intelligence
```

### Setup

يدخل منه المستخدم إلى:

- Tracking Hub
- Platform Connections
- Pixels
- AI Assistant
- Data Sync readiness

### Campaign Builder

يدخل منه المستخدم إلى:

- Link Generator الحالي
- UTM links
- لاحقًا Campaign Registry بدون كسر الموجود

### Conversions

يدخل منه المستخدم إلى:

- Quality
- Conversion Events
- Repair Center إن وجد

### Performance

يدخل منه المستخدم إلى:

- Insights
- Data Sync
- Google Ads Deep Data
- Platform snapshots

### Intelligence

يدخل منه المستخدم إلى:

- Recommendations
- Reconciliation
- Learnings لاحقًا

## مشاكل التعقيد الحالية

1. Link Generator خارج رحلة التسويق رغم أنه جزء أساسي من التشغيل.
2. صفحة التسويق الرئيسية تعرض أدوات، لكنها لا تشرح التسلسل.
3. Quality وInsights متداخلتان ذهنيًا؛ يجب توضيح أن Quality للتتبع وInsights للقرار.
4. Data Sync أداة تشغيل وليست مركز تحليل.
5. Google Ads Deep Data أداة متخصصة وليست مدخلًا رئيسيًا لكل المستخدمين.
6. AI Assistant إعداد مساعد، وليس نظام AI مستقل.

## قواعد التنفيذ الآمن

- لا تعديل على public website.
- لا تعديل على checkout/payment.
- لا تعديل على tracking runtime في هذه المرحلة.
- لا إنشاء Integrations Center.
- لا إنشاء Ads Performance جديد.
- لا إنشاء AI settings منفصلة.
- لا إنشاء جداول جديدة لنتائج الإعلانات.
- أي تحسين الآن يكون UX وتنظيم فقط.

## أولويات الكود

1. استخدام `lib/marketing/operating-flow.ts` في صفحة `/dashboard/marketing`.
2. إضافة Link Generator كمرحلة رسمية داخل صفحة التسويق.
3. إضافة Sources of Truth داخل صفحة التسويق.
4. عدم لمس `tracking-hub` لأنه بالفعل مختصر وجيد.
5. بعد ذلك نراجع هل نحتاج route alias أو redirect من صفحات قديمة إلى الرحلة الجديدة.

## القرار

نبدأ بتحديث صفحة `/dashboard/marketing` فقط. باقي الصفحات تبقى كما هي حتى لا نكسر شيئًا.
