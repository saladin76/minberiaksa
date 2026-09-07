# خارطة تطوير تجربة الاستخدام — Dashboard UX Roadmap

> **تاريخ الإنشاء:** 2026-08-02
> **الغرض:** رفع مستوى لوحة التحكم من "شاشات تعمل" إلى "منتج احترافي مريح ومنظم".
> **النطاق المتفق عليه:** واجهة فاتحة فقط (لا وضع ليلي الآن) · هيكل محايد بلمسات زرقاء · إعادة بناء القشرة + مكونات مشتركة + تطبيقها على أهم ١٢ صفحة.
>
> هذا المستند مكمّل لـ [dashboard-completion-roadmap.md](dashboard-completion-roadmap.md) الذي يعالج **صحة الأرقام**. هذا المستند يعالج **تجربة الاستخدام**. لا تتعارض الوثيقتان.

---

## 1. التشخيص — ما المشكلة فعليًا

اللوحة تحتوي **١٥١ صفحة** و**~٥٢٬٤٠٠ سطر**. المشاكل ليست تجميلية فقط، بل بنيوية:

### أ. التنقّل والبنية المعلوماتية
| # | المشكلة | الأثر | الدليل |
|---|---|---|---|
| N1 | ٤٠ عنصر تنقّل في ٧ مجموعات، قائمة مسطّحة بلا تسلسل | المستخدم يفقد موقعه | `lib/dashboard/nav-config.ts:5-94` |
| N2 | الأيقونات مرتبطة بـ**مفتاح الصلاحية** لا بالصفحة → ٦ عناصر في "التواصل" و٥ في "التشغيل" تحمل نفس الأيقونة `MessageSquare` | لا يمكن التمييز بصريًا | `DashboardLayoutClient.tsx:82-104` |
| N3 | عناوين مكرّرة: "نظرة عامة" ×٢، "السجلات المتقدمة" ×٢، "الحملات" بمعنيين | لبس دائم | `nav-config.ts:63,73,79,91,46` |
| N4 | التنقّل عبر `<button onClick={router.push}>` لا `<Link>` | لا prefetch، لا فتح في تبويب جديد، لا زر أوسط | `DashboardLayoutClient.tsx:173` |
| N5 | حالة طيّ المجموعات في `useState` غير محفوظة | تُفقد مع كل إعادة تحميل | `DashboardLayoutClient.tsx:59` |
| N6 | **لا يوجد بحث ولا لوحة أوامر** رغم أن `cmdk` مثبّتة | الوصول لأي صفحة = تصفّح يدوي | لا مطابقات لـ `⌘K` في القشرة |
| N7 | **٣٤ صفحة مبنية بالكامل وغير قابلة للوصول من التنقّل**: `marketing-intelligence/*` (٢٢) و`brand/*` (١٢) | عمل مهدور بالكامل | لا مدخل في `DASHBOARD_NAV_GROUPS` |

### ب. سياق الصفحة
| # | المشكلة | الأثر | الدليل |
|---|---|---|---|
| C1 | فتات الخبز من مستويين فقط، وتعرض **آخر جزء من المسار بالإنجليزية الخام**: `/operations/communication/audiences` → «لوحة التحكم › audiences» | لا يفيد، ويكسر عربية الواجهة | `DashboardLayoutClient.tsx:225` |
| C2 | المسارات الديناميكية تعرض المعرّف الخام (`686f2a…`) | غير مقروء | نفس السطر |
| C3 | لا يوجد `PageHeader` مشترك؛ كل صفحة تعيد اختراع العنوان بأحجام مختلفة (`text-2xl` مقابل `md:text-3xl`) | عدم اتساق | `campaigns/page.tsx` مقابل `monthly/page.tsx` |
| C4 | كل صفحة ملفوفة قسريًا داخل بطاقة بيضاء + حشو مزدوج | الصفحات التحليلية تبدو مضغوطة داخل صندوق | `DashboardLayoutClient.tsx:233-234` |

### ج. الحالات (تحميل / فراغ / خطأ)
| # | المشكلة | الأثر | الدليل |
|---|---|---|---|
| S1 | **`error.tsx` = صفر** عبر ١٥١ مسارًا | أي خطأ عرض يهدم القشرة كاملة | لا ملفات |
| S2 | **`loading.tsx` = ملف واحد** فقط | صفحات الخادم تتجمّد بلا مؤشر | `platform-connections/communication/loading.tsx` |
| S3 | حالات الفراغ نص عارٍ: «لا توجد بيانات» بلا أيقونة ولا إجراء | طريق مسدود للمستخدم | `monthly/page.tsx`, `campaigns/page.tsx` |
| S4 | `ui/skeleton.tsx` موجودة و**غير مستخدمة إطلاقًا**؛ كل صفحة تكتب `animate-pulse` يدويًا | تكرار وعدم اتساق | ٠ استيراد في اللوحة |

