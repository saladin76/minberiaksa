export type AiAssistantField = {
  key: string;
  label: string;
  required?: boolean;
  secret?: boolean;
  placeholder?: string;
  help: string;
};

export type AiAssistantCapability = {
  key: string;
  title: string;
  description: string;
  inputs: string[];
  outputs: string[];
};

export const AI_ASSISTANT_FIELDS: AiAssistantField[] = [
  { key: "provider", label: "AI Provider", required: true, placeholder: "OpenAI / Azure / OpenAI-compatible", help: "اختر مزود الذكاء الاصطناعي المستخدم داخل الموقع. هذا يحدد طريقة الاتصال والـ endpoint." },
  { key: "apiKey", label: "API Key", required: true, secret: true, help: "يتم إنشاؤه من لوحة تحكم مزود الذكاء الاصطناعي. يجب حفظه كقيمة سرية في Environment Variables أو إعدادات آمنة." },
  { key: "model", label: "Model", required: true, placeholder: "gpt-4.1 / gpt-4o / custom-model", help: "اسم الموديل الذي سيحلل بيانات التسويق ويولّد التوصيات. يمكن تغييره لاحقًا حسب التكلفة والجودة." },
  { key: "baseUrl", label: "Base URL", placeholder: "https://api.openai.com/v1 أو endpoint مخصص", help: "اختياري. استخدمه إذا كان لديك Azure OpenAI أو بوابة OpenAI-compatible أو proxy داخلي." },
  { key: "assistantId", label: "Assistant ID", placeholder: "asst_...", help: "اختياري. يستخدم إذا كان لديك Assistant جاهز بتعليمات وأدوات محفوظة مسبقًا." },
  { key: "dailyBudgetLimit", label: "Daily AI Budget Limit", placeholder: "مثال: 10 USD/day", help: "اختياري. يساعد لاحقًا في التحكم في تكلفة التحليلات اليومية والتشغيل التلقائي." },
];

export const AI_ASSISTANT_CAPABILITIES: AiAssistantCapability[] = [
  { key: "performance_summary", title: "ملخص الأداء اليومي", description: "يقرأ الصرف والتبرعات وROAS وحالة التتبع ويخرج ملخصًا واضحًا للإدارة.", inputs: ["Platform snapshots", "Donation revenue", "Conversion events", "Sync health"], outputs: ["ملخص تنفيذي", "أهم فرص", "أهم مشاكل", "أولويات اليوم"] },
  { key: "budget_recommendations", title: "توصيات الميزانية", description: "يقترح زيادة أو إيقاف أو تقليل ميزانية الحملات بناءً على site ROAS وplatform ROAS وجودة التتبع.", inputs: ["Spend", "Site revenue", "Platform conversions", "Tracking confidence"], outputs: ["زود", "قلل", "أوقف", "اختبر", "راجع التتبع"] },
  { key: "google_ads_diagnosis", title: "تحليل Google Ads", description: "يحلل الكلمات وSearch Terms والعناوين والأوصاف والأصول لاكتشاف التشتيت وفرص التحسين.", inputs: ["Keywords", "Search terms", "Headlines", "Descriptions", "Assets", "Final URLs"], outputs: ["Negative keyword candidates", "أفضل كلمات", "عناوين ضعيفة", "رسائل تحتاج تعديل"] },
  { key: "tracking_diagnosis", title: "تشخيص التتبع", description: "يفسر أسباب عدم ظهور التبرعات في المنصات ويقترح خطوات إصلاح عملية.", inputs: ["ConversionEvent", "Click IDs", "UTM", "Pixel/CAPI readiness", "Platform sync status"], outputs: ["سبب محتمل", "ثقة", "خطوة إصلاح", "أولوية"] },
  { key: "creative_insights", title: "تحليل الرسائل والإعلانات", description: "يساعد الفريق على فهم أي رسالة أو عنوان أو وصف يجلب تبرعات حقيقية وأيها يجلب نقرات فقط.", inputs: ["Ad copy", "Clicks", "Donations", "Average donation", "Campaign objective"], outputs: ["رسائل رابحة", "رسائل مشتتة", "اقتراحات نصوص", "اختبارات A/B"] },
];
