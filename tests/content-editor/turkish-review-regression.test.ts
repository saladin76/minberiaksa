import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { calculateZakat } from "../../lib/minbar/zakat-calculation";

const strings = JSON.parse(readFileSync("i18n/messages/tr.json", "utf8"));

test("Turkish homepage uses reviewed donation and endowment copy", () => {
  assert.equal(strings.homepage.recurringTitle, "Kalıcı Bir İyiliğe Dönüşen Düzenli Bağış");
  assert.equal(strings.common.startRecurring, "Düzenli Bağışı Başlat");
  assert.match(strings.homepage.heroLead, /Kudüs.*Mescid-i Aksâ/);
  assert.match(strings.homepage.waqfLead, /sürdürülebilir programlar/);
});

test("Turkish volunteer and profile panels do not fall back to English", () => {
  assert.equal(strings.volunteer.heroTitle, "Gönüllümüz Olun");
  assert.match(strings.volunteer.receivedNote, /\{field\}/);
  for (const block of [strings.volunteer, strings.Profile.support, strings.Profile.password, strings.Profile.avatar, strings.Profile.impact]) {
    for (const value of Object.values(block)) {
      if (typeof value === "string") assert.doesNotMatch(value, /\b(?:your account|password updated|please select|send request|volunteer with us|message was sent)\b/i);
    }
  }
  assert.equal(strings.TeamSupport.oneTimeNote, "Bu bağışla birlikte bir kez alınır.");
});

test("public search page and empty video notice have Turkish copy", () => {
  const searchPage = readFileSync("app/[locale]/search/page.tsx", "utf8");
  const gallery = readFileSync("components/minbar/videos/VideoGridPage.tsx", "utf8");
  assert.match(searchPage, /safeLocale === "tr"/);
  assert.match(searchPage, /Sitede Ara/);
  assert.match(gallery, /source.embedUrl \|\| source.watchUrl/);
  assert.match(gallery, /role="status"/);
  assert.match(strings.homepage.noPublishedVideos, /yayımlanmadı/);
});

test("Turkish gold nisab calculation and explanatory text agree", () => {
  assert.match(strings.zakat.nisabNote, /80,18 gram altın veya 595 gram gümüş/);
  const localized = calculateZakat({ cash: "8200" }, "100", "1", "gold", 80.18);
  const other = calculateZakat({ cash: "8200" }, "100", "1", "gold");
  assert.equal(localized.nisab, 8018);
  assert.equal(localized.due, 205);
  assert.equal(other.nisab, 8500);
  assert.equal(other.due, 0);
  assert.equal(calculateZakat({ cash: "8200" }, "100", "1", "silver", 80.18).nisab, 595);
});

test("reviewed Turkish Iftar story label and still-card navigation are wired", () => {
  const stories = readFileSync("components/minbar/home/TopSections.tsx", "utf8");
  const reels = readFileSync("components/minbar/home/MediaSections.tsx", "utf8");
  assert.match(stories, /story\.title\.trim\(\)\.toLocaleLowerCase\("tr"\) === "iftar"/);
  assert.match(stories, /title: "Bağış"/);
  assert.match(reels, /href=\{video\.regionKey\.toLowerCase\(\)/);
  assert.match(reels, /miaPath\("jerusalem", locale\)/);
  assert.match(reels, /miaPath\("aqsa", locale\)/);
});

test("donor linked identities and login code panels have a Turkish path", () => {
  for (const file of ["components/auth/DonorLinkedIdentities.tsx", "components/auth/DonorCodeLogin.tsx"]) {
    const src = readFileSync(file, "utf8");
    assert.match(src, /locale === "tr"/);
  }
  const identities = readFileSync("components/auth/DonorLinkedIdentities.tsx", "utf8");
  assert.match(identities, /Giriş Yöntemleri ve Bağlı Hesaplar/);
  assert.match(identities, /Birincil e-posta/);
  const login = readFileSync("components/auth/DonorCodeLogin.tsx", "utf8");
  assert.match(login, /Kodu Nasıl Almak İstersiniz/);
  assert.match(login, /Giriş Kodu Gönder/);
});
