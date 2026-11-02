// Local, versioned locale CSS; optional font display prevents a late font swap
// from delaying first content. Original CDN binaries retain Unicode subsetting.
export const LOCALE_FONT_STYLESHEETS: Partial<Record<string, string>> = {
  "ja": "/fonts/locales/ja-1776f14287.css",
  "zh": "/fonts/locales/zh-6c062b7fa7.css",
  "hi": "/fonts/locales/hi-a08905399e.css"
};
