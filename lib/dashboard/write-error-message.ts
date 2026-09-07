/**
 * Turn a thrown write error into an Arabic message the dashboard can show.
 *
 * The dashboard forms used to render a fixed "فشل التحديث" for every failure,
 * which made the real causes indistinguishable: a transaction that ran out of
 * time, a duplicate slug, and a dropped connection all looked identical. The
 * admin had no way to know whether retrying would help.
 *
 * Prisma error codes: https://www.prisma.io/docs/reference/api-reference/error-reference
 */

function codeOf(error: unknown): string | null {
  if (error && typeof error === "object" && "code" in error) {
    const c = (error as { code: unknown }).code;
    if (typeof c === "string") return c;
  }
  return null;
}

export function writeErrorMessage(error: unknown, fallback = "تعذّر حفظ التغييرات"): string {
  switch (codeOf(error)) {
    // Interactive transaction closed / timed out, or the engine could not start
    // one in time. Retrying is genuinely the right advice here.
    case "P2028":
    case "P2034":
      return "انتهت مهلة العملية على قاعدة البيانات. حاول مرة أخرى.";
    case "P2002":
      return "توجد بالفعل نسخة بنفس القيمة الفريدة (الرابط أو الاسم). غيّرها وحاول مجددًا.";
    case "P2025":
      return "العنصر غير موجود — ربما حُذف من جهاز آخر.";
    case "P2003":
      return "لا يمكن إتمام العملية لوجود عناصر مرتبطة.";
    case "P1001":
    case "P1002":
    case "P1017":
      return "تعذّر الاتصال بقاعدة البيانات. حاول مرة أخرى بعد قليل.";
    default:
      return fallback;
  }
}
