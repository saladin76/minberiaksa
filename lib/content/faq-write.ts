/**
 * Shaping for the FAQ write endpoints.
 *
 * Follows `lib/content/story-write.ts`: one select shared by every read that
 * follows a write, full scalars for create, and a patch for update so an
 * omitted field means "leave it alone" rather than "reset it".
 *
 * `page` scopes an entry to one page of the site (the donation page, the waqf
 * page). Null means it is general and shows everywhere the FAQ block appears.
 */

import { boolDefaultTrue, intOr, optionalStr, parseTranslations, str } from "./translation-write";

export const FAQ_WITH_TRANSLATIONS_SELECT = {
  id: true,
  question: true,
  answer: true,
  page: true,
  order: true,
  isActive: true,
  translations: { select: { locale: true, question: true, answer: true } },
} as const;

/**
 * Both fields are required for a locale to count as translated: a question with
 * no answer is not a usable FAQ entry, so the question alone decides presence
 * and the answer rides along with it.
 */
export function parseFaqTranslations(translations: unknown) {
  return parseTranslations(translations, { required: "question", optional: ["answer"] });
}

export function buildFaqScalars(body: Record<string, unknown>) {
  return {
    question: str(body.question),
    answer: str(body.answer),
    page: optionalStr(body.page),
    order: intOr(body.order, 0),
    isActive: boolDefaultTrue(body.isActive),
  };
}

export function buildFaqScalarPatch(body: Record<string, unknown>) {
  const patch: Record<string, unknown> = {};
  if (body.question !== undefined) patch.question = str(body.question);
  if (body.answer !== undefined) patch.answer = str(body.answer);
  if (body.page !== undefined) patch.page = optionalStr(body.page) ?? null;
  if (body.order !== undefined) patch.order = intOr(body.order, 0);
  if (body.isActive !== undefined) patch.isActive = boolDefaultTrue(body.isActive);
  return patch;
}
