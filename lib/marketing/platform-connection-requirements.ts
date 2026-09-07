/**
 * Per-platform configuration requirements + readiness scoring for the
 * Marketing Platform Connections page.
 *
 * This file is intentionally UI/API reusable. It defines the marketer-facing
 * checklist, Arabic guidance, and the readiness score used by the connections
 * dashboard, create/update APIs, test endpoints, and future sync jobs.
 */

export type PlatformCategory =
  | "ADS"
  | "ANALYTICS"
  | "MESSAGING"
  | "EMAIL"
  | "AI"
  | "ARCHIVE_STORAGE"
  | "INTERNAL_API"
  | "CUSTOM";
export type PlatformKey =
  | "META"
  | "GOOGLE_ADS"
  | "TIKTOK"
  | "X"
  | "GA4"
  | "TWILIO"
  | "NETGSM"
  | "EMAIL_PROVIDER"
  | "WHATSAPP_PROVIDER"
  | "SMS_PROVIDER"
  | "OPENAI"
  | "GOOGLE_DRIVE"
  | "GOOGLE_PICKER"
  | "VIDEO_FRAME_EXTRACTOR"
  | "STORAGE_PROVIDER"
  | "INTERNAL_API"
  | "CUSTOM";

export type ConnectionStatus =
  | "ACTIVE"
  | "DISABLED"
  | "MISSING_CONFIG"
  | "AUTH_ERROR"
  | "PERMISSION_ERROR"
  | "SYNC_ERROR"
  | "NOT_IMPLEMENTED";

export interface RequirementField {
  field: string;
  labelAr: string;
  secret: boolean;
  guidanceAr: string;
}

export interface PlatformRequirements {
  platform: PlatformKey;
  category: PlatformCategory;
  labelAr: string;
  required: RequirementField[];
  optional: RequirementField[];
  setupGuideAr: string;
}

const META_GUIDE: PlatformRequirements = {
  platform: "META",
  category: "ADS",
  labelAr: "Meta Ads",
  required: [
    { field: "accountId", labelAr: "Ad Account ID", secret: false, guidanceAr: "ناقص Ad Account ID. ستجده في Meta Ads Manager بصيغة act_XXXXXXXX." },
    { field: "accessToken", labelAr: "Access Token", secret: true, guidanceAr: "ناقص Access Token. يمكنك الحصول عليه من Meta Business Settings > Users > System Users > Generate Token." },
    { field: "pixelId|datasetId", labelAr: "Pixel ID أو Dataset ID", secret: false, guidanceAr: "ناقص Pixel ID أو Dataset ID. ستجده في Events Manager داخل Meta." },
  ],
  optional: [
    { field: "businessId", labelAr: "Business ID", secret: false, guidanceAr: "Business ID اختياري لكنه مفيد لإدارة الصلاحيات." },
    { field: "appSecret", labelAr: "Meta App Secret", secret: true, guidanceAr: "مطلوب إذا كان Meta App يفرض appsecret_proof. استخدم App Secret الحقيقي من Meta Developers لنفس التطبيق الذي صدر منه Access Token. لا تستخدم Test Event Code هنا." },
  ],
  setupGuideAr: "اربط حساب إعلانات Meta + Pixel/Dataset لتجهيز مزامنة الحملات. إذا ظهر خطأ appsecret_proof فأضف Meta App Secret الصحيح لنفس التطبيق.",
};

const GOOGLE_ADS_GUIDE: PlatformRequirements = {
  platform: "GOOGLE_ADS",
  category: "ADS",
  labelAr: "Google Ads",
  required: [
    { field: "accountId", labelAr: "Customer ID", secret: false, guidanceAr: "ناقص Customer ID. ستجده في أعلى حساب Google Ads." },
    { field: "developerToken", labelAr: "Developer Token", secret: true, guidanceAr: "ناقص Developer Token. ستجده في Google Ads > Tools & Settings > API Center." },
    { field: "appId", labelAr: "OAuth Client ID", secret: false, guidanceAr: "ناقص OAuth Client ID. أنشئه من Google Cloud Console > Credentials." },
    { field: "clientSecret", labelAr: "OAuth Client Secret", secret: true, guidanceAr: "ناقص OAuth Client Secret. أنشئه من Google Cloud Console > Credentials." },
    { field: "refreshToken", labelAr: "Refresh Token", secret: true, guidanceAr: "ناقص Refresh Token. يجب إكمال OAuth وربط حساب Google Ads." },
  ],
  optional: [
    { field: "managerAccountId", labelAr: "Manager Customer ID", secret: false, guidanceAr: "Manager Customer ID مطلوب فقط إذا كان الحساب مُدار من MCC." },
    { field: "conversionId", labelAr: "Conversion ID (AW-XXXXXXX)", secret: false, guidanceAr: "Conversion ID اختياري — مطلوب لاحقًا لربط Enhanced Conversions." },
    { field: "conversionLabel", labelAr: "Conversion Label", secret: false, guidanceAr: "Conversion Label اختياري — مرافق لـ Conversion ID." },
  ],
  setupGuideAr: "اربط Google Ads + OAuth + Developer Token لمزامنة الحملات والإنفاق لاحقًا.",
};

