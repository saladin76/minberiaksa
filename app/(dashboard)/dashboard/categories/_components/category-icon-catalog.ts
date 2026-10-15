import {
  ALL_CATEGORY_ICON_NAMES,
  CUSTOM_ICON_NAMES,
  customIconValue,
} from "@/components/CategoryIcon";
import { dt } from "@/lib/dashboard/i18n";

/**
 * Arabic labels and grouping for the category icon picker.
 *
 * The picker used to show raw English component names ("HandHeart", "TreePine"),
 * which is unreadable for the people who actually run the dashboard. Each icon
 * now carries an Arabic label and sits under the sector it belongs to  the same
 * three the organisation splits its projects across  so an admin looking for
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
  get faith() { return dt("المشاريع الدينية"); },
  get relief() { return dt("قطاع الإغاثة"); },
  get shelter() { return dt("قطاع الإيواء والإعمار"); },
  get development() { return dt("قطاع التنمية المجتمعية"); },
  get general() { return dt("عام"); },
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
  { name: "Mosque", get label() { return dt("مسجد"); }, sector: "faith", keywords: ["mosque", "جامع", "مصلى", "بناء مساجد"] },
  { name: "PrayerRug", get label() { return dt("سجادة صلاة"); }, sector: "faith", keywords: ["prayer", "rug", "صلاة", "فرش المساجد"] },
  { name: "Quran", get label() { return dt("مصحف"); }, sector: "faith", keywords: ["quran", "قرآن", "كتاب", "تحفيظ"] },
  { name: "Crescent", get label() { return dt("هلال / رمضان"); }, sector: "faith", keywords: ["crescent", "ramadan", "رمضان", "عيد"] },
  { name: "Lantern", get label() { return dt("فانوس رمضان"); }, sector: "faith", keywords: ["lantern", "ramadan", "فانوس", "رمضان"] },
  { name: "Church", get label() { return dt("دار عبادة"); }, sector: "faith", keywords: ["church", "معبد"] },
  { name: "BookOpen", get label() { return dt("كتاب مفتوح"); }, sector: "faith", keywords: ["book", "علم", "تعليم"] },
  { name: "BookMarked", get label() { return dt("كتاب بعلامة"); }, sector: "faith", keywords: ["book", "مرجع"] },

  // ── قطاع الإغاثة ──
  { name: "Sheep", get label() { return dt("أضحية (خروف)"); }, sector: "relief", keywords: ["sheep", "أضاحي", "عقيقة", "قربان"] },
  { name: "Beef", get label() { return dt("لحوم / أضاحي"); }, sector: "relief", keywords: ["beef", "meat", "لحم", "أضاحي"] },
  { name: "Dates", get label() { return dt("تمر / إفطار صائم"); }, sector: "relief", keywords: ["dates", "iftar", "تمر", "إفطار"] },
  { name: "ShoppingBasket", get label() { return dt("سلة غذائية"); }, sector: "relief", keywords: ["basket", "food", "سلة", "طرد غذائي"] },
  { name: "Package", get label() { return dt("طرد إغاثي"); }, sector: "relief", keywords: ["package", "parcel", "طرد", "مساعدات"] },
  { name: "Utensils", get label() { return dt("وجبات"); }, sector: "relief", keywords: ["food", "meal", "وجبة", "مطبخ"] },
  { name: "Soup", get label() { return dt("تكية / حساء"); }, sector: "relief", keywords: ["soup", "kitchen", "تكية", "مطبخ"] },
  { name: "Sandwich", get label() { return dt("وجبة سريعة"); }, sector: "relief", keywords: ["sandwich", "طعام"] },
  { name: "Salad", get label() { return dt("خضروات"); }, sector: "relief", keywords: ["salad", "vegetables", "خضار"] },
  { name: "Carrot", get label() { return dt("محاصيل"); }, sector: "relief", keywords: ["carrot", "زراعة", "خضار"] },
  { name: "Milk", get label() { return dt("حليب"); }, sector: "relief", keywords: ["milk", "حليب", "ألبان"] },
  { name: "Wheat", get label() { return dt("قمح / دقيق"); }, sector: "relief", keywords: ["wheat", "flour", "قمح", "طحين"] },
  { name: "Droplets", get label() { return dt("مياه"); }, sector: "relief", keywords: ["water", "ماء", "سقيا"] },
  { name: "GlassWater", get label() { return dt("مياه شرب"); }, sector: "relief", keywords: ["water", "drink", "شرب", "سقيا"] },
  { name: "Truck", get label() { return dt("قافلة إغاثية"); }, sector: "relief", keywords: ["truck", "convoy", "قافلة", "نقل"] },
  { name: "Ambulance", get label() { return dt("إسعاف"); }, sector: "relief", keywords: ["ambulance", "طوارئ"] },
  { name: "Stethoscope", get label() { return dt("رعاية طبية"); }, sector: "relief", keywords: ["health", "طبي", "علاج"] },
  { name: "BriefcaseMedical", get label() { return dt("حقيبة إسعافات"); }, sector: "relief", keywords: ["medical", "first aid", "إسعافات"] },
  { name: "HeartPulse", get label() { return dt("صحة"); }, sector: "relief", keywords: ["health", "قلب", "صحة"] },
  { name: "Pill", get label() { return dt("أدوية"); }, sector: "relief", keywords: ["medicine", "دواء"] },
  { name: "Syringe", get label() { return dt("تطعيم"); }, sector: "relief", keywords: ["vaccine", "لقاح", "حقن"] },
  { name: "Bandage", get label() { return dt("ضمادات"); }, sector: "relief", keywords: ["bandage", "جروح", "علاج"] },
  { name: "Cross", get label() { return dt("عيادة"); }, sector: "relief", keywords: ["clinic", "مستوصف", "طبي"] },
  { name: "Thermometer", get label() { return dt("فحص طبي"); }, sector: "relief", keywords: ["thermometer", "حرارة", "فحص"] },
  { name: "Shirt", get label() { return dt("كسوة"); }, sector: "relief", keywords: ["clothes", "ملابس", "كسوة"] },
  { name: "Blanket", get label() { return dt("بطانية / شتاء"); }, sector: "relief", keywords: ["blanket", "winter", "بطانية", "شتاء"] },
  { name: "Snowflake", get label() { return dt("حملة شتاء"); }, sector: "relief", keywords: ["winter", "cold", "شتاء", "برد"] },
  { name: "Umbrella", get label() { return dt("حماية / إغاثة"); }, sector: "relief", keywords: ["umbrella", "حماية"] },
  { name: "Flame", get label() { return dt("تدفئة / وقود"); }, sector: "relief", keywords: ["fuel", "heating", "تدفئة", "وقود"] },

  // ── قطاع الإيواء والإعمار ──
  { name: "Tent", get label() { return dt("خيمة"); }, sector: "shelter", keywords: ["tent", "خيام", "نزوح"] },
  { name: "TentTree", get label() { return dt("مخيم"); }, sector: "shelter", keywords: ["camp", "مخيم", "خيام"] },
  { name: "Home", get label() { return dt("مسكن"); }, sector: "shelter", keywords: ["home", "house", "بيت", "سكن"] },
  { name: "Building2", get label() { return dt("مبنى / إعمار"); }, sector: "shelter", keywords: ["building", "بناء", "إعمار"] },
  { name: "Warehouse", get label() { return dt("مستودع"); }, sector: "shelter", keywords: ["warehouse", "مخزن"] },
  { name: "Hammer", get label() { return dt("إعمار"); }, sector: "shelter", keywords: ["build", "بناء", "ترميم"] },
  { name: "Wrench", get label() { return dt("صيانة"); }, sector: "shelter", keywords: ["repair", "صيانة", "ترميم"] },
  { name: "WaterWell", get label() { return dt("بئر ماء"); }, sector: "shelter", keywords: ["well", "water", "بئر", "آبار", "حفر"] },
  { name: "Waves", get label() { return dt("شبكة مياه"); }, sector: "shelter", keywords: ["water", "شبكة", "مياه"] },
  { name: "Bed", get label() { return dt("إيواء"); }, sector: "shelter", keywords: ["bed", "shelter", "إيواء", "مأوى"] },
  { name: "Sofa", get label() { return dt("أثاث"); }, sector: "shelter", keywords: ["furniture", "أثاث"] },
  { name: "DoorOpen", get label() { return dt("سكن مؤقت"); }, sector: "shelter", keywords: ["door", "سكن"] },
  { name: "Landmark", get label() { return dt("مرفق عام"); }, sector: "shelter", keywords: ["landmark", "مرفق", "منشأة"] },
  { name: "Zap", get label() { return dt("كهرباء / طاقة"); }, sector: "shelter", keywords: ["power", "electricity", "كهرباء", "طاقة"] },
  { name: "Sun", get label() { return dt("طاقة شمسية"); }, sector: "shelter", keywords: ["solar", "شمسية", "طاقة"] },
  { name: "Lightbulb", get label() { return dt("إنارة"); }, sector: "shelter", keywords: ["light", "إنارة", "كهرباء"] },

  // ── قطاع التنمية المجتمعية ──
  { name: "OrphanCare", get label() { return dt("كفالة يتيم"); }, sector: "development", keywords: ["orphan", "يتيم", "كفالة", "أيتام"] },
  { name: "Baby", get label() { return dt("رعاية الطفولة"); }, sector: "development", keywords: ["baby", "child", "طفل", "طفولة"] },
  { name: "GraduationCap", get label() { return dt("تعليم"); }, sector: "development", keywords: ["education", "تعليم", "دراسة"] },
  { name: "School", get label() { return dt("مدرسة"); }, sector: "development", keywords: ["school", "مدرسة", "بناء مدارس"] },
  { name: "Library", get label() { return dt("مكتبة"); }, sector: "development", keywords: ["library", "مكتبة"] },
  { name: "Backpack", get label() { return dt("حقيبة مدرسية"); }, sector: "development", keywords: ["backpack", "حقيبة", "قرطاسية"] },
  { name: "Pen", get label() { return dt("قرطاسية"); }, sector: "development", keywords: ["pen", "قلم", "قرطاسية"] },
  { name: "Pencil", get label() { return dt("أدوات دراسية"); }, sector: "development", keywords: ["pencil", "قلم", "دراسة"] },
  { name: "Ruler", get label() { return dt("تدريب مهني"); }, sector: "development", keywords: ["ruler", "تدريب", "مهني"] },
  { name: "Microscope", get label() { return dt("بحث علمي"); }, sector: "development", keywords: ["science", "بحث", "علوم"] },
  { name: "FlaskConical", get label() { return dt("مختبر"); }, sector: "development", keywords: ["lab", "مختبر"] },
  { name: "Briefcase", get label() { return dt("مشروع مدرّ للدخل"); }, sector: "development", keywords: ["work", "job", "عمل", "مشروع"] },
  { name: "Coins", get label() { return dt("زكاة"); }, sector: "development", keywords: ["zakat", "زكاة", "صدقة", "مال"] },
  { name: "HandCoins", get label() { return dt("صدقة جارية"); }, sector: "development", keywords: ["sadaqah", "صدقة", "تبرع"] },
  { name: "Banknote", get label() { return dt("مساعدة نقدية"); }, sector: "development", keywords: ["cash", "نقد", "مساعدة"] },
  { name: "PiggyBank", get label() { return dt("ادخار"); }, sector: "development", keywords: ["savings", "ادخار"] },
  { name: "Wallet", get label() { return dt("تمكين اقتصادي"); }, sector: "development", keywords: ["wallet", "تمكين", "دخل"] },
  { name: "Scale", get label() { return dt("عدالة / حقوق"); }, sector: "development", keywords: ["justice", "عدالة", "حقوق"] },
  { name: "Sprout", get label() { return dt("زراعة"); }, sector: "development", keywords: ["farm", "زراعة", "نبات"] },
  { name: "DatePalm", get label() { return dt("نخلة / زراعة"); }, sector: "development", keywords: ["palm", "tree", "نخيل", "زراعة", "غرس"] },
  { name: "TreePine", get label() { return dt("تشجير"); }, sector: "development", keywords: ["tree", "شجرة", "تشجير"] },
  { name: "Leaf", get label() { return dt("بيئة"); }, sector: "development", keywords: ["environment", "بيئة"] },
  { name: "Recycle", get label() { return dt("تدوير"); }, sector: "development", keywords: ["recycle", "تدوير", "بيئة"] },
  { name: "Wheelchair", get label() { return dt("ذوو الإعاقة"); }, sector: "development", keywords: ["wheelchair", "disability", "إعاقة", "كرسي"] },
  { name: "Accessibility", get label() { return dt("دمج / إتاحة"); }, sector: "development", keywords: ["accessibility", "إتاحة", "دمج"] },
  { name: "Award", get label() { return dt("تكريم"); }, sector: "development", keywords: ["award", "تكريم", "جائزة"] },
  { name: "Trophy", get label() { return dt("تميّز"); }, sector: "development", keywords: ["trophy", "تميز"] },

  // ── عام ──
  { name: "Heart", get label() { return dt("قلب"); }, sector: "general", keywords: ["heart", "قلب", "خير"] },
  { name: "HandHeart", get label() { return dt("عطاء"); }, sector: "general", keywords: ["give", "عطاء", "تبرع"] },
  { name: "Hand", get label() { return dt("يد العون"); }, sector: "general", keywords: ["hand", "يد", "مساعدة"] },
  { name: "Handshake", get label() { return dt("شراكة"); }, sector: "general", keywords: ["partnership", "شراكة", "تعاون"] },
  { name: "Users", get label() { return dt("المستفيدون"); }, sector: "general", keywords: ["people", "أشخاص", "مستفيدون"] },
  { name: "PersonStanding", get label() { return dt("فرد"); }, sector: "general", keywords: ["person", "فرد", "شخص"] },
  { name: "Globe", get label() { return dt("عالمي"); }, sector: "general", keywords: ["global", "عالمي", "دولي"] },
  { name: "MapPin", get label() { return dt("موقع"); }, sector: "general", keywords: ["location", "موقع", "منطقة"] },
  { name: "Bus", get label() { return dt("نقل"); }, sector: "general", keywords: ["transport", "نقل", "مواصلات"] },
  { name: "Gift", get label() { return dt("هدية"); }, sector: "general", keywords: ["gift", "هدية", "عيدية"] },
  { name: "Star", get label() { return dt("مميز"); }, sector: "general", keywords: ["star", "نجمة", "مميز"] },
  { name: "ShieldCheck", get label() { return dt("حماية"); }, sector: "general", keywords: ["shield", "حماية", "أمان"] },
  { name: "Target", get label() { return dt("هدف"); }, sector: "general", keywords: ["target", "هدف"] },
  { name: "Glasses", get label() { return dt("بصريات"); }, sector: "general", keywords: ["glasses", "نظارة", "بصر"] },
];

const CUSTOM = new Set(CUSTOM_ICON_NAMES);

/* Copied by descriptor, not spread: a spread would read the translated `label`
   getter once, when this module loads, and freeze it in that language. */
export const ICON_CATALOG: IconCatalogEntry[] = ENTRIES.map((entry) =>
  Object.defineProperties({}, {
    ...Object.getOwnPropertyDescriptors(entry),
    custom: { value: CUSTOM.has(entry.name), enumerable: true },
    // Custom glyphs are stored prefixed so they can never be shadowed by a Lucide
    // name; Lucide icons keep storing their bare name, as they always have.
    value: { value: CUSTOM.has(entry.name) ? customIconValue(entry.name) : entry.name, enumerable: true },
  }) as IconCatalogEntry,
);

/**
 * Any registered icon the list above forgot still has to be pickable  otherwise
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
