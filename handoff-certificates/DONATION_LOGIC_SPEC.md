# DONATION_LOGIC_SPEC — منطق التبرع (عقد التنفيذ للمبرمج)

الواجهة كاملة ومبنية. هذا المستند يحدد العقد الذي يبنيه الـBackend. لا شيء هنا مُنفَّذ خلفيًا.

---

## 1. التبرع الدوري

### التدفق
`Fund → Frequency → Amount → Currency → Timing → Review → Payment → Active plan`

الواجهة: `التبرع الدوري.dc.html` — الخطوات مبنية بهذا الترتيب، والمراجعة تعرض الملخص قبل الدفع.

### Canonical Contract: donationMode × frequency
`donationMode: one_time | recurring` — `frequency: null (one_time) | daily | friday | monthly (recurring فقط)`. التخزين الداخلي الحالي في Frontend (`mia_cart_items.freqKey`) يستخدم القيم التاريخية `once|daily|friday|monthly`؛ التطبيع لهذا العقد الرسمي (once→one_time/null) مسؤولية القراءة عند بناء أي Payload خارجي — التفاصيل والجدول الكامل في `RECURRING_DONATION_FLOW_MAP.md`.

### الدوريات
| القيمة | السلوك |
|---|---|
| `daily` | سحب كل يوم في التوقيت المحدد |
| `friday` | كل جمعة — والسحب المرتبط بوقت الصلاة انظر §1.3 |
| `monthly` | نفس يوم الشهر من أول سحبة؛ الشهر الأقصر يسحب آخر يوم فيه |

### 1.3 السحب المرتبط بوقت الصلاة (خيار «قبل صلاة الجمعة»)
- **Timezone:** تُخزَّن مع الخطة وقت الإنشاء (IANA مثل `Europe/Istanbul`)، من المتصفح مع سماح التعديل.
- **Location:** مدينة المتبرع تُخزَّن كإحداثيات لحساب وقت الصلاة، الافتراضي عاصمة بلد اللغة.
- **Prayer time source:** API موثوق (Diyanet أو Aladhan بطريقة حساب Diyanet) — يقرره المبرمج ويوثقه.
- **DST:** الحساب بالـIANA timezone يمتص التحول الصيفي تلقائيًا — ممنوع تخزين offset ثابت.
- **تغير وقت الصلاة:** يُعاد حساب موعد السحبة التالية عند كل تنفيذ، لا يُخزَّن جدول سنوي مسبق.
- **Retry:** فشل السحب → 3 محاولات (بعد ساعة، 6 ساعات، 24 ساعة) ثم `payment_failed` + إشعار.
- **Expired payment method:** قبل السحبة بـ7 أيام يُفحص انتهاء البطاقة ويُرسَل إشعار تحديث.

### 1.4 حالات الخطة
```
draft → pending_payment → active ⇄ paused
                             ↘ payment_failed → active (بعد تحديث الدفع)
                             ↘ cancelled
                             ↘ completed (خطط محدودة العدد إن أُضيفت)
```
- `pause/resume/cancel` من حساب المتبرع — الواجهة موجودة في `حساب المتبرع.dc.html`.
- الإلغاء لا يحذف السجل؛ يُعلَّم `cancelled` ويبقى في السجل.

### 1.5 الإشعارات
بريد عند: إنشاء الخطة، كل سحبة ناجحة (+ إيصال)، فشل السحب، الإيقاف، الاستئناف، الإلغاء، قرب انتهاء البطاقة. القوالب جاهزة في `قوالب البريد.dc.html` (12 قالبًا مربوطة i18n).

---

## 2. الشهادات — توليد خلفي حصرًا

### التدفق
`Payment Confirmed → Eligibility Validation → Unique Serial → Certificate Record → Render → Storage → Link to donor/donation → Display/Download`

