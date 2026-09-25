import test from "node:test";
import assert from "node:assert/strict";
import { bareWish, parseAmount, parseCommand, parseFrequency, parseGiftName, parseIntent, parseMessage, parseRegion, needsRuling, wantsToDonate } from "../../lib/ai/concierge/intent";

test("language and currency switches are read without the model", () => {
  assert.deepEqual(parseCommand("غير لغة الموقع للإنجليزية"), { kind: "set_language", locale: "en" });
  assert.deepEqual(parseCommand("خلي الموقع بالتركي"), { kind: "set_language", locale: "tr" });
  assert.deepEqual(parseCommand("switch the language to Arabic"), { kind: "set_language", locale: "ar" });
  assert.deepEqual(parseCommand("حول العملة لليورو"), { kind: "set_currency", currency: "EUR" });
  assert.deepEqual(parseCommand("change currency to Turkish lira"), { kind: "set_currency", currency: "TRY" });
  assert.deepEqual(parseCommand("para birimini dolar yap"), { kind: "set_currency", currency: "USD" });
  assert.deepEqual(parseCommand("please switch the site to Turkish"), { kind: "set_language", locale: "tr" });
  assert.deepEqual(parseCommand("mets le site en arabe"), { kind: "set_language", locale: "ar" });
  assert.deepEqual(parseCommand("change the site currency to Turkish lira"), { kind: "set_currency", currency: "TRY" });
  assert.equal(parseCommand("I love the English language"), null, "a mention is not a request");
  assert.equal(parseCommand("عايز اتبرع 100 دولار"), null, "an amount in dollars is not a currency switch");
});

test("a bare wish to give is recognised so the areas can be offered", () => {
  assert.equal(bareWish("عايز اتبرع"), true);
  assert.equal(bareWish("I want to donate $50 monthly"), true);
  assert.equal(bareWish("معايا 500 دولار عايز اتبرع بيهم على 5 شهور"), true);
  assert.equal(bareWish("عايز اتبرع للأيتام"), false);
  assert.equal(bareWish("I want to donate to something like education"), false);
  assert.equal(wantsToDonate("عايز اتبرع"), true);
  assert.equal(wantsToDonate("I want to donate"), true);
  assert.equal(wantsToDonate("bağış yapmak istiyorum"), true);
  assert.equal(wantsToDonate("hello there"), false);
  assert.equal(parseIntent("عايز اتبرع"), null, "no cause named, so no intent — the engine asks where");
});

/**
 * The deterministic reading of a visitor's message is what the concierge
 * trusts for numbers and what answers when the model is off, so it is pinned
 * here in the languages the site sees most.
 */

test("amounts and currencies are read in Arabic, English and Turkish", () => {
  assert.deepEqual(parseAmount("معايا 500 دولار وعايز صدقة جارية"), { amount: 500, currency: "USD" });
  assert.deepEqual(parseAmount("عندي ٢٥٠ ليرة"), { amount: 250, currency: "TRY" });
  assert.deepEqual(parseAmount("I can give $1,500 monthly"), { amount: 1500, currency: "USD" });
  assert.deepEqual(parseAmount("2k euros for water"), { amount: 2000, currency: "EUR" });
  assert.deepEqual(parseAmount("100 TL bağışlamak istiyorum"), { amount: 100, currency: "TRY" });
  assert.equal(parseAmount("عايز أطلع زكاة مالي").amount, null);
  assert.equal(parseAmount("we are 100% sure").amount, null);
});

test("frequencies", () => {
  assert.equal(parseFrequency("عايز أتبرع كل جمعة"), "friday");
  assert.equal(parseFrequency("كل شهر 50 دولار"), "monthly");
  assert.equal(parseFrequency("every day please"), "daily");
  assert.equal(parseFrequency("her cuma"), "friday");
  assert.equal(parseFrequency("just once"), "once");
  assert.equal(parseFrequency("500 دولار"), null);
});

test("intents", () => {
  assert.equal(parseIntent("معايا 500 دولار وعايز حاجة يكون ليها أثر مستمر"), "sadaqah_jariyah");
  assert.equal(parseIntent("عايز أطلع زكاة مالي"), "zakat");
  assert.equal(parseIntent("إيه أكتر حاجة محتاجة دعم؟"), "most_needed");
  assert.equal(parseIntent("عايز أعمل وقف"), "waqf");
  assert.equal(parseIntent("عايز أتبرع كل جمعة"), "recurring");
  assert.equal(parseIntent("I want to help with emergency relief in Gaza"), "relief");
  assert.equal(parseIntent("عايز أتبرع باسم أمي"), "gift");
  assert.equal(parseIntent("Zekâtımı vermek istiyorum"), "zakat");
  assert.equal(parseIntent("مش عارف أتبرع فين"), "explore");
  assert.equal(parseIntent("hello"), null);
  /* A problem beats everything else in the sentence. */
  assert.equal(parseIntent("عايز فلوسي ترجع من تبرع الزكاة"), "support");
  assert.equal(parseIntent("I was charged twice for my donation"), "support");
  assert.equal(parseIntent("Bağışım için iade istiyorum"), "support");
  /* The donor's own giving beats the cause words inside the sentence. */
  assert.equal(parseIntent("فين إيصال تبرعي للزكاة؟"), "account");
  assert.equal(parseIntent("did my donation go through?"), "account");
  assert.equal(parseIntent("when is my next charge"), "account");
  assert.equal(parseIntent("bağışım ulaştı mı"), "account");
});

test("regions map to the site's category slugs", () => {
  assert.equal(parseRegion("relief in Gaza"), "gaza");
  assert.equal(parseRegion("مشاريع القدس"), "al-quds");
  assert.equal(parseRegion("Suriye için"), "syria");
  assert.equal(parseRegion("nothing here"), null);
});

test("gift names and rulings", () => {
  assert.equal(parseGiftName("عايز أتبرع باسم أمي"), "أمي");
  assert.equal(parseGiftName("a donation in the name of my late father"), "my late father");
  assert.equal(parseGiftName("500 dollars"), null);
  assert.equal(needsRuling("هل يجوز إخراج الزكاة لبناء مسجد؟"), true);
  assert.equal(needsRuling("is it permissible to give zakat to my brother"), true);
  assert.equal(needsRuling("عايز أطلع زكاة مالي"), false);
});

test("a total over a span becomes an instalment at the span's cadence", () => {
  let p = parseMessage("معايا 500 دولار عايز اتبرع بيهم على 5 شهور");
  assert.equal(p.amount, 100);
  assert.equal(p.frequency, "monthly");
  p = parseMessage("I have $500 and want to give it over 5 months");
  assert.equal(p.amount, 100);
  assert.equal(p.frequency, "monthly");
  p = parseMessage("200 dollars weekly");
  assert.equal(p.amount, 200);
  assert.equal(p.frequency, "friday");
  p = parseMessage("1200 TL 6 ay boyunca");
  assert.equal(p.amount, 200);
  assert.equal(p.frequency, "monthly");
  p = parseMessage("عايز أتبرع شهرين");
  assert.equal(p.amount, null, "the span alone is not an amount");
  assert.equal(p.frequency, "monthly");
  p = parseMessage("عايز اتبرع");
  assert.equal(p.amount, null);
  assert.equal(p.frequency, null);
});

test("parseMessage combines the pieces", () => {
  const p = parseMessage("عايز أتبرع بـ500 دولار للمشروع ده كل شهر");
  assert.equal(p.amount, 500);
  assert.equal(p.currency, "USD");
  assert.equal(p.frequency, "monthly");
  assert.equal(p.intent, "current_page");
});
