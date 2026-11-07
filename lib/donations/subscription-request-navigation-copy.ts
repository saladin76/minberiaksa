import type { SupportedLocale } from "../locales";
import { receiptLocale } from "../templates/receipt-localization";

type NavigationCopy = { title: string; description: string; selectPlan: string; empty: string };
const COPY: Record<SupportedLocale, NavigationCopy> = {
  ar: { title: "طلبات إدارة التبرع", description: "إرسال طلبات التعديل ومتابعة حالتها ورد الإدارة", selectPlan: "اختر التبرع الدوري", empty: "لا توجد لديك تبرعات دورية لإدارة طلباتها حاليًا." },
  en: { title: "Donation management requests", description: "Submit changes and follow request status and team replies", selectPlan: "Choose a recurring donation", empty: "You have no recurring donations to manage yet." },
  tr: { title: "Bağış yönetimi talepleri", description: "Değişiklik talebi gönderin, durumunu ve ekip yanıtlarını takip edin", selectPlan: "Düzenli bağış seçin", empty: "Henüz yönetebileceğiniz düzenli bir bağışınız yok." },
  fr: { title: "Demandes de gestion des dons", description: "Envoyez une demande et suivez son état et les réponses de l’équipe", selectPlan: "Choisir un don régulier", empty: "Vous n’avez pas encore de don régulier à gérer." },
  de: { title: "Anfragen zur Spendenverwaltung", description: "Änderungen beantragen, den Status verfolgen und Teamantworten lesen", selectPlan: "Regelmäßige Spende auswählen", empty: "Sie haben noch keine regelmäßigen Spenden zu verwalten." },
  es: { title: "Solicitudes de gestión de donaciones", description: "Solicita cambios y consulta el estado y las respuestas del equipo", selectPlan: "Elige una donación periódica", empty: "Aún no tienes donaciones periódicas que gestionar." },
  id: { title: "Permintaan pengelolaan donasi", description: "Ajukan perubahan dan pantau status serta balasan tim", selectPlan: "Pilih donasi rutin", empty: "Anda belum memiliki donasi rutin untuk dikelola." },
  pt: { title: "Pedidos de gestão de donativos", description: "Peça alterações e acompanhe o estado e as respostas da equipa", selectPlan: "Escolher um donativo recorrente", empty: "Ainda não tem donativos recorrentes para gerir." },
  ur: { title: "عطیات کے انتظام کی درخواستیں", description: "تبدیلی کی درخواست بھیجیں اور اس کی حیثیت اور ٹیم کے جواب دیکھیں", selectPlan: "باقاعدہ عطیہ منتخب کریں", empty: "ابھی آپ کا کوئی باقاعدہ عطیہ موجود نہیں ہے۔" },
  sq: { title: "Kërkesat për menaxhimin e dhurimeve", description: "Kërkoni ndryshime dhe ndiqni statusin e përgjigjet e ekipit", selectPlan: "Zgjidhni një dhurim periodik", empty: "Nuk keni ende dhurime periodike për të menaxhuar." },
  it: { title: "Richieste di gestione delle donazioni", description: "Richiedi modifiche e segui lo stato e le risposte del team", selectPlan: "Scegli una donazione ricorrente", empty: "Non hai ancora donazioni ricorrenti da gestire." },
  nl: { title: "Verzoeken voor donatiebeheer", description: "Vraag wijzigingen aan en volg de status en antwoorden van het team", selectPlan: "Kies een periodieke donatie", empty: "U heeft nog geen periodieke donaties om te beheren." },
  sv: { title: "Ärenden för donationshantering", description: "Begär ändringar och följ status och svar från teamet", selectPlan: "Välj en återkommande donation", empty: "Du har inga återkommande donationer att hantera ännu." },
  no: { title: "Forespørsler om donasjonshåndtering", description: "Be om endringer og følg status og svar fra teamet", selectPlan: "Velg en fast donasjon", empty: "Du har ingen faste donasjoner å administrere ennå." },
  da: { title: "Anmodninger om donationsstyring", description: "Anmod om ændringer og følg status og teamets svar", selectPlan: "Vælg en fast donation", empty: "Du har endnu ingen faste donationer at administrere." },
  ms: { title: "Permohonan pengurusan sumbangan", description: "Mohon perubahan dan ikuti status serta balasan pasukan", selectPlan: "Pilih sumbangan berkala", empty: "Anda belum mempunyai sumbangan berkala untuk diuruskan." },
  ja: { title: "寄付管理の申請", description: "変更を申請し、対応状況や担当チームの返信を確認できます", selectPlan: "継続寄付を選択", empty: "管理できる継続寄付はまだありません。" },
  zh: { title: "捐赠管理申请", description: "提交变更申请，查看处理状态和团队回复", selectPlan: "选择定期捐赠", empty: "您目前没有可管理的定期捐赠。" },
  hi: { title: "दान प्रबंधन के अनुरोध", description: "बदलाव का अनुरोध करें और उसकी स्थिति व टीम के उत्तर देखें", selectPlan: "नियमित दान चुनें", empty: "प्रबंधन के लिए अभी आपका कोई नियमित दान नहीं है।" },
};

export const subscriptionRequestNavigationCopy = (locale: string) => COPY[receiptLocale(locale)];
