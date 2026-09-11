/**
 * prisma/seed/migrate-static-content.ts — move the last hand-written site
 * content into the database.
 *
 * Until now four things the public site shows lived in code rather than in
 * the CMS: the bank accounts (`lib/minbar/banks.ts`), the eleven FAQs and the
 * six report PDFs (i18n message files + `lib/minbar/achievements.ts`), and the
 * one booklet (`PublicationsPage`). This copies each into its model, with every
 * one of the 19 translations read straight from `i18n/messages/*.json`, so the
 * dashboard becomes the only place they are edited from.
 *
 * On the bank accounts: the schema says nothing there is ever seeded, and that
 * rule is about placeholders — a made-up IBAN that reaches production sends a
 * donor's transfer nowhere. These are not placeholders. They are the accounts
 * the site has published on its bank-transfer page since launch, copied as
 * they are, and nothing is invented.
 *
 * Idempotent: upsert on slug (or on the Arabic question for FAQs, which have
 * no slug). Re-running updates; it never duplicates or deletes.
 *
 *   npx tsx prisma/seed/migrate-static-content.ts
 */
import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();

const MESSAGES_DIR = path.join(process.cwd(), "i18n", "messages");
type Messages = Record<string, Record<string, string>>;

function loadMessages(): Map<string, Messages> {
  const out = new Map<string, Messages>();
  for (const f of fs.readdirSync(MESSAGES_DIR)) {
    if (!f.endsWith(".json")) continue;
    out.set(f.replace(/\.json$/, ""), JSON.parse(fs.readFileSync(path.join(MESSAGES_DIR, f), "utf8")));
  }
  return out;
}

const messages = loadMessages();
const ar = messages.get("ar")!;
const otherLocales = [...messages.keys()].filter((l) => l !== "ar");

/** The string for one key in one locale, or "" when that locale lacks it. */
const msg = (locale: string, ns: string, key: string): string => (messages.get(locale)?.[ns]?.[key] ?? "").trim();

