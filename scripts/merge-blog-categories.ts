/**
 * scripts/merge-blog-categories.ts
 * ---------------------------------------------------------------
 * حزم المقالات الثلاث (179–198 · 199–218 · 219–258) جاءت بتصنيفات canonical
 * مختلفة عن تصنيفات الـ178 الأصلية، فأُضيفت بلا توحيد: 29 تصنيفًا فيها 13
 * تكرارًا دلاليًا («التعليم» و«التعليم والطفولة»، «رمضان» و«رمضان والمواسم»، …).
 * النتيجة فهرس جانبي مزدحم وصفحات تصنيف هزيلة في الـSEO.
 *
 * هذا السكربت يطبّق خريطة merge-blog-categories.json على قاعدة الإنتاج:
 *   1) ينقل مقالات كل تصنيف مدموج إلى وجهته (mergeWhole)،
 *   2) ثم يطبّق استثناءات المقالات المفردة (movePosts) — لازمة لأن «المياه والصحة»
 *      كان خليطًا: 7 مقالات طبية بحتة و9 مقالات مياه، ودمجه كتلةً كان سيضع
 *      المحتوى الطبي تحت عنوان «المياه والصرف الصحي»،
 *   3) ثم يحذف سجلات التصنيفات المدموجة وترجماتها — بعد التأكد أنها صفرية المقالات.
 *
 * إعادة التوجيه 301 للـslugs المحذوفة مُعرَّفة في next.config.ts (blogCategoryRedirects).
 *
 * التشغيل:
 *   npx tsx scripts/merge-blog-categories.ts            # معاينة فقط
 *   npx tsx scripts/merge-blog-categories.ts --apply    # الكتابة فعليًا
 *
 * idempotent: يطابق على الاسم/الـslug ولا يكتب إلا حين تختلف القيمة الحالية.
 */
import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

type MergeMap = {
  mergeWhole: Record<string, string>;
  splitCategories: string[];
  movePosts: Record<string, string>;
};

async function main() {
  const map = JSON.parse(
    fs.readFileSync(path.join(__dirname, "merge-blog-categories.json"), "utf8"),
  ) as MergeMap;

  const categories = await prisma.postCategory.findMany({ select: { id: true, name: true, slug: true } });
  const byName = new Map(categories.map((c) => [c.name, c]));
  console.log(`تصنيفات في قاعدة البيانات: ${categories.length}`);

  /* الوجهات أولًا: لا معنى لنقل مقالة إلى تصنيف غير موجود. */
  const destinations = new Set([...Object.values(map.mergeWhole), ...Object.values(map.movePosts)]);
  const missingDest = [...destinations].filter((n) => !byName.has(n));
  if (missingDest.length) throw new Error("وجهات غير موجودة في قاعدة البيانات: " + missingDest.join(" | "));

  let movedWhole = 0;
  let movedSingle = 0;

  // 1) نقل التصنيفات المدموجة كاملةً
  for (const [from, to] of Object.entries(map.mergeWhole)) {
    const src = byName.get(from);
    if (!src) {
      console.warn(`تخطٍّ: «${from}» غير موجود (مُطبَّق سابقًا؟)`);
      continue;
    }
    const dst = byName.get(to)!;
    const n = await prisma.post.count({ where: { categoryId: src.id } });
    console.log(`«${from}» → «${to}»  (${n} مقالة)`);
    if (APPLY && n) await prisma.post.updateMany({ where: { categoryId: src.id }, data: { categoryId: dst.id } });
    movedWhole += n;
  }

  // 2) استثناءات المقالات المفردة (تُطبَّق بعد النقل الكتلي كي تَجُبّه)
  for (const [slug, to] of Object.entries(map.movePosts)) {
    const dst = byName.get(to)!;
    const post = await prisma.post.findUnique({ where: { slug }, select: { id: true, categoryId: true } });
    if (!post) {
      console.warn(`تخطٍّ: المقالة «${slug}» غير موجودة`);
      continue;
    }
    if (post.categoryId === dst.id) continue;
    console.log(`  ↳ ${slug} → «${to}»`);
    if (APPLY) await prisma.post.update({ where: { id: post.id }, data: { categoryId: dst.id } });
    movedSingle++;
  }

  // 3) حذف التصنيفات المدموجة — الصفرية فقط
  const toDelete = [...Object.keys(map.mergeWhole), ...map.splitCategories];
  let deleted = 0;
  for (const name of toDelete) {
    const cat = byName.get(name);
    if (!cat) continue;
    const left = APPLY ? await prisma.post.count({ where: { categoryId: cat.id } }) : 0;
    if (left > 0) {
      console.warn(`لم يُحذف «${name}»: ما زال يحمل ${left} مقالة`);
      continue;
    }
    console.log(`حذف التصنيف «${name}» (${cat.slug}) وترجماته`);
    if (APPLY) {
      await prisma.postCategoryTranslation.deleteMany({ where: { categoryId: cat.id } });
      await prisma.postCategory.delete({ where: { id: cat.id } });
    }
    deleted++;
  }

  const remaining = APPLY ? await prisma.postCategory.count() : categories.length - deleted;
  console.log(
    `\n${APPLY ? "طُبِّق" : "معاينة فقط (أضف --apply للكتابة)"}: ` +
      `${movedWhole} مقالة بالنقل الكتلي، ${movedSingle} باستثناءات مفردة، ` +
      `${deleted} تصنيفًا محذوفًا، المتبقي ${remaining}.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
