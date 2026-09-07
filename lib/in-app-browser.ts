// Detect social-app in-app browsers (Facebook/Instagram/TikTok/etc. WebViews).
// Donation flow uses a 3D Secure popup + cross-domain redirect chain that
// these WebViews handle poorly — window.open is blocked, cookies are often
// stripped on the return trip, and users get stuck on the bank page.

export type InAppBrowserInfo = {
  isInApp: boolean;
  app: string | null;
  isMobile: boolean;
};

const APP_PATTERNS: Array<{ name: string; re: RegExp }> = [
  // Facebook native app — FBAN (iOS/Android), FBAV (App version)
  { name: "facebook", re: /FBAN|FBAV|FB_IAB/i },
  { name: "instagram", re: /Instagram/i },
  { name: "tiktok", re: /musical_ly|tiktok|bytedancewebview/i },
  { name: "linkedin", re: /LinkedInApp/i },
  { name: "twitter", re: /Twitter/i },
  { name: "snapchat", re: /Snapchat/i },
  { name: "whatsapp", re: /WhatsApp/i },
  { name: "line", re: /Line\//i },
  { name: "wechat", re: /MicroMessenger/i },
  { name: "telegram", re: /Telegram/i },
  // Generic iOS WebView (no Safari, has AppleWebKit): apps that embed WKWebView
  // without identifying themselves still hit this. False positives on hybrid
  // PWAs are acceptable — the banner is non-blocking.
];

export function detectInAppBrowser(userAgent?: string): InAppBrowserInfo {
  const ua =
    userAgent ??
    (typeof navigator !== "undefined" ? navigator.userAgent : "");
  if (!ua) return { isInApp: false, app: null, isMobile: false };

  const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);

  for (const { name, re } of APP_PATTERNS) {
    if (re.test(ua)) return { isInApp: true, app: name, isMobile };
  }

  return { isInApp: false, app: null, isMobile };
}

// True when we should skip window.open and go straight to a full-page POST.
// In-app WebViews block popups silently; on mobile in general the popup UX
// is poor (popup blocked → form auto-submits to _self anyway, but the parent
// page sets up doomed polling first). Going straight to _self is cleaner.
export function shouldSkipPopup(userAgent?: string): boolean {
  const info = detectInAppBrowser(userAgent);
  return info.isInApp || info.isMobile;
}
