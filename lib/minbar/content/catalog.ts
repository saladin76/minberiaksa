/**
 * Courses, video programmes, and the achievement / endorsement video reels.
 *
 * Ported from `Minbar/courses-data.js`, `programs-data.js`,
 * `achievements-videos-data.js` and `endorsements-videos-data.js`. All four are
 * marked `[DASHBOARD-INTEGRATION]` in the handoff: publishing an item here is
 * what makes it appear on both its own page and the homepage rail, and the
 * dashboard takes over that role once the CMS models exist.
 *
 * Titles that carry an i18n key are interface copy translated ×19; titles given
 * as literal strings are proper names (a scholar's name, an official programme
 * title) that stay as written in every language, per the `[OFFICIAL]` rule in
 * `TRANSLATION_GLOSSARY.md`.
 */

import { youtubeThumb } from "./media";

/* ── Courses ─────────────────────────────────────────────────────────────────
 * `pinned` items always lead the homepage rail — the Nur ad-Din Zengi course is
 * pinned first by the foundation's decision. An item with no `href` has no
 * detail page yet and opens its intro video directly. */
export interface MinbarCourse {
  slug: string;
  pinned?: boolean;
  /** Internal route key, or an external URL for a course hosted on YouTube. */
  href?: string;
  external?: boolean;
  /** i18n key in the `homepage` namespace; falls back to `title`. */
  titleKey?: string;
  title: string;
  /** Arabic source subtitle. Display copy only where `subtitleKey` is set. */
  subtitle: string;
  /**
   * i18n key for the subtitle. Only the Zangi course has one — the handoff
   * ships no `course*Sub` key for the other six in any of the 19 languages, so
   * their cards render without a subtitle rather than with Arabic text on an
   * English page.
   */
  subtitleKey?: string;
  cover: string;
  introVideoId?: string;
  units?: number;
  /** Course or seminar. Stated rather than inferred from the Arabic title —
      the handoff tests whether the title starts with "ندوة", which stops
      being true the moment the title is translated. */
  kind: "course" | "seminar";
}

export const COURSES: readonly MinbarCourse[] = [
  {
    slug: "zenki",
    kind: "course",
    pinned: true,
    titleKey: "courseZenki",
    title: "دورة نور الدين محمود زنكي",
    subtitleKey: "courseZenkiSub",
    subtitle:
      "دورة علمية في قضية بيت المقدس والمسجد الأقصى — تسع وحدات وملحق تكميلي للخطباء والدعاة",
    cover: youtubeThumb("vC1A_17VBpQ"),
    introVideoId: "vC1A_17VBpQ",
    units: 9,
  },
  {
    slug: "afaq-Al-Amal",
    kind: "seminar",
    href: "https://www.youtube.com/watch?v=olXuOaactnQ",
    external: true,
    titleKey: "courseAfaq",
    title: "ندوة: آفاق العمل للقدس في الدول الإسلامية",
    subtitle: "ندوة علمية من ندوات المؤسسة حول آفاق العمل لخدمة القدس في الدول الإسلامية",
    cover: youtubeThumb("olXuOaactnQ"),
    introVideoId: "olXuOaactnQ",
  },
  {
    slug: "alquds-waqi",
    kind: "seminar",
    href: "https://www.youtube.com/watch?v=oQd7SFzmacM",
    external: true,
    titleKey: "courseWaqi",
    title: "ندوة: القدس الواقع والاحتياجات",
    subtitle: "ندوة علمية من ندوات المؤسسة حول واقع القدس واحتياجات أهلها",
    cover: youtubeThumb("oQd7SFzmacM"),
    introVideoId: "oQd7SFzmacM",
  },
  {
    slug: "social-media",
    kind: "course",
    href: "https://www.youtube.com/watch?v=4u-PcbBNr2Q",
    external: true,
    titleKey: "courseSocial",
    title: "دورة: مهارات وتقنيات وسائل التواصل الاجتماعي في خدمة قضية القدس",
    subtitle: "دورة تدريبية في توظيف وسائل التواصل الاجتماعي لخدمة قضية القدس",
    cover: youtubeThumb("4u-PcbBNr2Q"),
    introVideoId: "4u-PcbBNr2Q",
  },
  {
    slug: "media-appearance",
    kind: "course",
    href: "https://www.youtube.com/watch?v=R-nRNkpM4nA",
    external: true,
    titleKey: "courseMedia",
    title: "دورة: الظهور الإعلامي ودوره في خدمة قضية القدس",
    subtitle: "دورة تدريبية في مهارات الظهور الإعلامي لخدمة قضية القدس",
    cover: youtubeThumb("R-nRNkpM4nA"),
    introVideoId: "R-nRNkpM4nA",
  },
  {
    slug: "mosque-work",
    kind: "course",
    href: "https://www.youtube.com/watch?v=vNHWeaG4CUg",
    external: true,
    titleKey: "courseMosque",
    title: "دورة: مأسسة العمل المسجدي وتطويعه لخدمة قضية القدس",
    subtitle: "دورة تدريبية في تنظيم العمل المسجدي وتوجيهه لخدمة قضية القدس",
    cover: youtubeThumb("vNHWeaG4CUg"),
    introVideoId: "vNHWeaG4CUg",
  },
  {
    slug: "sharia-studies",
    kind: "course",
    href: "https://www.youtube.com/watch?v=pz88m7MgLss",
    external: true,
    titleKey: "courseSharia",
    title: "دورة: دراسات شرعية في علوم بيت المقدس",
    subtitle: "دورة علمية في الدراسات الشرعية المتعلقة بعلوم بيت المقدس",
    cover: youtubeThumb("pz88m7MgLss"),
    introVideoId: "pz88m7MgLss",
  },
];

