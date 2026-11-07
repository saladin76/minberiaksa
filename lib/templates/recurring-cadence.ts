import { SUPPORTED_LOCALES, type SupportedLocale } from "../locales";

export type RecurringFrequency = "DAILY" | "FRIDAY" | "MONTHLY";
// Adjectives/periods are localized independently of the donor's browser language.
export const CADENCE_COPY: Record<SupportedLocale, readonly [string,string,string,string,string]> = {
  ar:["يومي","كل جمعة","شهري","دوري","دورية التبرع"],
  en:["daily","every Friday","monthly","recurring","Donation frequency"],
  tr:["günlük","her cuma","aylık","düzenli","Bağış sıklığı"],
  fr:["quotidien","chaque vendredi","mensuel","récurrent","Fréquence du don"],
  de:["täglich","jeden Freitag","monatlich","regelmäßig","Spendenrhythmus"],
  es:["diario","cada viernes","mensual","periódico","Frecuencia de la donación"],
  id:["harian","setiap Jumat","bulanan","rutin","Frekuensi donasi"],
  pt:["diário","todas as sextas-feiras","mensal","recorrente","Frequência do donativo"],
  ur:["روزانہ","ہر جمعہ","ماہانہ","باقاعدہ","عطیے کی تکرار"],
  sq:["ditor","çdo të premte","mujor","periodik","Shpeshtësia e dhurimit"],
  it:["giornaliero","ogni venerdì","mensile","periodico","Frequenza della donazione"],
  nl:["dagelijks","elke vrijdag","maandelijks","periodiek","Donatiefrequentie"],
  sv:["dagligen","varje fredag","månadsvis","återkommande","Donationsintervall"],
  no:["daglig","hver fredag","månedlig","fast","Donasjonsintervall"],
  da:["dagligt","hver fredag","månedligt","tilbagevendende","Donationsinterval"],
  ms:["harian","setiap Jumaat","bulanan","berkala","Kekerapan sumbangan"],
  ja:["毎日","毎週金曜日","毎月","定期","寄付の頻度"],
  zh:["每日","每周五","每月","定期","捐赠频率"],
  hi:["दैनिक","हर शुक्रवार","मासिक","नियमित","दान की आवृत्ति"],
};
const MONTHLY: Record<SupportedLocale,RegExp> = {
  ar:/الشهري(?:ة)?|شهري(?:اً|ًا|ا|ة)?/gu,en:/\bmonthly\b|\bevery month\b/gi,
  tr:/aylık|her ay/giu,fr:/mensuell?e?s?|chaque mois/giu,de:/monatlich(?:e[nmrs]?)?|jeden Monat/giu,
  es:/mensual(?:es)?|cada mes/giu,id:/bulanan|setiap bulan/giu,pt:/mensais|mensal|todos os meses/giu,
  ur:/ماہانہ/gu,sq:/mujor(?:e)?|çdo muaj/giu,it:/mensil[ei]|ogni mese/giu,nl:/maandelijks(?:e)?|elke maand/giu,
  sv:/månadsvis|månatlig(?:a|t)?|varje månad/giu,no:/månedlig(?:e)?|hver måned/giu,
  da:/månedlig(?:t|e)?|hver måned/giu,ms:/bulanan|setiap bulan/giu,ja:/毎月|月次/gu,zh:/每月|按月|月度/gu,hi:/मासिक|हर महीने/gu,
};
export function cadenceLocale(locale:string):SupportedLocale { const key=locale.toLowerCase().split(/[-_]/)[0].replace(/^nb$/,"no");return SUPPORTED_LOCALES.includes(key as SupportedLocale)?key as SupportedLocale:"en"; }
export function recurringFrequency(value:unknown):RecurringFrequency|null { return value==null?"MONTHLY":["DAILY","FRIDAY","MONTHLY"].includes(String(value))?value as RecurringFrequency:null; }
export function recurringFrequencyLabel(frequency:RecurringFrequency,locale:string) { return CADENCE_COPY[cadenceLocale(locale)][frequency==="DAILY"?0:frequency==="FRIDAY"?1:2]; }
// URLs, template tokens and HTML attributes must never be rewritten as prose.
function visibleText(text:string,locale:string,replacement:(matched:string)=>string) {
  const pattern=MONTHLY[cadenceLocale(locale)];
  return text.split(/(<[^>]*>|(?:https?:\/\/|\/)[^\s<>"']+|\{\{[^}]*\}\})/g).map((part,index)=>index%2?part:part.replace(pattern,replacement)).join("");
}
export function containsMonthlyCadence(text:string,locale:string) { let found=false;visibleText(text,locale,value=>{found=true;return value;});return found; }
export function recurringNotificationText(text:string,frequency:RecurringFrequency|undefined,locale:string) {
  if(!frequency||frequency==="MONTHLY")return text;
  return visibleText(text,locale,matched=>{
    const label=recurringFrequencyLabel(frequency,locale);
    if(cadenceLocale(locale)==="ar"&&frequency==="DAILY"&&matched.startsWith("ال"))return "اليومي";
    return /^[A-Z]/.test(matched)?label.charAt(0).toUpperCase()+label.slice(1):label;
  });
}
/** A new Meta draft; the approved source and its provider schema are unchanged. */
export function recurringTemplateDraftText(text:string,locale:string) {
  const key=cadenceLocale(locale);
  return `${CADENCE_COPY[key][4]}: {{subscription.frequencyLabel}}\n\n${recurringGenericText(text,locale)}`;
}
export function recurringGenericText(text:string,locale:string) {
  const key=cadenceLocale(locale);
  return visibleText(text,locale,matched=>key==="ar"&&matched.startsWith("ال")?"الدوري":CADENCE_COPY[key][3]);
}
export function recurringNotificationDocument<T>(document:T,frequency:RecurringFrequency|undefined,locale:string):T {
  if(!document||!frequency||frequency==="MONTHLY")return document;
  if(Array.isArray(document))return document.map(value=>recurringNotificationDocument(value,frequency,locale)) as T;
  if(typeof document!=="object")return document;
  return Object.fromEntries(Object.entries(document).map(([key,value])=>[key,typeof value==="string"&&["text","contents","subject","title"].includes(key)?recurringNotificationText(value,frequency,locale):value&&typeof value==="object"?recurringNotificationDocument(value,frequency,locale):value])) as T;
}