### د. نظام التصميم
| # | المشكلة | الأثر | الدليل |
|---|---|---|---|
| D1 | **٧٥٠ تكرارًا للون `#025EB8` في ١٧٠ ملفًا** بلا رمز تصميم | تغيير الهوية = تعديل ١٧٠ ملفًا | لا مفتاح `brand` في `tailwind.config.ts` |
| D2 | `--primary-foreground: 206 98% 65%` أزرق فاتح لا لون تباين → لا يمكن كتابة نص أبيض على `bg-primary` عبر الرمز | الرمز غير صالح للاستخدام | `app/[locale]/globals.css` |
| D3 | `--primary-light` / `--secondary-light` معرّفة وغير مربوطة في Tailwind | رموز ميتة | نفس الملف |
| D4 | ألوان الرسوم البيانية hex خام داخل كل ملف (`#2563eb`, `#22c55e`…) | لوحة ألوان غير متسقة | `monthly/page.tsx`, `DashboardAnalytics.tsx` |
| D5 | `Table` مستخدمة في ٥ ملفات فقط مقابل `Card` في ١٠٦ → أغلب الجداول `div` يدوية | سلوك ومظهر مختلفان لكل جدول | إحصاء الاستيراد |

### هـ. الجوال وإمكانية الوصول
| # | المشكلة | الدليل |
|---|---|---|
| M1 | شعار الجوال `src="logo-white.png"` **بلا شرطة بادئة** → 404 في كل مسار متداخل | `DashboardLayoutClient.tsx:214` |
| M2 | الدرج الجانبي بلا `Escape`، بلا حبس تركيز، بلا `aria-*` على زر الفتح | `DashboardLayoutClient.tsx:207-219` |
| M3 | `ChevronLeft` مستخدمة للطيّ وللفاصل دون قلب مع RTL | `:167,225` |

### و. كود ميت وتكرار
- `DashboardThemeProvider` مركّبة في القشرة و`useDashboardTheme` **غير مستهلَكة في أي مكان**.
- `components/ui/sidebar.tsx` (٢٣ ك.ب) غير مستخدمة — القشرة مكتوبة يدويًا.
- `components/DashboardHeader.tsx` **يُرجع `null`** (٧ أسطر).
- ٣ أنظمة إشعارات: `react-hot-toast` (مستخدم) + `sonner` + `sweetalert2` + `ui/toaster` (غير مستخدمة).
- نسخة ثانية كاملة من `components/ui/` في `app/[locale]/components/ui/`.
- ٤ مكوّنات تحقن DOM عالميًا في **كل** المسارات الـ١٥١ بغض النظر عن الصلة: `DashboardAutoEnhancements` (تُرقّع `fetch` و`XMLHttpRequest` عالميًا)، `ProjectEditorSectionsEnhancer`، `ProjectLocaleSlugEditor`، `BankTransfersExportPanel`.

---

## 2. المبادئ الحاكمة

1. **القشرة تنسحب، المحتوى يتقدّم.** الهيكل رمادي محايد؛ الأزرق `#025EB8` محجوز للعنصر النشط وأزرار الإجراء والبيانات.
2. **إعادة الاستخدام قبل الاختراع.** `shadcn/ui` كاملة موجودة (٤٥ مكوّنًا). نبني ما هو ناقص فعلًا فقط.
3. **رمز واحد لكل قرار تصميم.** لا hex خام جديد بعد المرحلة ٠.
4. **لا كسر للأرقام.** لا تُمسّ منطق الحسابات؛ التعديلات عرضية فقط. راجع `dashboard-completion-roadmap.md` قبل أي مساس بـ `currentAmount`.
5. **RTL أصيل**، لا استثناءات شرطية متناثرة.

---

## 3. المراحل

### المرحلة ٠ — أساس الرموز (Design tokens)
**الملفات:** `tailwind.config.ts`, `app/[locale]/globals.css`