/** Homepage rail order: pinned first, then the rest in declaration order. */
export const COURSES_FOR_HOME = [...COURSES].sort(
  (a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0)
);

/* ── Video programmes ────────────────────────────────────────────────────────
 * The first episode of each programme is what surfaces on the homepage, so
 * publishing a new episode at the head of the list updates the homepage with no
 * other change. */
export interface MinbarProgram {
  /** i18n key in the `homepage` namespace. */
  titleKey: string;
  title: string;
  subtitle: string;
  href: string;
  episodes: Array<{ id: string }>;
}

export const PROGRAMS: readonly MinbarProgram[] = [
  {
    titleKey: "progIbadan",
    title: "عبادًا لنا",
    subtitle: "سلسلة مشروع (عبادًا لنا) لإعداد جيل يحمي القدس والمسجد الأقصى",
    href: "https://www.youtube.com/playlist?list=PLCrFGtYrL9HJbWUki4EAtpJ6Vfbg4vbpv",
    episodes: [{ id: "WoR_GhjB4YE" }, { id: "rWU9MBROBoA" }, { id: "fqvkXCC2AUs" }],
  },
  {
    titleKey: "progKalimat",
    title: "كلمات منبرية",
    subtitle: "كلمات ووقفات إيمانية من منبر الأقصى حول القدس والمسجد الأقصى المبارك",
    href: "https://www.youtube.com/playlist?list=PLCrFGtYrL9HITvi-mH57JBPiLGusKVJ1y",
    episodes: [{ id: "lDgTUbnfJtI" }, { id: "AFAeGw--djc" }, { id: "K5G1yFjCkms" }],
  },
  {
    titleKey: "progHikaya",
    title: "حكاية صمود القدس",
    subtitle: "برنامج وثائقي عن صمود المقدسيين حول المسجد الأقصى",
    href: "https://www.youtube.com/playlist?list=PLCrFGtYrL9HK7v1m-OEMzg7oiwjAXseNz",
    episodes: [{ id: "1-PzVBus8IE" }, { id: "rSSmajvAtiA" }, { id: "jbKxQqUIgkg" }],
  },
  {
    titleKey: "progKhawatir",
    title: "خواطر مقدسية",
    subtitle: "سلسلة خواطر إيمانية وتربوية حول القدس والمسجد الأقصى",
    href: "https://www.youtube.com/playlist?list=PLCrFGtYrL9HKNBYY5NDRaYASEjoSP_1pk",
    episodes: [{ id: "hEOGoPUlG80" }, { id: "7jJJBgeyQuk" }, { id: "7KFxSqlabzk" }],
  },
];

/* ── Video reels ─────────────────────────────────────────────────────────────
 * `titleKey` = interface copy translated ×19. `title` without a key = a proper
 * name, unchanged in every language. `locales` restricts an item to particular
 * language editions (the Turkish endorsements are for the Turkish audience).
 * `imageKey` names a still from `media.ts` for items with no real video yet —
 * those render without a fake play affordance. */
export interface MinbarVideo {
  titleKey?: string;
  title: string;
  /** i18n key for the region / tag chip, in the `homepage` namespace. */
  regionKey: string;
  youtubeId?: string;
  start?: number;
  imageKey?: string;
  locales?: readonly string[];
  published: boolean;
}

