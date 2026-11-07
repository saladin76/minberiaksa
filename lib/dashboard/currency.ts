export const DASHBOARD_CURRENCY_COOKIE = "dashboard_currency";
export function currencyCookieName(dashboard: boolean) { return dashboard ? DASHBOARD_CURRENCY_COOKIE : "currency"; }
export function onDashboard(pathname: string) { return /^\/dashboard(?:\/|$)/.test(pathname); }
