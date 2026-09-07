type MessageValue = string | number | boolean | null | MessageObject | MessageValue[];
export type MessageObject = { [key: string]: MessageValue };

export type LocaleMessages = Record<string, MessageObject>;

type CorrectionMap = Record<string, MessageValue>;

const EMPTY_TEXT_RE = /^\s*$/;

function isObject(value: unknown): value is MessageObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cloneValue<T extends MessageValue>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => cloneValue(item)) as T;
  if (isObject(value)) return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, cloneValue(v)])) as T;
  return value;
}

function pathGet(obj: MessageObject, path: string): MessageValue | undefined {
  const parts = path.split(".");
  let current: MessageValue | undefined = obj;
  for (const part of parts) {
    if (!isObject(current)) return undefined;
    current = current[part];
  }
  return current;
}

function pathSet(obj: MessageObject, path: string, value: MessageValue) {
  const parts = path.split(".");
  let current: MessageObject = obj;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const key = parts[i];
    if (!isObject(current[key])) current[key] = {};
    current = current[key] as MessageObject;
  }
  current[parts[parts.length - 1]] = cloneValue(value);
}

function mergeMissing(base: MessageValue, fallback: MessageValue): MessageValue {
  if (typeof base === "string") {
    if (!EMPTY_TEXT_RE.test(base)) return base;
    return typeof fallback === "string" ? fallback : base;
  }
  if (base == null) return cloneValue(fallback);
  if (Array.isArray(base)) {
    if (base.length > 0) return base.map((item, idx) => mergeMissing(item, Array.isArray(fallback) ? fallback[idx] : undefined));
    return Array.isArray(fallback) ? cloneValue(fallback) : base;
  }
  if (isObject(base) && isObject(fallback)) {
    const out: MessageObject = { ...base };
    for (const [key, fallbackValue] of Object.entries(fallback)) {
      out[key] = key in out ? mergeMissing(out[key], fallbackValue) : cloneValue(fallbackValue);
    }
    return out;
  }
  return base;
}

function applyCorrections(messages: MessageObject, corrections: CorrectionMap): MessageObject {
  const out = cloneValue(messages);
  for (const [path, value] of Object.entries(corrections)) {
    pathSet(out, path, value);
  }
  return out;
}

const AR_CORRECTIONS: CorrectionMap = {
  "Navbar.events": "الأنشطة والفعاليات",
  "HomePage.newsSubtitle": "آخر أخبار جمعيتنا",
  "CampaignsSlider.sharesMode": "أسهم — {currency}{price} للسهم",
  "QuickDonate.hadithQuote": "قال رسول الله ﷺ",
  "QuickDonate.customAmount": "أو أدخل مبلغًا مخصصًا",
  "Footer.description": "جمعية يدي جيهان الدولية للتضامن جمعية عاملة للنفع العام، تقف إلى جانب المحتاجين منذ عام 1961 في مجالات الصحة والإغاثة العاجلة والاستجابة للكوارث والتعليم.",
  "AboutUs.ctaTitle": "كن جزءًا من التغيير",
  "AboutUs.ctaDesc": "انضم إلينا في رحلتنا لبناء مستقبل أفضل للأطفال حول العالم.",
  "ContactUs.successMessage": "شكرًا لتواصلك معنا، سنرد عليك قريبًا.",
  "Campaign.campaignStats": "إحصائيات المشروع",
  "Campaign.notFound": "المشروع غير موجود",
  "Campaign.campaignNotFound": "المشروع غير موجود",
  "DonationSuccess.campaignsAndCategoriesDonatedTo": "المشاريع والمجالات التي تبرعت لها",
};