export const ACHIEVEMENT_VIDEOS = {
  homeCount: 5,
  items: [
    { titleKey: "achParcels", title: "تجهيز طرود غزة", regionKey: "regionGaza", imageKey: "parcels", published: true },
    { titleKey: "achWater", title: "توزيع المياه في غزة", regionKey: "regionGaza", imageKey: "meals", published: true },
    { titleKey: "achHome", title: "ترميم منزل في القدس", regionKey: "regionQuds", imageKey: "quds", published: true },
    { titleKey: "achAqsa", title: "دعم الأقصى", regionKey: "regionAqsa", imageKey: "aqsa", published: true },
    { titleKey: "achTour", title: "جولة الفريق الميداني", regionKey: "regionField", imageKey: "redline", published: true },
  ] as readonly MinbarVideo[],
};

export const ENDORSEMENT_VIDEOS = {
  homeCount: 8,
  items: [
    /* Turkish endorsements (public figures) — Turkish edition only. */
    { title: "Prof. Dr. Mehmet Görmez", regionKey: "tagTezkiye", youtubeId: "eiDqMoM7jis", start: 70, locales: ["tr"], published: true },
    { title: "Yunus Balcıoğlu — Çamlıca Camii İmam Hatibi", regionKey: "tagTezkiye", youtubeId: "Wj00W4jIlwM", start: 39, locales: ["tr"], published: true },
    { title: "Prof. Dr. Abdurrahman Haçkalı", regionKey: "tagTezkiye", youtubeId: "bJfQ911G-F4", start: 41, locales: ["tr"], published: true },
    { title: "Hasan Turan", regionKey: "tagTezkiye", youtubeId: "l4hCA5t7IbU", start: 23, locales: ["tr"], published: true },
    { title: "Abdullah Cahit Dinç", regionKey: "tagTezkiye", youtubeId: "hEazO4AoH20", locales: ["tr"], published: true },
    /* General endorsements — every language. */
    { titleKey: "vidSupporter", title: "شهادة داعم للمؤسسة", regionKey: "tagTezkiye", youtubeId: "yOkCybUFyoc", published: true },
    { titleKey: "vidScholars", title: "رسالة إلى علماء الأمة", regionKey: "regionAqsa", imageKey: "minber", published: true },
    { titleKey: "vidRedline", title: "القدس خطنا الأحمر", regionKey: "regionQuds", imageKey: "redline", published: true },
    { titleKey: "vidIamQuds", title: "أنا القدس", regionKey: "regionQuds", imageKey: "aqsa", published: true },
    { titleKey: "vidFieldWord", title: "كلمة من الفريق الميداني", regionKey: "regionField", imageKey: "parcels", published: true },
    { titleKey: "vidFieldPartner", title: "شهادة شريك ميداني", regionKey: "regionQuds", imageKey: "quds", published: true },
  ] as readonly MinbarVideo[],
};

/** Published videos for a locale, limited to the homepage rail count. */
export function videosForHome(
  source: { homeCount: number; items: readonly MinbarVideo[] },
  locale: string
): MinbarVideo[] {
  return source.items
    .filter((v) => v.published && (!v.locales || v.locales.includes(locale)))
    .slice(0, source.homeCount);
}

/**
 * The intro video differs by language edition — the Arabic, Turkish and
 * international cuts are separate recordings, not subtitles of one.
 */
export function introVideoId(locale: string): string {
  if (locale === "ar") return "kdsphkfqq6Q";
  if (locale === "tr") return "35aS9lTFsXs";
  return "yPXKyaiNKU4";
}

/**
 * The Al-Aqsa preacher's address at the third conference. The Turkish edition
 * plays the Turkish recording; every other language plays the original.
 */
export function khatibEmbed(locale: string): string {
  return locale === "tr"
    ? "https://www.youtube.com/embed/yYLVvxMPTR0?si=c8EmQKzb-cXideta&start=55"
    : "https://www.youtube.com/embed/gKLGSFKnWrg?si=LBvL2r093_30taxL&start=70";
}

/** Playlist embeds used by the events cards. */
export const CONFERENCE_3_EMBED =
  "https://www.youtube.com/embed/videoseries?si=Ya4eStWfBme8B1FV&list=PLCrFGtYrL9HJZohJVqi4u8ZrUrTg0-6Zq";
export const CONFERENCE_2_EMBED = "https://www.youtube.com/embed/_r5D0NbKqbI?si=c5IxEDa5NyDc3VMh";