- إضافة `colors.brand.{DEFAULT,dark,light,50…900}` و`colors.accent` (البرتقالي `#FA5D17`) إلى `theme.extend`.
- إصلاح `--primary-foreground` ليصبح لون تباين حقيقي (أبيض)، وكذلك `--secondary-foreground`.
- ربط `--primary-light` / `--secondary-light` أو حذفهما.
- تعريف لوحة ألوان الرسوم البيانية `chart.1…8` كرموز.

**المخرج:** `bg-brand`, `text-brand`, `ring-brand` تعمل. لا تغيير بصري بعد.
**المخاطر:** لا شيء — إضافة بحتة.

---

### المرحلة ١ — إعادة بناء القشرة ⭐ الأعلى أثرًا
**الملفات:** `DashboardLayoutClient.tsx` (تفكيك)، `lib/dashboard/nav-config.ts`، ملفات جديدة تحت `app/(dashboard)/dashboard/_shell/`

| # | العمل | يعالج |
|---|---|---|
| 1.1 | نقل الأيقونة إلى `nav-config.ts` **لكل عنصر** بدل الربط بمفتاح الصلاحية | N2 |
| 1.2 | إزالة تكرار العناوين — تسمية صريحة لكل عنصر | N3 |
| 1.3 | الشريط الجانبي: خلفية `slate-50`/أبيض، حدود خفيفة، العنصر النشط بأزرق العلامة | الاتجاه البصري |
| 1.4 | استبدال `<button>` بـ `<Link>` في كل عناصر التنقّل | N4 |
| 1.5 | حفظ حالة الطيّ في `localStorage` + فتح المجموعة الحاوية للمسار النشط تلقائيًا | N5 |
| 1.6 | **لوحة أوامر `⌘K` / `Ctrl+K`** عبر `cmdk` الموجودة — بحث في كل الـ٤٠ عنصرًا + إجراءات سريعة | N6 |
| 1.7 | فتات خبز حقيقية متعددة المستويات مشتقّة من `nav-config` بالعربية، مع روابط للأجداد | C1, C2 |
| 1.8 | قائمة مستخدم منسدلة (`DropdownMenu`) بدل زر الخروج العاري | تحسين |
| 1.9 | إصلاح مسار شعار الجوال، إضافة `Escape` + حبس تركيز + `aria-*` | M1, M2 |
| 1.10 | قلب الأيقونات الاتجاهية مع RTL | M3 |
| 1.11 | إزالة غلاف البطاقة البيضاء المزدوج — الصفحة تملك تخطيطها | C4 |
| 1.12 | حذف `DashboardThemeProvider` الميت و`DashboardHeader.tsx` الفارغ | كود ميت |

**المخاطر:** متوسطة — ملف واحد يخدم ١٥١ مسارًا. الاختبار: التنقّل عبر كل مجموعة + التحقّق من بوابات الصلاحيات.

---

### المرحلة ٢ — المكونات المشتركة الناقصة
**الملفات الجديدة:** `components/dashboard/`

| المكوّن | البديل الحالي | ملاحظة |
|---|---|---|
| `PageHeader` | ٥ صيغ مختلفة يدويًا | ترقية `marketing/_components/MarketingPageHeader.tsx` (٢٥ سطرًا) إلى مشترك |
| `EmptyState` | نص عارٍ | أيقونة + عنوان + وصف + إجراء |
| `PageSkeleton` / `TableSkeleton` / `StatsSkeleton` | `animate-pulse` يدوي | تبنّي `ui/skeleton.tsx` المهجورة |
| `FilterBar` | يدوي في كل صفحة | بحث + مرشّحات + إجراءات، RTL جاهز |
| `SectionCard` | `Card` + عناوين يدوية | غلاف موحّد للأقسام |
| `StatsMetricCard` (تحديث) | موجود، لكنه يثبّت `bg-white`/`text-slate-900` | تحويله لرموز |
| `chart-theme.ts` | hex خام | لوحة ألوان موحّدة للرسوم |

**إعادة الاستخدام المؤكّدة:** `components/dashboard/StatsMetricCard.tsx`، `_components/data-table.tsx` (TanStack، مستخدم في صفحة واحدة فقط رغم جودته)، كل `components/ui/*`.

---

### المرحلة ٣ — الصلابة (حدود الخطأ والتحميل)
- `app/(dashboard)/dashboard/error.tsx` — حدّ خطأ يحافظ على القشرة ويعرض زر إعادة محاولة. **يعالج S1.**
- `app/(dashboard)/dashboard/loading.tsx` — هيكل عظمي عام. **يعالج S2.**
- `loading.tsx` مخصّصة للأقسام الثقيلة: `monthly`, `campaigns`, `marketing`, `operations`.
- `not-found.tsx` داخل القشرة.