const TIKTOK_GUIDE: PlatformRequirements = {
  platform: "TIKTOK",
  category: "ADS",
  labelAr: "TikTok Ads",
  required: [
    { field: "advertiserId", labelAr: "Advertiser ID", secret: false, guidanceAr: "ناقص Advertiser ID. ستجده في TikTok Ads Manager أو Business Center." },
    { field: "accessToken", labelAr: "Access Token", secret: true, guidanceAr: "ناقص Access Token. يجب إنشاء تطبيق أو Authorization من TikTok Marketing API." },
    { field: "pixelId", labelAr: "Pixel Code", secret: false, guidanceAr: "ناقص Pixel Code. أنشئه من Events Manager في TikTok Ads." },
  ],
  optional: [
    { field: "appId", labelAr: "App ID", secret: false, guidanceAr: "App ID اختياري — لتطبيق TikTok Marketing API عند الحاجة." },
    { field: "appSecret", labelAr: "App Secret", secret: true, guidanceAr: "App Secret اختياري لتطبيق TikTok Marketing API عند الحاجة." },
  ],
  setupGuideAr: "اربط TikTok Ads + Pixel Code لتجهيز مزامنة الحملات وEvents API لاحقًا.",
};

const X_GUIDE: PlatformRequirements = {
  platform: "X",
  category: "ADS",
  labelAr: "X / Twitter Ads",
  required: [
    { field: "accountId", labelAr: "Ad Account ID", secret: false, guidanceAr: "ناقص Ad Account ID. ستجده في X Ads Manager > Account Settings." },
    { field: "accessToken", labelAr: "Access Token", secret: true, guidanceAr: "قد تحتاج إلى تفعيل Ads API access من X Developer Portal للحصول على Access Token." },
  ],
  optional: [
    { field: "pixelId", labelAr: "Pixel ID", secret: false, guidanceAr: "Pixel ID اختياري — لتفعيل التحويلات لاحقًا." },
    { field: "conversionId", labelAr: "Conversion Event ID", secret: false, guidanceAr: "Conversion Event ID اختياري لقياس التبرعات." },
    { field: "refreshToken", labelAr: "Refresh Token", secret: true, guidanceAr: "Refresh Token اختياري — لتمديد صلاحية الـ Access Token." },
    { field: "appId", labelAr: "App Key", secret: false, guidanceAr: "App Key اختياري — جزء من تطبيق X Developer." },
    { field: "appSecret", labelAr: "App Secret", secret: true, guidanceAr: "App Secret اختياري — جزء من تطبيق X Developer." },
  ],
  setupGuideAr: "تفعيل Ads API access من X Developer Portal مطلوب قبل ربط الحساب.",
};

const GA4_GUIDE: PlatformRequirements = {
  platform: "GA4",
  category: "ANALYTICS",
  labelAr: "Google Analytics 4",
  required: [
    { field: "accountId", labelAr: "Measurement ID (G-XXXXXXXXXX)", secret: false, guidanceAr: "ناقص Measurement ID. ستجده داخل GA4 Data Stream ويبدأ غالبًا بـ G-." },
    { field: "apiSecret", labelAr: "API Secret", secret: true, guidanceAr: "ناقص API Secret. من GA4 Admin > Data Streams > Measurement Protocol API secrets." },
  ],
  optional: [
    { field: "propertyId", labelAr: "Property ID", secret: false, guidanceAr: "Property ID اختياري — لاستعلامات Reporting API." },
    { field: "streamId", labelAr: "Stream ID", secret: false, guidanceAr: "Stream ID اختياري — لتخصيص Data Streams." },
  ],
  setupGuideAr: "اربط GA4 لتجهيز Reporting API وMeasurement Protocol. أحداث التتبع المباشر تدار من قسم البكسلات والتتبع.",
};

