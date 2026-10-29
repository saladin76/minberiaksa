import { createHash } from "node:crypto";
import { SUPPORTED_LOCALES, type SupportedLocale } from "../locales";
import { RECEIPT_BRANDS } from "../templates/receipt-localization";
import { whatsappUnsubscribeCopy } from "./whatsapp-template-unsubscribe";

// An unsolicited greeting is submitted as MARKETING, never disguised as a
// transactional receipt. Every language has its own body, brand and stop control.
const GREETINGS: Record<SupportedLocale, string> = {
  ar: "السلام عليكم {{user.name}}،\n\nأهلًا وسهلًا بك. يسعدنا التواصل معك والإجابة عن استفساراتك حول مشاريعنا الخيرية وخدمة القدس وأهلها.\n\nكيف يمكننا مساعدتك اليوم؟ رد على هذه الرسالة وسيتابع معك فريقنا.",
  tr: "Merhaba {{user.name}},\n\nSizinle iletişim kurmaktan ve hayır projelerimiz ile Kudüs halkına yönelik çalışmalarımız hakkındaki sorularınızı yanıtlamaktan memnuniyet duyarız.\n\nBugün size nasıl yardımcı olabiliriz? Bu mesajı yanıtlayın; ekibimiz sizinle ilgilenecektir.",
  en: "Hello {{user.name}},\n\nWe’re happy to hear from you and answer your questions about our charitable projects and our work serving Jerusalem and its people.\n\nHow can we help you today? Reply to this message and our team will assist you.",
  fr: "Bonjour {{user.name}},\n\nNous sommes heureux d’échanger avec vous et de répondre à vos questions sur nos projets solidaires et nos actions au service de Jérusalem et de ses habitants.\n\nComment pouvons-nous vous aider aujourd’hui ? Répondez à ce message et notre équipe vous accompagnera.",
  de: "Guten Tag {{user.name}},\n\nGerne beantworten wir Ihre Fragen zu unseren Hilfsprojekten und unserem Einsatz für Jerusalem und seine Bevölkerung.\n\nWie können wir Ihnen heute helfen? Antworten Sie auf diese Nachricht, und unser Team kümmert sich um Ihr Anliegen.",
  es: "Hola {{user.name}}:\n\nNos alegra poder atenderte y responder a tus preguntas sobre nuestros proyectos solidarios y nuestro trabajo al servicio de Jerusalén y sus habitantes.\n\n¿Cómo podemos ayudarte hoy? Responde a este mensaje y nuestro equipo te atenderá.",
  id: "Halo {{user.name}},\n\nKami senang dapat menjawab pertanyaan Anda tentang program amal kami serta upaya kami melayani Yerusalem dan masyarakatnya.\n\nApa yang dapat kami bantu hari ini? Balas pesan ini dan tim kami akan membantu Anda.",
  pt: "Olá {{user.name}},\n\nTemos todo o gosto em responder às suas perguntas sobre os nossos projetos solidários e o nosso trabalho ao serviço de Jerusalém e da sua população.\n\nComo podemos ajudar hoje? Responda a esta mensagem e a nossa equipa irá prestar-lhe apoio.",
  ur: "السلام علیکم {{user.name}}،\n\nہمیں آپ سے رابطہ کرکے خوشی ہوئی۔ ہم اپنے فلاحی منصوبوں اور القدس اور اس کے باشندوں کی خدمت سے متعلق آپ کے سوالات کے جواب دینے کے لیے حاضر ہیں۔\n\nآج ہم آپ کی کیا مدد کر سکتے ہیں؟ اس پیغام کا جواب دیں، ہماری ٹیم آپ کی رہنمائی کرے گی۔",
  sq: "Përshëndetje {{user.name}},\n\nMe kënaqësi u përgjigjemi pyetjeve tuaja për projektet tona bamirëse dhe punën tonë në shërbim të Jerusalemit dhe banorëve të tij.\n\nSi mund t’ju ndihmojmë sot? Përgjigjuni këtij mesazhi dhe ekipi ynë do t’ju ndihmojë.",
  it: "Buongiorno {{user.name}},\n\nSiamo lieti di rispondere alle sue domande sui nostri progetti solidali e sul nostro impegno al servizio di Gerusalemme e dei suoi abitanti.\n\nCome possiamo aiutarla oggi? Risponda a questo messaggio e il nostro team la assisterà.",
  nl: "Hallo {{user.name}},\n\nWe beantwoorden graag uw vragen over onze liefdadigheidsprojecten en ons werk voor Jeruzalem en zijn inwoners.\n\nHoe kunnen we u vandaag helpen? Beantwoord dit bericht en ons team helpt u verder.",
  sv: "Hej {{user.name}},\n\nVi svarar gärna på dina frågor om våra välgörenhetsprojekt och vårt arbete för Jerusalem och dess invånare.\n\nHur kan vi hjälpa dig idag? Svara på det här meddelandet så hjälper vårt team dig vidare.",
  no: "Hei {{user.name}},\n\nVi svarer gjerne på spørsmålene dine om veldedighetsprosjektene våre og arbeidet vårt for Jerusalem og innbyggerne der.\n\nHvordan kan vi hjelpe deg i dag? Svar på denne meldingen, så hjelper teamet vårt deg videre.",
  da: "Hej {{user.name}},\n\nVi besvarer gerne dine spørgsmål om vores velgørenhedsprojekter og vores arbejde for Jerusalem og byens indbyggere.\n\nHvordan kan vi hjælpe dig i dag? Svar på denne besked, så hjælper vores team dig videre.",
  ms: "Salam {{user.name}},\n\nKami berbesar hati untuk menjawab pertanyaan anda tentang projek kebajikan kami serta usaha kami berkhidmat untuk Baitulmaqdis dan penduduknya.\n\nBagaimanakah kami boleh membantu anda hari ini? Balas mesej ini dan pasukan kami akan membantu anda.",
  ja: "{{user.name}}様、こんにちは。\n\n私たちの慈善事業や、エルサレムとその住民を支援する活動について、ご質問にお答えいたします。\n\n本日はどのようなご用件でしょうか。このメッセージにご返信いただければ、担当チームがご案内いたします。",
  zh: "{{user.name}}，您好！\n\n我们很高兴为您解答有关慈善项目以及服务耶路撒冷及其居民的工作的问题。\n\n今天有什么可以帮助您的吗？请回复此消息，我们的团队会为您提供协助。",
  hi: "नमस्ते {{user.name}},\n\nहम अपनी परोपकारी परियोजनाओं और यरूशलेम तथा वहाँ के लोगों की सेवा से जुड़े आपके सवालों के जवाब देने के लिए उपलब्ध हैं।\n\nआज हम आपकी क्या मदद कर सकते हैं? इस संदेश का जवाब दें, हमारी टीम आपका मार्गदर्शन करेगी।",
};