const EN_CORRECTIONS: CorrectionMap = {
  "Navbar.donate": "Donate Now",
  "HomePage.donationCategories": "Donation Areas",
  "HomePage.faq2Question": "Is volunteering with the Yedicihan team paid?",
  "HomePage.featuredProjects": "Featured Projects",
  "HomePage.weHelp": "We Help",
  "HomePage.latestNews": "Latest News",
  "CampaignsSlider.sharesMode": "Shares — {currency}{price} per share",
  "QuickDonate.description": "Make your giving continuous and help change the lives of people in need. Your monthly commitment increases the impact of every donation and sustains our charitable work.",
  "QuickDonate.monthlyCommitment": "Commit to a Monthly Donation",
  "Footer.description": "Yedicihan International Solidarity Association is a public-benefit association that has stood beside people in need since 1961, working in healthcare, emergency relief, disaster response and education.",
  "Campaign.campaignStats": "Project Statistics",
  "Campaign.notFound": "Project not found",
  "Campaign.campaignNotFound": "Project Not Found",
  "Campaign.errorOccurred": "An error occurred. Please try again.",
  "DonationDialog.chooseDonationTypeDesc": "Choose a one-time or monthly donation.",
  "DonationDialog.oneTimeDonationDesc": "Make a one-time donation to this project.",
  "DonationDialog.monthlyDonationDesc": "Support this project with a monthly donation.",
  "DonationDialog.hadithQuote": "The Messenger of Allah ﷺ said:",
  "DonationDialog.hadithText": "Allah says: Spend, O son of Adam, and I shall spend on you.",
  "DonationDialog.confirmationDesc": "Review your donation",
  "DonationSuccess.campaignsAndCategoriesDonatedTo": "Campaigns and Categories You Donated To",
};

const TR_CORRECTIONS: CorrectionMap = {
  "Navbar.donate": "Şimdi Bağış Yap",
  "Navbar.donateNow": "Şimdi Bağış Yap",
  "Navbar.projects": "Projeler",
  "Navbar.news": "Haberler",
  "Navbar.about": "Hakkımızda",
  "Navbar.contact": "İletişim",
  "HomePage.featuredProjects": "Öne Çıkan Projeler",
  "HomePage.currentProjects": "Güncel Projeler",
  "Campaign.campaignStats": "Proje İstatistikleri",
  "Campaign.notFound": "Proje bulunamadı",
  "Campaign.campaignNotFound": "Proje Bulunamadı",
  "DonationDialog.confirmDonation": "Bağışı Onayla",
  "DonationDialog.donationFailed": "Bağış başarısız oldu",
  "DonationSuccess.thankYou": "Çok teşekkür ederiz",
};

const FR_CORRECTIONS: CorrectionMap = {
  "Navbar.donate": "Faire un don",
  "Navbar.donateNow": "Faire un don",
  "Navbar.projects": "Projets",
  "Navbar.news": "Actualités",
  "Navbar.about": "Qui sommes-nous ?",
  "Navbar.contact": "Contact",
  "HomePage.featuredProjects": "Projets à la une",
  "HomePage.currentProjects": "Projets en cours",
  "Campaign.campaignStats": "Statistiques du projet",
  "Campaign.notFound": "Projet introuvable",
  "Campaign.campaignNotFound": "Projet introuvable",
  "DonationDialog.confirmDonation": "Confirmer le don",
  "DonationDialog.donationFailed": "Le don a échoué",
  "DonationSuccess.thankYou": "Merci beaucoup",
};

const ID_CORRECTIONS: CorrectionMap = {
  "Navbar.donate": "Donasi Sekarang",
  "Navbar.donateNow": "Donasi Sekarang",
  "Navbar.projects": "Proyek",
  "Navbar.news": "Berita",
  "Navbar.about": "Tentang Kami",
  "Navbar.contact": "Kontak",
  "HomePage.featuredProjects": "Proyek Unggulan",
  "HomePage.currentProjects": "Proyek Saat Ini",
  "Campaign.campaignStats": "Statistik Proyek",
  "Campaign.notFound": "Proyek tidak ditemukan",
  "Campaign.campaignNotFound": "Proyek Tidak Ditemukan",
  "DonationDialog.confirmDonation": "Konfirmasi Donasi",
  "DonationDialog.donationFailed": "Donasi gagal",
  "DonationSuccess.thankYou": "Terima kasih banyak",
};

const PT_CORRECTIONS: CorrectionMap = {
  "Navbar.donate": "Doar agora",
  "Navbar.donateNow": "Doar agora",
  "Navbar.projects": "Projetos",
  "Navbar.news": "Notícias",
  "Navbar.about": "Sobre nós",
  "Navbar.contact": "Contato",
  "HomePage.featuredProjects": "Projetos em destaque",
  "HomePage.currentProjects": "Projetos atuais",
  "Campaign.campaignStats": "Estatísticas do projeto",
  "Campaign.notFound": "Projeto não encontrado",
  "Campaign.campaignNotFound": "Projeto não encontrado",
  "DonationDialog.confirmDonation": "Confirmar doação",
  "DonationDialog.donationFailed": "A doação falhou",
  "DonationSuccess.thankYou": "Muito obrigado",
};

