# Marketing Conversion Closure

## الحكم العام

مسار التحويلات قوي بما يكفي ليكون مصدر الحقيقة داخل Marketing Operating System.

المصدر الأساسي هو ConversionEvent، مع fallback قديم إلى AuditLog عند غياب البيانات.

## ما هو موجود

- صفحة Conversion Events.
- Timeline لكل تبرع.
- فلاتر بالمنصة والقناة والحالة والفترة.
- عرض الحالات: SENT وFAILED وSKIPPED وPENDING.
- تجميع الأحداث حسب donationId.
- Retry للتبرعات التي لم يتم إرسال تحويل server لها بنجاح.
- API مستقل لإعادة محاولة الإرسال.

## مصدر الحقيقة

المصدر الرسمي لتسليم التحويلات هو:

ConversionEvent

AuditLog fallback يستخدم فقط للماضي أو عند عدم وجود ConversionEvent.

## قرار الإغلاق

نعتبر Conversion Closure مقبولًا بشرط:

1. كل صفحات Marketing تشير إلى ConversionEvent كمصدر الحقيقة.
2. Quality تعرض مشاكل التسليم والناقص.
3. Conversion Events تعرض السجل الفني والتايملاين.
4. Retry يبقى يدويًا وليس تلقائيًا.
5. لا يتم اعتبار Donation timestamp وحده مصدر إرسال التحويل.

## ما لا نفعله الآن

- لا نغير منطق الإرسال الفعلي.
- لا نغير donation checkout.
- لا نضيف auto retry.
- لا نعيد بناء ConversionEvent.
- لا نحذف AuditLog fallback قبل التأكد من التاريخ القديم.

## تحسينات لاحقة آمنة

- إضافة رابط أوضح من Marketing Home إلى Conversion Events.
- إضافة شرح أن Retry يدوي ويجب استخدامه بحذر.
- إضافة Summary صغيرة في Quality تقود إلى Conversion Events عند الفشل.

## النتيجة

Conversion system لا يحتاج إعادة بناء قبل Operations. يحتاج فقط إبراز أفضل داخل Marketing Home وربطه ذهنيًا بمرحلة Conversions.