---

### المرحلة ٤ — تطبيق على أهم ١٢ صفحة
بالترتيب: `/dashboard` · `/monthly` · `/campaigns` · `/users/donors` · `/bank-transfers` · `/categories` · `/blog` · `/operations/communication/inbox` · `/operations/tasks` · `/marketing` · `/platform-connections` · `/users/team`

لكل صفحة: `PageHeader` موحّد → `FilterBar` → محتوى → `EmptyState`/`Skeleton` حقيقيان → استبدال hex الخام برموز.

الـ١٣٩ صفحة الباقية ترث تحسينات القشرة تلقائيًا (تنقّل، فتات خبز، بحث، حدود خطأ) دون تعديل.

---

### المرحلة ٥ — تنظيف البنية المعلوماتية

> ⛔ **تصحيح (2026-08-02):** ادّعى التدقيق الأولي أن `marketing-intelligence/*` (٢٢) و`brand/*` (١٢) هي
> «٣٤ صفحة عمل مهدور يجب إظهارها في التنقّل». **هذا خطأ، ولا يجوز تنفيذه.** بالفحص:
> - صفحات `brand/*` هي **أكواب تحويل** من ٩ أسطر: `redirect(resolveDashboardFallbackHref(...))`.
>   واجهات الإدارة و APIs الخاصة بها **محذوفة فعلًا**، والمحتوى نُقل للقراءة فقط إلى
>   `archive/assets` و`communication/templates`.
> - كل مسار في `marketing-intelligence/*` له تحويل صريح في `next.config.ts` نحو وجهته المعتمدة
>   في `marketing/*` أو `platform-connections/*`.
> - `tests/integration-settings/brand-dashboard-removal.test.ts` **يفرض** غياب brand عن التنقّل
>   وعن `DASHBOARD_PERMISSION_KEYS`.
>
> أي أنها بقايا **عملية دمج مكتملة ومقصودة**، لا عمل مهدور. إظهارها سيكسر الاختبار ويعيد إنشاء
> مداخل مكرّرة لنفس الوظيفة. **الإجراء الصحيح: تُترك كما هي.**

يبقى من هذه المرحلة بندان حقيقيان:

**١) تقليم مكوّنات حقن DOM — ✅ منفَّذ**

> ⛔ **تصحيح إضافي:** ادّعى التدقيق أن المكوّنات الأربعة كلها «تعمل على كل المسارات الـ١٥١ بغض النظر عن
> الصلة». بالفحص الفعلي: **اثنان منها كانا مضبوطَين أصلًا**، والادّعاء كان مبالغًا فيه.

| المكوّن | الحالة الفعلية | الإجراء |
|---|---|---|
| `BankTransfersExportPanel` | مكوّن ميت يُرجع `null`، وتعليقه ينص أنه باقٍ «فقط لأن `DashboardLayoutClient` يستورده» | **حُذف** — الاستيراد أُزيل ثم الملف |
| `DashboardAutoEnhancements` | **غير مضبوط فعلًا**: `patchNetworkSaveEvents()` كان يُركّب ترقيعًا عالميًا لـ `fetch` و`XMLHttpRequest.prototype` عند التركيب على **كل** مسار، مع `setInterval` كل ٧٠٠م.ث يستعلم الـDOM — رغم أن `statusForPath` تُرجع `null` لأي مسار خارج `campaigns/edit` و`categories/edit` و`blog` | **ضُبط** عبر `isEnhanceableRoute = isProjectForm \|\| hasTextImprover`؛ الترقيع يُركّب كسولًا عند أول زيارة لمسار محرِّر (والحارس `__dashboardSaveStatusPatched` يبقيه تركيبًا عالميًا واحدًا) |
| `ProjectEditorSectionsEnhancer` | مضبوط أصلًا — `if (!isProjectEdit \|\| !projectId) return;` | لا تغيير |
| `ProjectLocaleSlugEditor` | مضبوط أصلًا — كلا التأثيرين يخرجان مبكرًا، وترقيع XHR داخل فرع `isProjectNew` فقط | لا تغيير |

**٢) نمط تنقّل فرعي موحّد — ✅ منفَّذ**

