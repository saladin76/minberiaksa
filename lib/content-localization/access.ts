import type { DashboardPermissionKey } from "@/lib/dashboard/permissions";

export const CONTENT_LOCALIZATION_SECTIONS = [
  "campaigns",
  "categories",
  "blog",
  "slides",
] as const;

export type ContentLocalizationSection =
  (typeof CONTENT_LOCALIZATION_SECTIONS)[number];

const SECTION_PERMISSION: Record<
  ContentLocalizationSection,
  DashboardPermissionKey
> = {
  campaigns: "campaigns",
  categories: "categories",
  blog: "blog",
  slides: "slides",
};

export function parseContentLocalizationSection(
  value: unknown,
): ContentLocalizationSection | null {
  return typeof value === "string" &&
    (CONTENT_LOCALIZATION_SECTIONS as readonly string[]).includes(value)
    ? (value as ContentLocalizationSection)
    : null;
}

export function contentLocalizationPermissionForSection(
  section: ContentLocalizationSection,
): DashboardPermissionKey {
  return SECTION_PERMISSION[section];
}