async function main() {
  /* ── Bank accounts ─────────────────────────────────────────────────────── */
  const HOLDER = "Minberiaksa Uluslararası Yardımlaşma Derneği";
  const banks = [
    {
      slug: "ziraat-katilim",
      name: "Ziraat Katılım Bankası",
      swift: "ZKBATRIS",
      logo: "/ziraat-katilim.jpg",
      currencies: [
        { code: "TRY", iban: "TR750020900001843729000001" },
        { code: "EUR", iban: "TR210020900001843729000003" },
        { code: "USD", iban: "TR480020900001843729000002" },
      ],
    },
    {
      slug: "albaraka",
      name: "AlbarakaTürk Katılım Bankası",
      swift: "BTFHTRIS",
      logo: null as string | null,
      currencies: [{ code: "TRY", iban: "TR710020300009942518000001" }],
    },
  ];
  for (const [i, b] of banks.entries()) {
    const row = await prisma.bankAccount.upsert({
      where: { slug: b.slug },
      update: { name: b.name, holder: HOLDER, swift: b.swift, logo: b.logo ?? undefined, order: i, isActive: true },
      create: { slug: b.slug, name: b.name, holder: HOLDER, swift: b.swift, logo: b.logo ?? undefined, order: i, isActive: true, locales: [] },
    });
    /* Currencies have no key of their own — replace the set, as the dashboard does.
       "TL" in the old file was the bank's local label; ISO 4217 is TRY. */
    await prisma.bankAccountCurrency.deleteMany({ where: { bankAccountId: row.id } });
    await prisma.bankAccountCurrency.createMany({ data: b.currencies.map((c) => ({ bankAccountId: row.id, code: c.code, iban: c.iban })) });
  }
  console.log(`✓ bank accounts: ${banks.length}`);

  /* ── FAQs ──────────────────────────────────────────────────────────────── */
  const FAQ_CATEGORY: Record<number, string> = {
    1: "zakat", 2: "zakat", 3: "zakat",
    4: "waqf", 5: "waqf", 6: "waqf",
    7: "donation", 8: "donation", 9: "donation",
    10: "reports", 11: "reports",
  };
  let faqCount = 0, faqTr = 0;
  for (let n = 1; n <= 11; n++) {
    const question = msg("ar", "homepage", `faq${n}Q`);
    const answer = msg("ar", "homepage", `faq${n}A`);
    if (!question || !answer) { console.warn(`  faq${n}: missing Arabic, skipped`); continue; }

    const existing = await prisma.faq.findFirst({ where: { question }, select: { id: true } });
    const data = { question, answer, page: FAQ_CATEGORY[n], order: n - 1, isActive: true };
    const row = existing
      ? await prisma.faq.update({ where: { id: existing.id }, data })
      : await prisma.faq.create({ data });

    for (const locale of otherLocales) {
      const q = msg(locale, "homepage", `faq${n}Q`);
      const a = msg(locale, "homepage", `faq${n}A`);
      if (!q || !a) continue;
      await prisma.faqTranslation.upsert({
        where: { faqId_locale: { faqId: row.id, locale } },
        update: { question: q, answer: a },
        create: { faqId: row.id, locale, question: q, answer: a },
      });
      faqTr++;
    }
    faqCount++;
  }
  console.log(`✓ faqs: ${faqCount} (translations: ${faqTr})`);

  /* ── Reports ───────────────────────────────────────────────────────────── */
  const REPORTS = [
    { n: 1, file: "rep-yearly.pdf", year: 2025 },
    { n: 2, file: "rep-brochure.pdf", year: null },
    { n: 3, file: "prj-tahfiz.pdf", year: null },
    { n: 4, file: "prj-kursi.pdf", year: null },
    { n: 5, file: "prj-school.pdf", year: null },
    { n: 6, file: "prj-families.pdf", year: null },
  ];
  let reportTr = 0;
  for (const [i, r] of REPORTS.entries()) {
    const title = msg("ar", "achievements", `report${r.n}Title`);
    const description = msg("ar", "achievements", `report${r.n}Meta`);
    const slug = r.file.replace(/\.pdf$/, "");
    const filePath = path.join(process.cwd(), "public", "minbar", "reports", r.file);
    if (!fs.existsSync(filePath)) console.warn(`  ${r.file}: not found under public/minbar/reports — row written anyway`);
    const base = { title, description: description || undefined, fileUrl: `/minbar/reports/${r.file}`, year: r.year ?? undefined, order: i, isPublished: true };
    const row = await prisma.report.upsert({ where: { slug }, update: base, create: { ...base, slug } });
    for (const locale of otherLocales) {
      const t = msg(locale, "achievements", `report${r.n}Title`);
      if (!t) continue;
      const d = msg(locale, "achievements", `report${r.n}Meta`);
      await prisma.reportTranslation.upsert({
        where: { reportId_locale: { reportId: row.id, locale } },
        update: { title: t, description: d || undefined },
        create: { reportId: row.id, locale, title: t, description: d || undefined },
      });
      reportTr++;
    }
  }
  console.log(`✓ reports: ${REPORTS.length} (translations: ${reportTr})`);

  /* ── Booklets ──────────────────────────────────────────────────────────── */
  const booklets = [
    {
      slug: "isharat-altanzil",
      title: "عبادًا لنا: إشارات التنزيل إلى صفات البعث على بني إسرائيل",
      /* The author is part of the title on the shelf, and is not translated. */
      author: "أسامة أبو بكر",
      summaryKey: "bookletIsharatSummary",
      fileUrl: "/minbar/assets/books/isharat-altanzil.pdf",
    },
  ];
  let bookletTr = 0;
  for (const [i, b] of booklets.entries()) {
    const base = { title: b.title, author: b.author, description: msg("ar", "common", b.summaryKey) || undefined, fileUrl: b.fileUrl, order: i, isPublished: true };
    const row = await prisma.booklet.upsert({ where: { slug: b.slug }, update: base, create: { ...base, slug: b.slug } });
    for (const locale of otherLocales) {
      const d = msg(locale, "common", b.summaryKey);
      if (!d) continue;
      /* Title stays Arabic — it is the book's name — but the summary translates. */
      await prisma.bookletTranslation.upsert({
        where: { bookletId_locale: { bookletId: row.id, locale } },
        update: { title: b.title, description: d },
        create: { bookletId: row.id, locale, title: b.title, description: d },
      });
      bookletTr++;
    }
  }
  console.log(`✓ booklets: ${booklets.length} (translations: ${bookletTr})`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
