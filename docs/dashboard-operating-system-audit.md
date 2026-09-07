# Dashboard Operating System — Phase 0 Audit

> ⚠️ **متجاوَزة جزئيًا — SUPERSEDED (2026-08-01)**
>
> **المصدر الموثوق لحالة لوحة التحكم هو `docs/dashboard-completion-roadmap.md`.**
> هذه الوثيقة تدقيق مؤرّخ 2026-07-04 ولم تُحدَّث بعد إصلاحات جلسة 2026-07-31/08-01. أجزاء منها لم تعد صحيحة:
>
> - تصف **مركز التواصل** كنموذج أولي «الإرسال معطّل». الإرسال ما يزال غير مُفعَّل لعدم وجود مزوّد، لكن ثلاث `await` ناقصة كانت تجعل الواجهة تدّعي الجاهزية — أُصلحت (P1-7).
> - تسرد مسارات `/dashboard/brand/*` و`api/admin/brand/*` — **لم تعد موجودة**.
> - أرقام الإيرادات والمتبرعين الواردة فيها سبقت إصلاحات P0/P1/P2 (منها تضخيم عدّاد المتبرعين العام بنسبة ~51%، و`teamSupport` على الرسم بـ5.5×).
>
> اقرأ الخارطة أولًا؛ استخدم هذه الوثيقة للسياق المعماري لا لحالة النظام.

Status: **audit only, no runtime behaviour changed by this document.**
Date: 2026-07-04
Scope: repository root `d:/Work/alafiya - Copy/` (the active project). The
`gozbebekleri/` subfolder is a **stale May-2026 snapshot** and is out of scope —
never edit it. Confirmed via `git log` (root `app/` last changed 2026-07-03,
`gozbebekleri/` last changed 2026-05-24).

This audit verifies the actual codebase against the target architecture. It does
**not** assume the code matches any prior plan.

---

## 1. Prisma schema — which file is live

- **`prisma/schema.prisma` is the ONLY active/generated schema.** `package.json`
  has no `schema` override and `prisma generate` runs against the default path.
- `prisma/dashboard-foundation.schema.prisma` and
  `prisma/content-runtime.schema.prisma` are **drafts** (validation-only /
  unreferenced). Their generator/datasource blocks are boilerplate so they can be
  validated stand-alone. **Anything that lives only in those files does not exist
  at runtime** and must be added to `schema.prisma` to become real.

### Models that EXIST in the live schema
- `User` — `preferredLang String?`, `emailNotifications`/`smsNotifications`
  (Boolean, the only consent gate), `phone`, `countryCode`, `role Role`,
  `dashboardPermissions String[]`. No consent-timestamp/source, no double opt-in.
- `Donation` — `locale String?`, `status DonationStatus {PAID,FAILED}`,
  `paidAt`, country snapshot is **`donorCountryCode`** (not `countryCode`),
  `attribution Json?`, `conversionEventsSentAt`, `conversionFailedEventsSentAt`.
- `WhatsappTemplate` — canonical Arabic `body` + `translations Json?`, `language`,
  `category`, `approvalStatus`, Twilio `externalTemplateId`, `header`, `buttons`,
  `variables`, `providerRaw`.
- `EmailTemplate` — `subject`, `document Json` (email-builder), `translations Json?`.
- `MessageTrigger` — `event MessageTriggerEvent`, `channel MessageChannel {EMAIL,WHATSAPP}`, `templateId`, `enabled`.
- `SentMessage` — `channel`, `origin {MANUAL,TRIGGER,BACKFILL}`,
  `status {SENT,FAILED,SKIPPED}`, `locale`, recipient fields, `renderedSubject/Body`,
  `providerMessageId`, `errorMessage`, `donationId`. **This is the message archive today.**
- `AuditLog` — `actorId/Role`, `action`, bilingual `messageAr/messageEn`,
  `entityType`, `entityId`, `metadata Json?`, `stream {TEAM,DONOR}`.
- `MarketingPlatformConnection` — `category`, `platform`, `status`,
  `supportedLocales String[]`, `supportedCountries String[]`, many id fields +
  masked secrets (accessToken, refreshToken, appSecret…), `configChecklist Json?`.
- `PlatformSyncRun`, `AdCampaignSnapshot`, `AdGroupSnapshot`, `AdSnapshot`,
  `MarketingCampaignSnapshot` (messaging rollups: provider/channel/sent/delivered/…).
- `OperationTask` (with dangling `contentItemId/planId/seasonId` refs).
- Brand: `BrandProfile` (org + `contentVoice` + `supportedLocales`), `BrandColor`, `BrandGuideline`.
- Archive: `ArchiveCollection`, `ArchiveProject`.

### Models that are ABSENT from the live schema (must be built later)
- **Entire `Communication*` stack** — `CommunicationSender`, `CommunicationTemplateGroup/Variant`,
  `CommunicationCampaign`, `CommunicationDelivery`, `CommunicationProviderEvent`,
  `SenderRoutingRule`, `DonorCommunicationProfile`, a real `ContactPreference`/consent ledger. None exist anywhere.
