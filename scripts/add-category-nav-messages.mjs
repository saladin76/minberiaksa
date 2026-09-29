#!/usr/bin/env node
/**
 * Add the `CategoryNav` message namespace to the locale files.
 *
 * The public category index: the header's projects dropdown, the homepage's
 * categories section and the footer's categories band. It is a shell namespace
 * (`SHELL_NAMESPACES`) because the header and footer render it on every page.
 *
 * App-level (PascalCase) namespace, like `ProjectExtras`:
 * `scripts/sync-minbar-messages.mjs` rewrites the Minbar namespaces.
 *
 * Idempotent.  node scripts/add-category-nav-messages.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";

const CATEGORY_NAV = {
  ar: {
    showMore: "عرض المزيد ({count})",
    showLess: "عرض أقل",
    title: "تصنيفات المشاريع",
    toggle: "عرض تصنيفات المشاريع",
    sectionEyebrow: "تبرّع حسب المجال",
    sectionTitle: "تصفّح المشاريع حسب التصنيف",
    sectionLead: "اختر المجال الأقرب إلى قلبك، وادعم مشاريعه مباشرة.",
    explore: "استكشف",
    projectsCount:
      "{count, plural, =0 {لا مشاريع بعد} one {مشروع واحد} two {مشروعان} few {# مشاريع} many {# مشروعًا} other {# مشروع}}",
  },
  en: {
    showMore: "Show more ({count})",
    showLess: "Show less",
    title: "Project categories",
    toggle: "Show project categories",
    sectionEyebrow: "Give by cause",
    sectionTitle: "Browse projects by category",
    sectionLead: "Choose the cause closest to your heart and support its projects directly.",
    explore: "Explore",
    projectsCount: "{count, plural, =0 {No projects yet} one {# project} other {# projects}}",
  },
  tr: {
    showMore: "Daha fazla göster ({count})",
    showLess: "Daha az göster",
    title: "Proje kategorileri",
    toggle: "Proje kategorilerini göster",
    sectionEyebrow: "Alana göre bağış yapın",
    sectionTitle: "Projelere kategoriye göre göz atın",
    sectionLead: "Kalbinize en yakın alanı seçin ve projelerini doğrudan destekleyin.",
    explore: "Keşfet",
    projectsCount: "{count, plural, =0 {Henüz proje yok} other {# proje}}",
  },
  fr: {
    showMore: "Afficher plus ({count})",
    showLess: "Afficher moins",
    title: "Catégories de projets",
    toggle: "Afficher les catégories de projets",
    sectionEyebrow: "Donner par cause",
    sectionTitle: "Parcourir les projets par catégorie",
    sectionLead: "Choisissez la cause la plus proche de votre cœur et soutenez directement ses projets.",
    explore: "Découvrir",
    projectsCount: "{count, plural, =0 {Aucun projet pour l'instant} one {# projet} other {# projets}}",
  },
  de: {
    showMore: "Mehr anzeigen ({count})",
    showLess: "Weniger anzeigen",
    title: "Projektkategorien",
    toggle: "Projektkategorien anzeigen",
    sectionEyebrow: "Nach Anliegen spenden",
    sectionTitle: "Projekte nach Kategorie durchsuchen",
    sectionLead: "Wählen Sie das Anliegen, das Ihnen am meisten am Herzen liegt, und unterstützen Sie seine Projekte direkt.",
    explore: "Entdecken",
    projectsCount: "{count, plural, =0 {Noch keine Projekte} one {# Projekt} other {# Projekte}}",
  },
  es: {
    showMore: "Mostrar más ({count})",
    showLess: "Mostrar menos",
    title: "Categorías de proyectos",
    toggle: "Mostrar categorías de proyectos",
    sectionEyebrow: "Dona por causa",
    sectionTitle: "Explora los proyectos por categoría",
    sectionLead: "Elige la causa más cercana a tu corazón y apoya sus proyectos directamente.",
    explore: "Explorar",
    projectsCount: "{count, plural, =0 {Aún no hay proyectos} one {# proyecto} other {# proyectos}}",
  },
  pt: {
    showMore: "Mostrar mais ({count})",
    showLess: "Mostrar menos",
    title: "Categorias de projetos",
    toggle: "Mostrar categorias de projetos",
    sectionEyebrow: "Doe por causa",
    sectionTitle: "Explore os projetos por categoria",
    sectionLead: "Escolha a causa mais próxima do seu coração e apoie diretamente os seus projetos.",
    explore: "Explorar",
    projectsCount: "{count, plural, =0 {Ainda sem projetos} one {# projeto} other {# projetos}}",
  },
  id: {
    showMore: "Tampilkan lebih banyak ({count})",
    showLess: "Tampilkan lebih sedikit",
    title: "Kategori proyek",
    toggle: "Tampilkan kategori proyek",
    sectionEyebrow: "Berdonasi per bidang",
    sectionTitle: "Jelajahi proyek berdasarkan kategori",
    sectionLead: "Pilih bidang yang paling dekat dengan hati Anda dan dukung proyek-proyeknya secara langsung.",
    explore: "Jelajahi",
    projectsCount: "{count, plural, =0 {Belum ada proyek} other {# proyek}}",
  },
  ms: {
    showMore: "Tunjuk lagi ({count})",
    showLess: "Tunjuk kurang",
    title: "Kategori projek",
    toggle: "Tunjukkan kategori projek",
    sectionEyebrow: "Menderma mengikut bidang",
    sectionTitle: "Semak imbas projek mengikut kategori",
    sectionLead: "Pilih bidang yang paling dekat di hati anda dan sokong projek-projeknya secara terus.",
    explore: "Teroka",
    projectsCount: "{count, plural, =0 {Belum ada projek} other {# projek}}",
  },
  ur: {
    showMore: "مزید دکھائیں ({count})",
    showLess: "کم دکھائیں",
    title: "منصوبوں کی اقسام",
    toggle: "منصوبوں کی اقسام دکھائیں",
    sectionEyebrow: "شعبے کے لحاظ سے عطیہ کریں",
    sectionTitle: "منصوبوں کو قسم کے لحاظ سے دیکھیں",
    sectionLead: "وہ شعبہ چنیں جو آپ کے دل کے سب سے قریب ہے اور اس کے منصوبوں کی براہِ راست مدد کریں۔",
    explore: "دیکھیں",
    projectsCount: "{count, plural, =0 {ابھی کوئی منصوبہ نہیں} one {# منصوبہ} other {# منصوبے}}",
  },
  hi: {
    showMore: "और दिखाएँ ({count})",
    showLess: "कम दिखाएँ",
    title: "परियोजना श्रेणियाँ",
    toggle: "परियोजना श्रेणियाँ दिखाएँ",
    sectionEyebrow: "उद्देश्य के अनुसार दान करें",
    sectionTitle: "श्रेणी के अनुसार परियोजनाएँ देखें",
    sectionLead: "वह उद्देश्य चुनें जो आपके दिल के सबसे क़रीब है और उसकी परियोजनाओं का सीधे समर्थन करें।",
    explore: "देखें",
    projectsCount: "{count, plural, =0 {अभी कोई परियोजना नहीं} one {# परियोजना} other {# परियोजनाएँ}}",
  },
  zh: {
    showMore: "显示更多（{count}）",
    showLess: "收起",
    title: "项目分类",
    toggle: "显示项目分类",
    sectionEyebrow: "按领域捐赠",
    sectionTitle: "按分类浏览项目",
    sectionLead: "选择最触动您的领域，直接支持其项目。",
    explore: "查看",
    projectsCount: "{count, plural, =0 {暂无项目} other {# 个项目}}",
  },
  ja: {
    showMore: "もっと見る（{count}）",
    showLess: "閉じる",
    title: "プロジェクトのカテゴリー",
    toggle: "プロジェクトのカテゴリーを表示",
    sectionEyebrow: "分野別に寄付する",
    sectionTitle: "カテゴリー別にプロジェクトを見る",
    sectionLead: "あなたの心に最も近い分野を選び、そのプロジェクトを直接支援してください。",
    explore: "見る",
    projectsCount: "{count, plural, =0 {プロジェクトはまだありません} other {# 件のプロジェクト}}",
  },
  it: {
    showMore: "Mostra altro ({count})",
    showLess: "Mostra meno",
    title: "Categorie di progetti",
    toggle: "Mostra le categorie di progetti",
    sectionEyebrow: "Dona per causa",
    sectionTitle: "Sfoglia i progetti per categoria",
    sectionLead: "Scegli la causa più vicina al tuo cuore e sostieni direttamente i suoi progetti.",
    explore: "Scopri",
    projectsCount: "{count, plural, =0 {Ancora nessun progetto} one {# progetto} other {# progetti}}",
  },
  nl: {
    showMore: "Meer tonen ({count})",
    showLess: "Minder tonen",
    title: "Projectcategorieën",
    toggle: "Projectcategorieën tonen",
    sectionEyebrow: "Geef per doel",
    sectionTitle: "Bekijk projecten per categorie",
    sectionLead: "Kies het doel dat u het meest aan het hart gaat en steun de projecten ervan rechtstreeks.",
    explore: "Ontdekken",
    projectsCount: "{count, plural, =0 {Nog geen projecten} one {# project} other {# projecten}}",
  },
  sv: {
    showMore: "Visa fler ({count})",
    showLess: "Visa färre",
    title: "Projektkategorier",
    toggle: "Visa projektkategorier",
    sectionEyebrow: "Ge efter ändamål",
    sectionTitle: "Bläddra bland projekt efter kategori",
    sectionLead: "Välj det ändamål som ligger dig närmast om hjärtat och stöd dess projekt direkt.",
    explore: "Utforska",
    projectsCount: "{count, plural, =0 {Inga projekt ännu} one {# projekt} other {# projekt}}",
  },
  no: {
    showMore: "Vis flere ({count})",
    showLess: "Vis færre",
    title: "Prosjektkategorier",
    toggle: "Vis prosjektkategorier",
    sectionEyebrow: "Gi etter formål",
    sectionTitle: "Bla gjennom prosjekter etter kategori",
    sectionLead: "Velg formålet som ligger deg nærmest hjertet, og støtt prosjektene direkte.",
    explore: "Utforsk",
    projectsCount: "{count, plural, =0 {Ingen prosjekter ennå} one {# prosjekt} other {# prosjekter}}",
  },
  da: {
    showMore: "Vis flere ({count})",
    showLess: "Vis færre",
    title: "Projektkategorier",
    toggle: "Vis projektkategorier",
    sectionEyebrow: "Giv efter formål",
    sectionTitle: "Gennemse projekter efter kategori",
    sectionLead: "Vælg det formål, der ligger dit hjerte nærmest, og støt dets projekter direkte.",
    explore: "Udforsk",
    projectsCount: "{count, plural, =0 {Ingen projekter endnu} one {# projekt} other {# projekter}}",
  },
  sq: {
    showMore: "Shfaq më shumë ({count})",
    showLess: "Shfaq më pak",
    title: "Kategoritë e projekteve",
    toggle: "Shfaq kategoritë e projekteve",
    sectionEyebrow: "Dhuro sipas kauzës",
    sectionTitle: "Shfleto projektet sipas kategorisë",
    sectionLead: "Zgjidh kauzën më të afërt me zemrën tënde dhe mbështet drejtpërdrejt projektet e saj.",
    explore: "Eksploro",
    projectsCount: "{count, plural, =0 {Ende pa projekte} one {# projekt} other {# projekte}}",
  },
};

let written = 0;
for (const locale of Object.keys(CATEGORY_NAV)) {
  const file = `i18n/messages/${locale}.json`;
  const json = JSON.parse(readFileSync(file, "utf8"));
  json.CategoryNav = CATEGORY_NAV[locale];
  writeFileSync(file, `${JSON.stringify(json, null, 2)}\n`, "utf8");
  written += 1;
}
console.log(`[category-nav-messages] wrote CategoryNav namespace to ${written} locale files`);
