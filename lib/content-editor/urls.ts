import { SUPPORTED_LOCALES } from "../locales";
export function safeEditorUrl(value: string): boolean {
  if (!value) return true;
  if (/[\s\\]/.test(value)) return false;
  if (value.startsWith("/")) return !value.startsWith("//");
  if (/^#[A-Za-z][\w-]*$/.test(value)) return true;
  if (!/^https?:\/\//.test(value)) return false;
  try {
    const url = new URL(value);
    return Boolean(url.hostname) && !url.username && !url.password;
  } catch {
    return false;
  }
}
export function localizeContentHref(url: string, locale: string): string {
  const value = url.trim();
  if (!value || /^(?:javascript|data|vbscript):/i.test(value)) return "";
  if (/^(?:https?:)?\/\//i.test(value) || /^(?:#|mailto:|tel:)/i.test(value))
    return value;
  const path = value.startsWith("/") ? value : `/${value}`;
  const known = new RegExp(`^/(${SUPPORTED_LOCALES.join("|")})(?=/|\\?|#|$)`);
  return `/${locale}${path.replace(known, "")}`;
}
export function parseIstanbulSchedule(value: unknown): Date | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const raw = value.trim();
  const parsed = new Date(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raw) ? raw + ":00+03:00" : raw,
  );
  if (Number.isNaN(parsed.getTime())) throw new Error("موعد غير صالح");
  return parsed;
}

export function validateSectionLinks(
  body: Record<string, unknown>,
): string | null {
  if (!Array.isArray(body.blocks)) return null;
  const blocks = body.blocks.filter(
    (v): v is Record<string, unknown> => Boolean(v) && typeof v === "object",
  );
  const active = blocks.filter((b) => b.isActive !== false),
    anchors = active
      .map((b) => (typeof b.anchor === "string" ? b.anchor.trim() : ""))
      .filter(Boolean);
  if (new Set(anchors).size !== anchors.length)
    return "توجد معرفات أقسام مكررة";
  const links = [
    body.ctaPrimaryHref,
    body.ctaSecondaryHref,
    body.ctaTertiaryHref,
    ...active.map((b) => b.linkUrl),
  ];
  if (
    links.some(
      (href) =>
        typeof href === "string" &&
        href.startsWith("#") &&
        !anchors.includes(href.slice(1)),
    )
  )
    return "يوجد زر يشير إلى قسم مخفي أو غير موجود";
  return null;
}
export function validateSchedule(
  start: Date | null | undefined,
  end: Date | null | undefined,
): boolean {
  return !(start && end && start.getTime() >= end.getTime());
}