const TWILIO_GUIDE: PlatformRequirements = {
  platform: "TWILIO",
  category: "MESSAGING",
  labelAr: "Twilio",
  required: [
    { field: "accountId", labelAr: "Account SID", secret: false, guidanceAr: "ناقص Account SID. ستجده في Twilio Console > Account Info." },
    { field: "authToken", labelAr: "Auth Token", secret: true, guidanceAr: "ناقص Auth Token. ستجده في Twilio Console > Account Info." },
  ],
  optional: [
    { field: "messagingServiceSid", labelAr: "Messaging Service SID", secret: false, guidanceAr: "Messaging Service SID اختياري لكنه مفضل لإدارة الإرسال والـ callbacks." },
    { field: "whatsappSender", labelAr: "WhatsApp Sender", secret: false, guidanceAr: "WhatsApp Sender اختياري — مثلاً whatsapp:+14155238886." },
    { field: "smsSender", labelAr: "SMS Sender", secret: false, guidanceAr: "SMS Sender اختياري — رقم E.164 معتمد لدى Twilio." },
    { field: "emailSender", labelAr: "Email Sender", secret: false, guidanceAr: "Email Sender اختياري — مع تكامل SendGrid عبر Twilio." },
  ],
  setupGuideAr: "اربط Twilio لإدارة WhatsApp وSMS والبريد. الإرسال الفعلي الحالي لا يتأثر بهذه الإعدادات حتى تفعيل المزامنة.",
};

const NETGSM_GUIDE: PlatformRequirements = {
  platform: "NETGSM",
  category: "MESSAGING",
  labelAr: "Netgsm",
  required: [
    { field: "accountId", labelAr: "Netgsm Username", secret: false, guidanceAr: "ناقص اسم مستخدم Netgsm. ستجده داخل لوحة Netgsm." },
    { field: "apiSecret", labelAr: "Netgsm Password / API Secret", secret: true, guidanceAr: "ناقص كلمة مرور أو API Secret الخاص بـ Netgsm. لا تعرضه داخل الواجهة." },
    { field: "senderId", labelAr: "SMS Header", secret: false, guidanceAr: "ناقص SMS Header المعتمد للإرسال من Netgsm داخل تركيا." },
  ],
  optional: [
    { field: "accountName", labelAr: "اسم الحساب", secret: false, guidanceAr: "اسم الحساب اختياري لتوضيح الحساب للفريق." },
    { field: "appSecret", labelAr: "Webhook Secret", secret: true, guidanceAr: "Webhook Secret اختياري إذا تم تفعيل callbacks لاحقًا." },
  ],
  setupGuideAr: "Netgsm هو مسار SMS الأساسي داخل تركيا. لا تستخدمه كبديل لـ WhatsApp أو البريد.",
};

const EMAIL_PROVIDER_GUIDE: PlatformRequirements = {
  platform: "EMAIL_PROVIDER",
  category: "EMAIL",
  labelAr: "موفر البريد الإلكتروني",
  required: [
    { field: "name", labelAr: "اسم الموفر", secret: false, guidanceAr: "حدّد اسم الموفر (SendGrid / Mailgun / SES …)." },
    { field: "apiSecret", labelAr: "API Key", secret: true, guidanceAr: "ناقص API Key. أنشئه من لوحة الموفر." },
    { field: "emailSender", labelAr: "بريد المرسل / النطاق المعتمد", secret: false, guidanceAr: "ناقص بريد المرسل أو النطاق المعتمد." },
  ],
  optional: [
    { field: "appSecret", labelAr: "Webhook Secret", secret: true, guidanceAr: "Webhook Secret اختياري — للتحقق من الـ events." },
    { field: "senderId", labelAr: "اسم المرسل الافتراضي", secret: false, guidanceAr: "اسم المرسل الافتراضي اختياري." },
  ],
  setupGuideAr: "أضف API Key والنطاق المعتمد لإرسال البريد الإلكتروني عبر الموفر المختار لاحقًا.",
};

const WHATSAPP_PROVIDER_GUIDE: PlatformRequirements = { ...TWILIO_GUIDE, platform: "WHATSAPP_PROVIDER", category: "MESSAGING", labelAr: "موفر WhatsApp" };
const SMS_PROVIDER_GUIDE: PlatformRequirements = { ...TWILIO_GUIDE, platform: "SMS_PROVIDER", category: "MESSAGING", labelAr: "موفر SMS" };

