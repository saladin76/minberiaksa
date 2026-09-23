/**
 * scripts/retarget-blog-covers-219-258.ts
 * ---------------------------------------------------------------
 * الحزمة 219–258 (40 مقالة) وصلت بلا مجلد صور: IMAGE_MAP.csv يسمّي الملفات
 * المطلوبة فقط. الأغلفة المؤقتة الأولى أُسندت بمطابقة آلية بالكلمات المفتاحية
 * فأخطأت في أغلبها (غلاف «تغذية الأمهات» فوق مقالة عن الديون، …). هذا السكربت
 * يطبّق الإسناد المراجَع يدويًا — نفس القيم المكتوبة في prisma/seed/seed-posts.json —
 * على قاعدة الإنتاج مباشرة، لأن الواجهة تقرأ من الـDB لا من ملف البذرة.
 *
 * هذه أغلفة مؤقتة تبقى حتى ترفع المؤسسة الصور الأربعين المسماة في IMAGE_MAP.csv.
 *
 * التشغيل:
 *   npx tsx scripts/retarget-blog-covers-219-258.ts            # عرض فقط (dry run)
 *   npx tsx scripts/retarget-blog-covers-219-258.ts --apply    # الكتابة فعليًا
 *
 * idempotent: يطابق على slug ويكتب فقط حين تختلف القيمة الحالية.
 */
import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";
import seedPosts from "../prisma/seed/seed-posts.json";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

/** نفس تحويل seed.ts: البذرة تخزّن `assets/blog/x.jpg` والموقع يخدم `/assets/blog/x.webp`. */
const publicPath = (src?: string | null): string | undefined => {
  if (!src) return undefined;
  if (/^(?:https?:)?\/\//i.test(src)) return src;
  const rooted = src.startsWith("/") ? src : "/" + src.replace(/^\.\//, "");
  const webp = rooted.replace(/\.(?:jpe?g|png)$/i, ".webp");
  if (webp !== rooted && fs.existsSync(path.join("public", webp.slice(1)))) return webp;
  return rooted;
};

async function main() {
  const targets = JSON.parse(
    fs.readFileSync(path.join(__dirname, "retarget-blog-covers-219-258.json"), "utf8"),
  ) as { index: number; slug: string; title: string; final: string }[];

  const bySlug = new Map(seedPosts.posts.map((p) => [p.slug, p]));

  let changed = 0;
  let already = 0;
  let missing = 0;

  for (const t of targets) {
    const seeded = bySlug.get(t.slug);
    if (!seeded?.image) {
      console.warn(`#${t.index} ${t.slug} — غير موجود في ملف البذرة، تخطٍّ`);
      missing++;
      continue;
    }
    const next = publicPath(seeded.image)!;

    const post = await prisma.post.findUnique({ where: { slug: t.slug }, select: { id: true, image: true } });
    if (!post) {
      console.warn(`#${t.index} ${t.slug} — غير موجود في قاعدة البيانات، تخطٍّ`);
      missing++;
      continue;
    }
    if (post.image === next) {
      already++;
      continue;
    }

    console.log(`#${t.index} ${t.slug}\n    ${post.image ?? "(بلا غلاف)"}\n → ${next}`);
    if (APPLY) await prisma.post.update({ where: { id: post.id }, data: { image: next } });
    changed++;
  }

  console.log(
    `\n${APPLY ? "طُبِّق" : "معاينة فقط (أضف --apply للكتابة)"}: ` +
      `${changed} تغيير، ${already} مطابقة أصلًا، ${missing} مفقودة.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
