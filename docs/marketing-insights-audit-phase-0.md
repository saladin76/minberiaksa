# Marketing Insights Audit — Phase 0

## الحكم العام

صفحة التحليل والتوصيات جيدة كبداية. هي ليست نظام Intelligence كامل بعد، لكنها صالحة كصفحة قرار مختصرة داخل مرحلة Performance وIntelligence.

## مصادر البيانات الحالية

الواجهة تقرأ من API overview الخاص بـ Marketing Intelligence.

هذا API يجمع من:

- AdCampaignSnapshot
- MarketingPlatformDailyMetric
- MarketingPlatformConnection
- PlatformSyncRun
- Donation DB

كما يحسب site revenue من التبرعات المدفوعة والمنسوبة للإعلانات، وليس من أرقام المنصات فقط.

## نقاط القوة

- يعتمد على Donation DB كمصدر حقيقة للإيراد.
- يعرض spend وsiteRevenue وsiteRoas.
- يعرض active connections وfailed syncs.
- يعرض أعلى الحملات صرفًا.
- يستخدم قواعد توصية بسيطة ومفهومة.
- لا ينشئ نظام نتائج جديد خارج snapshots.

## الحدود الحالية

هذه الصفحة لا تزال مختصرة جدًا، لذلك لا يجب اعتبارها Intelligence كامل.

القيود الحالية:

1. التوصيات heuristic بسيطة.
2. لا يوجد تحليل Creative عميق.
3. لا يوجد funnel كامل من click إلى paid.
4. لا يوجد تفسير قوي للفروق بين الموقع والمنصة.
5. لا يوجد LTV أو monthly donor quality.
6. لا يوجد ربط مباشر بالمحتوى حتى يتم بناء Operations.
7. لا يوجد ربط مباشر بالأرشيف أو asset source.

## القرار

لا نعيد بناء الصفحة الآن.

نثبت دورها الحالي كالتالي:

- Performance summary
- First-level recommendations
- Quick decision screen

أما Intelligence الحقيقي لاحقًا فيأتي بعد:

- ContentItem
- ContentAdLink
- MarketingLearning
- Reconciliation 2.0
- Full donor journey events

## تحسينات آمنة لاحقًا

يمكن تحسينها بدون كسر النظام عبر:

1. إضافة label واضح: البيانات من الموقع مقابل البيانات من المنصات.
2. عرض platformRoas وsiteRoas جنبًا إلى جنب.
3. إضافة warning عند غياب platform snapshots.
4. إضافة رابط مباشر إلى Quality عند وجود failed syncs.
5. إضافة رابط مباشر إلى Link Generator عند غياب campaign attribution.
6. إضافة قسم صغير: What to do next.

## ممنوع الآن

- لا ننشئ جدول performance جديد.
- لا نكرر spend أو clicks أو revenue خارج snapshots.
- لا نربطها بـ Operations قبل بناء ContentItem.
- لا نعرض أرقام صفرية كأنها حقيقة عند غياب البيانات.

## الخلاصة

Insights ليست مصدر التعقيد الأكبر. هي فقط تحتاج توضيح حدودها حتى لا يتوقع الفريق منها ذكاء كامل قبل اكتمال Operations وLearnings.
