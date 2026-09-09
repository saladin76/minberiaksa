import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/options';
import { userHasDashboardPermission } from '@/lib/dashboard/permissions';
import jsPDF from 'jspdf';
import { format } from 'date-fns';
import type { Locale } from 'date-fns';
import { arSA, enUS, fr, tr, id, pt, es } from 'date-fns/locale';

const DATE_LOCALES: Record<string, Locale> = { ar: arSA, en: enUS, fr, tr, id, pt, es };

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  TRY: '₺',
  SAR: 'ر.س',
  AED: 'د.إ',
};

const RECEIPT_LABELS = {
  en: {
    title: 'Donation Receipt',
    orgName: 'GBYD Association',
    receiptNo: 'Receipt No',
    date: 'Date',
    time: 'Time',
    donorInfo: 'Donor Information',
    name: 'Name',
    email: 'Email',
    phone: 'Phone',
    country: 'Country',
    cityRegion: 'City / Region',
    donationDetails: 'Donation Details',
    donatedTo: 'Your donation supports',
    type: 'Type',
    oneTime: 'One-time',
    monthly: 'Monthly',
    paymentMethod: 'Payment Method',
    card: 'Card',
    paypal: 'PayPal',
    status: 'Status',
    active: 'Active',
    paused: 'Paused',
    cancelled: 'Cancelled',
    campaign: 'Campaign',
    category: 'Category',
    amount: 'Amount',
    subtotal: 'Subtotal',
    teamSupport: 'Team Support',
    fees: 'Transaction Fees',
    total: 'Total',
    nextBilling: 'Next billing date',
    thankYou: 'Thank you for your generous donation.',
    thankYouFrom: 'With gratitude,\nMinberiaksa Relief and Solidarity Association',
    thankYouMessage: 'Your kindness brings hope and relief to those in need. Together we are making a lasting difference in the lives of children and families. This receipt confirms your support we are deeply grateful.',
    footer: 'This is an official receipt. For questions, contact support.',
  },
  ar: {
    title: 'إيصال تبرع',
    orgName: 'منبر الأقصي',
    receiptNo: 'رقم الإيصال',
    date: 'التاريخ',
    time: 'الوقت',
    donorInfo: 'معلومات المتبرع',
    name: 'الاسم',
    email: 'البريد الإلكتروني',
    phone: 'الهاتف',
    country: 'الدولة',
    cityRegion: 'المدينة / المنطقة',
    donationDetails: 'تفاصيل التبرع',
    donatedTo: 'تبرعكم يدعم',
    type: 'النوع',
    oneTime: 'مرة واحدة',
    monthly: 'شهري',
    paymentMethod: 'طريقة الدفع',
    card: 'بطاقة',
    paypal: 'باي بال',
    status: 'الحالة',
    active: 'نشط',
    paused: 'متوقف مؤقتاً',
    cancelled: 'ملغي',
    campaign: 'المشروع',
    category: 'الفئة',
    amount: 'المبلغ',
    subtotal: 'المجموع الفرعي',
    teamSupport: 'دعم الفريق',
    fees: 'الرسوم',
    total: 'الإجمالي',
    nextBilling: 'تاريخ الخصم القادم',
    thankYou: 'شكراً لتبرعكم السخي.',
    thankYouFrom: 'بامتنان،\nجمعية منبر الأقصي للإغاثة والتضامن',
    thankYouMessage: 'لطفكم يبعث الأمل والإغاثة لمن هم في حاجة. معاً نصنع فرقاً دائمياً في حياة الأطفال والأسر. هذا الإيصال يؤكد دعمكم نحن ممتنون جداً.',
    footer: 'هذا إيصال رسمي. للاستفسارات يرجى التواصل مع الدعم.',
  },
  fr: {
    title: 'Reçu de don',
    orgName: 'GBYD Association',
    receiptNo: 'N° de reçu',
    date: 'Date',
    time: 'Heure',
    donorInfo: 'Informations du donateur',
    name: 'Nom',
    email: 'E-mail',
    phone: 'Téléphone',
    country: 'Pays',
    cityRegion: 'Ville / Région',
    donationDetails: 'Détails du don',
    donatedTo: 'Votre don soutient',
    type: 'Type',
    oneTime: 'Ponctuel',
    monthly: 'Mensuel',
    paymentMethod: 'Mode de paiement',
    card: 'Carte',
    paypal: 'PayPal',
    status: 'Statut',
    active: 'Actif',
    paused: 'En pause',
    cancelled: 'Annulé',
    campaign: 'Campagne',
    category: 'Catégorie',
    amount: 'Montant',
    subtotal: 'Sous-total',
    teamSupport: 'Soutien équipe',
    fees: 'Frais',
    total: 'Total',
    nextBilling: 'Prochaine date de prélèvement',
    thankYou: 'Merci pour votre généreux don.',
    thankYouFrom: 'Avec gratitude,\nMinberiaksa – Association de secours et de solidarité',
    thankYouMessage: 'Votre générosité apporte espoir et réconfort à ceux qui en ont besoin. Ensemble nous faisons une différence durable dans la vie des enfants et des familles. Ce reçu confirme votre soutien—nous vous en sommes profondément reconnaissants.',
    footer: 'Ceci est un reçu officiel. Pour toute question, contactez le support.',
  },
} as const;

