/**
 * WhatsApp template problems in Arabic (owner, 2026-11-20): Meta's rules checked before sending, and Meta's
 * known rejections explained with what to change. Meta's raw text stays available as technical detail.
 */
const LANGUAGE_NAMES: Record<string, string> = {
  ar: "العربية", tr: "التركية", en: "الإنجليزية", fr: "الفرنسية", de: "الألمانية", es: "الإسبانية", id: "الإندونيسية",
  pt: "البرتغالية", ur: "الأردية", sq: "الألبانية", it: "الإيطالية", nl: "الهولندية", sv: "السويدية", no: "النرويجية",
  da: "الدنماركية", ms: "الملايوية", ja: "اليابانية", zh: "الصينية", hi: "الهندية",
};
export const arabicLanguageName = (locale: string) => LANGUAGE_NAMES[locale] ?? locale;

const EMOJI = /\p{Extended_Pictographic}/u;
const EMOJI_ALL = /\p{Extended_Pictographic}/gu;

type Draft = { body?: string; footerText?: string; buttons?: Array<{ type?: string; text?: string }> } | undefined;

/** Meta's format rules, checked before sending; one Arabic line per problem, naming the language. */
export function metaTemplateFormatProblems(locales: Record<string, Draft>, skip: { has(locale: string): boolean }): string[] {
  const problems: string[] = [];
  for (const [locale, draft] of Object.entries(locales)) {
    if (!draft || skip.has(locale)) continue;
    const lang = arabicLanguageName(locale);
    for (const button of draft.buttons ?? []) {
      const text = String(button.text ?? "");
      const label = `زر «${text.trim() || "بلا نص"}» في نسخة ${lang}`;
      if (EMOJI.test(text)) problems.push(`${label}: يحتوي إيموجي، وMeta لا تقبل الإيموجي في نص الأزرار.`);
      if (/\r|\n/.test(text)) problems.push(`${label}: يحتوي سطراً جديداً، ونص الزر يجب أن يكون سطراً واحداً.`);
      if (/[*_~`]/.test(text)) problems.push(`${label}: يحتوي رموز تنسيق (* _ ~ \`)، وهي غير مسموحة في الأزرار.`);
      if (/\{\{/.test(text)) problems.push(`${label}: يحتوي متغيراً، والمتغيرات غير مسموحة في نص الزر.`);
      if ([...text.trim()].length > 25) problems.push(`${label}: أطول من 25 حرفاً.`);
    }
    const body = String(draft.body ?? "");
    if (/\n[ \t]*\n[ \t]*\n/.test(body)) problems.push(`نص الرسالة في نسخة ${lang}: فيه أكثر من سطر فارغ متتالٍ. اترك سطراً فارغاً واحداً فقط بين الفقرات.`);
    const emojis = (body.match(EMOJI_ALL) ?? []).length;
    if (emojis > 10) problems.push(`نص الرسالة في نسخة ${lang}: فيه ${emojis} إيموجي، وMeta تقبل 10 كحد أقصى.`);
    if (/\{\{/.test(String(draft.footerText ?? ""))) problems.push(`التذييل في نسخة ${lang}: لا يقبل المتغيرات.`);
  }
  return problems;
}

/** Meta's known rejections in Arabic, with the fix; null when the message is not one we recognise. */
export function explainMetaTemplateError(raw: string): string | null {
  const s = String(raw ?? "");
  if (/Buttons can't have any variables, newlines, emojis/i.test(s) || /Button format is incorrect/i.test(s))
    return "رفضت Meta أحد الأزرار: نص الزر لا يقبل الإيموجي أو الأسطر الجديدة أو رموز التنسيق أو المتغيرات. اكتبه نصاً عادياً (حتى 25 حرفاً) في كل اللغات.";
  if (/more than two consecutive newline|more than 10 emojis|only have parameters/i.test(s) || /Message body format is incorrect/i.test(s))
    return "رفضت Meta نص الرسالة: إما أن فيه أكثر من سطر فارغ متتالٍ، أو أكثر من 10 إيموجي، أو أنه متغيرات فقط. اترك سطراً فارغاً واحداً بين الفقرات وقلّل الإيموجي.";
  if (/already exists|same name|name.*(taken|in use)|2388023|2388024/i.test(s))
    return "يوجد في Meta قالب بالاسم نفسه. غيّر اسم القالب (حروف إنجليزية صغيرة وأرقام وشرطة سفلية).";
  if (/example|sample/i.test(s) && /(missing|required|invalid)/i.test(s))
    return "تطلب Meta أمثلة للمتغيرات أو للوسائط. أدخل مثالاً لكل متغير، وارفع عينة الصورة أو الفيديو.";
  if (/header|media|image|video|document|handle/i.test(s) && /(invalid|failed|incorrect|format|size)/i.test(s))
    return "رفضت Meta وسائط الرأس (الصورة/الفيديو/الملف). أعد رفع العينة بصيغة وحجم مقبولين.";
  if (/character limit|too long|exceeds|maximum length/i.test(s))
    return "أحد النصوص أطول من الحد المسموح لدى Meta (النص حتى 1024 حرفاً، والتذييل حتى 60، ونص الزر حتى 25).";
  if (/language|locale/i.test(s) && /(not supported|invalid|unsupported)/i.test(s))
    return "Meta لا تقبل هذه اللغة لهذا القالب. احذف اللغة أو اخترها بالرمز الصحيح.";
  if (/rate limit|too many|throttl/i.test(s))
    return "تجاوزتم عدد المحاولات المسموح لدى Meta مؤقتاً. انتظروا قليلاً ثم أعيدوا الإرسال.";
  if (/permission|access token|OAuth|not authorized|unauthorized/i.test(s))
    return "مشكلة في صلاحيات حساب Meta المرتبط. تحقّقوا من ربط الحساب في إعدادات التواصل.";
  if (/network error|timed? ?out|ETIMEDOUT|ECONNRESET|fetch failed|unexpected error/i.test(s))
    return "تعذّر الاتصال بـMeta مؤقتاً (مشكلة لديهم أو في الشبكة). أعيدوا المحاولة بعد قليل.";
  return null;
}
