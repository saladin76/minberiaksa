# Dashboard Prisma Foundation Slice

آخر تحديث: 2026-06-22

## الهدف

هذا الملف يوثق شريحة DB foundation آمنة للداشبورد. الشريحة المرجعية موجودة في:

`prisma/dashboard-foundation.schema.prisma`

الموديلات الستة الأولى موجودة أيضًا في `prisma/schema.prisma`، أما بقية موديلات Brand/Archive/Operations/AI في هذه الشريحة فهي staged contracts فقط حتى يتم إدخالها تدريجيًا في runtime schema.

## الحالة الحالية

تم تنفيذ المسار الآمن حتى الآن:

- تم تجهيز الشريحة المستقلة والتحقق منها عبر `npm run dashboard:schema:validate`.
- تم إدخال الموديلات الستة الأولى في `prisma/schema.prisma` الأساسي.
- تم قطع `BrandProfile`, `BrandColor`, `BrandGuideline` إلى قراءة DB-backed مع fallback foundation.
- تم قطع `ArchiveCollection` و`ArchiveProject` إلى قراءة DB-backed مع fallback foundation.
- تم إضافة create API آمن لـ `ArchiveCollection` و`ArchiveProject` مع zod validation وAuditLog.
- تم قطع `OperationTask` إلى قراءة DB-backed مع fallback محسوب من Planning Engine.
- تم إضافة create/update API آمن لـ `OperationTask` مع zod validation وAuditLog.
- تم تجهيز Archive Asset `assign-task` لإنشاء `OperationTask` فعلي عند توفر DB.
- تم تجهيز `BrandAsset`, `BrandFont`, و`BrandMessageFramework` كعقود staged فقط.
- تم تجهيز Brand repository ليقرأ `BrandAsset`, `BrandFont`, و`BrandMessageFramework` إذا كان Prisma Client يوفّر delegates، وإلا يرجع foundation data بوضوح.
- تم تجهيز `ArchiveDriveLink`, `ArchiveAsset`, و`ArchiveVideoFrame` كعقود staged فقط لدعم Google Drive metadata وAI/human review لاحقًا.
- تم تجهيز Archive repository ليقرأ `ArchiveDriveLink`, `ArchiveAsset`, و`ArchiveVideoFrame` إذا كان Prisma Client يوفّر delegates، وإلا يرجع foundation data بوضوح.
- تم تجهيز `ArchiveDriveLink` mutation path ليحاول الكتابة في runtime `archiveDriveLink` delegate فور توفره، مع AuditLog fallback آمن عندما يكون الموديل غير موجود في `prisma/schema.prisma` الرئيسي أو عندما يكون المشروع ليس runtime ObjectId بعد.
- تم تجهيز عقود Operations/Content التالية كـ staged contracts فقط: `OperationSeason`, `MonthlyContentPlan`, `ContentItem`, `ContentPublication`, `MessageSchedule`, `DonorReactivationReminder`, `MarketingLearning`, و`ContentAdLink`.
- تم تجهيز `AiOperationRun` كعقد staged لسجل تشغيل Shared AI Core، مع optional persistence fallback إذا كان Prisma Client يوفّر delegate لاحقًا.

لم يتم في هذه المرحلة:

- إدخال بقية موديلات Brand/Archive/Operations/Content/AI الجديدة إلى `prisma/schema.prisma` الرئيسي.
- إدخال `ArchiveDriveLink` نفسه إلى `prisma/schema.prisma` الرئيسي؛ mutation path جاهز للـ delegate فقط.
- تشغيل Google Drive sync حقيقي.
- تحميل ملفات Drive أو تحليل صور/فيديوهات تلقائيًا.
- تحويل أفعال Archive approval/create-content إلى DB writes.
- تفعيل DB-backed AI audit log فعليًا قبل وجود runtime schema.
- إرسال أو نشر تلقائي.
- إنشاء ContentAdPerformance يكرر AdSnapshot.
- تغيير payment أو tracking runtime.

## التحقق

الأمر المرجعي للتحقق من الشريحة المستقلة:

```bash
npm run dashboard:schema:validate
```

الأمر يشغل:

```bash
prisma validate --schema prisma/dashboard-foundation.schema.prisma
```

بعد كل cutover يجب أن يمر Vercel Preview ثم Production بعد الدمج.

## الموديلات في الشريحة

### Brand

- `BrandProfile`
- `BrandAsset` staged contract + repository read fallback only
- `BrandColor`
- `BrandFont` staged contract + repository read fallback only
- `BrandGuideline`
- `BrandMessageFramework` staged contract + repository read fallback only

### Archive

- `ArchiveCollection`
- `ArchiveProject`
- `ArchiveDriveLink` staged contract + repository read fallback + mutation runtime-delegate fallback prepared
- `ArchiveAsset` staged contract + repository read fallback only
- `ArchiveVideoFrame` staged contract + repository read fallback only

### Operations & Content

- `OperationTask`
- `OperationSeason` staged contract only
- `MonthlyContentPlan` staged contract only
- `ContentItem` staged contract only
- `ContentPublication` staged contract only
- `MessageSchedule` staged contract only
- `DonorReactivationReminder` staged contract only
- `MarketingLearning` staged contract only
- `ContentAdLink` staged contract only

### Shared AI

- `AiOperationRun` staged contract + optional persistence fallback only

## cutover status

