/** GTM is an explicit operator setting, never a hard-coded legacy container. */
export function googleTagManagerId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const id = value.trim().toUpperCase();
  return /^GTM-[A-Z0-9]+$/.test(id) ? id : null;
}

export function configuredGoogleTagManager(settings: Record<string, unknown> | null): string | null {
  return settings?.googleTagManagerEnabled === true ? googleTagManagerId(settings.googleTagManagerId) : null;
}

type GoogleWindow = {
  dataLayer?: unknown[];
  gtag?: (...args: unknown[]) => void;
  __miaGoogleTracking?: { ids: Set<string>; containers: Set<string> };
};

function state(scope: GoogleWindow) {
  return scope.__miaGoogleTracking ??= { ids: new Set(), containers: new Set() };
}

function appendScript(doc: Document, src: string) {
  const script = doc.createElement("script");
  script.async = true;
  script.src = src;
  // A later mount may retry a failed request; no second copy of a live script.
  script.onerror = () => script.remove();
  doc.head.appendChild(script);
}

/** One Google library, one config per destination, including multiple Ads accounts.
 * Keep an existing gtag queue/function intact and leave purchase IDs to the
 * canonical conversion sender. Remounts must not emit duplicate page views. */
export function initializeGoogleTracking(input: { gaMeasurementId?: string | null; adsIds: string[] }, scope: GoogleWindow, doc: Document) {
  const ids = [...new Set([input.gaMeasurementId, ...input.adsIds].filter((id): id is string => Boolean(id)))];
  if (!ids.length) return;
  const initialized = state(scope);
  scope.dataLayer ??= [];
  if (!scope.gtag) {
    scope.gtag = function () {
      // eslint-disable-next-line prefer-rest-params -- Google's data layer expects Arguments objects.
      scope.dataLayer?.push(arguments);
    };
    scope.gtag("js", new Date());
  }
  for (const id of ids) {
    if (initialized.ids.has(id)) continue;
    initialized.ids.add(id);
    if (id === input.gaMeasurementId) scope.gtag("config", id, { send_page_view: true });
    else scope.gtag("config", id);
  }
  const exists = Array.from(doc.scripts).some(script => {
    try {
      const url = new URL(script.src);
      return url.hostname === "www.googletagmanager.com" && url.pathname === "/gtag/js";
    } catch { return false; }
  });
  if (!exists) appendScript(doc, `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(ids[0])}`);
}

export function loadConfiguredGoogleTagManager(settings: Record<string, unknown>, scope: GoogleWindow, doc: Document) {
  const id = configuredGoogleTagManager(settings);
  if (!id) return;
  const initialized = state(scope);
  if (!initialized.containers.has(id)) {
    initialized.containers.add(id);
    scope.dataLayer ??= [];
    scope.dataLayer.push({ "gtm.start": Date.now(), event: "gtm.js" });
  }
  const src = `https://www.googletagmanager.com/gtm.js?id=${id}`;
  if (!Array.from(doc.scripts).some(script => script.src === src)) appendScript(doc, src);
}