export function greetingTemplateDraft() {
  const translations = Object.fromEntries(SUPPORTED_LOCALES.map(locale => {
    const copy = whatsappUnsubscribeCopy(locale);
    return [locale, { body: `${GREETINGS[locale]}\n\n${RECEIPT_BRANDS[locale]}`, footerText: copy.footer, buttons: [{ type: "QUICK_REPLY", text: copy.button }] }];
  })) as Record<SupportedLocale, { body: string; footerText: string; buttons: { type: string; text: string }[] }>;
  const hash = createHash("sha256").update(JSON.stringify(translations)).digest("hex").slice(0, 12);
  return { name: `mia_greeting_${hash}`, ...translations.ar, translations };
}

export function greetingTemplateMatches(existing: { body: string; footerText?: string | null; buttons?: unknown; translations: unknown }) {
  const draft = greetingTemplateDraft();
  const translations = existing.translations && typeof existing.translations === "object" ? existing.translations as Record<string, unknown> : {};
  const rootButtons = existing.buttons as Array<{ type?: string; text?: string }> | null;
  return existing.body === draft.body && existing.footerText === draft.footerText && Array.isArray(rootButtons) && rootButtons.length === 1 && rootButtons[0].type === draft.buttons[0].type && rootButtons[0].text === draft.buttons[0].text && SUPPORTED_LOCALES.every(locale => {
    const value = translations[locale] as { body?: string; footerText?: string; buttons?: Array<{ type?: string; text?: string }> } | undefined;
    const expected = draft.translations[locale];
    return value?.body === expected.body && value.footerText === expected.footerText && value.buttons?.length === 1 && value.buttons[0].type === expected.buttons[0].type && value.buttons[0].text === expected.buttons[0].text;
  });
}
