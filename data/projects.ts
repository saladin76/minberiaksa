export type ProjectStatus =
  | "active"
  | "seasonal"
  | "archived"
  | "needs-verification";

export type DonationType =
  | "sadaqah"
  | "zakat"
  | "waqf"
  | "recurring"
  | "qurbani";

export type ProjectRegion =
  | "al-quds"
  | "al-aqsa"
  | "gaza"
  | "syria"
  | "sudan"
  | "yemen"
  | "global";

export type LocalizedText = {
  ar: string;
  tr: string;
  en: string;
};

export type ProjectImage = {
  /** Temporary source reference. Replace with an optimized local/CDN asset before launch. */
  sourceUrl: string;
  sourceLabel: string;
  alt: LocalizedText;
  usage: "hero" | "card" | "proof" | "gallery";
};

export type ProjectRecord = {
  id: string;
  slug: string;
  title: LocalizedText;
  summary: LocalizedText;
  region: ProjectRegion;
  donationTypes: DonationType[];
  status: ProjectStatus;
  featured?: boolean;
  seasonal?: boolean;
  legacySource: string;
  image?: ProjectImage;
  tags: string[];
};

const drive = (fileId: string) =>
  `https://drive.google.com/uc?export=view&id=${fileId}`;

export const projects: ProjectRecord[] = [
  {
    id: "gaza-food-parcels",
    slug: "gaza-food-parcels",
    title: {
      ar: "طرود غذائية لأهل غزة",
      tr: "Gazze Gıda Kolileri",
      en: "Food Parcels for Gaza",
    },
    summary: {
      ar: "تجهيز وتسليم طرود غذائية للعائلات المتضررة في غزة مع توثيق مراحل التنفيذ والتسليم.",
      tr: "Gazze'deki ihtiyaç sahibi ailelere gıda kolilerinin hazırlanması ve ulaştırılması.",
      en: "Preparing and delivering food parcels to affected families in Gaza with field documentation.",
    },
    region: "gaza",
    donationTypes: ["sadaqah", "zakat", "recurring"],
    status: "active",
    featured: true,
    legacySource: "Legacy website + Drive: Gaza / طرود غزة",
    image: {
      sourceUrl: drive("14ExUX9TVvMB-jc_mWa_iPnqSjl_UH0lv"),
      sourceLabel: "IMG_5298.JPG — direct field delivery",
      usage: "card",
      alt: {
        ar: "تسليم طرد غذائي لعائلة في مخيم بغزة",
        tr: "Gazze'de bir aileye gıda kolisi teslimi",
        en: "Food parcel delivery to a family in Gaza",
      },
    },
    tags: ["gaza", "food", "zakat-eligible", "field-proof"],
  },
  {
    id: "gaza-hot-meals",
    slug: "gaza-hot-meals",
    title: {
      ar: "الوجبات الساخنة في غزة",
      tr: "Gazze Sıcak Yemek",
      en: "Hot Meals in Gaza",
    },
    summary: {
      ar: "دعم المطابخ الميدانية وتوفير وجبات ساخنة للأسر في مناطق النزوح.",
      tr: "Saha mutfaklarını ve yerinden edilmiş ailelere sıcak yemek dağıtımını destekleyin.",
      en: "Support field kitchens and hot meal distribution for displaced families.",
    },
    region: "gaza",
    donationTypes: ["sadaqah", "zakat", "recurring"],
    status: "active",
    featured: true,
    legacySource: "Legacy campaign: 1,000,000 hot meals + Drive Gaza meal folders",
    tags: ["gaza", "meals", "emergency"],
  },
  {
    id: "gaza-bread",
    slug: "gaza-bread",
    title: {
      ar: "الخبز لأهل غزة",
      tr: "Gazze Ekmek Desteği",
      en: "Bread Support for Gaza",
    },
    summary: {
      ar: "تمويل إنتاج وتوزيع الخبز بصورة منتظمة للأسر في غزة.",
      tr: "Gazze'deki aileler için düzenli ekmek üretimi ve dağıtımı.",
      en: "Fund regular bread production and distribution for families in Gaza.",
    },
    region: "gaza",
    donationTypes: ["sadaqah", "zakat", "recurring"],
    status: "active",
    legacySource: "Drive: غزة / خبز - رمضان",
    tags: ["gaza", "bread", "food"],
  },
  {
    id: "gaza-water",
    slug: "gaza-water",
    title: {
      ar: "سقيا الماء في غزة",
      tr: "Gazze Su Dağıtımı",
      en: "Water Support in Gaza",
    },
    summary: {
      ar: "توفير مياه شرب آمنة للأسر ومراكز النزوح في غزة.",
      tr: "Gazze'deki ailelere ve barınma merkezlerine temiz içme suyu ulaştırın.",
      en: "Provide safe drinking water to families and displacement centres in Gaza.",
    },
    region: "gaza",
    donationTypes: ["sadaqah", "zakat", "recurring"],
    status: "active",
    legacySource: "Drive: غزة / سقيا الماء - رمضان",
    tags: ["gaza", "water", "emergency"],
  },
  {
    id: "gaza-winter-relief",
    slug: "gaza-winter-relief",
    title: {
      ar: "إغاثة الشتاء في غزة",
      tr: "Gazze Kış Yardımı",
      en: "Winter Relief in Gaza",
    },
    summary: {
      ar: "بطانيات وفرشات ومواد تدفئة وعوازل خيام للأسر النازحة.",
      tr: "Yerinden edilmiş aileler için battaniye, yatak, ısınma malzemesi ve çadır yalıtımı.",
      en: "Blankets, mattresses, heating materials and tent insulation for displaced families.",
    },
    region: "gaza",
    donationTypes: ["sadaqah", "zakat"],
    status: "seasonal",
    seasonal: true,
    legacySource: "Drive: غزة / بطانيات، فرشات، مواد تدفئة، عوازل خيام",
    tags: ["gaza", "winter", "shelter"],
  },
  {
    id: "gaza-iftar",
    slug: "gaza-iftar",
    title: {
      ar: "إفطار الصائمين في غزة",
      tr: "Gazze İftar Projesi",
      en: "Iftar Meals in Gaza",
    },
    summary: {
      ar: "تجهيز موائد ووجبات إفطار خلال رمضان والمناسبات المباركة.",
      tr: "Ramazan ve mübarek günlerde iftar sofraları ve yemekleri.",
      en: "Prepare iftar meals during Ramadan and blessed occasions.",
    },
    region: "gaza",
    donationTypes: ["sadaqah"],
    status: "seasonal",
    seasonal: true,
    legacySource: "Drive: غزة / إفطار المسجد، مائدة إفطار، إفطار يوم عرفة",
    tags: ["gaza", "iftar", "ramadan"],
  },
  {
    id: "gaza-zakat-al-fitr",
    slug: "gaza-zakat-al-fitr",
    title: {
      ar: "زكاة الفطر في غزة",
      tr: "Gazze Fitre",
      en: "Zakat al-Fitr in Gaza",
    },
    summary: {
      ar: "إيصال زكاة الفطر إلى الأسر المستحقة في الوقت الشرعي المحدد.",
      tr: "Fitrelerin uygun zamanda Gazze'deki ihtiyaç sahibi ailelere ulaştırılması.",
      en: "Deliver Zakat al-Fitr to eligible families within the required time.",
    },
    region: "gaza",
    donationTypes: ["zakat"],
    status: "seasonal",
    seasonal: true,
    legacySource: "Drive: غزة / زكاة الفطر - رمضان",
    tags: ["gaza", "zakat-al-fitr", "ramadan"],
  },
  {
    id: "al-quds-home-restoration",
    slug: "al-quds-home-restoration",
    title: {
      ar: "ترميم منازل القدس",
      tr: "Kudüs Ev Tadilatları",
      en: "Home Restoration in Al-Quds",
    },
    summary: {
      ar: "ترميم منازل الأسر المقدسية ودعم بقائهم وصمودهم داخل المدينة.",
      tr: "Kudüslü ailelerin evlerini yenileyerek şehirde kalmalarını destekleyin.",
      en: "Restore homes for Al-Quds families and support their continued presence in the city.",
    },
    region: "al-quds",
    donationTypes: ["sadaqah", "zakat", "waqf"],
    status: "active",
    featured: true,
    legacySource: "Legacy website + Drive: القدس / الترميم",
    image: {
      sourceUrl: drive("1vslhxCj1c7KpF0dziaG5ZRJBO8OQFmDu"),
      sourceLabel: "1S7A8142.JPG — restoration project documentation",
      usage: "proof",
      alt: {
        ar: "توثيق مشروع ترميم منزل في القدس",
        tr: "Kudüs'te bir ev tadilat projesinin saha belgesi",
        en: "Field documentation of a home restoration project in Al-Quds",
      },
    },
    tags: ["al-quds", "restoration", "housing", "major-giving"],
  },
  {
    id: "al-quds-family-relief",
    slug: "al-quds-family-relief",
    title: {
      ar: "إغاثة الأسر في القدس",
      tr: "Kudüs Aile Yardımı",
      en: "Family Relief in Al-Quds",
    },
    summary: {
      ar: "مساعدات غذائية ومعيشية عاجلة للأسر المقدسية المحتاجة.",
      tr: "İhtiyaç sahibi Kudüslü ailelere gıda ve temel yaşam desteği.",
      en: "Food and essential living support for families in Al-Quds.",
    },
    region: "al-quds",
    donationTypes: ["sadaqah", "zakat", "recurring"],
    status: "active",
    legacySource: "Drive: القدس / إغاثة القدس",
    tags: ["al-quds", "families", "relief"],
  },
  {
    id: "al-quds-education-sponsorship",
    slug: "al-quds-education-sponsorship",
    title: {
      ar: "رعاية تعليم طلاب القدس",
      tr: "Kudüslü Öğrencilere Eğitim Sponsorluğu",
      en: "Education Sponsorship for Al-Quds Students",
    },
    summary: {
      ar: "المساهمة في تكاليف تعليم الطلاب المحتاجين ودعم استمرارهم الدراسي.",
      tr: "Kudüslü ihtiyaç sahibi öğrencilerin eğitim masraflarına destek olun.",
      en: "Support education costs for students in Al-Quds and help them continue learning.",
    },
    region: "al-quds",
    donationTypes: ["sadaqah", "zakat", "recurring", "waqf"],
    status: "active",
    legacySource: "Legacy catalogue: Eğitim Sponsorluğu Projesi",
    tags: ["al-quds", "education", "students"],
  },
  {
    id: "al-quds-learning-centres",
    slug: "al-quds-learning-centres",
    title: {
      ar: "دعم المراكز التعليمية والدورات",
      tr: "Öğrenim Merkezleri ve Kurs Destekleri",
      en: "Learning Centres and Course Support",
    },
    summary: {
      ar: "دعم المراكز التعليمية والطلاب الأيتام والمحتاجين لتطوير تعليمهم ومهاراتهم.",
      tr: "Eğitim merkezlerini, yetim ve ihtiyaç sahibi öğrencilerin öğrenimini destekleyin.",
      en: "Support learning centres and help orphaned and disadvantaged students develop their skills.",
    },
    region: "al-quds",
    donationTypes: ["sadaqah", "zakat", "recurring", "waqf"],
    status: "active",
    legacySource: "Legacy catalogue: Öğrenim Merkezleri ve Kurs Destekleri",
    tags: ["al-quds", "education", "courses"],
  },
  {
    id: "al-aqsa-quran-programmes",
    slug: "al-aqsa-quran-programmes",
    title: {
      ar: "تحفيظ القرآن في رحاب الأقصى",
      tr: "Mescid-i Aksa Kur'an Programları",
      en: "Quran Programmes at Al-Aqsa",
    },
    summary: {
      ar: "دعم حلقات تحفيظ القرآن والبرامج التعليمية للطلاب في مدارس وساحات الأقصى.",
      tr: "Aksa çevresindeki öğrenciler için Kur'an ezberi ve eğitim programlarını destekleyin.",
      en: "Support Quran memorisation and educational programmes for students around Al-Aqsa.",
    },
    region: "al-aqsa",
    donationTypes: ["sadaqah", "waqf", "recurring"],
    status: "active",
    legacySource: "Drive: القدس / تحفيظ القرآن ومدارس رياض الأقصى",
    tags: ["al-aqsa", "quran", "education"],
  },
  {
    id: "al-aqsa-lectures-and-pathways",
    slug: "al-aqsa-lectures-and-pathways",
    title: {
      ar: "محاضرات ومسارات داخل ساحات الأقصى",
      tr: "Aksa Avlularında Eğitim ve Seminerler",
      en: "Lectures and Learning Paths at Al-Aqsa",
    },
    summary: {
      ar: "برامج معرفية وتربوية داخل باحات المسجد الأقصى.",
      tr: "Mescid-i Aksa avlularında eğitim ve bilinçlendirme programları.",
      en: "Educational and awareness programmes within the courtyards of Al-Aqsa.",
    },
    region: "al-aqsa",
    donationTypes: ["sadaqah", "waqf", "recurring"],
    status: "active",
    legacySource: "Drive: القدس / مشروع محاضرات ومسارات داخل باحات المسجد الأقصى",
    tags: ["al-aqsa", "education", "awareness"],
  },
  {
    id: "al-quds-young-leaders",
    slug: "al-quds-young-leaders",
    title: {
      ar: "برنامج القيادات الشابة في القدس",
      tr: "Kudüs Genç Liderler Programı",
      en: "Young Leaders Programme in Al-Quds",
    },
    summary: {
      ar: "تأهيل الشباب المقدسي بالمهارات والمعرفة لخدمة مجتمعهم.",
      tr: "Kudüslü gençleri topluma hizmet edecek bilgi ve becerilerle destekleyin.",
      en: "Equip young people in Al-Quds with skills and knowledge to serve their community.",
    },
    region: "al-quds",
    donationTypes: ["sadaqah", "recurring", "waqf"],
    status: "active",
    legacySource: "Drive: القدس / القيادات الشابة",
    tags: ["al-quds", "youth", "education"],
  },
  {
    id: "al-quds-olive-harvest",
    slug: "al-quds-olive-harvest",
    title: {
      ar: "دعم موسم قطف الزيتون",
      tr: "Kudüs Zeytin Hasadı Desteği",
      en: "Olive Harvest Support in Al-Quds",
    },
    summary: {
      ar: "مساندة الأسر والمزارعين خلال موسم الزيتون وحماية مصدر رزقهم.",
      tr: "Zeytin hasadı döneminde Kudüslü aileleri ve çiftçileri destekleyin.",
      en: "Support families and farmers during the olive harvest season.",
    },
    region: "al-quds",
    donationTypes: ["sadaqah"],
    status: "seasonal",
    seasonal: true,
    legacySource: "Drive: القدس / فعالية قطف الزيتون",
    tags: ["al-quds", "olive", "livelihood"],
  },
  {
    id: "al-aqsa-umrah-visit",
    slug: "al-aqsa-umrah-visit",
    title: {
      ar: "زيارة العمرة لأهل القدس",
      tr: "Kudüslüler İçin Umre Ziyareti",
      en: "Umrah Visit Support for Al-Quds Families",
    },
    summary: {
      ar: "دعم برامج الزيارة والعمرة للفئات المستحقة وفق ضوابط المشروع.",
      tr: "Uygun yararlanıcılar için umre ziyareti programlarını destekleyin.",
      en: "Support Umrah visit programmes for eligible beneficiaries.",
    },
    region: "al-quds",
    donationTypes: ["sadaqah"],
    status: "needs-verification",
    legacySource: "Drive: القدس / زيارة العمرة",
    tags: ["al-quds", "umrah", "seasonal"],
  },
  {
    id: "zakat-for-palestine",
    slug: "zakat-for-palestine",
    title: {
      ar: "زكاتك لفلسطين",
      tr: "Filistin İçin Zekât",
      en: "Zakat for Palestine",
    },
    summary: {
      ar: "توجيه الزكاة إلى المشاريع والفئات المؤهلة في فلسطين بإيصال منفصل ومسار واضح.",
      tr: "Zekâtınızı Filistin'deki uygun projelere ve hak sahiplerine yönlendirin.",
      en: "Direct your Zakat to eligible projects and beneficiaries in Palestine through a clear dedicated flow.",
    },
    region: "global",
    donationTypes: ["zakat"],
    status: "active",
    featured: true,
    legacySource: "Legacy website: Zakat page",
    tags: ["zakat", "palestine", "featured"],
  },
  {
    id: "waqf-for-al-quds",
    slug: "waqf-for-al-quds",
    title: {
      ar: "الوقف في القدس",
      tr: "Kudüs Vakıf Projesi",
      en: "Waqf for Al-Quds",
    },
    summary: {
      ar: "سهم أو متر وقفي باسمك أو باسم من تحب لدعم مشاريع القدس والأقصى.",
      tr: "Kendiniz veya sevdikleriniz adına Kudüs için vakıf hissesi ya da metre bağışı.",
      en: "Create a Waqf share or metre for Al-Quds in your name or for someone you love.",
    },
    region: "al-quds",
    donationTypes: ["waqf"],
    status: "active",
    featured: true,
    legacySource: "Legacy website: Waqf page",
    tags: ["waqf", "al-quds", "certificate", "major-giving"],
  },
  {
    id: "monthly-palestine-support",
    slug: "monthly-palestine-support",
    title: {
      ar: "الاستقطاع الشهري لفلسطين",
      tr: "Filistin İçin Aylık Bağış",
      en: "Monthly Giving for Palestine",
    },
    summary: {
      ar: "تبرع شهري ثابت لدعم المشاريع المستمرة في القدس وغزة وفلسطين.",
      tr: "Kudüs, Gazze ve Filistin'deki sürekli projeler için düzenli aylık bağış.",
      en: "A recurring monthly donation supporting ongoing work in Al-Quds, Gaza and Palestine.",
    },
    region: "global",
    donationTypes: ["recurring"],
    status: "active",
    featured: true,
    legacySource: "Legacy website: monthly-donate page",
    tags: ["recurring", "monthly", "palestine"],
  },
  {
    id: "syria-emergency-relief",
    slug: "syria-emergency-relief",
    title: {
      ar: "الإغاثة العاجلة في سوريا",
      tr: "Suriye Acil Yardım",
      en: "Emergency Relief in Syria",
    },
    summary: {
      ar: "غذاء ومستلزمات أساسية للأسر المتضررة في سوريا.",
      tr: "Suriye'deki etkilenen aileler için gıda ve temel ihtiyaç desteği.",
      en: "Food and essential support for affected families in Syria.",
    },
    region: "syria",
    donationTypes: ["sadaqah", "zakat"],
    status: "needs-verification",
    legacySource: "Drive top-level Syria archives",
    tags: ["syria", "emergency", "relief"],
  },
  {
    id: "sudan-qurbani",
    slug: "sudan-qurbani",
    title: {
      ar: "الأضاحي في السودان",
      tr: "Sudan Kurban Projesi",
      en: "Qurbani in Sudan",
    },
    summary: {
      ar: "تنفيذ الأضاحي وتوزيع اللحوم على الأسر المحتاجة في السودان.",
      tr: "Sudan'da kurban kesimi ve ihtiyaç sahibi ailelere et dağıtımı.",
      en: "Qurbani implementation and meat distribution to families in Sudan.",
    },
    region: "sudan",
    donationTypes: ["qurbani", "sadaqah"],
    status: "seasonal",
    seasonal: true,
    legacySource: "Legacy campaigns + Drive Sudan/Qurbani",
    tags: ["sudan", "qurbani", "seasonal"],
  },
  {
    id: "global-qurbani",
    slug: "global-qurbani",
    title: {
      ar: "مشروع الأضاحي",
      tr: "Kurban Projesi",
      en: "Qurbani Project",
    },
    summary: {
      ar: "اختيار منطقة التنفيذ وتقديم حصة أو أضحية كاملة للفئات المحتاجة.",
      tr: "Uygulama bölgesini seçerek hisse veya tam kurban bağışlayın.",
      en: "Choose an implementation region and give a share or full Qurbani.",
    },
    region: "global",
    donationTypes: ["qurbani"],
    status: "seasonal",
    seasonal: true,
    legacySource: "Legacy website campaigns: Gaza, Syria, Yemen, Africa, Sudan",
    tags: ["qurbani", "seasonal", "global"],
  },
];

export const getProjectBySlug = (slug: string) =>
  projects.find((project) => project.slug === slug);

export const getActiveProjects = () =>
  projects.filter((project) => project.status === "active");

export const getProjectsByRegion = (region: ProjectRegion) =>
  projects.filter((project) => project.region === region);

export const getProjectsByDonationType = (type: DonationType) =>
  projects.filter((project) => project.donationTypes.includes(type));
