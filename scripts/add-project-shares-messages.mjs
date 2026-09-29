#!/usr/bin/env node
/**
 * Add the `ProjectShares` message namespace to the locale files.
 *
 * The wording of a سهوم (shares) campaign on the Minbar project card and the
 * project page's donation panel: the price of one share, the count chips, and
 * "N of M shares" progress. `{unit}` is either the campaign's own unit name
 * (Campaign.shareLabels, e.g. خروف / خراف) or `unitSingular` / `unitPlural`.
 *
 * App-level (PascalCase) namespace for the same reason as `TeamSupport`:
 * `scripts/sync-minbar-messages.mjs` rewrites every Minbar namespace and would
 * drop keys added there. Locales not listed here are filled from `en` by
 * `buildNormalizedMessages()`.
 *
 * Idempotent: re-running overwrites the namespace with the same content.
 *   node scripts/add-project-shares-messages.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";

const PROJECT_SHARES = {
  ar: {
    unitSingular: "سهم",
    unitPlural: "أسهم",
    count: "{count, plural, zero {# سهم} one {سهم واحد} two {سهمان} few {# أسهم} many {# سهمًا} other {# سهم}}",
    countWithUnit: "{count} {unit}",
    pricePer: "{price} لكل {unit}",
    soldOfTotal: "{sold} من {total} {unit}",
    givenSoFar: "تم التبرع بـ {count} {unit} حتى الآن",
    chooseCount: "اختر عدد {unit}",
    customCountPh: "عدد آخر",
  },
  en: {
    unitSingular: "share",
    unitPlural: "shares",
    count: "{count, plural, one {# share} other {# shares}}",
    countWithUnit: "{count} {unit}",
    pricePer: "{price} per {unit}",
    soldOfTotal: "{sold} of {total} {unit}",
    givenSoFar: "{count} {unit} given so far",
    chooseCount: "Choose the number of {unit}",
    customCountPh: "Other number",
  },
  tr: {
    unitSingular: "hisse",
    unitPlural: "hisse",
    count: "{count} hisse",
    countWithUnit: "{count} {unit}",
    pricePer: "{unit} başına {price}",
    soldOfTotal: "{total} {unit} içinden {sold}",
    givenSoFar: "Şu ana kadar {count} {unit} bağışlandı",
    chooseCount: "{unit} sayısını seçin",
    customCountPh: "Başka sayı",
  },
  fr: {
    unitSingular: "part",
    unitPlural: "parts",
    count: "{count, plural, one {# part} other {# parts}}",
    countWithUnit: "{count} {unit}",
    pricePer: "{price} par {unit}",
    soldOfTotal: "{sold} sur {total} {unit}",
    givenSoFar: "{count} {unit} données jusqu'ici",
    chooseCount: "Choisissez le nombre de {unit}",
    customCountPh: "Autre nombre",
  },
  de: {
    unitSingular: "Anteil",
    unitPlural: "Anteile",
    count: "{count, plural, one {# Anteil} other {# Anteile}}",
    countWithUnit: "{count} {unit}",
    pricePer: "{price} pro {unit}",
    soldOfTotal: "{sold} von {total} {unit}",
    givenSoFar: "Bisher {count} {unit} gespendet",
    chooseCount: "Anzahl der {unit} wählen",
    customCountPh: "Andere Anzahl",
  },
  es: {
    unitSingular: "participación",
    unitPlural: "participaciones",
    count: "{count, plural, one {# participación} other {# participaciones}}",
    countWithUnit: "{count} {unit}",
    pricePer: "{price} por {unit}",
    soldOfTotal: "{sold} de {total} {unit}",
    givenSoFar: "{count} {unit} donadas hasta ahora",
    chooseCount: "Elige el número de {unit}",
    customCountPh: "Otro número",
  },
  pt: {
    unitSingular: "quota",
    unitPlural: "quotas",
    count: "{count, plural, one {# quota} other {# quotas}}",
    countWithUnit: "{count} {unit}",
    pricePer: "{price} por {unit}",
    soldOfTotal: "{sold} de {total} {unit}",
    givenSoFar: "{count} {unit} doadas até agora",
    chooseCount: "Escolha o número de {unit}",
    customCountPh: "Outro número",
  },
  id: {
    unitSingular: "saham",
    unitPlural: "saham",
    count: "{count} saham",
    countWithUnit: "{count} {unit}",
    pricePer: "{price} per {unit}",
    soldOfTotal: "{sold} dari {total} {unit}",
    givenSoFar: "{count} {unit} telah didonasikan",
    chooseCount: "Pilih jumlah {unit}",
    customCountPh: "Jumlah lain",
  },
};

let written = 0;
for (const locale of Object.keys(PROJECT_SHARES)) {
  const file = `i18n/messages/${locale}.json`;
  const json = JSON.parse(readFileSync(file, "utf8"));
  json.ProjectShares = PROJECT_SHARES[locale];
  writeFileSync(file, `${JSON.stringify(json, null, 2)}\n`, "utf8");
  written += 1;
}
console.log(`[project-shares-messages] wrote ProjectShares namespace to ${written} locale files`);
