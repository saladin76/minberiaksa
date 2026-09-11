/**
 * The few pieces of homepage media that are configuration rather than content.
 *
 * Everything that used to be listed here — the courses, the video programmes,
 * the achievement and endorsement reels — is CMS content now: Course,
 * VideoPlaylist and Video rows, managed from the dashboard and read through
 * `lib/minbar/cms.ts`. What remains is the set of recordings that vary by
 * language edition rather than by editorial decision: which cut of the intro
 * film a locale plays, and which recording of the preacher's address. These
 * are keyed by locale in code because the edition, not an editor, chooses
 * them — the Arabic, Turkish and international films are separate recordings,
 * not one film subtitled.
 */

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
