# خطة دمج مسارات الترجمة وSEO — منبر الأقصى

## نقطة الانطلاق
- Repo: `saladin76/minberiaksa`
- Main baseline: `35180bc75900e904f536450d5c6c4cb4caaa2a50`
- Integration: `integration/translation-seo-20261107`
- PR #143 (الصور) عمل مستقل، لا يدخل في هذا التكامل تلقائيًا.

## فروع عمل متوازية — مراجعة Draft PR
1. Translation core: `feat/translation-core-20261107` — PR #144.
2. Translation CMS: `feat/translation-cms-20261107` — PR #145.
3. Translation blog/slides: `feat/translation-blog-slides-20261107` — PR #146.
4. SEO dashboard: `feat/seo-dashboard-20261107` — PR #147.
5. SEO public: `feat/seo-public-20261107` — PR #148.

كل فرع يحتوي `docs/workstreams/<name>.md` بحدوده واختباراته. لا يعمل أي فرع في ملفات خارج ملكيته دون قرار تنسيق. لا تستخدم البيانات الإنتاجية في الاختبارات. حماية مال التبرعات، الـcron، الواتساب، وبيانات المتبرعين أولوية قصوى.

## بروتوكول الدمج (منفصل عن النشر)
1. مراجعة diff وSHA وملكية الملفات وغياب أي أسرار أو تغييرات إنتاجية غير مصرح بها.
2. مراجعة QA وصحة النتائج، خصوصًا أي تغيير API contract بين Core ↔ CMS.
3. دمج PR #144 أولًا إلى Integration، وإعادة تأسيس أو دمج آخر إصدار Integration في بقية فروع العمل **بعد انتهاء العمل بها وقبل قبولها**، وليس عمل rebase قسري من محادثة أخرى.
4. دمج #145 ثم #146 مع اختبارات عمليات الحفظ والترجمة وRTL، ثم #147 ثم #148 مع فحوصات SEO والروابط. كل دمج مشروط بنجاح الاختبارات، ولا يُفرض مع conflicts.
5. على Integration: `npm run test:content-editors` و`npm run typecheck:content-editor-service` و`npm run typecheck:communication-runtime` و`npm run typecheck:integration-release` و`npm run typecheck:baseline` و`npm run lint:ci` + اختبارات ترجمة/SEO/المتصفح والنشر المعزول.
6. تحقق من لغات الموقع الـ19، حفظ جميع اللغات دون فقد تنسيق، canonical/hreflang/sitemap/robots/noindex، حفظ slugs وإعادة التوجيه 301 للقديم.
7. PR منفصل `integration/translation-seo-20261107 → main` بعد اكتمال الفحص والأدلة واعتماد النشر. لا تستخدم تعارض PR #143 ولا تعديلات لم تُنشر كحقيقة للموقع.
8. نشر مرة واحدة عبر نظام نشر الإنتاج المعتمد والاحتفاظ بإمكانية rollback، ثم اختبارات حيّة للترجمات وSEO وروابط الموقع وشرائح المحتوى. لا تنشر أي تغييرات قبل اعتمادها.

## بروتوكول التقارير
كل محادثة تسلّم رابط PR الخاص بها، SHA، scope، نتائج أوامر الاختبار، عينات استجابات API ولقطات UI، ومخاطر معلنة. لا تفترض أن المحادثات الخمس تتشارك الحالة؛ ملف المهمة والـPR هما العقد الموحّد.
