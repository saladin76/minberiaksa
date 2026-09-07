# Marketing Intelligence Operating System Blueprint

> Production safety note: this blueprint is documentation only. It does not change routes, slugs, redirects, checkout, payment behavior, live tracking behavior, or ad links.

## 1. لماذا نحتاج إعادة تنظيم؟

الأفكار السابقة قوية، لكنها كانت مقسمة إلى مراحل كبيرة يمكن أن تتحول إلى أنظمة متجاورة ومكررة:

- Tracking Control Center
- Ads Diagnostics
- Marketing Platform Connections
- Platform Sync + Reconciliation
- Twilio Messaging Intelligence
- Alerts + Executive Reporting
- Link Generator / Campaign Builder

القرار المعماري هنا: نجمع كل ذلك تحت نظام واحد باسم **Marketing Intelligence Operating System**، بحيث يكون لكل جزء مصدر حقيقة واحد، ولا نكرر منطق التتبع أو التشخيص أو القنوات.

## 2. المصادر الرسمية التي يجب الالتزام بها عند التنفيذ

هذه الروابط مرجعية ويجب مراجعتها مرة أخرى قبل تنفيذ أي تكامل API فعلي:

- Meta Conversions API: deduplication باستخدام `event_name` + `event_id`، وإرسال بيانات مطابقة مثل `_fbp`, `_fbc`, IP, user agent، وبيانات العميل بعد hashing عند الحاجة.
  - https://developers.facebook.com/docs/marketing-api/conversions-api/
  - https://developers.facebook.com/docs/marketing-api/conversions-api/deduplicate-pixel-and-server-events/
- Google Ads API conversions:
  - Conversion management overview: https://developers.google.com/google-ads/api/docs/conversions/overview
  - Offline conversion upload / click identifiers: https://developers.google.com/google-ads/api/docs/conversions/upload-offline
- GA4 Measurement Protocol:
  - Events reference, including `purchase`: https://developers.google.com/analytics/devguides/collection/protocol/ga4/reference/events
- Twilio:
  - Content API resources and template/content structure: https://www.twilio.com/docs/content/content-api-resources
  - Outbound message status callbacks: https://www.twilio.com/docs/messaging/guides/track-outbound-message-status

## 3. قواعد الأمان الخاصة بالموقع الحالي

ممنوع في هذه المنظومة:

- تغيير روابط الحملات أو المشاريع الحالية.
- تغيير slugs.
- تغيير redirects.
- تغيير checkout أو payment flow.
- تغيير أسماء أحداث production الحالية بدون migration واضح.
- حذف pixel أو CAPI أو GA4 أو Twilio logic موجود.
- إظهار الأسرار أو tokens في الواجهة أو AuditLog.
- إظهار أرقام صفرية مضللة عند غياب بيانات المنصة؛ استخدم `غير متاح`.

مسموح:

- إضافة طبقة تحليل فوق البيانات الموجودة.
- توحيد config/types/helpers.
- تطوير `link-generator` الحالي بدون كسر وضع الرابط العادي.
- تمديد أقسام الرسائل والقوالب الحالية بدل تكرارها.
- إضافة endpoints آمنة ترجع `MISSING_CONFIG` أو `NOT_IMPLEMENTED` بدل crash.

## 4. الخريطة الحالية في المشروع

### 4.1 Link Generator الحالي

المسار:

```txt
app/(dashboard)/dashboard/link-generator/page.tsx
```

الحالة الحالية:

- يولد روابط داخلية للموقع.
- يدعم صفحات عامة، مشاريع، حملات/تصنيفات، مقالات، profile، success، login.
- يدعم اللغة، العملة، referral، `openCartPayment`, tab, search.
- لا يدعم UTM campaign builder بعد.
- يجب تطويره إلى **Campaign Builder 2.0** بدل إنشاء صفحة جديدة.

### 4.2 Attribution + Tracking

المسارات الأساسية الموجودة:

```txt
components/AttributionCapture.tsx
lib/attribution/client-payload.ts
components/TrackingPixels.tsx
lib/tracking/canonical.ts
app/api/track/route.ts
lib/tracking/donation-conversion-server.ts
lib/tracking/meta-capi.ts
lib/tracking/conversion-audit.ts
lib/tracking/data-quality-score.ts
lib/tracking/attribution-resolver.ts
lib/attribution/detect-source.ts
app/api/admin/ads/donation-detail/[id]/route.ts
```

مصدر الحقيقة المقترح:

- أسماء الأحداث: `lib/tracking/canonical.ts`
- التقاط UTM/click IDs: `lib/attribution/client-payload.ts`
- المصدر والتحليل: `lib/tracking/attribution-resolver.ts`
- جودة التتبع: `lib/tracking/data-quality-score.ts`
- التحويل النهائي server-side: `lib/tracking/donation-conversion-server.ts`
- إرسال Meta CAPI: `lib/tracking/meta-capi.ts`
- السجل التشخيصي: `lib/tracking/conversion-audit.ts`

ملاحظة تنظيف:

- `lib/attribution/detect-source.ts` يبدو أقدم من `attribution-resolver.ts`. لا يُحذف الآن، لكن في مراحل التنظيف يجب تحويله إلى wrapper أو تقليل الاعتماد عليه.

### 4.3 قاعدة البيانات الحالية ذات الصلة

نماذج موجودة بالفعل ويمكن البناء عليها:

- `Donation.attribution`
- `Donation.conversionEventsSentAt`
- `Donation.conversionFailedEventsSentAt`
- `TrackingSettings`
- `MarketingPlatformConnection`
- `PlatformSyncRun`
- `AdCampaignSnapshot`
- `AdGroupSnapshot`
- `AdSnapshot`
- `MarketingCampaignSnapshot`
- `WhatsappTemplate`
- `EmailTemplate`
- `SentMessage`
- `AuditLog`

قرار مهم: لا نضيف models جديدة قبل مراجعة استخدام هذه models؛ أغلب البنية الأساسية موجودة بالفعل.

## 5. الهيكل النهائي المقترح

القسم الرئيسي في لوحة التحكم:

```txt
ذكاء التسويق
```

التبويبات:

1. غرفة القيادة
2. منشئ الحملات والروابط
3. التتبع وجودة البيانات
4. الإعلانات والمنصات
5. الرسائل والقوالب
6. المطابقة والتحليل
7. التنبيهات
8. التقارير
9. الإعدادات

## 6. الطبقات المعمارية

### الطبقة 1: Campaign Builder 2.0

يبنى فوق `link-generator` الحالي.

وضعان:

- رابط موقع عادي: الوضع الحالي كما هو.
- حملة تسويقية: يضيف UTM/platform parameters آمنة.

يدعم القنوات:

- Meta
- Google Ads
- TikTok
- X
- Twilio WhatsApp
- Twilio SMS
- Twilio Email
- Email
- WhatsApp
- SMS
- Organic

حقول campaign mode:

```txt
platform
channel
utm_source
utm_medium
utm_campaign
utm_id
utm_content
utm_term
campaign_id
adset_id / ad_group_id
ad_id
placement
device
language
target_country
audience_segment
message_variant
twilio_campaign_id
twilio_template_id
button_id
button_label
link_position
```

Validation:

- لا تضف `fbclid` يدويًا.
- لا تضف `gclid` يدويًا.
- كشف macros غير مستبدلة مثل `{{...}}` و`__CAMPAIGN_ID__`.
- `language` يجب أن تكون code مثل `ar` لا `Arabic`.
- `target_country` يجب أن تكون ISO-like code أو اختيار واضح.
- `utm_source` و`utm_medium` يجب أن يطابقا القناة.
- إظهار health preview لكل منصة.

### الطبقة 2: Attribution & Event Spine

المطلوب تثبيت event contract واحد:

```txt
page_view
view_content
add_to_cart
begin_checkout
add_payment_info
payment_submit
payment_failed
donation_complete
```

كل حدث يجب أن يملك:

- canonical name
- Meta event mapping
- GA4 event mapping
- TikTok event mapping
- X event mapping
- dataLayer mapping إن وجد
- event_id rule
- browser/server ownership
- deduplication behavior

قاعدة التحويل النهائي:

- المتصفح يمكنه إرسال browser pixel.
- السيرفر هو مصدر الحقيقة لتحويل `donation_complete` بعد `PAID`.
- `event_id = donate_<donationId>`.
- نفس `event_id` يستخدم للـ dedup بين browser/server عند الحاجة.

### الطبقة 3: Platform Connections & Sync

الموجود:

- `MarketingPlatformConnection`
- `PlatformSyncRun`
- snapshots models

المطلوب لاحقًا:

- عدم بناء connections جديدة.
- إنشاء UI موحد لحالة المنصات.
- Manual sync فقط في البداية.
- إذا credentials ناقصة: `MISSING_CONFIG`.
- إذا API غير جاهز: `NOT_IMPLEMENTED`.

### الطبقة 4: Reconciliation Engine

هذا هو قلب النظام.

يقارن:

- site paid donations
- site revenue
- platform reported conversions
- platform reported value
- spend
- impressions
- clicks
- messaging sent/delivered/failed/clicked later

