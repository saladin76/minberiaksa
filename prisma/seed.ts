// Run with:  npx tsx prisma/seed.ts

import { PrismaClient } from "@prisma/client";
import { generateUniqueSlug } from "../lib/slug";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding…");

  // ─────────────────────────────────────────────
  // QUICK CATEGORIES — drop-in slot for additional dummies
  // ─────────────────────────────────────────────
  // Add entries below to seed extra categories. Only `name` (Arabic, unique
  // across categories) is required — every other field is auto-filled with
  // dummy defaults. Idempotent: a category with the same name is skipped.
  // Categories created here can be referenced by name in QUICK CAMPAIGNS below.
  type QuickCategory = {
    /** Arabic name (required, unique across categories) */
    name: string;
    /* ── optional overrides ── */
    description?: string;   // default: derived from name
    order?: number;         // default: 99 (so it sorts after curated ones)
    icon?: string;          // default: 'Heart'
    image?: string;         // default: deterministic picsum seed image
    currentAmount?: number; // default: 0
  };

  const quickCategoriesRaw: QuickCategory[] = [
    // Example — uncomment / duplicate to add more.
     { name: 'اليمن' },
  ];

  if (quickCategoriesRaw.length > 0) {
    let catCreatedCount = 0;
    let catSkippedCount = 0;

    for (const q of quickCategoriesRaw) {
      const existing = await prisma.category.findUnique({
        where: { name: q.name },
        select: { id: true },
      });
      if (existing) {
        console.log(`ℹ️  quickCategory skipped — already exists: "${q.name}"`);
        catSkippedCount += 1;
        continue;
      }

      const slug = await generateUniqueSlug(
        prisma.category as any,
        q.name,
        { fallbackPrefix: "category" }
      );

      const seedKey = slug || `quick-cat-${catCreatedCount}`;

      await prisma.category.create({
        data: {
          name: q.name,
          description:
            q.description ??
            `${q.name} — تصنيف لدعم المشاريع الإنسانية والتنموية في هذا المجال.`,
          order: q.order ?? 99,
          currentAmount: q.currentAmount ?? 0,
          slug,
          icon: q.icon ?? "Heart",
          image:
            q.image ??
            `https://picsum.photos/seed/${encodeURIComponent(seedKey)}/1200/600`,
        },
      });

      catCreatedCount += 1;
    }

    console.log(
      `✓ Created ${catCreatedCount} quick category(ies)${
        catSkippedCount ? ` (${catSkippedCount} skipped)` : ""
      }`
    );
  } else {
    console.log(
      "ℹ️  quickCategoriesRaw is empty — skipping quick-add categories"
    );
  }

  // ─────────────────────────────────────────────
  // QUICK CAMPAIGNS — drop-in slot for additional dummies
  // ─────────────────────────────────────────────
  // Add entries below to seed extra campaigns into ANY existing category.
  // Only `categoryName` (Arabic, must match an existing category), `title`,
  // and `description` are required. No translations are created — the Arabic
  // base fields drive every locale via the API's locale-fallback chain.
  type QuickCampaign = {
    /** Arabic name of an existing category — e.g. 'مشاريع تركيا' */
    categoryName: string;
    /** Arabic title (required) */
    title: string;
    /** Arabic description (required) */
    description: string;
    /* ── optional overrides ── */
    targetAmount?: number;       // default 50000
    currentAmount?: number;      // default 0
  };

  const quickCampaignsRaw: QuickCampaign[] = [
    // Example — uncomment / duplicate to add more.
          {
       categoryName: 'غزه',
       title: 'مشروع تشغيل المخابز وتوزيع الخبز في غزة',
       description: `يُعد الخبز من أبسط الاحتياجات اليومية التي لا يمكن للأسرة الاستغناء عنها، لكنه في ظل الأزمات قد يتحول إلى حاجة صعبة المنال. لذلك يأتي مشروع تشغيل المخابز وتوزيع الخبز في غزة لتأمين الخبز الساخن للأسر المحتاجة، وخاصة العائلات التي فقدت مصادر دخلها أو تعيش في مناطق تعاني من نقص شديد في الخدمات الأساسية.

تعمل الجمعية من خلال هذا المشروع على تشغيل الأفران المحلية، بما يضمن توفير الخبز لعشرات الأسر، وفي الوقت نفسه يساهم في دعم العاملين في هذه الأفران من خلال توفير مصدر رزق لهم. وبهذا يجمع المشروع بين الإغاثة المباشرة ودعم دورة الحياة المحلية، حيث يستفيد المحتاجون من الخبز، ويستفيد العاملون من استمرار العمل.

يستهدف المشروع الأسر الفقيرة، والنازحين، والعائلات التي لا تستطيع شراء الخبز بشكل منتظم. ويساهم في تخفيف العبء اليومي عن الأسر، ومنح الأطفال غذاءً أساسيًا يساعدهم على الاستمرار وسط الظروف القاسية.

بدعمك لهذا المشروع، يصل الخبز إلى بيت محتاج، وتستمر يد العمل في خدمة الناس داخل غزة.`,
     },
          {
       categoryName: 'غزه',
       title: 'مشروع الترميم الجزئي للمنازل في غزة',
       description: `تضررت منازل كثيرة في غزة بشكل جزئي، وبقيت عائلاتها بين خيارين قاسيين: البقاء في بيت غير آمن، أو الانتقال إلى خيمة مؤقتة لا توفر الحد الأدنى من الراحة. لذلك يهدف مشروع الترميم الجزئي للمنازل إلى مساعدة الأسر التي تضررت بيوتها بسبب القصف أو الظروف الطارئة، لكنها لا تزال قابلة للإصلاح الجزئي.

تعمل الجمعية من خلال هذا المشروع على تنفيذ أعمال ترميم أساسية تساعد العائلة على العودة إلى منزل أكثر أمانًا، أو تحسين ظروف السكن فيه بما يحميها من البرد والحر والمخاطر اليومية. وقد تشمل الأعمال إصلاح أجزاء متضررة، أو إغلاق فتحات، أو تحسين مرافق أساسية بحسب الحاجة والإمكانات.

يستهدف المشروع الأسر التي لا تملك مأوى بديلًا، والعائلات التي تعيش في بيوت متصدعة أو غير مكتملة الصلاحية للسكن. ويساعد المشروع على حفظ كرامة الأسرة، ويمنح الأطفال مساحة أكثر أمانًا للحياة اليومية.

ساهم في ترميم منزل، وكن سببًا في عودة عائلة إلى مكان أكثر أمانًا واستقرارًا.`,
     },
          {
       categoryName: 'غزه',
       title: 'مشروع توزيع الوجبات الساخنة',
       description: `عندما تعيش الأسرة تحت ضغط النزوح والفقر ونقص الإمكانات، قد يصبح إعداد وجبة طعام ساخنة أمرًا صعبًا. لذلك يهدف مشروع توزيع الوجبات الساخنة إلى توفير وجبات جاهزة وكريمة للعائلات التي لا تستطيع تحضير الطعام بسبب الظروف المعيشية القاسية.

تعمل الجمعية من خلال هذا المشروع على تجهيز وتوزيع وجبات ساخنة تصل إلى الأسر الأشد حاجة، خاصة العائلات التي تضم أطفالًا، أو تعيش في المخيمات، أو لا تملك أدوات الطهي والمواد الغذائية الكافية. وتساعد الوجبة الساخنة على تخفيف الجوع، وتمنح المستفيدين شعورًا بالاهتمام والرحمة في وقت يحتاجون فيه إلى الدعم.

يستهدف المشروع النازحين، والأسر الفقيرة، والأطفال، وكبار السن، والعائلات التي فقدت القدرة على تأمين وجبة يومية كريمة. وهو من المشاريع ذات الأثر المباشر والسريع، لأن أثره يصل إلى المستفيد في اللحظة نفسها.

بدعمك للوجبات الساخنة، تقدم طعامًا جاهزًا يصل في وقت الحاجة إلى أسرة تنتظره.`,
     },



  ];

  if (quickCampaignsRaw.length > 0) {
    const allCategories = await prisma.category.findMany({
      select: { id: true, name: true },
    });
    const categoryByName = new Map(allCategories.map((c) => [c.name, c]));

    let createdCount = 0;
    let skippedCount = 0;

    for (const q of quickCampaignsRaw) {
      const cat = categoryByName.get(q.categoryName);
      if (!cat) {
        console.warn(
          `⚠️  quickCampaign skipped — category not found: "${q.categoryName}"`
        );
        skippedCount += 1;
        continue;
      }

      const seedKey =
        q.title.replace(/\s+/g, "-").slice(0, 24) || `quick-${createdCount}`;
      const slug = await generateUniqueSlug(
        prisma.campaign as any,
        q.title,
        { fallbackPrefix: "campaign" }
      );

      await prisma.campaign.create({
        data: {
          title: q.title,
          description: q.description,
          targetAmount: q.targetAmount ?? 50000,
          currentAmount: q.currentAmount ?? 0,
          // Many-to-many: connect to one category for seed data.
          categories: { connect: [{ id: cat.id }] },
          isActive: false,
          goalType: "FIXED",
          fundraisingMode: "AMOUNT",
          images: [
            `https://picsum.photos/seed/${encodeURIComponent(seedKey)}/800/500`,
          ],
          slug,
        },
      });

      createdCount += 1;
    }

    console.log(
      `✓ Created ${createdCount} quick campaign(s)${
        skippedCount ? ` (${skippedCount} skipped)` : ""
      }`
    );
  } else {
    console.log("ℹ️  quickCampaignsRaw is empty — skipping quick-add section");
  }

  console.log("✅ Seed complete");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
