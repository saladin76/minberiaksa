import { createHmac, timingSafeEqual } from "node:crypto";

export type StatementPreviewBinding = {
  fileHash: string;
  bankId: string;
  currency: string;
  donorLocale: string;
  sheetName: string;
  parserVersion: number;
};
const signature = (payload: string, secret: string) =>
  createHmac("sha256", secret)
    .update(`bank-statement-preview:${payload}`)
    .digest("base64url");
export function signStatementPreview(
  binding: StatementPreviewBinding,
  secret: string,
  now = Date.now(),
) {
  if (!secret) throw new Error("STATEMENT_PREVIEW_UNAVAILABLE");
  const payload = Buffer.from(
    JSON.stringify({ ...binding, expires: now + 2 * 60 * 60 * 1000 }),
  ).toString("base64url");
  return `${payload}.${signature(payload, secret)}`;
}
export function verifyStatementPreview(
  token: string,
  binding: StatementPreviewBinding,
  secret: string,
  now = Date.now(),
) {
  if (!secret || token.length > 4096) return false;
  try {
    const [payload, supplied, extra] = token.split(".");
    if (!payload || !supplied || extra) return false;
    const expected = Buffer.from(signature(payload, secret)),
      actual = Buffer.from(supplied);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual))
      return false;
    const saved = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    );
    return (
      typeof saved.expires === "number" &&
      saved.expires > now &&
      Object.entries(binding).every(([key, value]) => saved[key] === value)
    );
  } catch {
    return false;
  }
}
