# Dashboard Operating System — Target Architecture

> ⚠️ **متجاوَزة جزئيًا — SUPERSEDED (2026-08-01)**
>
> **المصدر الموثوق لحالة لوحة التحكم هو `docs/dashboard-completion-roadmap.md`.**
> هذه الوثيقة وثيقة معمارية مرجعية (north-star) ولم تُحدَّث بعد إصلاحات جلسة 2026-07-31/08-01. أجزاء منها لم تعد صحيحة:
>
> - تصف **مركز التواصل** كنموذج أولي «الإرسال معطّل». الإرسال ما يزال غير مُفعَّل لعدم وجود مزوّد، لكن ثلاث `await` ناقصة كانت تجعل الواجهة تدّعي الجاهزية — أُصلحت (P1-7).
> - تسرد مسارات `/dashboard/brand/*` و`api/admin/brand/*` — **لم تعد موجودة**.
> - أرقام الإيرادات والمتبرعين الواردة فيها سبقت إصلاحات P0/P1/P2 (منها تضخيم عدّاد المتبرعين العام بنسبة ~51%، و`teamSupport` على الرسم بـ5.5×).
>
> اقرأ الخارطة أولًا؛ استخدم هذه الوثيقة للسياق المعماري لا لحالة النظام.

North-star document. Pairs with the current-state audit in
`docs/dashboard-operating-system-audit.md` and the communication decision in
`docs/architecture/communication-center-audit.md`. This describes where the
dashboard is going; it does not itself change code.

## Principle
Turn the existing dashboard into one clean operating system for Marketing & Growth,
Content & Operations, Smart Archive, Brand Center, a shared Communication Center, a
shared AI Core, and shared Provider Connections — **reusing** existing models,
services, and routes wherever they exist, and only adding what is genuinely absent.

## Target areas → existing home (reuse-first)
- **Marketing & Growth** → `/dashboard/marketing*`, `/dashboard/marketing-intelligence/*`,
  `/dashboard/conversion-events`, `/dashboard/link-generator`. Reuse
  `MarketingPlatformConnection`, snapshot models, `MarketingRuntime`.
- **Content & Operations** → `/dashboard/operations/*` (content, tasks, publishing,
  scheduler, calendar, donor-reactivation). Runtime content models still staged.
- **Communication Center** → `/dashboard/operations/communication*` (official home,
  send-disabled today). Legacy `/dashboard/messages` + `/dashboard/templates` +
  `/api/templates/*` stay as the working (Twilio + SendGrid) send path.
- **Smart Archive** → `/dashboard/archive/*`. Runtime asset/drive models staged.
- **Brand Center** → `/dashboard/brand/*`. `BrandProfile/Color/Guideline` live;
  `BrandAsset/Font/MessageFramework` staged.
- **System** → provider connections/health (under marketing today), audit via
  `/dashboard/logs`. Consolidate later.

## Communication Center (the core decision)
One center for WhatsApp, Email, SMS as **channels** (not separate modules), with
providers behind swappable adapters. WhatsApp moves toward **Meta WhatsApp Cloud API**;
**Twilio stays intact** as legacy/fallback and for SMS; **SendGrid** stays for email
(the only channel currently configured). Domain layer under `lib/communication/`:
TemplateRenderer · ConsentService · AudienceService · SenderRouter · ProviderRouter ·
DeliveryLogService · WebhookReceiver · ConversationService + provider adapters.

Hard rules: no auto-send, no page→provider calls, no send without consent + human
approval, every delivery logged, webhooks idempotent, payloads sanitized, secrets
server-only, provider-missing → `SKIPPED`/`*_NOT_CONFIGURED` (never fake "sent").

## Multilingual foundation
`lib/locales.ts` is the single source of truth (enabled 8 + registered future
`sq/it/nl/sv`, each with direction/native-label/fallback/enabled). Messaging,
audiences, templates, and campaign language-coverage checks read the catalog so no
locale logic is hardcoded per channel. See `docs/implementation-packages/locale-foundation.md`.

## Package roadmap (safe, additive, build-green each step)
1. ✅ **Phase 0 audit** — `docs/dashboard-operating-system-audit.md`.
2. ✅ **Locale foundation** — catalog + future-locale registration.
3. Communication **Templates & Variables** (send-disabled) — prior Package 3.
4. Communication domain services (Consent/Audience/DeliveryLog/SenderRouter/ProviderRouter).
5. Multi-sender WhatsApp + Meta Cloud API adapter skeleton (Twilio preserved).
6. Templates + language-coverage warnings.
7. Audiences + donor language segmentation on paid donation (via
   `lib/events/dispatch.ts` — profile update only, never auto-send).
8. Campaign workflow + delivery archive (extend/replace `SentMessage`).
9. Inbox + inbound webhooks. 10. Marketing integration. 11. Archive/Brand/AI polish + nav cleanup.

Each package: no payment/tracking/Twilio breakage, `npm run build` green, no secrets
to the frontend, AI review-only, no send without approval.
