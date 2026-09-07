import {
  ALL_CATEGORY_ICON_NAMES,
  CUSTOM_ICON_NAMES,
  customIconValue,
} from "@/components/CategoryIcon";

/**
 * Arabic labels and grouping for the category icon picker.
 *
 * The picker used to show raw English component names ("HandHeart", "TreePine"),
 * which is unreadable for the people who actually run the dashboard. Each icon
 * now carries an Arabic label and sits under the sector it belongs to — the same
 * three the organisation splits its projects across — so an admin looking for
 * "بئر ماء" finds it where they'd expect rather than scanning a wall of glyphs.
 *
 * `keywords` widens search beyond the label: an admin may type the English name,
 * a synonym, or the project wording they use internally.
 */

export type IconSector =
  | "relief"
  | "shelter"
  | "development"
  | "faith"
  | "general";

export const ICON_SECTOR_LABELS: Record<IconSector, string> = {
  faith: "المشاريع الدينية",
  relief: "قطاع الإغاثة",
  shelter: "قطاع الإيواء والإعمار",
  development: "قطاع التنمية المجتمعية",
  general: "عام",
};

/** Render order of the groups in the picker. */
export const ICON_SECTOR_ORDER: IconSector[] = [
  "faith",
  "relief",
  "shelter",
  "development",
  "general",
];

export type IconCatalogEntry = {
  /** Value stored in `Category.icon`. Custom glyphs carry the `custom:` prefix. */
  value: string;
  /** Registry key, used to match against what `parseCategoryIcon` returns. */
  name: string;
  label: string;
  sector: IconSector;
  /** True for the locally drawn glyphs, so the picker can flag them. */
  custom: boolean;
  keywords?: string[];
};

type Entry = Omit<IconCatalogEntry, "value" | "custom">;

