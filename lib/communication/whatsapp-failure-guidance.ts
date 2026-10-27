/** Guidance never treats a provider acceptance as proof of delivery. */
export function whatsappFailureGuidance(message: string): string | null {
  if (/131026|Message undeliverable/i.test(message)) return "تعذر توصيل الرسالة إلى هذا الرقم. تحقق من صحة الرقم وتوفر واتساب لدى المستلم. إذا لم يذكر السجل رمز Meta فلا يمكن تحديد السبب الأدق من الوصف وحده. لا تُعد الإرسال جماعيًا.";
  if (/131049/i.test(message)) return "أوقف Meta توصيل رسالة تسويقية لحماية تفاعل المستخدم. انتظر مدة مناسبة وراجع تكرار الحملات؛ تكرار المحاولة فورًا لا يعالج السبب.";
  if (/132000|132012/i.test(message)) return "قيم القالب أو نوع وسائطه لا تطابق النسخة المعتمدة لدى Meta. راجع متغيرات القالب ومعاينته قبل إرسال محاولة جديدة.";
  if (/132001|template.*not.*exist/i.test(message)) return "القالب أو لغته غير متاحين لهذا الحساب. زامن قوالب الحساب وراجع اعتماد اللغة وتوجيه المرسل.";
  if (/WHATSAPP_MARKETING_COOLDOWN|RECENT_MARKETING_CONTACT/.test(message)) return "تم منع تكرار رسالة تسويقية ضمن الفاصل المحدد. راجع إعداد الفاصل والجمهور؛ الرسالة متخطاة ولم تُرسل للمزوّد.";
  if (/QUIET_HOURS|quiet.hours/i.test(message)) return "المستلم داخل ساعات الهدوء. راجع المنطقة الزمنية وموعد الاستئناف في إعدادات الحملة.";
  if (/LANGUAGE_EXCLUDED|LOCALE|LANGUAGE.*MISSING/i.test(message)) return "راجع لغة المستلم وسياسة اللغة البديلة وتوفر قالب معتمد لهذه اللغة لدى المرسل المختار.";
  return null;
}
