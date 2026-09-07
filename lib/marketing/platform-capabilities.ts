export type MarketingConnectionField = {
  key: string;
  label: string;
  required?: boolean;
  secret?: boolean;
  placeholder?: string;
  help: string;
};

export type MarketingPlatformCapability = {
  key: string;
  title: string;
  category: "ads" | "analytics" | "messaging" | "tracking" | "ai";
  description: string;
  connectionFields: MarketingConnectionField[];
  canPull: string[];
  canAnalyze: string[];
  implementedNow: string[];
  plannedNext: string[];
};

export const MARKETING_PLATFORM_CAPABILITIES: MarketingPlatformCapability[] = [
  {
    key: "meta",
    title: "Meta Ads + Pixel + CAPI",
    category: "ads",
    description: "ربط حسابات Meta الإعلانية والبكسل وCAPI لسحب الصرف وإرسال وتحليل التحويلات.",
    connectionFields: [
      { key: "accountId", label: "Ad Account ID", required: true, placeholder: "act_123456789", help: "تجده داخل Meta Ads Manager أو Business Settings > Ad Accounts. يمكن كتابته بصيغة act_... أو الرقم فقط. يستخدم لسحب الحملات والصرف والنتائج." },
      { key: "accessToken", label: "Access Token", required: true, secret: true, help: "يتم إنشاؤه من Meta Developer / Business App بصلاحيات ads_read وread_insights، ويستخدم لسحب بيانات الحملات من Marketing API." },
      { key: "pixelId", label: "Pixel ID", required: true, help: "تجده في Meta Events Manager > Data Sources. يستخدم لتفعيل Pixel وربط أحداث التبرع بـ Meta." },
      { key: "datasetId", label: "Dataset ID", help: "في بعض إعدادات Meta الحديثة يظهر Dataset بدل Pixel فقط. يستخدم مع CAPI وربط الأحداث بمصدر البيانات." },
      { key: "capiToken", label: "CAPI Access Token", secret: true, help: "تجده من Events Manager > Settings > Conversions API. يستخدم لإرسال التبرعات Server-side إلى Meta." },
    ],
    canPull: ["Campaigns", "Ad sets", "Ads", "Spend", "Impressions", "Clicks", "CTR", "CPC", "CPM", "Actions", "Action values", "Reported conversions"],
    canAnalyze: ["ROAS", "site vs Meta mismatch", "campaigns spending without donations", "missing CAPI/browser events", "placement/country/device breakdowns لاحقًا"],
    implementedNow: ["سحب Meta insights الأساسي", "حسابات متعددة", "ConversionEvent للـ CAPI/browser", "مقارنة أولية مع تبرعات الموقع"],
    plannedNext: ["Attribution windows", "Breakdowns country/device/placement", "فصل Donate عن باقي actions", "تشخيص جودة Pixel/CAPI لكل حملة"],
  },
  {
    key: "google_ads",
    title: "Google Ads",
    category: "ads",
    description: "ربط Google Ads لسحب الحملات، الكلمات، Search Terms، العناوين، الأوصاف، الأصول، والصرف والتحويلات.",
    connectionFields: [
      { key: "developerToken", label: "Developer Token", required: true, secret: true, help: "تجده في Google Ads Manager Account من Tools & Settings > Setup > API Center. مطلوب لاستخدام Google Ads API." },
      { key: "clientId", label: "OAuth Client ID", required: true, help: "يُنشأ من Google Cloud Console داخل Credentials. يستخدم مع Client Secret وRefresh Token للوصول إلى Google Ads API." },
      { key: "clientSecret", label: "OAuth Client Secret", required: true, secret: true, help: "يُنشأ مع OAuth Client ID في Google Cloud Console. يتم حفظه كقيمة سرية." },
      { key: "refreshToken", label: "Refresh Token", required: true, secret: true, help: "يتم توليده بعد ربط حساب Google بصلاحية Google Ads. يسمح للنظام بسحب البيانات دون تسجيل دخول كل مرة." },
      { key: "customerId", label: "Customer ID", required: true, placeholder: "123-456-7890", help: "رقم حساب Google Ads المطلوب سحب بياناته. يظهر أعلى حساب Google Ads. يمكن إدخاله بالشرطات أو بدونها." },
      { key: "managerCustomerId", label: "Manager Customer ID", help: "إذا كان الحساب تحت MCC، ضع رقم حساب المدير. يساعد في المصادقة والوصول للحسابات التابعة." },
      { key: "conversionId", label: "Conversion ID", help: "يظهر في Google Ads conversion tag. يستخدم لإرسال أو مقارنة تحويلات Google Ads." },
      { key: "conversionLabel", label: "Conversion Label", help: "يظهر مع Conversion ID في tag. مطلوب لتفعيل browser conversion أو enhanced/offline conversions لاحقًا." },
    ],
    canPull: ["Campaigns", "Ad groups", "Ads", "Keywords", "Search terms", "Responsive search ad headlines", "Descriptions", "Assets", "Asset performance", "Final URLs", "Tracking templates", "Spend", "Clicks", "Conversions", "Conversion value"],
    canAnalyze: ["الكلمات التي تصرف بدون تبرعات", "Search terms لإضافتها Negative", "العناوين والأوصاف الأفضل", "Final URL وUTM issues", "Google ROAS vs site ROAS"],
    implementedNow: ["هيكل ربط Google موجود", "مكان حفظ credentials موجود", "Browser conversion موجود جزئيًا"],
    plannedNext: ["GAQL sync فعلي", "Keyword/Search term reports", "Ad copy asset analysis", "Google conversion reconciliation"],
  },
  {
    key: "ga4",
    title: "GA4 Analytics",
    category: "analytics",
    description: "ربط GA4 لفهم رحلة المستخدم: sessions، source/medium، campaign، pages، events، device، country.",
    connectionFields: [
      { key: "propertyId", label: "GA4 Property ID", required: true, help: "تجده في GA4 Admin > Property Settings. يستخدم مع Google Analytics Data API لسحب التقارير." },
      { key: "measurementId", label: "Measurement ID", required: true, placeholder: "G-XXXXXXXXXX", help: "تجده في GA4 Data Stream. يستخدم لتفعيل GA4 browser tracking." },
      { key: "apiSecret", label: "Measurement Protocol API Secret", secret: true, help: "تجده في GA4 Data Stream > Measurement Protocol API secrets. يستخدم لإرسال server events إلى GA4." },
      { key: "serviceAccountJson", label: "Service Account JSON", secret: true, help: "يُنشأ من Google Cloud Service Account ويتم منحه صلاحية قراءة GA4 Property. يستخدم لتقارير Data API." },
    ],
    canPull: ["Sessions", "Source / medium", "Campaign", "Landing pages", "Events", "Conversions", "Transaction IDs", "Countries", "Devices"],
    canAnalyze: ["رحلة المستخدم قبل التبرع", "Landing pages", "مصادر الزيارات", "Device/country friction", "GA4 vs Donation DB"],
    implementedNow: ["GA4 server/browser tracking جزئي", "إعدادات GA4 موجودة"],
    plannedNext: ["GA4 Data API runReport", "Journey funnel", "Landing page quality"],
  },
  {
    key: "tiktok",
    title: "TikTok Ads + Pixel",
    category: "ads",
    description: "ربط TikTok لسحب الحملات والنتائج وتحليل CompletePayment وتتبع ttclid.",
    connectionFields: [
      { key: "advertiserId", label: "Advertiser ID", required: true, help: "تجده داخل TikTok Ads Manager أو Business Center. يستخدم لسحب الحملات والإعلانات." },
      { key: "accessToken", label: "Access Token", required: true, secret: true, help: "يتم إنشاؤه من TikTok Developer/Marketing API App بصلاحيات التقارير." },
      { key: "pixelId", label: "Pixel ID", help: "تجده في TikTok Events Manager. يستخدم لتفعيل TikTok Pixel وإرسال CompletePayment." },
      { key: "eventsApiToken", label: "Events API Token", secret: true, help: "يستخدم لإرسال server-side CompletePayment إلى TikTok عند توفره." },
    ],
    canPull: ["Campaigns", "Ad groups", "Ads", "Spend", "Impressions", "Clicks", "Conversions", "Conversion value"],
    canAnalyze: ["TikTok ROAS", "ttclid quality", "CompletePayment missing", "high clicks low donations"],
    implementedNow: ["هيكل ربط TikTok موجود", "browser helper جزئي"],
    plannedNext: ["TikTok Reporting API", "TikTok Events API server CompletePayment", "Creative/ad diagnostics"],
  },
  {
    key: "whatsapp_twilio",
    title: "WhatsApp / Twilio Messaging",
    category: "messaging",
    description: "ربط الرسائل والقوالب وروابط WhatsApp/SMS/Email مع نتائج التبرعات.",
    connectionFields: [
      { key: "accountSid", label: "Twilio Account SID", required: true, help: "تجده داخل Twilio Console. يستخدم للوصول إلى الرسائل والقوالب عند الحاجة." },
      { key: "authToken", label: "Twilio Auth Token", required: true, secret: true, help: "تجده في Twilio Console ويتم حفظه كسري. لا يظهر للمستخدمين." },
      { key: "messagingServiceSid", label: "Messaging Service SID", help: "يستخدم لتجميع الرسائل ضمن خدمة واحدة وتحليل حملات WhatsApp/SMS." },
      { key: "whatsappFrom", label: "WhatsApp Sender", help: "رقم WhatsApp المعتمد في Twilio بصيغة whatsapp:+..." },
    ],
    canPull: ["Sent messages", "Delivery status", "Failed messages", "Templates", "Campaign/template IDs", "Tracked clicks إذا الروابط مولدة من النظام"],
    canAnalyze: ["رسائل تصرف بدون تبرعات", "قوالب أعلى تحويلًا", "delivery issues", "click-to-donation rate"],
    implementedNow: ["Twilio/SentMessage local sync", "UTM support للرسائل"],
    plannedNext: ["Delivery callbacks", "Click tracking per template", "WhatsApp team inbox integration لاحقًا"],
  },
  {
    key: "ai_assistant",
    title: "AI Assistant API",
    category: "ai",
    description: "ربط API الخاص بمساعد الذكاء الاصطناعي داخل الموقع لتحليل الأداء وإخراج توصيات وملخصات تشغيلية.",
    connectionFields: [
      { key: "provider", label: "AI Provider", required: true, placeholder: "OpenAI / Azure / Custom", help: "اختر مزود الذكاء الاصطناعي المستخدم داخل الموقع. يُستخدم لتحديد شكل الاتصال والـ endpoint." },
      { key: "apiKey", label: "API Key", required: true, secret: true, help: "يُستخرج من لوحة تحكم مزود الذكاء الاصطناعي. يتم حفظه كسري ولا يظهر للفريق. يستخدم لتوليد التحليلات والتوصيات." },
      { key: "model", label: "Model", required: true, placeholder: "gpt-4.1 / gpt-4o / custom", help: "اسم الموديل الذي سيستخدمه النظام للتحليل والتوصيات ومساعد الموقع." },
      { key: "baseUrl", label: "Base URL", help: "اختياري إذا كان المزود يستخدم endpoint مخصص أو Azure/OpenAI-compatible gateway." },
      { key: "assistantId", label: "Assistant ID", help: "اختياري إذا كان لديك Assistant جاهز بإعدادات وتعليمات محفوظة مسبقًا." },
    ],
    canPull: ["لا يسحب بيانات إعلانية بنفسه؛ يقرأ البيانات الموجودة في النظام بعد الصلاحيات"],
    canAnalyze: ["تلخيص الأداء", "توصيات ميزانية", "تشخيص تتبع", "اقتراح كلمات سلبية Google", "تحليل عناوين الإعلانات", "إجابات داخلية للفريق"],
    implementedNow: ["سيتم تجهيز مكان الربط والاختبار في الواجهة"],
    plannedNext: ["API test endpoint", "تحليل تلقائي يومي", "توصيات AI محفوظة", "مساعد داخل الموقع للفريق/المتبرعين حسب الصلاحية"],
  },
];

export function getMarketingPlatformCapability(key: string) {
  return MARKETING_PLATFORM_CAPABILITIES.find((item) => item.key === key) ?? null;
}
