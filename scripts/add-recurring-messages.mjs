#!/usr/bin/env node
/**
 * Add the `Recurring` message namespace to every locale file.
 *
 * These strings describe what a recurring plan will do — the next charge
 * date shown before the donor confirms, and the "set up, first charge on
 * Friday" state — and were introduced with the frequency contract fix
 * (`DEPLOYED_VS_DESIGN_AUDIT.md` § P0.2).
 *
 * They live in an app-level (PascalCase) namespace rather than in the Minbar
 * bundles because `scripts/sync-minbar-messages.mjs` rewrites every Minbar
 * namespace from `Minbar/i18n/` on each run and would drop keys added there,
 * and the handoff's own translation pipeline (`Minbar/translation-sync.js`)
 * is not runnable here. `buildNormalizedMessages()` fills any gap from `en`.
 *
 * Idempotent: re-running overwrites the namespace with the same content.
 *   node scripts/add-recurring-messages.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";

const MESSAGES = {
  ar: {
    nextChargeOn: "الخصم القادم: {date}",
    firstChargeOn: "أول خصم: {date}",
    firstChargeToday: "يُخصم المبلغ الآن، ثم {cadence}",
    planScheduledTitle: "تم إعداد تبرعك الدوري",
    planScheduledLead: "حُفظت بطاقتك ولم يُخصم أي مبلغ بعد. أول خصم يوم {date}.",
    planActiveLead: "سيُخصم نفس المبلغ {cadence}. الخصم القادم: {date}.",
    cadenceDaily: "كل يوم",
    cadenceFriday: "كل جمعة",
    cadenceMonthly: "كل شهر",
    stripeNotReady: "نموذج الدفع لم يكتمل تحميله بعد — حاول مرة أخرى بعد لحظات.",
  },
  en: {
    nextChargeOn: "Next charge: {date}",
    firstChargeOn: "First charge: {date}",
    firstChargeToday: "Charged now, then {cadence}",
    planScheduledTitle: "Your recurring gift is set up",
    planScheduledLead: "Your card is saved and nothing has been charged yet. The first charge is on {date}.",
    planActiveLead: "The same amount will be charged {cadence}. Next charge: {date}.",
    cadenceDaily: "every day",
    cadenceFriday: "every Friday",
    cadenceMonthly: "every month",
    stripeNotReady: "The payment form is still loading — please try again in a moment.",
  },
  tr: {
    nextChargeOn: "Sonraki çekim: {date}",
    firstChargeOn: "İlk çekim: {date}",
    firstChargeToday: "Şimdi çekilir, sonra {cadence}",
    planScheduledTitle: "Düzenli bağışınız ayarlandı",
    planScheduledLead: "Kartınız kaydedildi, henüz bir çekim yapılmadı. İlk çekim {date} tarihinde.",
    planActiveLead: "Aynı tutar {cadence} çekilecek. Sonraki çekim: {date}.",
    cadenceDaily: "her gün",
    cadenceFriday: "her cuma",
    cadenceMonthly: "her ay",
    stripeNotReady: "Ödeme formu hâlâ yükleniyor — lütfen birazdan tekrar deneyin.",
  },
  fr: {
    nextChargeOn: "Prochain prélèvement : {date}",
    firstChargeOn: "Premier prélèvement : {date}",
    firstChargeToday: "Prélevé maintenant, puis {cadence}",
    planScheduledTitle: "Votre don régulier est configuré",
    planScheduledLead: "Votre carte est enregistrée et rien n'a encore été prélevé. Le premier prélèvement aura lieu le {date}.",
    planActiveLead: "Le même montant sera prélevé {cadence}. Prochain prélèvement : {date}.",
    cadenceDaily: "chaque jour",
    cadenceFriday: "chaque vendredi",
    cadenceMonthly: "chaque mois",
    stripeNotReady: "Le formulaire de paiement se charge encore — veuillez réessayer dans un instant.",
  },
  de: {
    nextChargeOn: "Nächste Abbuchung: {date}",
    firstChargeOn: "Erste Abbuchung: {date}",
    firstChargeToday: "Jetzt abgebucht, danach {cadence}",
    planScheduledTitle: "Ihre regelmäßige Spende ist eingerichtet",
    planScheduledLead: "Ihre Karte ist gespeichert; es wurde noch nichts abgebucht. Die erste Abbuchung erfolgt am {date}.",
    planActiveLead: "Derselbe Betrag wird {cadence} abgebucht. Nächste Abbuchung: {date}.",
    cadenceDaily: "täglich",
    cadenceFriday: "jeden Freitag",
    cadenceMonthly: "monatlich",
    stripeNotReady: "Das Zahlungsformular lädt noch — bitte versuchen Sie es gleich noch einmal.",
  },
  es: {
    nextChargeOn: "Próximo cargo: {date}",
    firstChargeOn: "Primer cargo: {date}",
    firstChargeToday: "Se cobra ahora y luego {cadence}",
    planScheduledTitle: "Tu donación periódica está configurada",
    planScheduledLead: "Tu tarjeta está guardada y aún no se ha cobrado nada. El primer cargo será el {date}.",
    planActiveLead: "Se cobrará el mismo importe {cadence}. Próximo cargo: {date}.",
    cadenceDaily: "cada día",
    cadenceFriday: "cada viernes",
    cadenceMonthly: "cada mes",
    stripeNotReady: "El formulario de pago aún se está cargando; inténtalo de nuevo en un momento.",
  },
  id: {
    nextChargeOn: "Penarikan berikutnya: {date}",
    firstChargeOn: "Penarikan pertama: {date}",
    firstChargeToday: "Ditarik sekarang, lalu {cadence}",
    planScheduledTitle: "Donasi rutin Anda telah diatur",
    planScheduledLead: "Kartu Anda tersimpan dan belum ada penarikan. Penarikan pertama pada {date}.",
    planActiveLead: "Jumlah yang sama akan ditarik {cadence}. Penarikan berikutnya: {date}.",
    cadenceDaily: "setiap hari",
    cadenceFriday: "setiap Jumat",
    cadenceMonthly: "setiap bulan",
    stripeNotReady: "Formulir pembayaran masih dimuat — silakan coba lagi sebentar lagi.",
  },
  pt: {
    nextChargeOn: "Próxima cobrança: {date}",
    firstChargeOn: "Primeira cobrança: {date}",
    firstChargeToday: "Cobrado agora e depois {cadence}",
    planScheduledTitle: "A sua doação recorrente está configurada",
    planScheduledLead: "O seu cartão foi guardado e ainda nada foi cobrado. A primeira cobrança será em {date}.",
    planActiveLead: "O mesmo valor será cobrado {cadence}. Próxima cobrança: {date}.",
    cadenceDaily: "todos os dias",
    cadenceFriday: "todas as sextas-feiras",
    cadenceMonthly: "todos os meses",
    stripeNotReady: "O formulário de pagamento ainda está a carregar — tente novamente dentro de instantes.",
  },
  ur: {
    nextChargeOn: "اگلی کٹوتی: {date}",
    firstChargeOn: "پہلی کٹوتی: {date}",
    firstChargeToday: "ابھی کٹوتی ہوگی، پھر {cadence}",
    planScheduledTitle: "آپ کا باقاعدہ عطیہ ترتیب دے دیا گیا",
    planScheduledLead: "آپ کا کارڈ محفوظ ہو گیا اور ابھی کوئی رقم نہیں کاٹی گئی۔ پہلی کٹوتی {date} کو ہوگی۔",
    planActiveLead: "یہی رقم {cadence} کاٹی جائے گی۔ اگلی کٹوتی: {date}۔",
    cadenceDaily: "ہر روز",
    cadenceFriday: "ہر جمعہ",
    cadenceMonthly: "ہر ماہ",
    stripeNotReady: "ادائیگی کا فارم ابھی لوڈ ہو رہا ہے — براہِ کرم تھوڑی دیر بعد دوبارہ کوشش کریں۔",
  },
  sq: {
    nextChargeOn: "Pagesa e radhës: {date}",
    firstChargeOn: "Pagesa e parë: {date}",
    firstChargeToday: "Tërhiqet tani, pastaj {cadence}",
    planScheduledTitle: "Dhurimi juaj i rregullt është konfiguruar",
    planScheduledLead: "Karta juaj është ruajtur dhe asgjë nuk është tërhequr ende. Pagesa e parë bëhet më {date}.",
    planActiveLead: "E njëjta shumë do të tërhiqet {cadence}. Pagesa e radhës: {date}.",
    cadenceDaily: "çdo ditë",
    cadenceFriday: "çdo të premte",
    cadenceMonthly: "çdo muaj",
    stripeNotReady: "Formulari i pagesës është ende duke u ngarkuar — provoni sërish pas pak.",
  },
  it: {
    nextChargeOn: "Prossimo addebito: {date}",
    firstChargeOn: "Primo addebito: {date}",
    firstChargeToday: "Addebitato ora, poi {cadence}",
    planScheduledTitle: "La tua donazione ricorrente è impostata",
    planScheduledLead: "La tua carta è salvata e non è ancora stato addebitato nulla. Il primo addebito sarà il {date}.",
    planActiveLead: "Lo stesso importo verrà addebitato {cadence}. Prossimo addebito: {date}.",
    cadenceDaily: "ogni giorno",
    cadenceFriday: "ogni venerdì",
    cadenceMonthly: "ogni mese",
    stripeNotReady: "Il modulo di pagamento è ancora in caricamento: riprova tra un istante.",
  },
  nl: {
    nextChargeOn: "Volgende afschrijving: {date}",
    firstChargeOn: "Eerste afschrijving: {date}",
    firstChargeToday: "Nu afgeschreven, daarna {cadence}",
    planScheduledTitle: "Uw periodieke gift is ingesteld",
    planScheduledLead: "Uw kaart is opgeslagen en er is nog niets afgeschreven. De eerste afschrijving is op {date}.",
    planActiveLead: "Hetzelfde bedrag wordt {cadence} afgeschreven. Volgende afschrijving: {date}.",
    cadenceDaily: "elke dag",
    cadenceFriday: "elke vrijdag",
    cadenceMonthly: "elke maand",
    stripeNotReady: "Het betaalformulier wordt nog geladen — probeer het zo opnieuw.",
  },
  sv: {
    nextChargeOn: "Nästa dragning: {date}",
    firstChargeOn: "Första dragning: {date}",
    firstChargeToday: "Dras nu, därefter {cadence}",
    planScheduledTitle: "Din återkommande gåva är inställd",
    planScheduledLead: "Ditt kort är sparat och inget har dragits ännu. Första dragningen sker {date}.",
    planActiveLead: "Samma belopp dras {cadence}. Nästa dragning: {date}.",
    cadenceDaily: "varje dag",
    cadenceFriday: "varje fredag",
    cadenceMonthly: "varje månad",
    stripeNotReady: "Betalningsformuläret laddas fortfarande — försök igen om en stund.",
  },
  no: {
    nextChargeOn: "Neste trekk: {date}",
    firstChargeOn: "Første trekk: {date}",
    firstChargeToday: "Trekkes nå, deretter {cadence}",
    planScheduledTitle: "Den faste gaven din er satt opp",
    planScheduledLead: "Kortet ditt er lagret, og ingenting er trukket ennå. Første trekk skjer {date}.",
    planActiveLead: "Samme beløp trekkes {cadence}. Neste trekk: {date}.",
    cadenceDaily: "hver dag",
    cadenceFriday: "hver fredag",
    cadenceMonthly: "hver måned",
    stripeNotReady: "Betalingsskjemaet laster fortsatt — prøv igjen om et øyeblikk.",
  },
  da: {
    nextChargeOn: "Næste trækning: {date}",
    firstChargeOn: "Første trækning: {date}",
    firstChargeToday: "Trækkes nu, derefter {cadence}",
    planScheduledTitle: "Din faste gave er sat op",
    planScheduledLead: "Dit kort er gemt, og der er endnu ikke trukket noget. Første trækning sker {date}.",
    planActiveLead: "Samme beløb trækkes {cadence}. Næste trækning: {date}.",
    cadenceDaily: "hver dag",
    cadenceFriday: "hver fredag",
    cadenceMonthly: "hver måned",
    stripeNotReady: "Betalingsformularen indlæses stadig — prøv igen om et øjeblik.",
  },
  ms: {
    nextChargeOn: "Caj seterusnya: {date}",
    firstChargeOn: "Caj pertama: {date}",
    firstChargeToday: "Dicaj sekarang, kemudian {cadence}",
    planScheduledTitle: "Derma berkala anda telah disediakan",
    planScheduledLead: "Kad anda telah disimpan dan belum ada caj dibuat. Caj pertama pada {date}.",
    planActiveLead: "Jumlah yang sama akan dicaj {cadence}. Caj seterusnya: {date}.",
    cadenceDaily: "setiap hari",
    cadenceFriday: "setiap Jumaat",
    cadenceMonthly: "setiap bulan",
    stripeNotReady: "Borang pembayaran masih dimuatkan — sila cuba lagi sebentar.",
  },
  ja: {
    nextChargeOn: "次回の決済：{date}",
    firstChargeOn: "初回の決済：{date}",
    firstChargeToday: "今すぐ決済され、その後{cadence}",
    planScheduledTitle: "継続寄付の設定が完了しました",
    planScheduledLead: "カードは保存され、まだ決済は行われていません。初回の決済は{date}です。",
    planActiveLead: "同じ金額が{cadence}決済されます。次回の決済：{date}。",
    cadenceDaily: "毎日",
    cadenceFriday: "毎週金曜日",
    cadenceMonthly: "毎月",
    stripeNotReady: "決済フォームを読み込んでいます。しばらくしてからもう一度お試しください。",
  },
  zh: {
    nextChargeOn: "下次扣款：{date}",
    firstChargeOn: "首次扣款：{date}",
    firstChargeToday: "现在扣款，之后{cadence}",
    planScheduledTitle: "您的定期捐赠已设置完成",
    planScheduledLead: "您的银行卡已保存，尚未扣款。首次扣款日期为 {date}。",
    planActiveLead: "将{cadence}扣除相同金额。下次扣款：{date}。",
    cadenceDaily: "每天",
    cadenceFriday: "每周五",
    cadenceMonthly: "每月",
    stripeNotReady: "支付表单仍在加载中，请稍后重试。",
  },
  hi: {
    nextChargeOn: "अगली कटौती: {date}",
    firstChargeOn: "पहली कटौती: {date}",
    firstChargeToday: "अभी कटौती होगी, फिर {cadence}",
    planScheduledTitle: "आपका नियमित दान सेट हो गया है",
    planScheduledLead: "आपका कार्ड सहेज लिया गया है और अभी कोई राशि नहीं काटी गई है। पहली कटौती {date} को होगी।",
    planActiveLead: "यही राशि {cadence} काटी जाएगी। अगली कटौती: {date}।",
    cadenceDaily: "हर दिन",
    cadenceFriday: "हर शुक्रवार",
    cadenceMonthly: "हर महीने",
    stripeNotReady: "भुगतान फ़ॉर्म अभी लोड हो रहा है — कृपया कुछ क्षण बाद पुनः प्रयास करें।",
  },
};

/**
 * The donor-facing state of a plan whose scheduler charges kept failing
 * (`SubscriptionStatus.PAYMENT_FAILED`) — shown on the account page next to
 * the plan, where "cancelled" would be untrue and "active" a lie.
 */