عند الفحص تبيّن أن اثنين من «الأنماط المتنافسة» الثلاثة **كود ميت** لا أنماط تحتاج توحيدًا:
- `MarketingQuickNav`: ٦ من روابطه السبعة تشير لمسارات مُحوَّلة في `next.config.ts`.
- `MarketingWorkflowHeader`: فتات خبزه يشير إلى `marketing-intelligence` و`executive-overview` وكلاهما مُحوَّل، وصار يكرر فتات الخبز الجديد في القشرة.

**الجديد:** `components/dashboard/SubNav.tsx` — تنقّل فرعي مشترك بمطابقة أطول بادئة للحالة النشطة.
طُبّق على العنقود **الحيّ** الوحيد: `app/(dashboard)/dashboard/archive/_components/ArchiveSubNav.tsx`
مركّب في `archive/layout.tsx` مرة واحدة. الأرشيف فيه **٨ صفحات حيّة بمدخل واحد فقط** في الشريط الجانبي،
فكانت السبع الأخرى تُبلغ فقط عبر روابط داخل `ArchiveConsole`.

**٣) حذف الكود الميت — ✅ منفَّذ (بقرار المستخدم)**

حُذف **٣٧ ملف صفحة** + `MarketingQuickNav` + `MarketingWorkflowHeader`. عدد صفحات اللوحة: ١٥١ → **١١٤**.
التحويلات في `next.config.ts` بقيت، فكل رابط يعمل تمامًا كما كان.

> ⚠️ **الفخ الذي مُنع:** «غير قابل للوصول كمسار» **لا يعني** «غير مستورد كوحدة». خمسة ملفات تبدو ميتة
> هي فعليًا **مكوّنات تُصيّرها صفحات حيّة**، وحذفها كان سيكسر الإنتاج:
>
> | الملف الميت ظاهريًا | تستورده الصفحة الحيّة |
> |---|---|
> | `marketing/data-sync/page.tsx` | `platform-connections/ad-accounts` |
> | `marketing-intelligence/campaign-links/page.tsx` | `marketing/attribution` (عنصر في الشريط الجانبي) |
> | `marketing/campaign-links/page.tsx` | `marketing/attribution` |
> | `conversion-events/page.tsx` | `marketing/tracking` (عنصر في الشريط الجانبي) |
> | `link-generator/page.tsx` | `marketing/attribution` |
>
> لذلك شرط الحذف كان مركّبًا: **مسار مُحوَّل _و_ لا يستورده أي ملف آخر** (حُسب آليًا).
>
> إصلاح جانبي حقيقي: `data-sync` (المُحتفَظ به) كان يصيّر `MarketingQuickNav`، أي أن شريط تنقّل
> بستة روابط ميتة كان **ظاهرًا فعلًا** على صفحة `ad-accounts` الحيّة. أُزيل.

---

### المرحلة ٦ — تنظيف نهائي — ✅ منفَّذ

قياس الاستخدام الفعلي قبل أي حذف:

| الحزمة / الشجرة | الاستخدام الحقيقي | الإجراء |
|---|---|---|
| `react-hot-toast` | **٩١ ملفًا** | ✅ النظام المعتمد — يبقى |
| `sonner` | **صفر** | 🗑️ أُزيلت |
| `sweetalert2` | **صفر** — المطابقة الوحيدة كانت داخل `components/.SlaytHizliBagis.jsx.swp`، وهو **ملف تبديل لـ Vim** لا كود | 🗑️ أُزيلت |
| `@mui/material` + `@mui/icons-material` | **صفر** | 🗑️ أُزيلت |
| `@emotion/react` + `@emotion/styled` | **صفر** (كانتا تابعتين لـ MUI فقط) | 🗑️ أُزيلت |
| `app/[locale]/components/ui/` | **صفر استيراد** — لا عبر `@/` ولا بمسار نسبي ولا من ملف شقيق عبر `./ui/` | 🗑️ حُذفت (٥٣ ملفًا) |
| `components/ui/toast` + `useToast` | ٥ ملفات | يبقى — استخدام حقيقي |

عدد التبعيات: ١٢٠ → **١١٤**.

> تحقق مهم قبل حذف شجرة `ui/` المزدوجة: `tsconfig.json` يربط `@/*` بجذر المستودع، فـ
> `@/components/ui/button` تشير للجذر لا لنسخة `[locale]`. وفُحصت أيضًا الاستيرادات الشقيقة
> بصيغة `./ui/x` — وهي الحالة التي كان النمط الأول سيفوّتها. النتيجة صفر في الحالتين.

