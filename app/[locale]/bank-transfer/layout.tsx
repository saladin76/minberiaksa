import type { Metadata } from "next";
import { buildPageMetadata, LOCALE_SEO, type Locale } from "@/lib/seo";

/**
 * Partial by design: the lookup below already falls back to `en`, and the
 * locales added with the Minbar port have no hand-written copy for this page
 * yet. A full `Record` would force placeholder text into 11 languages, which is
 * worse for search than the English fallback.
 */
type PageSeo = { title: string; description: string };
const BANK_TRANSFER_SEO: { en: PageSeo } & Partial<Record<Locale, PageSeo>> = {
  ar: {
    title: "التبرع عبر التحويل البنكي | جمعية منبر الأقصي",
    description: "اطّلع على حسابات جمعية منبر الأقصي البنكية وتبرع بأمان عبر التحويل البنكي لدعم المشاريع الإنسانية والطبية والتعليمية.",
  },
  en: {
    title: "Donate by Bank Transfer | Minberiaksa",
    description: "View Minberiaksa bank accounts and complete your donation safely by bank transfer to support humanitarian, medical, and educational projects.",
  },
  fr: {
    title: "Faire un don par virement bancaire | Minberiaksa",
    description: "Consultez les comptes bancaires de Minberiaksa et effectuez votre don en toute sécurité par virement bancaire pour soutenir nos projets humanitaires.",
  },
  tr: {
    title: "Banka Havalesi ile Bağış | Minberiaksa Derneği",
    description: "Minberiaksa Derneği banka hesaplarını görüntüleyin ve insani, tıbbi ve eğitim projelerine güvenle havale yoluyla bağış yapın.",
  },
  id: {
    title: "Donasi melalui Transfer Bank | Minberiaksa",
    description: "Lihat rekening bank Minberiaksa dan selesaikan donasi Anda dengan aman melalui transfer bank untuk mendukung program kemanusiaan.",
  },
  pt: {
    title: "Doar por transferência bancária | Minberiaksa",
    description: "Veja as contas bancárias da Minberiaksa e conclua a sua doação com segurança por transferência bancária para apoiar projetos humanitários.",
  },
  es: {
    title: "Donar por transferencia bancaria | Minberiaksa",
    description: "Consulta las cuentas bancarias de Minberiaksa y completa tu donación de forma segura mediante transferencia bancaria para apoyar proyectos humanitarios.",
  },
  de: {
    title: "Per Banküberweisung spenden | Minberiaksa",
    description: "Sieh dir die Bankkonten von Minberiaksa an und schließe deine Spende sicher per Banküberweisung ab, um humanitäre Projekte zu unterstützen.",
  },
};

interface Props {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: Pick<Props, "params">): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale = (rawLocale in LOCALE_SEO ? rawLocale : "en") as Locale;
  const seo = BANK_TRANSFER_SEO[locale] ?? BANK_TRANSFER_SEO.en;

  return buildPageMetadata(locale, {
    title: seo.title,
    description: seo.description,
    path: "/bank-transfer",
    keywords: LOCALE_SEO[locale].keywords,
  });
}

export default function BankTransferLayout({ children }: Props) {
  return children;
}