| Model | Runtime status | Notes |
| --- | --- | --- |
| `BrandProfile` | DB-backed read + foundation fallback | Brand overview and brand tabs can read active profile data. |
| `BrandAsset` | Repository read fallback prepared; runtime schema pending | Brand Center assets come from the Brand repository snapshot when available. |
| `BrandColor` | DB-backed read + foundation fallback | Colors tab and overview can read DB colors. |
| `BrandFont` | Repository read fallback prepared; runtime schema pending | Typography can use the same Brand repository snapshot once runtime model exists. |
| `BrandGuideline` | DB-backed read + foundation fallback | Voice/copy rules can read DB guidelines. |
| `BrandMessageFramework` | Repository read fallback prepared; runtime schema pending | Message frameworks can use the same Brand repository snapshot once runtime model exists. |
| `ArchiveCollection` | DB-backed read/write API + foundation fallback | Smart Archive pages can read and create collections through archive repository/service paths. |
| `ArchiveProject` | DB-backed read/write API + foundation fallback | Smart Archive pages can read and create projects through archive repository/service paths. |
| `ArchiveDriveLink` | Repository read fallback prepared; mutation delegate path prepared; runtime schema pending | Google Drive link metadata can be read/written through runtime delegate once model exists; until then create action remains audit-backed and no external Drive calls happen. |
| `ArchiveAsset` | Repository read fallback prepared; runtime schema pending | Asset metadata, AI draft fields, human review fields, and approval flags can be read when runtime model exists. |
| `ArchiveVideoFrame` | Repository read fallback prepared; runtime schema pending | Video frame metadata can be read when runtime model exists; no frame extraction or AI call. |
| `OperationTask` | DB-backed read/write API + create/edit UI + transitions + computed foundation fallback | Tasks page/API supports safe manual operations for real rows; Archive assign-task delegates here. |
| `OperationSeason` | Staged contract only | AI-suggested dates stay suggested until human review. |
| `MonthlyContentPlan` | Staged contract only | Plans can later generate ContentItems and OperationTasks. |
| `ContentItem` | Staged contract only | Does not replace Blog/Post models; links to them when needed. |
| `ContentPublication` | Staged contract only | Manual publishing checklist, not auto-publish. |
| `MessageSchedule` | Staged contract only | Manual-first scheduling; no automatic send. |
| `DonorReactivationReminder` | Staged contract only | Candidate reminders only; no automatic outreach. |
| `MarketingLearning` | Staged contract only | Stores learnings without duplicating ad snapshots. |
| `ContentAdLink` | Staged contract only | Links content/ad/platform identifiers only; no performance table duplicate. |
| `AiOperationRun` | Optional persistence fallback prepared; runtime schema pending | Sanitized Shared AI Core audit entries remain memory-first until runtime model exists. |

## قواعد الأمان

- لا تغييرات دفع.
- لا تغييرات tracking runtime.
- لا external platform calls.
- لا Google Drive sync في هذه الحزمة.
- لا frame extraction أو AI analysis في هذه الحزمة.
- لا إرسال أو نشر تلقائي.
- لا AI approval تلقائي.
- BrandAsset يبقى منفصل عن ArchiveAsset.
- ArchiveAsset يبقى للصور/الفيديو/التقارير الميدانية، وليس للوجوهات والهوية.
- sensitive/needsBlur/humanReviewRequired fields موجودة كعقود فقط ولا تمنح اعتمادًا تلقائيًا.
- ContentAdLink لا يكرر AdSnapshot أو MarketingCampaignSnapshot.
- Donor Reactivation وScheduler manual-first فقط.
- AI audit prompt preview is sanitized and capped before optional persistence.
- Archive collection/project create APIs validate input and fail clearly if DB persistence is unavailable.
- Archive Drive Link create path لا يستدعي Google Drive؛ يكتب runtime delegate فقط عند توفره، وإلا يسجل AuditLog fallback بوضوح.

## cutover المقترح التالي

الأولوية الآن:

`Append ArchiveDriveLink to runtime schema`

بعدها مباشرة:

`Persist Archive Drive Links`

لأن mutation path أصبح جاهزًا لاستخدام runtime delegate فور توفره من Prisma Client.

بعدها يمكن تنفيذ:

- `Append ArchiveAsset runtime model` بعد readiness لسياسة preview/thumbnail وحماية المواد الحساسة.
- `Persist ArchiveAsset review actions` بعد دخول ArchiveAsset للـ runtime schema.
- `Append BrandAsset runtime model` لقراءة manual URL records حقيقية.
- `Append BrandFont and MessageFramework runtime models`.
- `Append Operations content workflow runtime models` على شرائح صغيرة.
- `Append AiOperationRun runtime model` بعد تثبيت sanitization/retention policy.

## ملاحظات Mongo/Prisma

- العلاقات محفوظة كـ ObjectId scalar fields بدون relation blocks لتقليل التعقيد.
- الفهارس مضافة للقراءة والفلاتر الرئيسية فقط.
- `BrandAsset`, `BrandFont`, و`BrandMessageFramework` تبدأ كـ `TO_VERIFY`.
- `ArchiveAsset.aiStatus` يبدأ بـ `NOT_ANALYZED` و`humanReviewStatus` يبدأ بـ `PENDING`.
- `ArchiveVideoFrame.humanReviewRequired` يبدأ بـ `true`.
- `AiOperationRun.status` يبدأ بـ `DRAFT` و`humanApprovalRequired` يبدأ بـ `true`.
- `ContentPublication`, `MessageSchedule`, و`DonorReactivationReminder` لا تعني أي إرسال/نشر تلقائي.