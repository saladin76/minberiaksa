export type ProjectStatus = "active" | "seasonal" | "archived" | "needs-verification";
export type DonationType = "sadaqah" | "zakat" | "waqf" | "recurring" | "qurbani";
export type ProjectRegion = "al-quds" | "al-aqsa" | "gaza" | "syria" | "sudan" | "yemen" | "global";

export type LocalizedText = {
  ar: string;
  tr: string;
  en: string;
};

export type ProjectRecord = {
  id: string;
  slug: string;
  title: LocalizedText;
  summary: LocalizedText;
 