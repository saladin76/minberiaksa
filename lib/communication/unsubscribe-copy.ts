import { isValidLocale, localeDirection, type SupportedLocale } from "../locales";
// label, confirmation question, button and completed state stay in one language.
const COPY: Record<SupportedLocale, readonly [string, string, string, string]> = {
  ar: ["إلغاء الاشتراك من الرسائل التسويقية", "هل تريد إيقاف الرسائل التسويقية عبر البريد الإلكتروني؟", "تأكيد إلغاء الاشتراك", "تم إلغاء اشتراكك في الرسائل التسويقية عبر البريد الإلكتروني."],
  tr: ["Pazarlama e-postalarından aboneliği iptal et", "Pazarlama e-postalarını almayı durdurmak istiyor musunuz?", "Abonelik iptalini onayla", "Pazarlama e-postası aboneliğiniz iptal edildi."],
  en: ["Unsubscribe from marketing emails", "Stop receiving marketing emails?", "Confirm unsubscribe", "You have unsubscribed from marketing emails."],
  fr: ["Se désabonner des e-mails marketing", "Souhaitez-vous ne plus recevoir d’e-mails marketing ?", "Confirmer le désabonnement", "Vous êtes désabonné des e-mails marketing."],
  de: ["Marketing-E-Mails abbestellen", "Möchten Sie keine Marketing-E-Mails mehr erhalten?", "Abmeldung bestätigen", "Sie haben Marketing-E-Mails abbestellt."],
  es: ["Darse de baja de los correos de marketing", "¿Quieres dejar de recibir correos de marketing?", "Confirmar baja", "Te has dado de baja de los correos de marketing."],
  id: ["Berhenti berlangganan email pemasaran", "Apakah Anda ingin berhenti menerima email pemasaran?", "Konfirmasi berhenti", "Anda telah berhenti berlangganan email pemasaran."],
  pt: ["Cancelar a subscrição de e-mails de marketing", "Pretende deixar de receber e-mails de marketing?", "Confirmar cancelamento", "A sua subscrição de e-mails de marketing foi cancelada."],
  ur: ["تشہیری ای میلز کی رکنیت ختم کریں", "کیا آپ تشہیری ای میلز وصول کرنا بند کرنا چاہتے ہیں؟", "رکنیت ختم کرنے کی تصدیق", "تشہیری ای میلز کی آپ کی رکنیت ختم کر دی گئی ہے۔"],
  sq: ["Çregjistrohu nga emailet e marketingut", "Dëshironi të mos merrni më emaile marketingu?", "Konfirmo çregjistrimin", "Jeni çregjistruar nga emailet e marketingut."],
  it: ["Annulla l’iscrizione alle e-mail di marketing", "Vuole smettere di ricevere e-mail di marketing?", "Conferma annullamento", "L’iscrizione alle e-mail di marketing è stata annullata."],
  nl: ["Afmelden voor marketingmails", "Wilt u geen marketingmails meer ontvangen?", "Afmelding bevestigen", "U bent afgemeld voor marketingmails."],
  sv: ["Avregistrera marknadsföringsmejl", "Vill du sluta ta emot marknadsföringsmejl?", "Bekräfta avregistrering", "Du har avregistrerat dig från marknadsföringsmejl."],
  no: ["Avslutt abonnement på markedsførings-e-post", "Vil du slutte å motta markedsførings-e-post?", "Bekreft avslutning", "Du har avsluttet abonnementet på markedsførings-e-post."],
  da: ["Afmeld marketingmails", "Vil du stoppe med at modtage marketingmails?", "Bekræft afmelding", "Du er afmeldt marketingmails."],
  ms: ["Hentikan langganan e-mel pemasaran", "Adakah anda mahu berhenti menerima e-mel pemasaran?", "Sahkan pembatalan", "Langganan e-mel pemasaran anda telah dibatalkan."],
  ja: ["マーケティングメールの配信停止", "マーケティングメールの配信を停止しますか？", "配信停止を確定", "マーケティングメールの配信を停止しました。"],
  zh: ["退订营销邮件", "您确定不再接收营销邮件吗？", "确认退订", "您已退订营销邮件。"],
  hi: ["प्रचार ईमेल की सदस्यता समाप्त करें", "क्या आप प्रचार ईमेल प्राप्त करना बंद करना चाहते हैं?", "सदस्यता समाप्त करने की पुष्टि करें", "प्रचार ईमेल की आपकी सदस्यता समाप्त कर दी गई है।"],
};
export function emailUnsubscribeCopy(input?: string | null) {
  const language = String(input ?? "ar").toLowerCase().split(/[-_]/)[0].replace(/^nb$/, "no");
  const locale = isValidLocale(language) ? language : "en";
  const [label, question, button, done] = COPY[locale];
  return { locale, dir: localeDirection(locale), label, question, button, done };
}
