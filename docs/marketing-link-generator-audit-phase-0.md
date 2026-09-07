# Marketing Link Generator Audit — Phase 0

## الحكم العام

منشئ الروابط قوي جدًا وهو أقرب إلى Campaign Builder فعلي، وليس مجرد أداة نسخ روابط.

لا يحتاج إعادة بناء في Phase 0. المطلوب فقط ربطه ذهنيًا وعمليًا داخل رحلة Marketing Home كمرحلة Campaign Builder.

## ما يعمل جيدًا

- يدعم روابط الموقع العادية وروابط التسويق.
- يدعم منصات متعددة مثل Meta وGoogle Ads وTikTok وX وWhatsApp وEmail وSMS.
- ينشئ UTM parameters بشكل منظم.
- يدعم campaign id وadset id وad id وplacement وaudience segment.
- يدعم متغيرات المنصات الديناميكية.
- يحتوي على validation جيد يحذر من نقص Campaign ID أو استخدام macros بشكل خاطئ.
- يحتوي على tracking health score.
- يحفظ روابط الحملات في campaign links API.

## نقاط القوة الاستراتيجية

هذا الملف سيكون الجسر بين:

- Operations ContentItem لاحقًا.
- Publishing checklist.
- Messaging schedule.
- Ads performance.
- Marketing learnings.

لذلك يجب تطويره لاحقًا بدل إنشاء Campaign Builder جديد.

## أين يوجد التعقيد؟

- الصفحة طويلة وتحتوي على الكثير من الحقول.
- المستخدم غير التقني قد لا يعرف الفرق بين standard link وmarketing link.
- لا يوجد ربط مباشر حتى الآن مع ContentItem لأن Operations لم يبن بعد.
- لا يوجد campaign registry كامل، لكن يوجد حفظ للروابط التسويقية.

## القرار

لا نعيد بناء Link Generator الآن.

في Phase 0 يكفي:

- اعتباره رسميًا مرحلة Campaign Builder.
- ربطه من Marketing Home.
- عدم إنشاء أداة روابط جديدة داخل Operations.

## تحسينات لاحقة آمنة

بعد بناء Operations يمكن إضافة:

1. زر Create link من ContentItem.
2. حفظ contentItemId مع الرابط.
3. حفظ archiveAssetId أو archiveProjectId عند الحاجة.
4. قوالب UTM جاهزة لكل قناة.
5. وضع مبسط للمستخدمين غير التقنيين.
6. وضع متقدم لمدير الإعلانات.

## ممنوع الآن

- لا ننشئ Campaign Builder جديد.
- لا نغير أسماء UTM الحالية بدون migration واضح.
- لا نكسر الروابط القديمة.
- لا نحذف standard mode.
- لا نربطه بـ Operations قبل بناء ContentItem.

## الخلاصة

Link Generator ليس مشكلة؛ هو أصل مهم جدًا. يجب أن يبقى، ويتم تطويره تدريجيًا إلى Campaign Builder 2.0 بعد أن يصبح Operations موجودًا.
