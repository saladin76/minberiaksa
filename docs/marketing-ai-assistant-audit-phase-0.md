# AI Assistant Audit — Phase 0

## الحكم العام

AI Assistant الحالي بسيط ومقبول مؤقتًا.

الأهم أنه لا ينشئ جدول إعدادات مستقل. هو يستخدم MarketingPlatformConnection كسجل لإعدادات AI، وهذا متوافق مع قرار عدم إنشاء AI settings منفصلة.

## ما يعمل جيدًا

- يستخدم permission الخاصة بالتسويق.
- يخزن الإعدادات داخل MarketingPlatformConnection.
- يخفي المفتاح في GET response باستخدام masking.
- يسجل AuditLog عند الحفظ.
- الواجهة بسيطة ولا تدعي أنها نظام AI كامل.

## الحدود الحالية

- يستخدم platform = CUSTOM وcategory = CUSTOM.
- أسماء الحقول داخل MarketingPlatformConnection مستخدمة بشكل مؤقت:
  - accountName = provider
  - accountId = model
  - businessId = baseUrl
  - managerAccountId = assistantId
  - defaultCurrency = dailyBudgetLimit
- لا يوجد service مشترك لتحليل التسويق أو الأرشيف أو العمليات بعد.
- لا يوجد AiOperationRun حتى الآن.

## القرار

لا نعيد بناء AI Assistant الآن.

يبقى كإعداد مؤقت للـ Marketing Operating System.

لكن عند البدء في Operations وArchive يجب ترقية هذا التصميم بدل تكراره.

## الترقية المقترحة لاحقًا

عند تنفيذ Phase AI أو Archive AI:

1. أضف category = AI إلى MarketingPlatformConnection.
2. أضف platform = OPENAI.
3. انقل/اربط إعدادات AI Assistant الحالية إلى OPENAI.
4. أنشئ service مشترك مثل growth-suite-ai.
5. أضف AiOperationRun لتسجيل كل عمليات AI.
6. اجعل كل مخرجات AI Draft ولا تعتمد تلقائيًا.

## ممنوع الآن

- لا ننشئ AI settings جديدة للأرشيف.
- لا ننشئ AI settings جديدة للعمليات.
- لا نخزن مفاتيح مكشوفة في responses أو AuditLog.
- لا نجعل AI يتخذ قرارات نهائية.

## الخلاصة

AI Assistant ليس مشكلة الآن. لكنه يحتاج ترقية منظمة لاحقًا قبل استخدامه في Smart Archive وOperations، حتى لا تتكرر مفاتيح OpenAI في أكثر من مكان.
