export const PROFILE_TABS = ["donations", "overview", "account", "subscriptions", "settings", "support"] as const;
export type ProfileTab = typeof PROFILE_TABS[number];
export function profileHref(locale: string, tab: ProfileTab = "donations") {
  return `/${locale}/profile?${new URLSearchParams({ tab })}`;
}
