# Dashboard Open PR Audit

آخر تحديث: 2026-06-21

هذا الملف يوضح حالة PRs القديمة المفتوحة التي كانت تظهر في GitHub/Vercel كأنها أعمال ناقصة. تمت المراجعة ضد `main` بعد حزم Campaign, Operations, Archive, Brand, AI, Provider Catalog, وDashboard hardening.

## الخلاصة

لا يوجد PR قديم من القائمة التالية يجب دمجه كما هو الآن. معظم محتواه دخل `main` عبر حزم أحدث، أو أصبح متعارضًا/متجاوزًا ويجب إغلاقه أو تفكيكه فقط إذا احتجنا جزءًا محددًا لاحقًا.

## PRs القديمة

| PR | العنوان | الحالة بعد المراجعة | التوصية |
| --- | --- | --- | --- |
| #30 | Add integration foundation and provider catalog | تم تجاوزه بواسطة Provider catalog الحالي وPRs #70/#71. | إغلاق كـ superseded. |
| #37 | Add operations season readiness engine | منطق Season Engine موجود الآن على `main` داخل `lib/operations/seasons` وتظهر نتائجه في `/dashboard/operations/calendar`. | إغلاق كـ already covered. |
| #40 | Add operations planning engine foundation | Planning Engine موجود الآن على `main` داخل `lib/operations/planning` ومربوط بصفحة Calendar & Alerts. | إغلاق كـ already covered. |
| #43 | Add operations production board foundation | Production Board أصبح repository-backed في `lib/operations/production` وصفحة `/dashboard/operations/production`. | إغلاق كـ already covered. |
| #52 | Add executive system overview | Executive overview موجود الآن على `main` في `/dashboard/executive/system-overview`. | إغلاق كـ already covered. |
| #54 | Add integration provider foundation | provider standards/catalog تغيّرت ودخلت عبر حزم أحدث، وPR غير mergeable. | إغلاق أو تفكيك فقط إذا احتجنا diff محدد. |

## قواعد التعامل

- لا ندمج PR قديم غير mergeable مباشرة.
- لا نعيد إدخال ملفات قديمة فوق `main` الحالي.
- إذا ظهر احتياج من PR قديم، ننقل الجزء المطلوب فقط في PR جديد صغير.
- أي PR جديد يجب أن يمر Preview على Vercel قبل الدمج.

## ما دخل فعليًا إلى main

- Campaign Registry save/management/detail/tracking truth.
- Operations season readiness, planning, production, scheduler, repository foundation, and persistence status.
- Archive Center foundation and safe archive APIs.
- Brand Center and Shared AI Core foundation.
- Provider catalog metadata and Connections readiness adapter.
- Dashboard hardening and status documentation.

## المتبقي الحقيقي

العمل المتبقي ليس دمج PRs قديمة، بل حزم جديدة صغيرة:

1. Prisma model migration slice.
2. Repository cutover تدريجي من foundation data إلى DB-backed data.
3. Google Drive metadata sync implementation بعد اعتماد credentials/scopes.
4. Real BrandAsset uploads/downloads بعد توفير الملفات الرسمية.
5. AI provider activation بعد ضبط env ومراجعة human approval flow.
