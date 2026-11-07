import type { SupportedLocale } from "../locales";
import { RECEIPT_BRANDS } from "../templates/receipt-localization";

// Greeting, document handoff, closing, manual receipt label and cash method.
export const MANUAL_DOCUMENT_TEXT: Record<SupportedLocale, readonly [string, string, string, string, string]> = {
  ar: ["السلام عليكم ورحمة الله وبركاته،", "مستندكم الصادر عن المؤسسة جاهز. يمكنكم الاحتفاظ به أو تحميله عبر الرابط أدناه.", "بارك الله في عطائكم وتقبّل منكم.", "إيصال يدوي", "نقدًا"],
  tr: ["Selamünaleyküm,", "Derneğimiz tarafından düzenlenen belgeniz hazır. Aşağıdaki bağlantıdan indirebilir ve saklayabilirsiniz.", "Allah hayrınızı kabul etsin, bereketli kılsın.", "Manuel makbuz", "Nakit"],
  en: ["Peace be upon you,", "Your document issued by our association is ready. You may keep it or download it using the link below.", "May Allah accept your generosity and bless you.", "Manual receipt", "Cash"],
  fr: ["Que la paix soit sur vous,", "Votre document émis par notre association est prêt. Vous pouvez le conserver ou le télécharger via le lien ci-dessous.", "Qu’Allah accepte votre générosité et vous bénisse.", "Reçu manuel", "Espèces"],
  de: ["Friede sei mit Ihnen,", "Ihr von unserem Verein ausgestelltes Dokument ist fertig. Sie können es aufbewahren oder über den folgenden Link herunterladen.", "Möge Allah Ihre Großzügigkeit annehmen und Sie segnen.", "Manuell ausgestellte Quittung", "Bargeld"],
  es: ["La paz sea contigo,", "Tu documento emitido por nuestra asociación está listo. Puedes guardarlo o descargarlo desde el enlace siguiente.", "Que Alá acepte tu generosidad y te bendiga.", "Recibo manual", "Efectivo"],
  id: ["Assalamu’alaikum,", "Dokumen yang diterbitkan oleh lembaga kami sudah siap. Anda dapat menyimpannya atau mengunduhnya melalui tautan di bawah.", "Semoga Allah menerima kebaikan Anda dan memberkahi Anda.", "Kuitansi manual", "Tunai"],
  pt: ["Que a paz esteja consigo,", "O documento emitido pela nossa associação está pronto. Pode guardá-lo ou descarregá-lo através da ligação abaixo.", "Que Alá aceite a sua generosidade e lhe conceda bênçãos.", "Recibo manual", "Numerário"],
  ur: ["السلام علیکم ورحمۃ اللہ وبرکاتہ،", "ہماری تنظیم کی جاری کردہ دستاویز تیار ہے۔ آپ اسے محفوظ کر سکتے ہیں یا نیچے دیے گئے ربط سے ڈاؤن لوڈ کر سکتے ہیں۔", "اللہ آپ کی سخاوت قبول فرمائے اور برکت عطا کرے۔", "دستی رسید", "نقد"],
  sq: ["Paqja qoftë mbi ju,", "Dokumenti i lëshuar nga shoqata jonë është gati. Mund ta ruani ose ta shkarkoni nga lidhja më poshtë.", "Allahu e pranoftë bujarinë tuaj dhe ju bekoftë.", "Dëftesë manuale", "Para në dorë"],
  it: ["La pace sia con voi,", "Il documento emesso dalla nostra associazione è pronto. Potete conservarlo o scaricarlo dal collegamento qui sotto.", "Che Allah accetti la vostra generosità e vi benedica.", "Ricevuta manuale", "Contanti"],
  nl: ["Vrede zij met u,", "Uw document van onze vereniging is klaar. U kunt het bewaren of downloaden via onderstaande link.", "Moge Allah uw vrijgevigheid aanvaarden en u zegenen.", "Handmatige kwitantie", "Contant"],
  sv: ["Frid vare med er,", "Dokumentet som utfärdats av vår förening är klart. Du kan spara det eller ladda ner det via länken nedan.", "Må Allah ta emot din generositet och välsigna dig.", "Manuellt kvitto", "Kontant"],
  no: ["Fred være med deg,", "Dokumentet utstedt av foreningen vår er klart. Du kan lagre det eller laste det ned via lenken nedenfor.", "Må Allah ta imot din gavmildhet og velsigne deg.", "Manuell kvittering", "Kontant"],
  da: ["Fred være med dig,", "Dokumentet udstedt af vores forening er klar. Du kan gemme det eller hente det via linket nedenfor.", "Må Allah tage imod din gavmildhed og velsigne dig.", "Manuel kvittering", "Kontant"],
  ms: ["Assalamualaikum,", "Dokumen yang dikeluarkan oleh persatuan kami telah siap. Anda boleh menyimpannya atau memuat turunnya melalui pautan di bawah.", "Semoga Allah menerima kemurahan hati anda dan memberkati anda.", "Resit manual", "Tunai"],
  ja: ["平安があなたと共にありますように。", "当協会が発行した書類をご用意しました。保存するか、下記のリンクからダウンロードできます。", "アッラーがあなたの善意を受け入れ、祝福をお与えくださいますように。", "手動発行の領収書", "現金"],
  zh: ["愿平安与你同在，", "本协会为您签发的文件已准备好。您可以保存文件，或通过下方链接下载。", "愿真主悦纳您的善举并赐福于您。", "手工开具的收据", "现金"],
  hi: ["आप पर शांति हो,", "हमारी संस्था द्वारा जारी आपका दस्तावेज़ तैयार है। आप इसे सहेज सकते हैं या नीचे दिए लिंक से डाउनलोड कर सकते हैं।", "अल्लाह आपकी उदारता स्वीकार करे और आपको बरकत दे।", "मैन्युअल रसीद", "नकद"],
};
export const MANUAL_DOCUMENT_TEMPLATE = "mia_document_delivery_v1";
export function manualDocumentTemplate(locale: SupportedLocale): string {
  const [greeting, intro, closing] = MANUAL_DOCUMENT_TEXT[locale];
  return `📄 *{{document.title}}*\n\n${greeting} {{document.recipientName}}\n\n${intro}\n\n{{document.serial}} · {{document.date}}\n{{document.url}}\n\n${closing}\n${RECEIPT_BRANDS[locale]}`;
}