const OPENAI_GUIDE: PlatformRequirements = {
  platform: "OPENAI",
  category: "AI",
  labelAr: "OpenAI",
  required: [
    { field: "apiSecret", labelAr: "OpenAI API Key", secret: true, guidanceAr: "ناقص OpenAI API Key. يُستخدم فقط من الخادم داخل Shared AI Core ولا يظهر في الواجهة." },
  ],
  optional: [
    { field: "accountId", labelAr: "Project أو Organization ID", secret: false, guidanceAr: "اختياري لتحديد المشروع أو المنظمة في OpenAI." },
    { field: "accountName", labelAr: "اسم سياق الاستخدام", secret: false, guidanceAr: "اختياري، مثل Shared AI Core أو Marketing Assistant." },
  ],
  setupGuideAr: "OpenAI هنا عقد جاهزية للـ Shared AI Core فقط. لا إرسال تلقائي، لا نشر، ولا تغيير ميزانيات بدون موافقة بشرية.",
};

const GOOGLE_DRIVE_GUIDE: PlatformRequirements = {
  platform: "GOOGLE_DRIVE",
  category: "ARCHIVE_STORAGE",
  labelAr: "Google Drive",
  required: [
    { field: "accountId", labelAr: "Google Cloud Project ID", secret: false, guidanceAr: "ناقص Project ID. أنشئ مشروعًا في Google Cloud Console ثم فعّل Google Drive API." },
    { field: "appId", labelAr: "OAuth Client ID", secret: false, guidanceAr: "ناقص OAuth Client ID. أنشئه من Google Cloud Console > Credentials." },
    { field: "clientSecret", labelAr: "OAuth Client Secret", secret: true, guidanceAr: "ناقص OAuth Client Secret. يجب حفظه في الخادم فقط." },
    { field: "refreshToken", labelAr: "OAuth Refresh Token", secret: true, guidanceAr: "ناقص Refresh Token. لا تنفّذ sync قبل اعتماد OAuth وRedirect URI." },
  ],
  optional: [
    { field: "accountName", labelAr: "Root Folder ID / Name", secret: false, guidanceAr: "Root folder اختياري لتقييد وصول الأرشيف." },
    { field: "businessId", labelAr: "Google Workspace Customer", secret: false, guidanceAr: "اختياري إذا كان الربط على Workspace محدد." },
  ],
  setupGuideAr: "هذا عقد ربط فقط للأرشيف. استخدم scope drive.file مع Google Picker حيث أمكن، ولا تستخدم drive.readonly إلا عند الحاجة.",
};

const GOOGLE_PICKER_GUIDE: PlatformRequirements = {
  platform: "GOOGLE_PICKER",
  category: "ARCHIVE_STORAGE",
  labelAr: "Google Picker",
  required: [
    { field: "accountId", labelAr: "Google Cloud Project Number / API Key", secret: false, guidanceAr: "ناقص Project Number أو Browser API Key مقيّد بالـ referrer." },
    { field: "appId", labelAr: "OAuth Client ID", secret: false, guidanceAr: "ناقص OAuth Client ID المستخدم مع Google Picker." },
  ],
  optional: [
    { field: "propertyId", labelAr: "Picker App ID", secret: false, guidanceAr: "Picker App ID اختياري حسب إعداد Google Picker." },
    { field: "streamId", labelAr: "Scopes", secret: false, guidanceAr: "دوّن scopes المطلوبة هنا. drive.file مفضل، وdrive.readonly أوسع ويحتاج مراجعة." },
  ],
  setupGuideAr: "Google Picker يفتح اختيار ملفات آمن داخل المتصفح، لكنه لا يعني تنفيذ Google Drive Sync.",
};

const VIDEO_FRAME_EXTRACTOR_GUIDE: PlatformRequirements = {
  platform: "VIDEO_FRAME_EXTRACTOR",
  category: "ARCHIVE_STORAGE",
  labelAr: "Video Frame Extractor",
  required: [
    { field: "accountId", labelAr: "Runtime contract", secret: false, guidanceAr: "حدّد runtime المقترح لاستخراج الإطارات، مثل FFmpeg worker. لا يوجد تنفيذ فعلي الآن." },
  ],
  optional: [
    { field: "accountName", labelAr: "Queue / Worker name", secret: false, guidanceAr: "اسم الـ queue أو worker اختياري للتحضير لاحقًا." },
  ],
  setupGuideAr: "عقد foundation فقط لاستخراج frames من الفيديو لاحقًا. لا تشغيل ملفات ولا workers الآن.",
};

