# Marketing Operating System Closure Roadmap

## الهدف

إغلاق نظام التسويق بأعلى درجة ممكنة قبل بناء Operations وSmart Archive وBrand Center، بحيث يصبح النظام الحالي قاعدة مستقرة لا نحتاج الرجوع لإعادة بنائها لاحقًا.

## المبدأ

لا نعيد بناء نظام التسويق. الموجود قوي، لكن يحتاج إغلاق المنتج كرحلة تشغيل كاملة.

العمل يكون عبر تحسينات آمنة فوق الموجود:

- لا تعديل على الدفع.
- لا تعديل على checkout.
- لا تعديل على production tracking runtime إلا بعد اختبار مستقل.
- لا إنشاء نظام إعلانات جديد.
- لا إنشاء integrations center جديد.
- لا إنشاء campaign builder جديد.

## تعريف الإغلاق

يعتبر نظام التسويق مغلقًا عندما يجيب بوضوح على هذه الأسئلة:

1. هل الربط جاهز؟
2. هل البكسلات والتحويلات تعمل؟
3. هل روابط الحملات منظمة؟
4. هل البيانات تسحب من المنصات؟
5. هل الصرف مقابل التبرعات واضح؟
6. هل توجد مشاكل تتبع؟
7. ما القرار المطلوب اليوم؟
8. ما الذي يجب تطويره لاحقًا عبر Operations وليس داخل Marketing؟

## المراحل المقترحة للإغلاق

### M0 — Documentation and Flow

تم تنفيذ أغلبها في PR الحالي:

- توثيق Phase 0.
- توثيق Audits.
- إضافة operating-flow constants.
- تحديث الصفحة الرئيسية للتسويق.

### M1 — Marketing Home as Command Center

الهدف: تصبح الصفحة الرئيسية هي لوحة القيادة.

المطلوب:

- عرض رحلة التشغيل.
- عرض مصادر الحقيقة.
- إضافة What to do next.
- إضافة Quick links لأهم الصفحات.
- توضيح أن Link Generator هو Campaign Builder.

### M2 — Readiness and Health

الهدف: لا يضطر المستخدم للدخول لكل صفحة لمعرفة الوضع.

المطلوب لاحقًا:

- readiness summary من Connections.
- tracking health من Health API.
- last sync summary من PlatformSyncRun.
- warning عند غياب البيانات بدل أرقام صفرية مضللة.

### M3 — Conversions Closure

الهدف: تثبيت ConversionEvent كمصدر حقيقة لتسليم التحويلات.

المطلوب:

- صفحة أو قسم يوضح failed conversions.
- رابط واضح إلى conversion events.
- ربط Quality بمركز التسويق.
- عدم الاعتماد على timestamp واحد داخل Donation كمصدر وحيد.

### M4 — Campaign Links Closure

الهدف: إغلاق مسار الرابط والحملة.

المطلوب:

- اعتبار Link Generator هو Campaign Builder 2.0.
- إبقاء الروابط القديمة.
- إضافة وضع مبسط لاحقًا.
- بعد Operations فقط: ربط ContentItem بالرابط.

### M5 — Performance and Intelligence Closure

الهدف: فصل الأداء عن القرار.

المطلوب:

- عرض siteRoas وplatformRoas بوضوح.
- warning عند غياب platform data.
- What to do next.
- لا نبني intelligence كامل قبل وجود ContentItem وMarketingLearning.

### M6 — AI Closure

الهدف: منع تكرار مفاتيح AI لاحقًا.

المطلوب:

- الإبقاء على AI Assistant الحالي مؤقتًا.
- لاحقًا ترقية CUSTOM إلى OPENAI category AI.
- كل مخرجات AI تكون Draft.
- إضافة AiOperationRun لاحقًا عند بناء Operations/Archive.

### M7 — Handoff to Operations

الهدف: تحديد الحدود بوضوح.

Marketing مسؤول عن:

- الربط.
- التتبع.
- الروابط.
- سحب البيانات.
- جودة التحويلات.
- الأداء والتوصيات الأولية.

Operations مسؤول لاحقًا عن:

- خطة المحتوى.
- ContentItem.
- مهام الفريق.
- النشر.
- الرسائل.
- Learnings المرتبطة بالمحتوى.

Archive مسؤول لاحقًا عن:

- توثيقات Drive.
- AI asset analysis.
- Human review.
- Marketing picks.

## Acceptance Criteria

نعتبر نظام التسويق مغلقًا إذا:

1. الصفحة الرئيسية تعرض رحلة تشغيل واضحة.
2. Link Generator ظاهر رسميًا كـ Campaign Builder.
3. Connections تبقى مصدر الربط الوحيد.
4. Quality توضح صحة التتبع والتحويلات.
5. Insights توضح الأداء والتوصيات الأولية.
6. AI Assistant لا يكرر الإعدادات.
7. Google Ads Deep Data واضح أنه specialized preview وليس مصدر نتائج مكتمل.
8. لا توجد صفحات تسويق مكررة أو متضاربة.
9. لا توجد أرقام صفرية مضللة عند غياب البيانات.
10. يوجد قرار واضح: ما يبقى في Marketing وما ينتقل لاحقًا إلى Operations.

## الخطوة التالية داخل PR الحالي

إضافة تحسينات UX صغيرة وآمنة:

- تحديث PR description.
- إضافة What to do next إلى Marketing Home.
- إضافة section يوضح حدود Marketing مقابل Operations.
- عدم لمس APIs أو schema في هذه المرحلة.