const ENTRIES: Entry[] = [
  // ── المشاريع الدينية ──
  { name: "Mosque", label: "مسجد", sector: "faith", keywords: ["mosque", "جامع", "مصلى", "بناء مساجد"] },
  { name: "PrayerRug", label: "سجادة صلاة", sector: "faith", keywords: ["prayer", "rug", "صلاة", "فرش المساجد"] },
  { name: "Quran", label: "مصحف", sector: "faith", keywords: ["quran", "قرآن", "كتاب", "تحفيظ"] },
  { name: "Crescent", label: "هلال / رمضان", sector: "faith", keywords: ["crescent", "ramadan", "رمضان", "عيد"] },
  { name: "Lantern", label: "فانوس رمضان", sector: "faith", keywords: ["lantern", "ramadan", "فانوس", "رمضان"] },
  { name: "Church", label: "دار عبادة", sector: "faith", keywords: ["church", "معبد"] },
  { name: "BookOpen", label: "كتاب مفتوح", sector: "faith", keywords: ["book", "علم", "تعليم"] },
  { name: "BookMarked", label: "كتاب بعلامة", sector: "faith", keywords: ["book", "مرجع"] },

  // ── قطاع الإغاثة ──
  { name: "Sheep", label: "أضحية (خروف)", sector: "relief", keywords: ["sheep", "أضاحي", "عقيقة", "قربان"] },
  { name: "Beef", label: "لحوم / أضاحي", sector: "relief", keywords: ["beef", "meat", "لحم", "أضاحي"] },
  { name: "Dates", label: "تمر / إفطار صائم", sector: "relief", keywords: ["dates", "iftar", "تمر", "إفطار"] },
  { name: "ShoppingBasket", label: "سلة غذائية", sector: "relief", keywords: ["basket", "food", "سلة", "طرد غذائي"] },
  { name: "Package", label: "طرد إغاثي", sector: "relief", keywords: ["package", "parcel", "طرد", "مساعدات"] },
  { name: "Utensils", label: "وجبات", sector: "relief", keywords: ["food", "meal", "وجبة", "مطبخ"] },
  { name: "Soup", label: "تكية / حساء", sector: "relief", keywords: ["soup", "kitchen", "تكية", "مطبخ"] },
  { name: "Sandwich", label: "وجبة سريعة", sector: "relief", keywords: ["sandwich", "طعام"] },
  { name: "Salad", label: "خضروات", sector: "relief", keywords: ["salad", "vegetables", "خضار"] },
  { name: "Carrot", label: "محاصيل", sector: "relief", keywords: ["carrot", "زراعة", "خضار"] },
  { name: "Milk", label: "حليب", sector: "relief", keywords: ["milk", "حليب", "ألبان"] },
  { name: "Wheat", label: "قمح / دقيق", sector: "relief", keywords: ["wheat", "flour", "قمح", "طحين"] },
  { name: "Droplets", label: "مياه", sector: "relief", keywords: ["water", "ماء", "سقيا"] },
  { name: "GlassWater", label: "مياه شرب", sector: "relief", keywords: ["water", "drink", "شرب", "سقيا"] },
  { name: "Truck", label: "قافلة إغاثية", sector: "relief", keywords: ["truck", "convoy", "قافلة", "نقل"] },
  { name: "Ambulance", label: "إسعاف", sector: "relief", keywords: ["ambulance", "طوارئ"] },
  { name: "Stethoscope", label: "رعاية طبية", sector: "relief", keywords: ["health", "طبي", "علاج"] },
  { name: "BriefcaseMedical", label: "حقيبة إسعافات", sector: "relief", keywords: ["medical", "first aid", "إسعافات"] },
  { name: "HeartPulse", label: "صحة", sector: "relief", keywords: ["health", "قلب", "صحة"] },
  { name: "Pill", label: "أدوية", sector: "relief", keywords: ["medicine", "دواء"] },
  { name: "Syringe", label: "تطعيم", sector: "relief", keywords: ["vaccine", "لقاح", "حقن"] },
  { name: "Bandage", label: "ضمادات", sector: "relief", keywords: ["bandage", "جروح", "علاج"] },
  { name: "Cross", label: "عيادة", sector: "relief", keywords: ["clinic", "مستوصف", "طبي"] },
  { name: "Thermometer", label: "فحص طبي", sector: "relief", keywords: ["thermometer", "حرارة", "فحص"] },
  { name: "Shirt", label: "كسوة", sector: "relief", keywords: ["clothes", "ملابس", "كسوة"] },
  { name: "Blanket", label: "بطانية / شتاء", sector: "relief", keywords: ["blanket", "winter", "بطانية", "شتاء"] },
  { name: "Snowflake", label: "حملة شتاء", sector: "relief", keywords: ["winter", "cold", "شتاء", "برد"] },
  { name: "Umbrella", label: "حماية / إغاثة", sector: "relief", keywords: ["umbrella", "حماية"] },
  { name: "Flame", label: "تدفئة / وقود", sector: "relief", keywords: ["fuel", "heating", "تدفئة", "وقود"] },

  // ── قطاع الإيواء والإعمار ──
  { name: "Tent", label: "خيمة", sector: "shelter", keywords: ["tent", "خيام", "نزوح"] },
  { name: "TentTree", label: "مخيم", sector: "shelter", keywords: ["camp", "مخيم", "خيام"] },
  { name: "Home", label: "مسكن", sector: "shelter", keywords: ["home", "house", "بيت", "سكن"] },
  { name: "Building2", label: "مبنى / إعمار", sector: "shelter", keywords: ["building", "بناء", "إعمار"] },
  { name: "Warehouse", label: "مستودع", sector: "shelter", keywords: ["warehouse", "مخزن"] },
  { name: "Hammer", label: "إعمار", sector: "shelter", keywords: ["build", "بناء", "ترميم"] },
  { name: "Wrench", label: "صيانة", sector: "shelter", keywords: ["repair", "صيانة", "ترميم"] },
  { name: "WaterWell", label: "بئر ماء", sector: "shelter", keywords: ["well", "water", "بئر", "آبار", "حفر"] },
  { name: "Waves", label: "شبكة مياه", sector: "shelter", keywords: ["water", "شبكة", "مياه"] },
  { name: "Bed", label: "إيواء", sector: "shelter", keywords: ["bed", "shelter", "إيواء", "مأوى"] },
  { name: "Sofa", label: "أثاث", sector: "shelter", keywords: ["furniture", "أثاث"] },
  { name: "DoorOpen", label: "سكن مؤقت", sector: "shelter", keywords: ["door", "سكن"] },
  { name: "Landmark", label: "مرفق عام", sector: "shelter", keywords: ["landmark", "مرفق", "منشأة"] },
  { name: "Zap", label: "كهرباء / طاقة", sector: "shelter", keywords: ["power", "electricity", "كهرباء", "طاقة"] },
  { name: "Sun", label: "طاقة شمسية", sector: "shelter", keywords: ["solar", "شمسية", "طاقة"] },
  { name: "Lightbulb", label: "إنارة", sector: "shelter", keywords: ["light", "إنارة", "كهرباء"] },

  // ── قطاع التنمية المجتمعية ──
  { name: "OrphanCare", label: "كفالة يتيم", sector: "development", keywords: ["orphan", "يتيم", "كفالة", "أيتام"] },
  { name: "Baby", label: "رعاية الطفولة", sector: "development", keywords: ["baby", "child", "طفل", "طفولة"] },
  { name: "GraduationCap", label: "تعليم", sector: "development", keywords: ["education", "تعليم", "دراسة"] },
  { name: "School", label: "مدرسة", sector: "development", keywords: ["school", "مدرسة", "بناء مدارس"] },
  { name: "Library", label: "مكتبة", sector: "development", keywords: ["library", "مكتبة"] },
  { name: "Backpack", label: "حقيبة مدرسية", sector: "development", keywords: ["backpack", "حقيبة", "قرطاسية"] },
  { name: "Pen", label: "قرطاسية", sector: "development", keywords: ["pen", "قلم", "قرطاسية"] },
  { name: "Pencil", label: "أدوات دراسية", sector: "development", keywords: ["pencil", "قلم", "دراسة"] },
  { name: "Ruler", label: "تدريب مهني", sector: "development", keywords: ["ruler", "تدريب", "مهني"] },
  { name: "Microscope", label: "بحث علمي", sector: "development", keywords: ["science", "بحث", "علوم"] },
  { name: "FlaskConical", label: "مختبر", sector: "development", keywords: ["lab", "مختبر"] },
  { name: "Briefcase", label: "مشروع مدرّ للدخل", sector: "development", keywords: ["work", "job", "عمل", "مشروع"] },
  { name: "Coins", label: "زكاة", sector: "development", keywords: ["zakat", "زكاة", "صدقة", "مال"] },
  { name: "HandCoins", label: "صدقة جارية", sector: "development", keywords: ["sadaqah", "صدقة", "تبرع"] },
  { name: "Banknote", label: "مساعدة نقدية", sector: "development", keywords: ["cash", "نقد", "مساعدة"] },
  { name: "PiggyBank", label: "ادخار", sector: "development", keywords: ["savings", "ادخار"] },
  { name: "Wallet", label: "تمكين اقتصادي", sector: "development", keywords: ["wallet", "تمكين", "دخل"] },
  { name: "Scale", label: "عدالة / حقوق", sector: "development", keywords: ["justice", "عدالة", "حقوق"] },
  { name: "Sprout", label: "زراعة", sector: "development", keywords: ["farm", "زراعة", "نبات"] },
  { name: "DatePalm", label: "نخلة / زراعة", sector: "development", keywords: ["palm", "tree", "نخيل", "زراعة", "غرس"] },
  { name: "TreePine", label: "تشجير", sector: "development", keywords: ["tree", "شجرة", "تشجير"] },
  { name: "Leaf", label: "بيئة", sector: "development", keywords: ["environment", "بيئة"] },
  { name: "Recycle", label: "تدوير", sector: "development", keywords: ["recycle", "تدوير", "بيئة"] },
  { name: "Wheelchair", label: "ذوو الإعاقة", sector: "development", keywords: ["wheelchair", "disability", "إعاقة", "كرسي"] },
  { name: "Accessibility", label: "دمج / إتاحة", sector: "development", keywords: ["accessibility", "إتاحة", "دمج"] },
  { name: "Award", label: "تكريم", sector: "development", keywords: ["award", "تكريم", "جائزة"] },
  { name: "Trophy", label: "تميّز", sector: "development", keywords: ["trophy", "تميز"] },

  // ── عام ──
  { name: "Heart", label: "قلب", sector: "general", keywords: ["heart", "قلب", "خير"] },
  { name: "HandHeart", label: "عطاء", sector: "general", keywords: ["give", "عطاء", "تبرع"] },
  { name: "Hand", label: "يد العون", sector: "general", keywords: ["hand", "يد", "مساعدة"] },
  { name: "Handshake", label: "شراكة", sector: "general", keywords: ["partnership", "شراكة", "تعاون"] },
  { name: "Users", label: "المستفيدون", sector: "general", keywords: ["people", "أشخاص", "مستفيدون"] },
  { name: "PersonStanding", label: "فرد", sector: "general", keywords: ["person", "فرد", "شخص"] },
  { name: "Globe", label: "عالمي", sector: "general", keywords: ["global", "عالمي", "دولي"] },
  { name: "MapPin", label: "موقع", sector: "general", keywords: ["location", "موقع", "منطقة"] },
  { name: "Bus", label: "نقل", sector: "general", keywords: ["transport", "نقل", "مواصلات"] },
  { name: "Gift", label: "هدية", sector: "general", keywords: ["gift", "هدية", "عيدية"] },
  { name: "Star", label: "مميز", sector: "general", keywords: ["star", "نجمة", "مميز"] },
  { name: "ShieldCheck", label: "حماية", sector: "general", keywords: ["shield", "حماية", "أمان"] },
  { name: "Target", label: "هدف", sector: "general", keywords: ["target", "هدف"] },
  { name: "Glasses", label: "بصريات", sector: "general", keywords: ["glasses", "نظارة", "بصر"] },
];