### القواعد الصلبة
1. **Serial فريد** يولده الخادم (`MIA-WQF-2026-000123` نمط مقترح) — لا يولَّد في المتصفح أبدًا.
2. لا شهادة قبل تأكيد الدفع (البطاقة: فورًا بعد نجاح العملية؛ التحويل البنكي: بعد `Confirmed` §3).
3. إعادة تحميل الصفحة أو إعادة الطباعة **لا** تنتج Serial جديدًا — السجل مرجعه donationId.
4. الشهادة سجل دائم: `certificateId · serial · donationId · donorId · type (share|meter|thanks) · count · amount · currency · dedicatedTo · issuedAt · locale`.
5. القوالب frontend جاهزة: `شهادة الاوقاف` (سهم/متر — وجهان)، `شهادة الشكر عرضية/لوحة/طولي`، `إيصال التبرع`. كلها تستقبل props وتُصيَّر للطباعة/PDF، ومترجمة ×19 (حزمة `certificates`).
6. النسخة الرسمية EN وTR معتمدتان حرفيًا من شهادات المؤسسة المطبوعة (uploads/EN-*.pdf, TR-*.pdf).

---

## 3. التحويل البنكي

### التدفق
`Awaiting receipt → Receipt uploaded → Under review → Confirmed | Rejected`

| السؤال | الجواب المعتمد |
|---|---|
| من يغير الحالة؟ | موظف مالية من الداشبورد فقط (`Under review → Confirmed/Rejected`) |
| ماذا يرى المتبرع؟ | صفحة «الدفع قيد التأكيد» + حالة في حساب المتبرع + بريد عند كل تغيير حالة |
| Notification | بريد: استلام الإيصال، التأكيد (+ إيصال رسمي + شهادة)، الرفض (+ السبب) |
| عند الرفض؟ | يُذكر السبب، ويُسمح **بإعادة رفع الإيصال** (محاولتان كحد أقصى ثم تواصل يدوي) |
| متى Confirmed؟ | عند مطابقة موظف المالية المبلغ الوارد فعليًا بالحساب البنكي |
| متى تولَّد الشهادة؟ | بعد `Confirmed` فقط — أبدًا قبله |

لا تغيير على نظام الحسابات البنكية الحالي (`الحسابات البنكية.dc.html`) — حسابات مختلفة لكل لغة/منطقة تُدار من الداشبورد.

---

## 4. نقاط التكامل في الكود
ابحث عن الوسوم: `[BACKEND-INTEGRATION]` · `[DASHBOARD-INTEGRATION]` · `[AUTH-INTEGRATION]` · `[DESIGN-CONTRACT]` داخل تعليقات الصفحات المعنية (السلة، بيانات الدفع، التبرع الدوري، حساب المتبرع، الشهادات).


---

## Recurring Time Contract (ملزم)
كل RecurringPlan يحفظ: **timezone · scheduleType (daily/friday/monthly) · scheduleRule بنيةً لا نصًا** ({dayOfMonth: 15} لا «اليوم الخامس عشر» — الترجمة Presentation فقط) **· nextChargeAt (UTC محسوب Backend) · lastChargeAt? · status**.
- التنفيذ من ساعة الخادم حصرًا — **ممنوع الاعتماد على وقت متصفح المتبرع للخصم**.
- المرتبط بوقت صلاة: يحفظ location/timezone + prayer rule + مصدر الحساب + next resolved charge time، ويعاد الحساب عند DST/تغير التوقيت.
- فشل الخصم: active → payment_failed → retry policy **قابلة للتهيئة** (عددًا وفاصلًا — ليست قرارًا مثبتًا) → نجاح=active، استنفاد=cancelled مع إخطار.

## Idempotency (ملزم للمبرمج)
- **Payment**: نفس providerReference لا ينشئ Order/Donation ثانية مهما تكرر الـwebhook — idempotency key ملزم.
- **Certificate**: donation مؤهل + certificateType ⇒ هوية شهادة واحدة؛ إعادة تشغيل Job لا تصدر serial جديدًا (unique constraint).
- **Email**: سجل emailEventId (eventType + entityId + sentAt) — التكرار لا يعيد الإرسال.