const PAYMENT_FAILED = {
  ar: "تعذّر الخصم — يرجى تحديث بيانات البطاقة",
  en: "Payment failed — please update your card",
  tr: "Çekim başarısız — lütfen kart bilgilerinizi güncelleyin",
  fr: "Prélèvement échoué — veuillez mettre à jour votre carte",
  de: "Abbuchung fehlgeschlagen — bitte Kartendaten aktualisieren",
  es: "Cobro fallido — actualiza tu tarjeta",
  id: "Penarikan gagal — perbarui kartu Anda",
  pt: "Cobrança falhou — atualize o seu cartão",
  ur: "کٹوتی ناکام — براہِ کرم اپنے کارڈ کی معلومات اپ ڈیٹ کریں",
  sq: "Pagesa dështoi — përditësoni kartën tuaj",
  it: "Addebito non riuscito — aggiorna la tua carta",
  nl: "Afschrijving mislukt — werk uw kaart bij",
  sv: "Dragningen misslyckades — uppdatera ditt kort",
  no: "Trekket mislyktes — oppdater kortet ditt",
  da: "Trækningen mislykkedes — opdater dit kort",
  ms: "Caj gagal — kemas kini kad anda",
  ja: "決済に失敗しました — カード情報を更新してください",
  zh: "扣款失败 — 请更新您的银行卡",
  hi: "कटौती विफल — कृपया अपना कार्ड अपडेट करें",
};

let written = 0;
for (const [locale, block] of Object.entries(MESSAGES)) {
  const file = `i18n/messages/${locale}.json`;
  const json = JSON.parse(readFileSync(file, "utf8"));
  json.Recurring = { ...block, subscriptionPaymentFailed: PAYMENT_FAILED[locale] };
  writeFileSync(file, `${JSON.stringify(json, null, 2)}\n`, "utf8");
  written += 1;
}
console.log(`[recurring-messages] wrote Recurring namespace to ${written} locale files`);