const STORAGE_PROVIDER_GUIDE: PlatformRequirements = {
  platform: "STORAGE_PROVIDER",
  category: "ARCHIVE_STORAGE",
  labelAr: "Storage Provider",
  required: [
    { field: "accountId", labelAr: "Storage namespace / bucket", secret: false, guidanceAr: "ناقص اسم الـ bucket أو namespace الذي سيستضيف أصول الأرشيف." },
    { field: "apiSecret", labelAr: "Storage write token", secret: true, guidanceAr: "ناقص token التخزين. يجب حفظه server-side فقط وعدم عرضه في أي صفحة." },
  ],
  optional: [
    { field: "accountName", labelAr: "Provider name", secret: false, guidanceAr: "اسم الموفر اختياري، مثل Vercel Blob أو S3 أو Cloudinary بعد الاختيار الرسمي." },
    { field: "businessId", labelAr: "Region / Project", secret: false, guidanceAr: "المنطقة أو المشروع اختياري للتحضير للتشغيل." },
  ],
  setupGuideAr: "عقد تخزين للأرشيف فقط. لا يوجد رفع أو مزامنة فعلية في هذه المرحلة.",
};

const INTERNAL_API_GUIDE: PlatformRequirements = {
  platform: "INTERNAL_API",
  category: "INTERNAL_API",
  labelAr: "Internal APIs",
  required: [
    { field: "accountId", labelAr: "Contract name", secret: false, guidanceAr: "ناقص اسم العقد الداخلي أو مسار الـ API." },
  ],
  optional: [
    { field: "appSecret", labelAr: "Shared Secret", secret: true, guidanceAr: "Shared Secret اختياري للأتمتة الداخلية لاحقًا، ولا يجب عرضه في الواجهة." },
    { field: "notes", labelAr: "Event names", secret: false, guidanceAr: "دوّن أسماء الأحداث وقواعد idempotency/replay قبل التنفيذ." },
  ],
  setupGuideAr: "Internal APIs عقود داخلية فقط. لا يتم استدعاء منصات خارجية منها.",
};

const CUSTOM_GUIDE: PlatformRequirements = {
  platform: "CUSTOM",
  category: "CUSTOM",
  labelAr: "موفر مخصص",
  required: [
    { field: "name", labelAr: "الاسم", secret: false, guidanceAr: "ناقص الاسم." },
    { field: "accountId", labelAr: "Account ID أو API Key", secret: false, guidanceAr: "ناقص Account ID أو API Key." },
  ],
  optional: [
    { field: "apiSecret", labelAr: "API Secret", secret: true, guidanceAr: "API Secret اختياري." },
    { field: "accessToken", labelAr: "Access Token", secret: true, guidanceAr: "Access Token اختياري." },
  ],
  setupGuideAr: "موفر مخصص — أضف الحقول التي يحتاجها مزودك.",
};

const REGISTRY: Record<PlatformKey, PlatformRequirements> = {
  META: META_GUIDE,
  GOOGLE_ADS: GOOGLE_ADS_GUIDE,
  TIKTOK: TIKTOK_GUIDE,
  X: X_GUIDE,
  GA4: GA4_GUIDE,
  TWILIO: TWILIO_GUIDE,
  NETGSM: NETGSM_GUIDE,
  EMAIL_PROVIDER: EMAIL_PROVIDER_GUIDE,
  WHATSAPP_PROVIDER: WHATSAPP_PROVIDER_GUIDE,
  SMS_PROVIDER: SMS_PROVIDER_GUIDE,
  OPENAI: OPENAI_GUIDE,
  GOOGLE_DRIVE: GOOGLE_DRIVE_GUIDE,
  GOOGLE_PICKER: GOOGLE_PICKER_GUIDE,
  VIDEO_FRAME_EXTRACTOR: VIDEO_FRAME_EXTRACTOR_GUIDE,
  STORAGE_PROVIDER: STORAGE_PROVIDER_GUIDE,
  INTERNAL_API: INTERNAL_API_GUIDE,
  CUSTOM: CUSTOM_GUIDE,
};

export function getPlatformRequirements(p: PlatformKey): PlatformRequirements { return REGISTRY[p] ?? CUSTOM_GUIDE; }
export const ALL_PLATFORM_REQUIREMENTS: PlatformRequirements[] = Object.values(REGISTRY);

