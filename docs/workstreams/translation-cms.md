# المحادثة 2 — تجربة تحرير وترجمة المشاريع والتصنيفات

# قواعد مشتركة ملزمة للعمل المتوازي

- مستودع العمل: `saladin76/minberiaksa`، والفرع المحدد لك فقط. **لا تدمج ولا تنشر** ولا تشغّل migration أو seed أو cron ولا تعدّل بيانات الإنتاج.
- نقطة البداية: `35180bc75900e904f536450d5c6c4cb4caaa2a50` (`main` وقت التقسيم). لا تبنِ عملك على PR #143؛ فهو مستقل ومفتوح حتى الآن.
- لا تعمل مباشرة على `main` أو `integration/translation-seo-20261107`. أنشئ Draft PR إلى **فرع integration** للتسليم بعد رفع تعديلاتك إلى فرعك.
- استخدم ترجمة عربية أساسية، 19 لغة مدعومة حيث تنطبق، والكتابة RTL/LTR الصحيحة. لا تُصدر ترجمة آلية بغير مراجعة؛ احفظ بنية النص والروابط والعناصر المحمية.
- لا تكتب على قاعدة بيانات الإنتاج؛ استخدم fixtures/mocks والقراءة فقط. لا تغيّر الدفع أو تبرعات المتبرعين أو أنظمة الرسائل أو مسارات URLs الحالية من دون 301 مع اختبار.
- أي تغيير في ملف مشترك مع فرع آخر يُوقف حتى تتواصل مع محادثة الدمج وتوثق السبب؛ لا توسع النطاق تلقائيًا.
- اختبر `npm run test:content-editors` و`npm run typecheck:content-editor-service` و`npm run typecheck:baseline` و`npm run lint:ci`، مع اختبارات دقيقة لكل ميزة جديدة. إذا تطلب الاختبار توليد Prisma، استخدم بيئة معزولة بلا بيانات إنتاج.
- التسليم: رابط Draft PR + SHA + ملفات معدلة + اختبارات ونتائجها + صور/لقطات قبل/بعد + مخاطر + قائمة أمور لم تُنجز. لا تزعم نجاح نشر أو استعادة غير مؤكدة.

**الهدف:** واجهة واحدة متماسكة لترجمة المشاريع والتصنيفات والتصنيفات الكبرى: العربية الأصل، ترجمة ومراجعة 19 لغة، `Save All` حقيقي، إحصاء الحالات، حفظ التنسيق، ومنع فقدان التعديلات.

**الملفات المملوكة حصريًا:** `components/dashboard/content-editor/ContentEditor.tsx`، `components/dashboard/content-editor/ContentLanguagePicker.tsx`، `components/dashboard/content-editor/TranslationOverview.tsx`، `app/(dashboard)/dashboard/_components/ContentTranslationTabs.tsx`، `app/(dashboard)/dashboard/_components/AutoTranslateButton.tsx`، `app/(dashboard)/dashboard/campaigns/**` و`categories/**` و`super-categories/**` **باستثناء صفحة/قسم SEO الخاص بالمشاريع**، واختبارات جديدة باسم `tests/content-editor/translation-cms-*.test.ts`.

**أعمال محددة:**
1. مراجعة تفاعلية حقيقية: ترجمة الكل ثم تعديل كل لغة قبل الحفظ؛ `Save All` لكل اللغات دفعة واحدة مع نجاح/فشل واضح دون ضياع الحقول أو فشل جزئي صامت.
2. عدادات اللغات المكتملة والناقصة/تحتاج تدقيق في القوائم والمحرر، tabs في الأعلى وعدم تكرار `المحتوى/معلومات المشروع/الترجمات`.
3. حفظ تنسيق rich-text بدل تسطيح النص لفقرة واحدة؛ الإشعارات تختفي بطريقة صحيحة وإظهار حالة الحفظ.
4. فحص التوافق مع أسماء الحقول والـslug والـSEO الحالية من دون تغيير روابط عامة أو قواعد الدفع.

**ممنوع:** `lib/content-localization/**` (محادثة 1)، `app/api/admin/content-localization/**`، محرر المدونة، مكونات `SeoPanel` و`PageSeoEditor` و`SeoWorkspace`، `app/sitemap*`.

**ملاحظة:** تغييرات خدمة الحفظ العامة `lib/content-editor/service.ts` أو `contracts.ts` تحتاج طلبًا موثقًا لمحادثة الدمج قبل لمسها لأنها مشتركة.


## تسليم المحادثة

ارفع Commits إلى `feat/translation-cms-20261107` ثم أنشئ Draft PR هدفه `integration/translation-seo-20261107`، وضع فيه ملخص التعديلات والاختبارات ولقطات واجهة قبل/بعد. **لا تنشر مباشرة.**