const ES_CORRECTIONS: CorrectionMap = {
  "Navbar.donate": "Donar ahora",
  "Navbar.donateNow": "Donar ahora",
  "Navbar.projects": "Proyectos",
  "Navbar.news": "Noticias",
  "Navbar.about": "Quiénes somos",
  "Navbar.contact": "Contacto",
  "HomePage.featuredProjects": "Proyectos destacados",
  "HomePage.currentProjects": "Proyectos actuales",
  "Campaign.campaignStats": "Estadísticas del proyecto",
  "Campaign.notFound": "Proyecto no encontrado",
  "Campaign.campaignNotFound": "Proyecto no encontrado",
  "DonationDialog.confirmDonation": "Confirmar donación",
  "DonationDialog.donationFailed": "La donación falló",
  "DonationSuccess.thankYou": "Muchas gracias",
};

const DE_CORRECTIONS: CorrectionMap = {
  "BankTransfer.badge": "Spende per Banküberweisung",
  "BankTransfer.title": "Unsere Bankkonten",
  "BankTransfer.subtitle": "Du kannst deine Spende per Überweisung an eines der unten aufgeführten Konten senden.",
  "BankTransfer.notice": "Bitte gib deinen vollständigen Namen im Verwendungszweck an.",
  "BankTransfer.branch": "Filiale:",
  "BankTransfer.accountHolder": "Kontoinhaber",
  "BankTransfer.accountNo": "Kontonummer:",
  "BankTransfer.extNo": "Zusatznummer:",
  "BankTransfer.copyIban": "IBAN kopieren",
  "BankTransfer.copy": "Kopieren",
  "BankTransfer.copied": "Kopiert!",
  "BankTransfer.footer": "Bei Fragen kontaktiere uns unter",
  "DonationFailed.badge": "Spende konnte nicht verarbeitet werden",
  "DonationFailed.title": "Entschuldigung, deine Spende wurde nicht abgeschlossen",
  "DonationFailed.description": "Wir konnten deine Zahlung nicht abschließen. Das kann durch eine Kartenablehnung, ein Netzwerkproblem oder eine Unterbrechung beim Zahlungsanbieter passieren. Es wurde kein Betrag abgebucht.",
  "DonationFailed.tryAgain": "Erneut spenden",
  "DonationFailed.manualFallback": "Wenn du die Kartenzahlung nicht erneut versuchen möchtest, kannst du deine Spende per Banküberweisung an eines der unten aufgeführten Konten abschließen.",
  "BlogCard.readMore": "Weiterlesen",
  "Navbar.profile": "Profil",
  "Navbar.dashboard": "Dashboard",
  "Navbar.projects": "Projekte",
  "Navbar.news": "Nachrichten",
  "Navbar.events": "Aktivitäten & Veranstaltungen",
  "Navbar.programs": "Unsere Programme",
  "Navbar.about": "Über uns",
  "Navbar.contact": "Kontakt",
  "Navbar.search": "Suchen...",
  "Navbar.searchMobile": "Nach Projekt oder Spende suchen...",
  "Navbar.myAccount": "Mein Konto",
  "Navbar.signedInAs": "Angemeldet als",
  "Navbar.cart": "Warenkorb",
  "Navbar.donateNow": "Jetzt spenden",
  "Navbar.chooseLanguage": "Sprache wählen",
  "Navbar.chooseCurrency": "Währung wählen",
  "Navbar.blog": "Blog",
  "Navbar.loading": "Wird geladen...",
  "Navbar.noCategories": "Keine Kampagnen",
  "Navbar.myProfile": "Mein Profil",
  "Navbar.myDonations": "Meine Spenden",
  "Navbar.signOut": "Abmelden",
  "Navbar.activities": "Aktivitäten",
  "Navbar.searchPlaceholder": "Suchen...",
  "Navbar.donate": "Jetzt spenden",
  "Navbar.signIn": "Anmelden",
  "Navbar.bankAccounts": "Unsere Bankkonten",
  "HomePage.donationCategories": "Spendenbereiche",
  "HomePage.news": "Unsere Nachrichten",
  "HomePage.newsSubtitle": "Neueste Nachrichten unseres Vereins",
  "HomePage.faq": "Häufig gestellte Fragen",
  "HomePage.communityImpact": "Gesellschaftliche Wirkung",
  "HomePage.featuredProjects": "Ausgewählte Projekte",
  "HomePage.currentProjects": "Aktuelle Projekte",
  "HomePage.viewAll": "Alle anzeigen",
  "HomePage.weHelp": "Wir helfen",
  "HomePage.latestNews": "Neueste Nachrichten",
  "HomePage.stat1Label": "Unterstützte Familien",
  "HomePage.stat2Label": "Unterstützte Kinder",
  "HomePage.stat3Label": "Erreichte Länder",
  "HomePage.stat4Label": "Kontinente",
  "HeroSlider.quickDonate": "Schnell spenden",
  "CampaignsSlider.ongoingProjects": "Laufende Projekte",
  "CampaignsSlider.viewAll": "Alle anzeigen",
  "CampaignsSlider.donations": "gesammelt",
  "CampaignsSlider.remaining": "verbleibend",
  "CampaignsSlider.contributor": "Spender",
  "CampaignsSlider.openGoal": "Offenes Ziel",
  "CampaignsSlider.sharesMode": "Anteile — {currency}{price} pro Anteil",
  "CampaignsSlider.noCampaigns": "Derzeit sind keine Projekte verfügbar.",
  "CampaignsSlider.showMore": "Weitere Projekte anzeigen",
  "CampaignsSlider.loadingMore": "Wird geladen…",
  "CampaignsSlider.loadError": "Projekte konnten nicht geladen werden. Bitte versuche es erneut.",
  "QuickDonate.associationName": "Yedicihan Hilfs- und Solidaritätsverein",
  "QuickDonate.hadithQuote": "Der Gesandte Allahs ﷺ sagte",
  "QuickDonate.hadithText": "Die beste Spende ist die, die dauerhaft ist, selbst wenn sie klein ist.",
  "QuickDonate.description": "Mache deine Spende dauerhaft und hilf, das Leben bedürftiger Menschen zu verändern. Deine monatliche Unterstützung stärkt die Wirkung jeder Spende und macht unsere Hilfe nachhaltiger.",
  "QuickDonate.discoverMore": "Mehr über unsere Geschichte erfahren",
  "QuickDonate.monthlyCommitment": "Monatlich spenden",
  "QuickDonate.monthlyCommitmentDesc": "Mache deine Hilfe dauerhaft, wie es im edlen Hadith erwähnt wird:",
  "QuickDonate.selectProject": "Projekt auswählen",
  "QuickDonate.selectAmount": "Betrag auswählen",
  "QuickDonate.customAmount": "Oder einen eigenen Betrag eingeben",
  "QuickDonate.enterAmount": "Betrag eingeben",
  "QuickDonate.donateNow": "Jetzt spenden",
  "QuickDonate.secureTransactions": "Sichere und verschlüsselte Transaktionen",
  "QuickDonate.feature1": "Direkte Hilfe für Bedürftige",
  "QuickDonate.feature2": "Transparente Berichte für jedes Projekt",
  "QuickDonate.feature3": "Professionelles und spezialisiertes Team",
  "QuickDonate.feature4": "Vertrauenswürdige internationale Partnerschaften",
  "QuickDonate.stat1": "Begünstigte",
  "QuickDonate.stat2": "Hilfsprojekt",
  "QuickDonate.stat3": "Jahre des Gebens",
  "QuickDonate.stat4": "Transparenzrate",
  "Footer.aboutUsDesc1": "Ein gemeinnützig tätiger Solidaritätsverein, im Dienst seit 1961.",
  "Footer.description": "Der Yedicihan Internationale Solidaritätsverein ist ein gemeinnützig tätiger Verein, der seit 1961 Menschen in Not zur Seite steht — im Gesundheitswesen, in der Nothilfe, in der Katastrophenhilfe und in der Bildung.",
  "Footer.messageTitle": "Sende uns eine Nachricht",
  "Footer.messageDesc": "Hast du eine Frage oder einen Vorschlag? Kontaktiere uns, wir melden uns bald bei dir.",
  "Footer.messagePlaceholder": "Schreibe deine Nachricht hier...",
  "Footer.messageLabel": "Nachricht",
  "Footer.namePlaceholder": "Name (optional)",
  "Footer.emailPlaceholder": "E-Mail (für Gäste)",
  "Footer.sending": "Wird gesendet...",
  "Footer.send": "Senden",
  "Footer.sendSuccess": "Deine Nachricht wurde erfolgreich gesendet!",
  "Footer.sendError": "Senden fehlgeschlagen. Bitte versuche es erneut.",
  "Footer.newsletterTitle": "Abonniere unseren Newsletter",
  "Footer.newsletterDesc": "Erhalte die neuesten Updates und Projekte",
  "Footer.subscribing": "Wird abonniert...",
  "Footer.subscribe": "Abonnieren",
  "Footer.subscribeSuccess": "Erfolgreich abonniert!",
  "Footer.quickLinks": "Schnellzugriff",
  "Footer.categories": "Kampagnen",
  "Footer.contactUs": "Kontakt",
  "Footer.copyright": "© {year} Yedicihan. Alle Rechte vorbehalten.",
  "Footer.developedBy": "Entwickelt 2026",
  "Campaign.campaignStats": "Projektstatistiken",
  "Campaign.notFound": "Projekt nicht gefunden",
  "Campaign.campaignNotFound": "Projekt nicht gefunden",
  "Campaign.donateNow": "Jetzt spenden",
  "Campaign.share": "Teilen",
  "Campaign.loadingCampaign": "Projekt wird geladen...",
  "Campaign.fetchError": "Projektdaten konnten nicht geladen werden",
  "Campaign.errorOccurred": "Ein Fehler ist aufgetreten. Bitte versuche es erneut.",
  "DonationDialog.confirmDonation": "Spende bestätigen",
  "DonationDialog.donationFailed": "Spende fehlgeschlagen",
  "DonationDialog.donationSuccess": "Spende erfolgreich",
  "DonationDialog.processing": "Wird verarbeitet...",
  "DonationDialog.next": "Weiter",
  "DonationDialog.back": "Zurück",
  "DonationDialog.paymentMethod": "Zahlungsmethode",
  "DonationDialog.bankCard": "Bankkarte",
  "DonationDialog.continue": "Weiter",
  "DonationDialog.firstName": "Vorname",
  "DonationDialog.lastName": "Nachname",
  "DonationDialog.email": "E-Mail",
  "DonationDialog.contactPhone": "Telefonnummer",
  "DonationDialog.amount": "Betrag",
  "DonationDialog.total": "Gesamt",
  "DonationDialog.chooseDonationType": "Spendenart wählen",
  "DonationDialog.chooseDonationTypeDesc": "Wähle eine einmalige oder monatliche Spende.",
  "DonationDialog.oneTimeDonation": "Einmalige Spende",
  "DonationDialog.monthlyDonation": "Monatliche Spende",
  "DonationDialog.donationAmount": "Spendenbetrag",
  "DonationDialog.enterDonationAmount": "Spendenbetrag eingeben",
  "DonationSuccess.thankYou": "Vielen Dank",
  "DonationSuccess.thankYouName": "Vielen Dank, {name}",
  "DonationSuccess.donationReceivedMessage": "Deine Spende wurde erfolgreich empfangen! Du hast einen echten Unterschied im Leben eines Menschen bewirkt.",
  "DonationSuccess.transactionNumber": "Transaktionsnummer",
  "DonationSuccess.donationDetails": "Spendendetails",
  "DonationSuccess.donatedAmount": "Gespendeter Betrag",
  "DonationSuccess.totalAmount": "Gesamtbetrag",
  "DonationSuccess.supportedCampaign": "Unterstütztes Projekt",
  "DonationSuccess.donateToAnotherCampaign": "Für ein anderes Projekt spenden",
  "DonationSuccess.browseCampaigns": "Projekte ansehen",
  "DonationSuccess.backToHome": "Zur Startseite",
};

const CORRECTIONS_BY_LOCALE: Record<string, CorrectionMap> = {
  ar: AR_CORRECTIONS,
  en: EN_CORRECTIONS,
  tr: TR_CORRECTIONS,
  fr: FR_CORRECTIONS,
  id: ID_CORRECTIONS,
  pt: PT_CORRECTIONS,
  es: ES_CORRECTIONS,
  de: DE_CORRECTIONS,
};

export function normalizeLocaleMessages(locale: string, messages: MessageObject, fallbackMessages: MessageObject): MessageObject {
  const merged = mergeMissing(messages, fallbackMessages) as MessageObject;
  return applyCorrections(merged, CORRECTIONS_BY_LOCALE[locale] ?? {});
}

export function buildNormalizedMessages(allMessages: LocaleMessages, fallbackLocale = "en"): LocaleMessages {
  const fallback = allMessages[fallbackLocale] ?? Object.values(allMessages)[0] ?? {};
  return Object.fromEntries(
    Object.entries(allMessages).map(([locale, messages]) => [
      locale,
      normalizeLocaleMessages(locale, messages, fallback),
    ])
  );
}

export function getMessageByPath(messages: MessageObject, path: string): MessageValue | undefined {
  return pathGet(messages, path);
}