const ALL_PLATFORM_KEYS = Object.keys(REGISTRY) as PlatformKey[];
const ALL_CATEGORIES: PlatformCategory[] = [
  "ADS",
  "ANALYTICS",
  "MESSAGING",
  "EMAIL",
  "AI",
  "ARCHIVE_STORAGE",
  "INTERNAL_API",
  "CUSTOM",
];

export function isPlatformKey(v: unknown): v is PlatformKey { return typeof v === "string" && (ALL_PLATFORM_KEYS as string[]).includes(v); }
export function isCategoryKey(v: unknown): v is PlatformCategory { return typeof v === "string" && (ALL_CATEGORIES as string[]).includes(v); }

export interface ReadinessResult {
  completionPercent: number;
  missingRequiredFields: string[];
  missingOptionalFields: string[];
  status: ConnectionStatus;
  nextStepMessage: string;
  setupGuideItems: { label: string; ok: boolean; guidance: string }[];
  guidance: string[];
}

function fieldPresent(row: Record<string, unknown>, field: string): boolean {
  if (field.includes("|")) return field.split("|").some((f) => fieldPresent(row, f));
  const v = row[field];
  if (typeof v === "string") return v.trim().length > 0;
  if (typeof v === "number") return Number.isFinite(v);
  return false;
}

export function evaluateReadiness(platform: PlatformKey, row: Record<string, unknown>, opts: { enabled?: boolean; existingStatus?: ConnectionStatus } = {}): ReadinessResult {
  const reqs = getPlatformRequirements(platform);
  const missingRequired: string[] = [];
  const missingOptional: string[] = [];
  const guidance: string[] = [];
  const items: ReadinessResult["setupGuideItems"] = [];

  for (const f of reqs.required) {
    const ok = fieldPresent(row, f.field);
    items.push({ label: f.labelAr, ok, guidance: f.guidanceAr });
    if (!ok) { missingRequired.push(f.field); guidance.push(f.guidanceAr); }
  }
  for (const f of reqs.optional) {
    const ok = fieldPresent(row, f.field);
    items.push({ label: f.labelAr, ok, guidance: f.guidanceAr });
    if (!ok) missingOptional.push(f.field);
  }

  const totalSlots = reqs.required.length + reqs.optional.length;
  const filledSlots = reqs.required.filter((f) => fieldPresent(row, f.field)).length + reqs.optional.filter((f) => fieldPresent(row, f.field)).length;
  const completionPercent = totalSlots === 0 ? 0 : Math.round((filledSlots / totalSlots) * 100);

  let status: ConnectionStatus;
  if (opts.enabled === false) status = "DISABLED";
  else if (missingRequired.length > 0) status = "MISSING_CONFIG";
  else if (["AUTH_ERROR", "PERMISSION_ERROR", "SYNC_ERROR", "NOT_IMPLEMENTED"].includes(String(opts.existingStatus))) status = opts.existingStatus as ConnectionStatus;
  else status = "ACTIVE";

  let nextStepMessage = "";
  if (missingRequired.length > 0) nextStepMessage = `أكمل ${missingRequired.length} حقل مطلوب لتفعيل الاتصال.`;
  else if (missingOptional.length > 0) nextStepMessage = `الحقول المطلوبة مكتملة — أكمل ${missingOptional.length} حقل اختياري لتحسين القياس.`;
  else if (status === "AUTH_ERROR") nextStepMessage = "ثمة خطأ في المصادقة — جدّد المفاتيح وأعد الاختبار.";
  else if (status === "PERMISSION_ERROR") nextStepMessage = "تأكد من صلاحيات الحساب لدى المنصة.";
  else if (status === "SYNC_ERROR") nextStepMessage = "آخر مزامنة فشلت — راجع آخر خطأ.";
  else if (status === "NOT_IMPLEMENTED") nextStepMessage = "مزامنة هذه المنصة ستُفعَّل في مرحلة لاحقة.";
  else if (status === "DISABLED") nextStepMessage = "الاتصال موقوف — فعّله لإعادة المزامنة.";
  else nextStepMessage = "كل شيء جاهز — يمكنك الاختبار والمزامنة عند تفعيل عميل المنصة.";

  return { completionPercent, missingRequiredFields: missingRequired, missingOptionalFields: missingOptional, status, nextStepMessage, setupGuideItems: items, guidance };
}