- `ConversionEvent` — absent everywhere; conversion firing is tracked only by
  boolean/timestamp flags on `Donation`.
- `MarketingCampaignLink` registry — only a draft `ContentAdLink` exists.
- Content workflow runtime: `ContentItem`, `ContentPublication`, `MonthlyContentPlan`,
  `OperationSeason`, `MessageSchedule`, `DonorReactivationReminder`, `MarketingLearning` (draft-only).
- Archive pipeline: `ArchiveAsset`, `ArchiveDriveLink`, `ArchiveVideoFrame` (draft-only).
- Brand: `BrandAsset`, `BrandFont`, `BrandMessageFramework` (draft-only).

---

## 2. Messaging today — two separate systems

There are **two disconnected systems**. They share no code, tables, or providers.

### A. LEGACY send path — REAL, working, do NOT break
- `lib/whatsapp.ts` → **Twilio** WhatsApp (`sendBulkWhatsapp`, concurrency 5). Hard-disabled unless
  `WHATSAPP_LEGACY_TWILIO_ENABLED=true`; imported by no active route.
- ~~`lib/email.ts` → **SendGrid**~~ — **deleted**. Email is now Elastic Email only, via
  `lib/communication/providers/email/client.ts`. `app/api/templates/email/send` and the auth
  verification emails go through `sendArchivedEmail` / `sendVerificationEmailViaRuntime`.
- `lib/events/dispatch.ts` → the trigger fan-out. On `DONATION_PAID` it loads the
  donation context, picks locale from `user.preferredLang` (fallback `ar`), renders,
  sends, and writes a `SentMessage` row per recipient (SENT/FAILED/SKIPPED). Also
  fires server-side Meta CAPI + GA4 and the first-donation event. **Best-effort, never throws.**
- `app/api/templates/whatsapp/send` + `app/api/templates/email/send` — manual admin
  sends; write `SentMessage` + an audit summary.
- `app/api/templates/whatsapp/import` + `lib/messaging/twilio-templates.ts` — pull
  Twilio-approved templates into `WhatsappTemplate` (never throws, strips secrets).
- `/dashboard/messages` (history viewer) + `/dashboard/templates` (editor/sender).
- ⚠️ **Known pre-existing behaviour:** when provider creds are missing in dev, both
  send libs count `sent = recipients.length` **without sending**. This violates the
  "never mark as sent unless the real call succeeded" rule and should be tightened
  when the Communication delivery layer lands (log `SKIPPED / *_NOT_CONFIGURED` instead).

### B. NEW "Communication Center" — PLACEHOLDER, send-disabled
- `lib/communication/*` — types, static `provider-registry.ts` (names Meta WhatsApp +
  Brevo, none wired), `provider-connections.ts` (env-presence probe only, no network),
  `template-renderer.ts` (pure `{{var}}` preview), `communication-service.ts`
  (`getCommunicationCenterOverview` — reads templates from an **AuditLog-backed store**
  via `lib/operations/messaging/messaging-repository.ts`, plus static seed).
- Routes: `/dashboard/operations/communication` (+ `/providers`, `/templates`) and
  `app/api/dashboard/operations/communication/*` — read-only server components / GET.
  Self-labelled "no real send". **No provider call, no SentMessage write.**
- Not surfaced in the main sidebar; reachable only from the Operations hub.

### Env credentials present (key names only)
- **`SENDGRID_API_KEY`, `SENDGRID_FROM`** — email is the only configured channel.
- **No** Twilio, Meta WhatsApp, Brevo, Netgsm, or OpenAI keys in `.env`. WhatsApp
  therefore falls into the dev no-op path today. → Meta WhatsApp behaviour must gate
  on `META_WHATSAPP_NOT_CONFIGURED` when built.

---

## 3. Locale / i18n foundation

- Central catalog `lib/locales.ts` — `SUPPORTED_LOCALES = ar,en,fr,tr,id,pt,es,de`,
  `LOCALE_LABELS`, `LOCALE_OPTIONS`, `isValidLocale`, `DEFAULT_LOCALE = ar`. No
  direction/RTL metadata, no `enabled`/native-label/fallback fields.
- The list is **duplicated across ~11 independent sources** that do NOT import the
  catalog: `i18n/routing.config.ts:4`, `middleware.ts:10` (+ regex `:12`),
  `app/[locale]/layout.tsx` (static JSON imports + `VALID_LOCALES`),
  `app/(dashboard)/dashboard/_components/DashboardAutoEnhancements.tsx:44`,
  `lib/seo.ts:7` (+ `OG_LOCALE_MAP`), `lib/campaign/share-labels.ts:18`,
  `lib/marketing/locales-countries.ts:9`, `app/layout.tsx` (JSON-LD),
  `scripts/audit-i18n-messages.mjs:7`, plus partial (7-locale, missing `de`) arrays in
  `app/api/{cart/payment,donations,stripe/intent}/route.ts` and `verify-email`.
