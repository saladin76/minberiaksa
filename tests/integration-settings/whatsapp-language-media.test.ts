import { test } from "node:test";
import { strict as assert } from "node:assert";
import { SUPPORTED_LOCALES } from "../../lib/locales";
import { translationSchema, templateButtonsSchema } from "../../lib/communication/whatsapp-template-schema";
import { META_TEMPLATE_LANGUAGES, templateLocaleFromLanguage, templateLocaleHeader, unsubmittedTemplateLocales } from "../../lib/communication/template-locale-media";
import { forEachTemplateSyncItem } from "../../lib/communication/template-sync-work";

for (const [index,locale] of SUPPORTED_LOCALES.entries()) {
  test(`${locale}: independent media survives API validation, persistence and provider locale resolution`, () => {
    const own = { type:index % 2 ? "VIDEO" : "IMAGE", mediaUrl:`https://assets.example/${locale}.${index % 2 ? "mp4" : "jpg"}`, exampleHandle:`sample_${locale}`, fileName:locale };
    const variant = translationSchema.parse({body:`Body ${locale}`,header:own});
    const template = JSON.parse(JSON.stringify({header:locale === "ar" ? own : {type:"IMAGE",mediaUrl:"https://assets.example/ar.jpg"},translations:{[locale]:variant}}));
    const language = META_TEMPLATE_LANGUAGES[locale];
    assert.ok(language);
    assert.equal(templateLocaleFromLanguage(language),locale);
    assert.deepEqual(templateLocaleHeader(template,language),own);
  });
}

test("failed initial publication retries Arabic and all unsent language variants", () => {
  const translations = {fr:{body:"Bonjour"},de:{body:"Hallo"}};
  assert.deepEqual(unsubmittedTemplateLocales(translations,new Set()),["ar","fr","de"]);
  assert.deepEqual(unsubmittedTemplateLocales(translations,new Set(["ar","fr"])),["de"]);
  assert.deepEqual(unsubmittedTemplateLocales(translations,new Set(["fr"])),["ar","de"]);
  assert.deepEqual(unsubmittedTemplateLocales(null,new Set()),["ar"]);
});

test("legacy variants inherit base media and an approved fallback uses its own language media", () => {
  const root = {type:"IMAGE",mediaUrl:"https://assets.example/ar.jpg"};
  const french = {type:"VIDEO",mediaUrl:"https://assets.example/fr.mp4"};
  const template={header:root,translations:{fr:{header:french},de:{body:"Hallo"},es:{header:{type:"NONE"}}}};
  assert.deepEqual(templateLocaleHeader(template,"de"),root);
  assert.deepEqual(templateLocaleHeader(template,"fr"),french);
  assert.deepEqual(templateLocaleHeader(template,"ar"),root);
  assert.deepEqual(templateLocaleHeader(template,"es"),{type:"NONE"});
  assert.notDeepEqual(templateLocaleHeader(template,"ar"),french);
});

test("invalid language media format is rejected instead of silently discarded", () => {
  assert.equal(translationSchema.safeParse({body:"hello",header:{type:"INVALID"}}).success,false);
});

test("large template sync bounds in-flight writes and completes every item", async () => {
  const completed=new Set<number>();
  let active=0, peak=0;
  await forEachTemplateSyncItem(Array.from({length:100},(_,i)=>i),6,async i=>{
    active++;peak=Math.max(peak,active);
    await new Promise(resolve=>setImmediate(resolve));
    completed.add(i);active--;
  });
  assert.equal(completed.size,100);
  assert.equal(peak,6);
  assert.equal(active,0);
});

test("sync write failure waits for started work and rejects before reconciliation", async () => {
  let active=0, started=0;
  await assert.rejects(forEachTemplateSyncItem([0,1,2,3,4,5,6,7],3,async i=>{
    active++;started++;
    try { await new Promise(resolve=>setImmediate(resolve)); if(i===0) throw new Error("DATABASE_UNAVAILABLE"); }
    finally { active--; }
  }),/DATABASE_UNAVAILABLE/);
  assert.equal(active,0);
  assert.equal(started,3);
});

test("Meta button limits reject excess URLs and phone buttons before publication",()=>{
  const url={type:"URL",text:"Donate",url:"https://example.test"};
  const phone={type:"PHONE_NUMBER",text:"Call",phoneNumber:"+905551112233"};
  assert.equal(templateButtonsSchema.safeParse([url,url]).success,true);
  assert.equal(templateButtonsSchema.safeParse([url,url,url]).success,false);
  assert.equal(templateButtonsSchema.safeParse([phone,phone]).success,false);
  assert.equal(translationSchema.safeParse({body:"Hello",buttons:[url,url,url,url]}).success,false);
});
