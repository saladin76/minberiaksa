# المحادثة 4 — أدوات إدارة SEO داخل لوحة التحكم

# قواعد مشتركة ملزمة للعمل المتوازي

- مستودع العمل: `saladin76/minberiaksa`، والفرع المحدد لك فقط. **لا تدمج ولا تنشر** ولا تشغّل migration أو seed أو cron ولا تعدّل بيانات الإنتاج.
- نقطة البداية: `35180bc75900e904f536450d5c6c4cb4caaa2a50` (`main` وقت التقسيم). لا تبنِ عملك على PR #143؛ فهو مستقل ومفتوح حتى الآن.
- لا تعمل مباشرة على `main` أو `integration/translation-seo-20261107`. أنشئ Draft PR إلى **فرع integration** للتسليم بعد رفع تعديلاتك إلى فرعك.
- استخدم ترجمة عربية أساسية، 19 لغة مدعومة حيث تنطبق، والكتابة RTL/LTR الصحيحة. لا تُصدر ترجمة آلية بغير مراجعة؛ احفظ بنية النص والروابط والعناصر المحمية.
- لا تكتب على قاعدة بيانات الإنتاج؛ استخدم fixtures/mocks والقراءة فقط. لا تغيّر الدفع أو تبرعات المتبرعين أو أنظمة الرسائل أو مسارات URLs الحالية من دون 301 مع اختبار.
- أي تغيير في ملف مشترك مع فرع آخر يُوقف حتى تتواصل مع محادثة الدمج وتوثق السبب؛ لا توسع النطاق تلقائيًا.
- اختبر `npm run test:content-editors` و`npm run typecheck:content-editor-service` و`npm run typecheck:baseline` و`npm run lint:ci`، مع اختبارات دقيقة لكل ميزة جديدة. إذا تطلب الاختبار توليد Prisma، استخدم بيئة معزولة بلا بيانات إنتاج.
- التسليم: رابط Draft PR + SHA + ملفات معدلة + اختبارات ونتائجها + صور/لقطات قبل/بعد + مخاطر + قائمة أمور لم تُنجز. لا تزعم نجاح نشر أو استعادة غير مؤكدة.

**الهدف:** أدوات SEO مهنية للمحرر الإداري: عنوان ووصف وOG وkeywords وNoindex وFAQ ومراجعة AI لكل لغة، مع التحذير من بيانات غير صحيحة وتوضيح حالة النشر والحفظ الجماعي.

**الملفات المملوكة حصريًا:** `components/dashboard/content-editor/PageSeoEditor.tsx`، `components/dashboard/content-editor/SeoWorkspace.tsx`، `components/dashboard/campaigns/SeoPanel.tsx`، `app/(dashboard)/dashboard/_components/ProjectInlineSeoWorkbench.tsx`، `app/(dashboard)/dashboard/_components/SmartSeoAuditCard.tsx`، `SmartSeoWorkbenchCard.tsx`، `SeoTextImproverCard.tsx`، `app/(dashboard)/dashboard/seo-pages/**`، `app/api/admin/seo/**`، `app/api/admin/page-seo/**`، اختبارات جديدة باسم `tests/content-editor/seo-dashboard-*.test.ts`.

**أعمال محددة:**
1. تدقيق عمليات توليد/تحسين عناوين ووصف SEO حسب نية البحث لكل لغة ورفض stuffing أو ادعاء غير موثق.
2. تدقيق حقول الصور OG/alt، التعارض بين عنوان المحتوى وSEO، والتحذير من حقول ناقصة أو Noindex غير مقصود.
3. إظهار Preview للمخرجات، اختلاف اللغات وحالة حفظها، تجنب الكتابة على لغة أخرى ضمن الحفظ الجماعي.
4. تقييم تجربة إدراج أدوات SEO في المحرر الإداري مع عدم لمس مترجم المشروع نفسه.

**ممنوع:** `lib/content-editor/public-seo.ts`، `lib/content-editor/page-seo.ts`، `lib/seo.ts`، `app/sitemap*`، `app/robots.ts` (محادثة 5)، أو `ContentEditor.tsx` (محادثة 2).

**ملاحظة:** إذا لزم تعديل خدمة مشتركة لتصبح واجهة SEO تعمل، ضع عقد API والتغيير المقترح في PR بدل تعديلها منفردًا.


## تسليم المحادثة

ارفع Commits إلى `feat/seo-dashboard-20261107` ثم أنشئ Draft PR هدفه `integration/translation-seo-20261107`، وضع فيه ملخص التعديلات والاختبارات ولقطات واجهة قبل/بعد. **لا تنشر مباشرة.**