> ملاحظة بيئة: `npm uninstall` يفشل بـ `ERESOLVE` بسبب تعارض **قائم مسبقًا** لا علاقة له بالحذف —
> `@usewaypoint/email-builder` يطلب React ‎≤18 والمشروع على 19. استُخدم `--legacy-peer-deps`.

**الوضع الليلي** — مؤجّل بقرار المستخدم. رموز المرحلة ٠ تجعله ممكنًا لاحقًا.

---

## 4. ترتيب التنفيذ

```
٠ رموز ──► ١ القشرة ──► ٢ المكونات ──► ٣ الصلابة ──► ٤ الصفحات ──► ٥ البنية ──► ٦ تنظيف
   (أساس)     (أعلى أثر)                                              (قرار منتج)
```

المراحل ٠–٣ تعطي **أغلب التحسّن المحسوس** لأنها تمسّ كل المسارات الـ١٥١.

---

## 5. التحقّق

- `npx prisma generate && npx next build` في bash (راجع: البناء يفشل على Windows عبر `npm run build`).
- تصفّح يدوي: كل مجموعة تنقّل + مسار ديناميكي واحد + الجوال.
- التحقّق من بوابات الصلاحيات: مستخدم بصلاحية واحدة يرى شريطًا مصفّى ولا يُطرد.
- عدم انحدار الأرقام: مقارنة `/dashboard` و`/monthly` قبل/بعد.

---

## 6. سجل التقدّم

| المرحلة | الحالة | التاريخ |
|---|---|---|
| ٠ — الرموز | ✅ مكتملة | 2026-08-02 |
| ١ — القشرة | ✅ مكتملة | 2026-08-02 |
| ٢ — المكونات | ✅ مكتملة | 2026-08-02 |
| ٣ — الصلابة | ✅ مكتملة | 2026-08-02 |
| ٤ — الصفحات | 🔶 تغطية آلية كاملة + تبنٍّ بنيوي جزئي | 2026-08-02 |
| ٥ — البنية | ✅ مكتملة | 2026-08-02 |
| ٦ — تنظيف | ✅ مكتملة | 2026-08-02 |

> ⚠️ **فخ بيئي:** بعد `npm uninstall` فشل البناء بخطأين من `next/font/google`:
> `Failed to fetch 'Noto Kufi Arabic' / 'Poppins'`. **ليس سببه حذف الحزم** — تغيير `node_modules`
> يُبطل ذاكرة Turbopack فيُعاد جلب الخطوط من الشبكة بدل الذاكرة. التحقق: `curl` إلى
> `fonts.googleapis.com` أعاد `200`، وإعادة تشغيل البناء نجحت (40s). إذا ظهر هذا الخطأ، أعد المحاولة
> قبل افتراض أن التغيير هو السبب.

### ما تم إنجازه فعليًا

**المرحلة ٠**
- `tailwind.config.ts`: مقياس `brand.50…950` (الأساس `brand-600` = `#025EB8`، و`brand.dark` = `#014FA0`) + `brand-orange.*`. لم يُستخدم اسم `accent` لأنه رمز رمادي قائم في shadcn ويُستعمل في `hover:bg-accent`.
- `globals.css`: `--primary-foreground` و`--secondary-foreground` كانا لونين فاتحين من نفس العائلة (نص أزرق فاتح على أزرق) — أصبحا أبيض. `ui/button.tsx` كان يتجاوز الخلل بـ `text-white` مكتوب يدويًا.
- ربط `--primary-light` / `--secondary-light` في Tailwind.

**المرحلة ١** — ملفات جديدة تحت `app/(dashboard)/dashboard/_shell/`
- `lib/dashboard/nav-icons.ts`: سجل `NavIconName → LucideIcon` (٣٩ أيقونة). نُبقي `nav-config.ts` بيانات صرفة كي تستوردها مكوّنات الخادم.
- `nav-config.ts`: أيقونة **لكل عنصر** + `keywords` للبحث + عناوين فريدة (`نظرة عامة على التسويق`، `نظرة عامة على الربط`، `سجلات المنصات`، `سجلات النظام`، `حملات الرسائل`، `قوالب الرسائل`، `تقارير الإرسال`).
- `lib/dashboard/breadcrumbs.ts`: `buildBreadcrumbs()` — مسار كامل بالعربية مع روابط للأجداد، قاموس ٥٠+ مقطعًا، وكشف معرّفات السجلات (ObjectId/cuid/uuid → «تفاصيل»). يقبل `visibleHrefs` فلا يربط لصفحة يمنعها الحارس.
- `DashboardSidebar.tsx`: خلفية بيضاء، `<Link>` بدل `router.push`، شريط نشط بأزرق العلامة، حبس تركيز + `Escape` + `aria-*`، قائمة مستخدم منسدلة، إصلاح مسار الشعار.
- `DashboardTopbar.tsx`: فتات خبز حقيقية، فاصل يتبع الاتجاه، زر بحث للجوال.
- `CommandPalette.tsx`: `Ctrl/⌘ + K` عبر `cmdk` المثبّتة، يعرض الصفحات المسموح بها فقط.
- `DashboardLayoutClient.tsx`: حفظ حالة الطيّ في `localStorage` + فتح تلقائي للمجموعة الحاوية للمسار، إزالة `DashboardThemeProvider` الميت، **إزالة غلاف البطاقة البيضاء المزدوج**.