const CUSTOM = new Set(CUSTOM_ICON_NAMES);

export const ICON_CATALOG: IconCatalogEntry[] = ENTRIES.map((entry) => ({
  ...entry,
  custom: CUSTOM.has(entry.name),
  // Custom glyphs are stored prefixed so they can never be shadowed by a Lucide
  // name; Lucide icons keep storing their bare name, as they always have.
  value: CUSTOM.has(entry.name) ? customIconValue(entry.name) : entry.name,
}));

/**
 * Any registered icon the list above forgot still has to be pickable — otherwise
 * adding one to the registry would silently hide it from the dashboard.
 */
const CATALOGUED = new Set(ICON_CATALOG.map((entry) => entry.name));

export const ICON_CATALOG_WITH_FALLBACK: IconCatalogEntry[] = [
  ...ICON_CATALOG,
  ...ALL_CATEGORY_ICON_NAMES.filter((name) => !CATALOGUED.has(name)).map((name) => ({
    name,
    label: name,
    sector: "general" as IconSector,
    custom: CUSTOM.has(name),
    value: CUSTOM.has(name) ? customIconValue(name) : name,
    keywords: [name],
  })),
];

/** Arabic label for a resolved icon name, falling back to the raw name. */
export function iconLabel(name: string): string {
  return ICON_CATALOG_WITH_FALLBACK.find((entry) => entry.name === name)?.label ?? name;
}
