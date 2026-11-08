# المحادثة 5 — SEO التقني العام والزحف والفهرسة

# قواعد مشتركة ملزمة للعمل المتوازي

- مستودع العمل: `saladin76/minberiaksa`، والفرع المحدد لك فقط. **لا تدمج ولا تنشر** ولا تشغّل migration أو seed أو cron ولا تعدّل بيانات الإنتاج.
- نقطة البداية: `35180bc75900e904f536450d5c6c4cb4caaa2a50` (`main` وقت التقسيم). لا تبنِ عملك على PR #143؛ فهو مستقل ومفتوح حتى الآن.
- لا تعمل مباشرة على `main` أو `integration/translation-seo-20261107`. أنشئ Draft PR إلى **فرع integration** للتسليم بعد رفع تعديلاتك إلى فرعك.
- استخدم ترجمة عربية أساسية، 19 لغة مدعومة حيث تنطبق، والكتابة RTL/LTR الصحيحة. لا تُصدر ترجمة آلية بغير مراجعة؛ احفظ بنية النص والروابط والعناصر المحمية.
- لا تكتب على قاعدة بيانات الإنتاج؛ استخدم fixtures/mocks والقراءة فقط. لا تغيّر الدفع أو تبرعات المتبرعين أو أنظمة الرسائل أو مسارات URLs الحالية من دون 301 مع اختبار.
- أي تغيير في ملف مشترك مع فرع آخر يُوقف حتى تتواصل مع محادثة الدمج وتوثق السبب؛ لا توسع النطاق تلقائيًا.
- اختبر `npm run test:content-editors` و`npm run typecheck:content-editor-service` و`npm run typecheck:baseline` و`npm run lint:ci`، مع اختبارات دقيقة لكل ميزة جديدة. إذا تطلب الاختبار توليد Prisma، استخدم بيئة معزولة بلا بيانات إنتاج.
- التسليم: رابط Draft PR + SHA + ملفات معدلة + اختبارات ونتائجها + صور/لقطات قبل/بعد + مخاطر + قائمة أمور لم تُنجز. لا تزعم نجاح نشر أو استعادة غير مؤكدة.

**الهدف:** إصلاح SEO الظاهر لجوجل والمستخدم، بما فيه canonical وhreflang وsitemap وrobots و301 وتفادي صفحات مكررة وnoindex خاطئ، في جميع اللغات الـ19.

**الملفات المملوكة حصريًا:** `lib/content-editor/public-seo.ts`، `lib/content-editor/page-seo.ts`، `lib/content-editor/page-seo-sitemap.ts`، `lib/content-editor/page-seo-registry.ts`، `lib/seo.ts`، `lib/seo-description.ts`، `lib/sitemap.ts`، `lib/minbar/slug-routing.ts`، `lib/minbar/redirect-query.ts`، `app/robots.ts`، `app/sitemap.xml/**`، `app/sitemap/**`، `lib/campaign/project-seo.ts`، `lib/campaign/seo-fields.ts`، اختبارات جديدة باسم `tests/content-editor/seo-public-*.test.ts`.

**أعمال محددة:**
1. تدقيق إنتاج metadata وcanonical وhreflang وOpenGraph وschema.org وstatus codes لكل نوع صفحة/لغة.
2. التأكد من استبعاد الصفحات غير المنشورة أو noindex من sitemap، وتجزئة sitemap وروابطها وفق السلوك الحالي.
3. فحص الروابط المترجمة والـslugs والتاريخ/التحويلات 301: لا تغيّر المسار القديم دون redirect متوافق مع query، وتجنب حلقات التحويل ومسارات اللغة المكررة.
4. اختبارات متعددة اللغات للتصنيفات والمشاريع والمدونة والصفحات الثابتة، وتقييم ما يحدث عند نقص ترجمة إحدى اللغات.

**ممنوع:** واجهة لوحة التحكم ومحررات المحتوى، أي تغيير قاعدة بيانات أو slugs منشورة دون موافقة، أو الاعتماد على sitemap فقط لإثبات ظهور البيانات في Google.

**ملاحظة:** لا تغيّر Metadata في ملف صفحة خارج الملكية قبل توثيق حاجة التعديل وإخطار محادثة الدمج. لا تنفذ نشرًا.


## تسليم المحادثة

ارفع Commits إلى `feat/seo-public-20261107` ثم أنشئ Draft PR هدفه `integration/translation-seo-20261107`، وضع فيه ملخص التعديلات والاختبارات ولقطات واجهة قبل/بعد. **لا تنشر مباشرة.**