**المرحلة ٢** — `components/dashboard/`
`PageHeader.tsx` · `EmptyState.tsx` · `skeletons.tsx` (`PageSkeleton`/`TableSkeleton`/`StatsSkeleton`/`ChartSkeleton`/`FilterBarSkeleton`/`PageHeaderSkeleton`، مبنية على `ui/skeleton.tsx` المهجورة) · `FilterBar.tsx` (خصائص منطقية `ps-*`/`start-*` فلا حاجة لاستثناءات RTL) · `SectionCard.tsx`

**المرحلة ٣** — `error.tsx` · `loading.tsx` · `not-found.tsx` تحت `app/(dashboard)/dashboard/`

### التحقّق المنفَّذ
- `npm run test:integration-settings` → **١٤٠/١٤٠ ناجحة** (اختبارات بنية التنقّل تتحقق من `href` لا العناوين، فتغيير التسميات آمن).
- `npx tsc --noEmit` → لا أخطاء جديدة في أي ملف تم إنشاؤه أو تعديله.
- `npx next build` → **ناجح** (`Compiled successfully in 2.4min`، ١٦٢ صفحة، خروج ٠).

> ملاحظة بيئة: `npx prisma generate` قد يفشل بـ `EPERM` على ويندوز إذا كان خادم التطوير ما زال يقفل
> `node_modules/.prisma/client/query_engine-windows.dll.node`. أوقف `next dev` أولًا، أو تجاوز التوليد
> إذا لم يتغيّر المخطط.

### المرحلة ٤ — التفصيل

بقرار المستخدم وُسّع النطاق ليشمل **كل صفحات لوحة التحكم** لا أهم ١٢ فقط. نُفِّذت على مسارين:

**(أ) تغطية آلية شاملة — ١٠٠٪ من صفحات اللوحة**

| Codemod | الأثر | الضمانة |
|---|---|---|
| رموز العلامة | **٨٩٦ استبدالًا في ١٩٤ ملفًا**: `bg-[#025EB8]`→`bg-brand`، `hover:bg-[#014fa0]`→`hover:bg-brand-dark`، `[#024A92]`→`brand-700`، `[#FA5D17]`→`brand-orange` | يستهدف **فقط** شكل `utility-[#hex]`. القيم اللونية الحقيقية (`fill="#025EB8"` في recharts، `style={{}}`) لم تُمسّ لأنها ليست أسماء أصناف. حُفظت المُعدِّلات: `bg-[#025EB8]/10`→`bg-brand/10`، ولم تُمسّ `min-w-[120px]` أو `text-[11px]` |
| توحيد العناوين | **٩٤ عنوانًا في ٩٤ ملفًا**: ٢٠ نمطًا مختلفًا (`text-lg`→`text-3xl`، `font-bold` مقابل `font-black`، ٤ ألوان مختلفة) → نمط واحد يطابق `PageHeader` | لا يُحقن لون حيث لا لون: ٢٩ عنوانًا داخل هيدرات متدرجة يرث نصها `text-white` من الأب — حقن `text-slate-900` كان سيخفيها |
| إزالة الحشو المزدوج | **٦٢ عنصر جذر في ٤٨ ملفًا** | يعدّل **فقط** العنصر التالي مباشرةً لـ `return (` أي جذر المكوّن. حاويات التمرير الداخلية وأجسام البطاقات احتفظت بحشوها |

**(ب) تبنٍّ بنيوي يدوي لـ `PageHeader`** — `campaigns` · `categories` · `badges` · `ticker` · `logs` · `messages` · `donations` · `bank-transfers`
مع `FilterBar` + `EmptyState` + هياكل تحميل مشتركة في `campaigns` و`categories`.