Group by:

- platform
- campaign
- ad group / ad set
- ad
- placement
- country
- channel
- template
- audience segment

Likely reason enum:

```txt
matched
platform_higher_likely_view_through
site_higher_likely_missing_platform_attribution
utm_only_no_click_id
missing_capi
attribution_window_difference
no_platform_data
custom_conversion_possible
ga4_inferred_only
unresolved_dynamic_macro
messaging_click_without_donation
messaging_delivery_issue
sms_failed_delivery
whatsapp_low_click_rate
email_low_open_rate
payment_issue
unknown
```

### الطبقة 5: Messaging Intelligence

لا يعيد بناء Twilio.

يبني فوق:

- `lib/whatsapp.ts` إن وجد
- `WhatsappTemplate`
- `EmailTemplate`
- `SentMessage`
- `MarketingCampaignSnapshot`

المطلوب لاحقًا:

- WhatsApp template preview.
- Twilio Content API import/sync.
- support for text/media/buttons/footer/variables.
- tracked URLs for buttons.
- delivery status callback foundation.
- analytics by campaign/template/language/country/segment.

### الطبقة 6: Alerts & Executive Reporting

لا تبدأ قبل تثبيت reconciliation.

مصادر التنبيهات:

- tracking health
- conversion audit
- attribution resolver
- platform snapshots
- messaging snapshots
- donation trends

مخرجاتها:

- alerts
- insights
- executive reports
- recommended actions

## 7. تسلسل التنفيذ الصحيح

### Phase 0 — Blueprint & Cleanup

الحالة: بدأت بهذا الملف.

أهدافها:

- تثبيت الخريطة.
- منع إضافة عشوائية.
- تحديد مصدر الحقيقة.
- حصر ما هو موجود.
- عدم تغيير production behavior.

### Phase 1 — Campaign Builder 2.0

الأولوية الأعلى لأن جودة الروابط هي جذر التتبع.

تعديلات آمنة:

- تطوير `link-generator` الحالي.
- عدم حفظ models في البداية إلا إذا احتجنا.
- إضافة campaign mode + templates + validation.
- عدم تغيير أي رابط موجود.

### Phase 2 — Tracking Health Cockpit

تبويب يقرأ من الموجود فقط:

- TrackingSettings
- TrackingPixels config
- Donation attribution
- ConversionAudit
- DataQualityScore

لا يغير التتبع.

### Phase 3 — Reconciliation Core

يبني helper واحد:

```txt
lib/marketing/reconciliation/reconcile.ts
```

بدون UI كبير في البداية، ثم يربط dashboard.

### Phase 4 — Platform Sync UI

يبني فوق models الموجودة:

- sync history
- manual sync
- missing config states
- not implemented states

### Phase 5 — Messaging Intelligence

يمتد على الرسائل والقوالب الحالية.

### Phase 6 — Alerts & Reports

آخر مرحلة، بعد أن تكون البيانات موحدة.

## 8. قرارات مصدر الحقيقة

| المجال | مصدر الحقيقة |
| --- | --- |
| الإيرادات | Donation DB |
| التحويل النهائي | Donation PAID + donation-conversion-server |
| event names | canonical.ts |
| UTM/click IDs | Donation.attribution |
| جودة البيانات | data-quality-score.ts |
| التشخيص | attribution-resolver.ts + conversion-audit.ts |
| روابط الحملات | link-generator بعد تطويره |
| منصات الإعلان | MarketingPlatformConnection + snapshots |
| Twilio | نماذج الرسائل والقوالب الحالية + snapshots |
| التقارير | snapshots محفوظة لا تتغير لاحقًا |

## 9. نقاط تنظيف قبل الكود الكبير

- لا نضيف `MarketingAlertRule` الآن إذا كان reconciliation غير جاهز.
- لا نكرر Messaging models؛ `WhatsappTemplate`, `SentMessage`, `MarketingCampaignSnapshot` موجودة.
- لا نكرر platform snapshots؛ النماذج موجودة بالفعل.
- لا نبني Tracking Control Center منفصل؛ سيكون تبويبًا داخل `ذكاء التسويق`.
- لا نستخدم `detect-source` كمنطق مستقل طويل المدى؛ نعتمد على `attribution-resolver`.

## 10. نتيجة هذه المرحلة

هذه الوثيقة هي عقد التنفيذ القادم. أي مرحلة لاحقة يجب أن تذكر صراحة أي طبقة من هذه الخطة تنفذها وأي ملفات تمسها، وألا تبدأ مرحلة أخرى قبل إنهاء الحالية.