type LocaleKey = keyof typeof RECEIPT_LABELS;

/** When locale is ar, return each label as "Arabic / English" for bilingual receipt */
function getLabels(locale: string): Record<string, string> {
  const key = (locale in RECEIPT_LABELS ? locale : 'en') as LocaleKey;
  const L = RECEIPT_LABELS[key];
  const L_en = RECEIPT_LABELS.en;
  if (key === 'ar') {
    const dual: Record<string, string> = {};
    (Object.keys(L) as (keyof typeof L)[]).forEach((k) => {
      dual[k] = `${L[k]} / ${L_en[k]}`;
    });
    return dual;
  }
  return { ...L };
}

function getDateLocale(locale: string) {
  const key = (locale in DATE_LOCALES ? locale : 'en') as LocaleKey;
  return DATE_LOCALES[key];
}

function currencyFormat(amount: number, currency: string) {
  const sym = CURRENCY_SYMBOLS[currency] ?? currency + ' ';
  return `${sym} ${amount.toFixed(2)}`;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: 'Donation ID required' }, { status: 400 });
    }
    const requestedLocale = (request.nextUrl.searchParams.get('locale') || 'en').slice(0, 2);
    let locale = requestedLocale as LocaleKey;

    /**
     * Set to true only once an Arabic-capable TTF is registered with jsPDF
     * (doc.addFileToVFS + doc.addFont) AND text is shaped for RTL. Flipping this alone is not
     * enough — it is the single switch that turns the Arabic path back on, so both halves stay
     * together instead of drifting.
     */
    const ARABIC_PDF_FONT_AVAILABLE = false;

    // Force English receipt if Arabic to avoid RTL/font issues.
    //
    // This is DELIBERATE, not an oversight: the PDF is drawn with jsPDF's built-in helvetica,
    // which has no Arabic glyphs. Rendering `ar` without embedding an Arabic TTF produces
    // boxes/garbage, so an English receipt is the better failure mode.
    //
    // Consequences, so nobody "fixes" one half and ships broken PDFs:
    //   - `isRtl` below is therefore ALWAYS false (see the note there).
    //   - the bilingual "Arabic / English" branch in getLabels() is unreachable for the same
    //     reason — it is kept for the day a font is embedded.
    // Making Arabic receipts genuinely Arabic requires doc.addFileToVFS + doc.addFont with an
    // Arabic-capable TTF and a shaping pass; that is a feature, not a cleanup. Until then this
    // line is what keeps receipts readable.
    if (!ARABIC_PDF_FONT_AVAILABLE && locale === 'ar') {
      locale = 'en';
    }
    const session = await getServerSession(authOptions);

    const donationRow = await prisma.donation.findUnique({
      where: { id },
      omit: { cardDetails: true },
      include: {
        donor: {
          select: {
            name: true,
            email: true,
            phone: true,
            country: true,
            countryName: true,
            countryCode: true,
            city: true,
            region: true,
          },
        },
        subscription: {
          select: {
            status: true,
            nextBillingDate: true,
            lastBillingDate: true,
          },
        },
        items: {
          include: {
            campaign: {
              select: {
                title: true,
                description: true,
                translations: { select: { locale: true, title: true, description: true } },
              },
            },
          },
        },
        categoryItems: {
          include: {
            category: {
              select: {
                name: true,
                translations: { select: { locale: true, name: true } },
              },
            },
          },
        },
      },
    });

    if (!donationRow) {
      return NextResponse.json({ error: 'Donation not found' }, { status: 404 });
    }

    // Guest donations have no session — the unguessable donation id acts as
    // the access token. For authenticated users, keep ownership/revenue-admin
    // enforcement to prevent cross-account receipt access.
    if (session) {
      const canViewReceipt =
        userHasDashboardPermission(session.user, 'revenue') ||
        session.user.id === donationRow.donorId;
      if (!canViewReceipt) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    const sub = donationRow.subscription;
    const donation = {
      ...donationRow,
      type: donationRow.subscriptionId ? ('MONTHLY' as const) : ('ONE_TIME' as const),
      status: sub?.status ?? null,
      nextBillingDate: sub?.nextBillingDate ?? null,
    };

    const L = getLabels(locale);
    const dateLocale = getDateLocale(locale);
    // Derived from the ORIGINAL request, not the coerced `locale` (which can no longer be
    // 'ar', so comparing it was dead code that also failed to typecheck). Always false while
    // ARABIC_PDF_FONT_AVAILABLE is false; the RTL layout below is kept wired up so it works
    // the moment the font lands.
    const isRtl = ARABIC_PDF_FONT_AVAILABLE && requestedLocale === 'ar';
    const receiptShortId = id;

    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    const pageW = 210;
    const margin = 20;
    const contentW = pageW - margin * 2;
    let y = 0;

    const addText = (text: string, x: number, yVal: number, opts?: { align?: 'left' | 'center' | 'right'; font?: 'normal' | 'bold'; size?: number }) => {
      doc.setFont('helvetica', opts?.font || 'normal');
      doc.setFontSize(opts?.size ?? 10);
      doc.text(text, x, yVal, { align: opts?.align || 'left' });
    };

    const addLine = (yVal: number) => {
      doc.setDrawColor(220, 220, 220);
      doc.line(margin, yVal, pageW - margin, yVal);
    };

    // ----- Header block -----
    doc.setFillColor(15, 23, 42); // slate-900
    doc.rect(0, 0, pageW, 40, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(L.orgName, pageW / 2, 14, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.text(L.title, pageW / 2, 34, { align: 'center' });
    doc.setTextColor(0, 0, 0);
    y = 48;

    // Receipt No & Date
    addText(`${L.receiptNo}: ${receiptShortId}`, isRtl ? pageW - margin : margin, y, { font: 'bold', align: isRtl ? 'right' : 'left' });
    const created = new Date(donation.createdAt);
    const dateStr = format(created, 'PPP', { locale: dateLocale });
    const timeStr = format(created, 'HH:mm', { locale: dateLocale });
    addText(`${L.date}: ${dateStr}  |  ${L.time}: ${timeStr}`, isRtl ? margin : pageW - margin, y, { align: isRtl ? 'left' : 'right' });
    y += 12;

    addLine(y);
    y += 14;

    // ----- Donor -----
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setFillColor(248, 250, 252);
    doc.rect(margin, y - 4, contentW, 10, 'F');
    addText(L.donorInfo, margin + 4, y + 2);
    y += 14;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    addText(`${L.name}: ${donation.donor.name ?? '—'}`, margin, y);
    y += 7;
    addText(`${L.email}: ${donation.donor.email ?? '—'}`, margin, y);
    y += 7;
    if (donation.donor.phone) {
      addText(`${L.phone}: ${donation.donor.phone}`, margin, y);
      y += 7;
    }
    const donorCountryLine =
      donation.donor.countryName?.trim() ||
      donation.donor.country?.trim() ||
      '';
    if (donorCountryLine) {
      addText(`${L.country}: ${donorCountryLine}`, margin, y);
      y += 7;
    }
    const donorCityRegion = [donation.donor.city?.trim(), donation.donor.region?.trim()]
      .filter(Boolean)
      .join(', ');
    if (donorCityRegion) {
      addText(`${L.cityRegion}: ${donorCityRegion}`, margin, y);
      y += 7;
    }
    y += 10;

    // ----- Donation type & payment & status -----
    doc.setFillColor(248, 250, 252);
    doc.rect(margin, y - 4, contentW, 10, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    addText(L.donationDetails, margin + 4, y + 2);
    y += 14;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    const typeLabel = donation.type === 'MONTHLY' ? L.monthly : L.oneTime;
    const paymentLabel = donation.paymentMethod === 'PAYPAL' ? L.paypal : L.card;
    addText(`${L.type}: ${typeLabel}  |  ${L.paymentMethod}: ${paymentLabel}`, margin, y);
    y += 7;
    if (donation.type === 'MONTHLY') {
      const statusLabel = donation.status === 'ACTIVE' ? L.active : donation.status === 'PAUSED' ? L.paused : L.cancelled;
      addText(`${L.status}: ${statusLabel}`, margin, y);
      y += 7;
    }
    y += 10;

    // Helpers for campaign/category titles (used in Donated to + line items table)
    const getCampaignTitle = (c: { title: string; translations?: { locale: string; title: string }[] }) => {
      const t = c.translations?.find((tr) => tr.locale === locale);
      return t?.title ?? c.title;
    };
    const getCampaignDesc = (c: { description?: string | null; translations?: { locale: string; description?: string | null }[] }) => {
      const t = c.translations?.find((tr) => tr.locale === locale);
      const desc = t?.description ?? c.description;
      return desc ?? '';
    };
    const getCategoryName = (c: { name: string; translations?: { locale: string; name: string }[] }) => {
      const t = c.translations?.find((tr) => tr.locale === locale);
      return t?.name ?? c.name;
    };

    // ----- Donated to (campaigns & categories) -----
    const hasDonatedTo = donation.items.length > 0 || donation.categoryItems.length > 0;
    if (hasDonatedTo) {
      doc.setFillColor(248, 250, 252);
      doc.rect(margin, y - 4, contentW, 10, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      addText(L.donatedTo || 'Your donation supports', margin + 4, y + 2);
      y += 14;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      donation.items.forEach((item) => {
        if (item.campaign) {
          const title = getCampaignTitle(item.campaign);
          addText('• ' + title, margin, y + 4);
          y += 7;
          const desc = getCampaignDesc(item.campaign);
          if (desc) {
            const lines = doc.splitTextToSize(desc, contentW - 12);
            lines.slice(0, 3).forEach((line: string) => {
              addText(line, margin + 6, y + 4);
              y += 6;
            });
            y += 2;
          }
        }
      });
      donation.categoryItems.forEach((catItem) => {
        if (catItem.category) {
          addText('• ' + getCategoryName(catItem.category) + ' (' + (L.category || 'Category') + ')', margin, y + 4);
          y += 7;
        }
      });
      y += 8;
    }

    // ----- Line items table -----
    const col1 = margin + 4;
    const col2 = pageW - margin - 4;
    doc.setFillColor(241, 245, 249);
    doc.rect(margin, y - 2, contentW, 8, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    addText(L.campaign + ' / ' + L.category, col1, y + 4);
    addText(L.amount, col2, y + 4, { align: 'right' });
    y += 10;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);

    donation.items.forEach((item) => {
      const title = item.campaign ? getCampaignTitle(item.campaign) : '—';
      addText(title, col1, y + 4);
      addText(currencyFormat(item.amount, donation.currency), col2, y + 4, { align: 'right' });
      y += 8;
    });
    donation.categoryItems.forEach((catItem) => {
      const name = catItem.category ? getCategoryName(catItem.category) : '—';
      addText(name + ' (' + L.category + ')', col1, y + 4);
      addText(currencyFormat(catItem.amount, donation.currency), col2, y + 4, { align: 'right' });
      y += 8;
    });

    y += 8;
    addLine(y);
    y += 12;

    // ----- Totals -----
    addText(`${L.subtotal}:`, col1, y);
    addText(currencyFormat(donation.amount, donation.currency), col2, y, { align: 'right' });
    y += 8;
    if ((donation.teamSupport ?? 0) > 0) {
      addText(`${L.teamSupport}:`, col1, y);
      addText(currencyFormat(donation.teamSupport!, donation.currency), col2, y, { align: 'right' });
      y += 8;
    }
    if ((donation.fees ?? 0) > 0) {
      addText(`${L.fees}:`, col1, y);
      addText(currencyFormat(donation.fees!, donation.currency), col2, y, { align: 'right' });
      y += 8;
    }
    addLine(y);
    y += 10;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    addText(`${L.total}:`, col1, y);
    addText(currencyFormat(donation.totalAmount, donation.currency), col2, y, { align: 'right' });
    y += 12;

    if (donation.type === 'MONTHLY' && donation.status === 'ACTIVE') {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      if (donation.nextBillingDate) {
        addText(`${L.nextBilling}: ${format(new Date(donation.nextBillingDate), 'PPP', { locale: dateLocale })}`, margin, y);
        y += 7;
      }
      y += 6;
    }

    // ----- Thank you (charming message from Minberiaksa) -----
    y += 10;
    addLine(y);
    y += 12;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(30, 64, 175);
    const thankYouMsg = (L.thankYouMessage ?? L.thankYou) as string;
    const thankYouLines = doc.splitTextToSize(thankYouMsg, contentW);
    thankYouLines.forEach((line: string) => {
      addText(line, pageW / 2, y, { align: 'center' });
      y += 6;
    });
    y += 8;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    const signOff = (L.thankYouFrom ?? 'With gratitude, Minberiaksa') as string;
    const signOffLines = signOff.split('\n');
    signOffLines.forEach((line: string) => {
      addText(line, pageW / 2, y, { align: 'center' });
      y += 7;
    });
    doc.setTextColor(0, 0, 0);
    y += 10;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    addText(L.footer, pageW / 2, y, { align: 'center' });

    const pdfBuffer = doc.output('arraybuffer');

    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="receipt-${receiptShortId}.pdf"`,
      },
    });
  } catch (error) {
    console.error('Error generating receipt:', error);
    return NextResponse.json({ error: 'Failed to generate receipt' }, { status: 500 });
  }
}
