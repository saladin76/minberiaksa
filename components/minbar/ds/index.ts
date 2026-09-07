/**
 * Minbar Al-Aqsa design system — React port.
 *
 * These are one-to-one ports of the ten components in the locked handoff bundle
 * `Minbar/_ds/design-system-d0075d3b-6dd5-4297-b7a4-b3aad2b56a47/_ds_bundle.js`,
 * which the `.dc.html` pages consumed through
 * `<x-import component-from-global-scope="DesignSystem_d0075d.<Name>">`.
 *
 * Two deliberate differences from the bundle:
 *  - every user-facing string is a prop rather than baked-in English, because
 *    the site renders in 19 languages;
 *  - colours resolve via CSS variables, so the locked palette in
 *    `styles/minbar/minbar.css` overrides the design-system defaults exactly as
 *    the static pages did by linking `design-tokens.css` last.
 *
 * `DonationPanel` is intentionally absent: the bundle's version is a static
 * demo with hard-coded intentions and a dead donate link. The real panel is the
 * page-level one in `components/minbar/DonationPanel.tsx`, which is wired to the
 * cart contract in `Minbar/DONATION_LOGIC_SPEC.md`.
 */
export { default as Badge } from "./Badge";
export type { BadgeProps, BadgeTone } from "./Badge";

export { default as Button } from "./Button";
export type { ButtonProps, ButtonSize, ButtonVariant } from "./Button";

export { CertificateCard, FundCard, ProjectCard } from "./cards";
export type { CertificateCardProps, FundCardProps, ProjectCardProps } from "./cards";

export { ReelCard, StoryCircle } from "./media";
export type { ReelCardProps, StoryCircleProps } from "./media";

export { StatMetric, TrustList } from "./trust";
export type { StatMetricProps, TrustListProps } from "./trust";