- Message JSON files exist for the 8 locales only (`i18n/messages/*.json`).
- RTL is derived ad-hoc as `locale === "ar"` in `components/SyncHtmlDir.tsx`
  (whose `LANG_MAP` is missing `de`) and `DashboardLayoutClient.tsx`.
- **Consequence:** adding the target locales `sq, it, nl, sv` to the *public router*
  is NOT safe without full translations (missing `messages/*.json` → 500s / build
  failures). The safe move is a catalog with an `enabled` flag: register the 4 new
  locales as **`enabled: false`** so the messaging/audience/template layers are
  multilingual-aware while public routing stays on the enabled 8.

---

## 4. Current dashboard navigation (`lib/dashboard/nav-config.ts`)

7 permission-gated groups, top-level links only:
1. General Admin — revenue, monthly, bank-transfers, referrals, logs
2. User Management — donors, team, badges, **messages**, **templates**
3. Content Management — campaigns, categories, blog
4. Content & Operations — operations, archive
5. Marketing & Growth — system-overview, marketing, link-generator, conversion-events
6. Brand Settings — brand, slides, ticker
7. General Settings — payment-gateways, team-support-defaults

Many built routes (all Communication Center pages, operations sub-routes, archive/brand/
marketing sub-routes, `marketing-intelligence/*`) exist but are **not in the sidebar**.

---

## 5. Prior team's documented plan (do not contradict)

- `docs/architecture/communication-center-audit.md` — decision to build **one**
  Communication Center; providers behind replaceable adapters (Meta WhatsApp Cloud API,
  Brevo Email/SMS, SMS fallback); WhatsApp/Email/SMS are channels; 8-step MVP order
  (Connections → Templates → Flows → Consent → Delivery Logs → Webhooks → Test send →
  Real send after approval); hard rules: no auto-send, no page→provider calls, log every delivery.
- `docs/implementation-packages/` — Communication **Package 1** (domain layer + registry +
  overview route) and **Package 2** (provider-connections readiness page/API) are **done**.
  Next planned = **Package 3: Templates & Variables** (still send-disabled).
- `docs/dashboard-system-status.md` — master log; runtime models for `ContentItem`,
  `ArchiveDriveLink`, `ArchiveAsset`, Brand*, `AiOperationRun` remain audit-backed by design;
  warns old PRs #30/#37/#40/#43/#52/#54 must not be merged.

> Note: the prior architecture doc chose **Brevo** for Email/SMS, but the live code
> uses **SendGrid** for email and **Twilio** for WhatsApp/SMS, and only SendGrid is
> configured. This audit records the mismatch; the provider adapter layer must treat
> the vendor as swappable and keep Twilio + SendGrid as working legacy/fallback.

---

## 6. Map: current routes → target architecture

| Target area | Exists today | Decision |
|---|---|---|
| Communication Center | `/dashboard/operations/communication[/providers,/templates]` (stub) | **Reuse & extend** — official home; add templates/senders/audiences/logs incrementally |
| Legacy messaging | `/dashboard/messages`, `/dashboard/templates`, `/api/templates/*` | **Keep as legacy** — the only real send + `SentMessage` writer; do not break |
| Marketing & Growth | `/dashboard/marketing*`, `/dashboard/marketing-intelligence/*`, `/dashboard/conversion-events`, `/dashboard/link-generator` | Reuse; align labels |
| Content & Operations | `/dashboard/operations/*` (content, tasks, publishing, scheduler, donor-reactivation, calendar) | Reuse; content runtime models still staged |
| Smart Archive | `/dashboard/archive/*` | Reuse; runtime asset/drive models still staged |
| Brand Center | `/dashboard/brand/*` | Reuse; BrandProfile live, Asset/Font/Framework staged |
| System | connections/health under marketing; audit via `/dashboard/logs` | Consolidate later |

---

## 7. Recommended safe package sequence (from here)

1. **Locale foundation (single source of truth) — implemented this session.**
   Rich `lib/locales.ts` catalog (label, nativeLabel, direction, fallbackLocale,
   enabled); register `sq/it/nl/sv` disabled; point core routers (middleware, i18n
   routing) + direction helpers at the catalog. **Zero public behaviour change** (the
   enabled set stays the exact current 8). Underpins the multilingual Communication Center.
2. Communication **Package 3** — Templates & Variables (send-disabled), per prior plan.
3. Communication domain services (Consent, Audience, DeliveryLog, SenderRouter, ProviderRouter) — no real bulk send yet.
4. Multi-sender WhatsApp + Meta Cloud API adapter skeleton (Twilio preserved as legacy/fallback).
5. Templates & language-coverage; 6. Audiences + donor language segmentation on paid donation; 7. Campaign workflow + delivery archive; 8. Inbox; 9. Marketing integration; 10. Polish.

Each package must keep `npm run build` green, must not touch payments/tracking/Twilio
behaviour, and must not send without human approval.