> النتيجة: **كل** صفحة لوحة تحكم موحّدة الآن في ألوان العلامة وحجم العنوان والحشو، وثمانٍ منها تبنّت المكوّنات المشتركة بنيويًا.

### متبقٍّ

1. **`PageHeader` بنيويًا** — أُنجز **١٤ صفحة**: `campaigns` · `categories` · `badges` · `ticker` · `logs` ·
   `messages` · `donations` · `bank-transfers` · `operations/tasks` · `operations/content` ·
   `operations/calendar` · `operations/publishing` · `marketing` · `marketing/recommendations`.
   يبقى ~٧٦ صفحة.

   > ⚠️ **لا تُؤتمت هذه الخطوة.** إزالة الغلاف `<div>` تترك `</div>` **يتيمًا** — حدث فعليًا في
   > `operations/tasks` و`marketing/page.tsx`، والتُقط بقراءة الناتج بعد كل تعديل. `tsc` يكشفه
   > كخطأ تحليل (TS1xxx)، فهو شبكة الأمان الوحيدة في غياب تحقّق بصري.

   > 🌐 **فشل بناء بيئي متكرر:** `next/font` يفشل أحيانًا بـ `Failed to fetch 'Noto Kufi Arabic' /
   > 'Poppins'` رغم أن `curl` إلى `fonts.googleapis.com` يُرجع `200` — يبدو تحديد معدّل بعد بناءات
   > متتالية. **ليس خطأ كود** (لا `Module not found` ولا أخطاء تصريف). الحل: أعد المحاولة لاحقًا.
2. **حالات الفراغ** — حُوِّلت يدويًا في ١١ موضعًا عبر: `campaigns` · `categories` · `slides` ·
   `bank-transfers` (٣) · `communication/inbox` (٢) · `communication/audiences` ·
   `communication/reports` · `marketing/performance` · `conversion-events` (٢) ·
   `marketing-intelligence/campaign-links` · `archive/ArchiveUploadedFilesManager`.

   > ⚠️ **ليست كل «لا توجد…» حالة فراغ.** بعضها **حالات إيجابية** مصمَّمة باللون الأخضر عمدًا:
   > «لا توجد رسائل فاشلة في هذه الفترة» و«لا توجد رسائل متخطاة» و«لا توجد قوائم تحتاج مراجعة»
   > كلها `text-emerald-700` — أي **خبر جيد** لا طريق مسدود. تحويلها إلى `EmptyState` رمادي محايد
   > يفقدها إشارتها الدلالية. تُركت كما هي عمدًا.
   > وبعضها الآخر **تلميحات** لا حالات فراغ، مثل «لا يمكن تغيير القناة بعد إنشاء الحملة».
   >
   > **وبعضها حالات مصغّرة داخل لوحات كثيفة** — `ArchiveFileActivityPanel` و`DiagnosticsDrawer`
   > تستخدم `text-xs`/`text-slate-400` داخل أدراج ضيّقة؛ و`EmptyState` بحشوه `py-12` وأيقونته
   > ٤٨px كان سيطغى على اللوحة بدل أن يخدمها. تُركت عمدًا.

   إصلاح جانبي أثناء التحويل: زر «رفع ملف» في `ArchiveDailyWork` كان يشير إلى
   `/dashboard/archive/marketing-files` وهو مسار **مُحوَّل**؛ عُدِّل إلى وجهته المعتمدة
   `/dashboard/archive/assets?category=MARKETING` لتوفير قفزة تحويل.
   الباقي ما زال نصًّا عاريًا. **لا يمكن أتمتتها**: ٤٠+ رسالة مختلفة مغروسة داخل خلايا جداول
   بقيم `colSpan` متباينة، وكل واحدة تحتاج قرارًا بشأن نصّها وإجرائها (زر «إعادة ضبط الفلاتر»
   عند وجود تصفية نشطة مقابل زر «إنشاء» عند الفراغ الحقيقي).
3. **هياكل التحميل** — ١٠ ملفات ما زالت تستخدم `animate-pulse` يدويًا.
4. **`/dashboard` و`/monthly`** — لم تُبنَّ مكوّناتهما بنيويًا عمدًا. صفحتا أموال (٢٢٦٦ و٢٤٢٣ سطرًا)؛ نالتا التوحيد الآلي فقط. راجع [dashboard-completion-roadmap.md](dashboard-completion-roadmap.md) قبل لمس أي حساب.
