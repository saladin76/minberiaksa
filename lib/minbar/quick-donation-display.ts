import type { MinbarProject } from "./projects";
import type { QuickDonationConfig, QuickDonationProjectOption } from "./quick-donation";

type QuickDonationProjectSource = Pick<MinbarProject, "id" | "slug" | "title" | "regionLabel">;

/** Select and minimize the project data sent to the homepage destination picker. */
export function selectQuickDonationProjectOptions(
  config: Pick<QuickDonationConfig, "projectsMode" | "projectIds">,
  projects: readonly QuickDonationProjectSource[],
): QuickDonationProjectOption[] {
  if (config.projectsMode === "none") return [];
  const selected = config.projectsMode === "selected" ? new Set(config.projectIds) : null;
  return projects
    .filter((project) => !selected || selected.has(project.id))
    .map(({ id, slug, title, regionLabel }) => ({ id, slug, title, regionLabel }));
}

/** Presets for the visitor's currency, and the currency they are priced in. */
export function resolveQuickAmounts(
  config: QuickDonationConfig,
  currencyCode: string | null | undefined,
): { amounts: number[]; currency: string } {
  const code = String(currencyCode || "").trim().toUpperCase();
  if (code && code !== "DEFAULT" && code !== "USD" && config.byCurrency[code]?.length) {
    return { amounts: config.byCurrency[code], currency: code };
  }
  return { amounts: config.amounts, currency: "USD" };
}

/** The title for this locale, or null to use the site copy. */
export function quickTitleFor(config: QuickDonationConfig, locale: string): string | null {
  const title = config.titles[locale]?.trim();
  return title || null;
}
