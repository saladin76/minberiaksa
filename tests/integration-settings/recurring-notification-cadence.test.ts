import test from "node:test";
import assert from "node:assert/strict";
import * as cadence from "../../lib/templates/recurring-cadence";
import * as money from "../../lib/templates/money";
import * as donationMoney from "../../lib/templates/donation-money";
import * as projects from "../../lib/templates/donation-projects";
import { SUPPORTED_LOCALES } from "../../lib/locales";
import { notificationUpgradeDraft, approvedNotificationLocales } from "../../lib/communication/notification-template-upgrade";
import { buildStandardMetaComponents } from "../../lib/communication/meta-template-components";
import { buildMetaComponents } from "../../lib/communication/providers/meta-whatsapp/parameters";
import { fixtureModule } from "./gift-delivery-fixture";

for (const locale of SUPPORTED_LOCALES) for (const frequency of ["DAILY", "FRIDAY", "MONTHLY"] as const) {
  test(`${locale}/${frequency}: recurring message uses the exact period and keeps amounts, tokens and links`, () => {
    const label = cadence.recurringFrequencyLabel(frequency, locale);
    const monthly = cadence.CADENCE_COPY[locale][2];
    const source = `${monthly} 12.50 USD {{donation.amount}} <a href="/monthly">${monthly}</a> https://example.test/monthly`;
    const actual = cadence.recurringNotificationText(source, frequency, locale);
    assert.ok(actual.startsWith(label), actual);
    assert.ok(actual.includes('href="/monthly"') && actual.includes("https://example.test/monthly"));
    assert.ok(actual.includes("12.50 USD {{donation.amount}}"));
    assert.equal(cadence.recurringNotificationText("/monthly?term=monthly",frequency,"en"),"/monthly?term=monthly");
    if (frequency !== "MONTHLY") assert.equal(cadence.containsMonthlyCadence(actual, locale), false);
    const document = { text: { data: { props: { text: source } } }, button: { url: "/monthly", title: monthly } };
    const copy = cadence.recurringNotificationDocument(document, frequency, locale);
    assert.equal(copy.button.url, "/monthly"); assert.equal(document.text.data.props.text, source);
    const receipt = donationMoney.donationMoneyFields({ amount: 12.5, totalAmount: 12.5, currency: "USD", paidAt: new Date(), billingReason: "subscription_cycle", frequency }, locale).receiptSummary;
    assert.ok(receipt.includes(label));
  });
}

test("neutral Meta successor has one cadence slot in every language and retains its immutable source", () => {
  const translations = Object.fromEntries(SUPPORTED_LOCALES.map(locale => [locale, { body: `${cadence.CADENCE_COPY[locale][2]} {{user.name}}. Reference: {{donation.id}}. https://example.test/${locale}/account`, buttons: [{type:"URL",text:cadence.CADENCE_COPY[locale][2],url:`https://example.test/${locale}/monthly`}], header:{type:"TEXT",text:cadence.CADENCE_COPY[locale][2]},headerText:cadence.CADENCE_COPY[locale][2] }]));
  const source = { id: "source", name: "mia_subscription_created", body: translations.ar.body, translations, buttons: translations.ar.buttons, header: translations.ar.header, kind: "SYSTEM", category: "UTILITY", purpose: "UTILITY" };
  const before = JSON.stringify(source), draft = notificationUpgradeDraft(source, false, false, true);
  const variants = SUPPORTED_LOCALES.map(locale => {
    const value = draft.translations[locale];
    assert.equal(cadence.containsMonthlyCadence(value.body, locale), false);
    assert.equal(cadence.containsMonthlyCadence(value.headerText,locale),false);
    assert.equal(cadence.containsMonthlyCadence(value.buttons[0].text??"",locale),false);
    assert.equal(value.buttons[0].url,source.translations[locale].buttons[0].url);
    assert.equal(value.body.match(/\{\{subscription.frequencyLabel\}\}/g)?.length, 1);
    const schema = buildStandardMetaComponents(value);
    for (const frequency of ["DAILY", "FRIDAY", "MONTHLY"] as const) {
      const values = {"subscription.frequencyLabel":cadence.recurringFrequencyLabel(frequency,locale),"user.name":"Fixture","donation.id":"fixture"};
      assert.equal(buildMetaComponents({ componentsSchema:schema.components,values,positionalNames:schema.bindings.map(row=>row.key),scopedNames:Object.fromEntries(schema.bindings.map(row=>[`${row.scope}.${row.position}`,row.key])) }).ok,true);
    }
    return {locale,languageCode:locale==="no"?"nb":locale,approvalStatus:"APPROVED",category:"UTILITY",providerTemplateName:draft.name,componentsSchema:schema.components,rejectionReason:null,lastSyncedAt:new Date()};
  });
  assert.equal(approvedNotificationLocales(draft,variants).length,19);
  variants[0].approvalStatus="PENDING";assert.equal(approvedNotificationLocales(draft,variants).length,18);
  assert.equal(JSON.stringify(source),before);
});

test("context resolves only the donation's own subscription, including cancellation ownership and legacy monthly frequency", async () => {
  let frequency: string | null = "DAILY";
  let owner = "donor";
  const subscription = () => ({id:"specific",donorId:owner,frequency,amount:1,currency:"USD",nextBillingDate:new Date("2026-12-01T00:00:00Z")});
  const context = fixtureModule<typeof import("../../lib/templates/variables")>("lib/templates/variables.ts", {
    "@/lib/prisma":{prisma:{
      user:{findUnique:async()=>({id:"donor",name:"Fixture",preferredLang:"ar"})},
      donation:{findMany:async()=>[],findUnique:async()=>({id:"donation",donorId:"donor",locale:"en",amount:1,currency:"USD",status:"PAID",createdAt:new Date(),paidAt:new Date(),items:[],categoryItems:[],subscription:subscription()})},
      subscription:{findUnique:async({where}:{where:{id:string}})=>{assert.equal(where.id,"specific");return subscription();}},
    }},"./recurring-cadence":cadence,"./money":money,"./donation-money":donationMoney,"./donation-projects":projects,"./variable-catalog":{VARIABLE_CATALOG:[]},
  });
  for (const value of ["DAILY","FRIDAY","MONTHLY",null,"INVALID"]) {
    frequency=value;
    const ctx=await context.loadContextForDonation("donation");
    assert.equal(ctx?.subscription?.frequency,value==="INVALID"?undefined:value??"MONTHLY");
    if(ctx?.subscription) assert.equal(ctx.subscription.frequencyLabel,cadence.recurringFrequencyLabel(ctx.subscription.frequency,"en"));
  }
  frequency="FRIDAY";
  assert.equal((await context.loadContextForSubscription("specific","donor"))?.subscription?.frequencyLabel,"كل جمعة");
  owner="other";assert.equal(await context.loadContextForSubscription("specific","donor"),null);
});

test("actual trigger rendering corrects email/SMS and refuses an incompatible approved monthly WhatsApp body", async () => {
  const { readFileSync } = await import("node:fs");
  const text="Monthly donation for {{user.name}}";
  const template={id:"template",name:"subscription",body:text,subject:text,document:{text},translations:{en:{body:text,subject:text,document:{text}}}};
  const sent:Array<{renderedBody:string;renderingError?:string}>=[];
  const transport=async(input:{renderedBody:string;renderingError?:string})=>{sent.push(input);return input.renderingError?{outcome:"SKIPPED",reason:input.renderingError}:{outcome:"SENT"};};
  const deps:Record<string,unknown>=Object.fromEntries([...readFileSync("lib/events/dispatch.ts","utf8").matchAll(/from\s+["']([^"']+)["']/g)].map(row=>[row[1],{}]));
  Object.assign(deps,{
    "@/lib/prisma":{prisma:{emailTemplate:{findUnique:async()=>template},smsTemplate:{findUnique:async()=>template},whatsappTemplate:{findUnique:async()=>template}}},
    "@/lib/templates/recurring-cadence":cadence,"@/lib/templates/donation-money":donationMoney,
    "@/lib/templates/variables":{mergeText:(value:string)=>value.replace("{{user.name}}","Fixture")},
    "@/lib/templates/font":{automaticEmailHtml:(value:string)=>value},
    "@/lib/templates/render":{renderEmailHtml:async(doc:{text:string})=>doc.text.replace("{{user.name}}","Fixture"),renderEmailSubject:(value:string)=>value},
    "@/lib/templates/locale-resolver":{resolveEmailVariant:()=>({...template,resolvedLocale:"en"}),resolveWhatsappBody:()=>({body:text,resolvedLocale:"en"})},
    "@/lib/templates/localize-donation-failure-link":{localizeDonationFailureLinks:(value:string)=>value},
    "@/lib/communication/sender-resolution":{resolveSenderFromSnapshot:()=>({ok:true,sender:{id:"sender",senderEmail:"fixture@example.test",phoneNumberId:"number",businessAccountId:"waba"}})},
    "@/lib/communication/automatic-message-dispatcher":{sendAutomaticEmailMessage:transport,sendAutomaticSmsMessage:transport,sendAutomaticWhatsappMessage:transport,resolveMetaTemplateMapping:async()=>null},
  });
  const dispatch=fixtureModule<{sendTriggerMessage:(...args:unknown[])=>Promise<{outcome:string}|null>}>("lib/events/dispatch.ts",deps);
  const user={id:"fixture",name:"Fixture",email:"fixture@example.test",phone:"+905550000000",countryName:"",countryCode:"TR",city:"",region:"",preferredLang:"en"};
  for(const frequency of ["DAILY","FRIDAY","MONTHLY"] as const){
    const ctx={user,donations:[],totals:{count:"0",amountUSD:"0",lastAt:""},subscription:{id:"specific",frequency,frequencyLabel:cadence.recurringFrequencyLabel(frequency,"en"),amount:"1",currency:"USD",nextBillingDate:""}};
    for(const channel of ["EMAIL","SMS","WHATSAPP"]){
      const result=await dispatch.sendTriggerMessage({channel,templateId:"template"},ctx,{event:"SUBSCRIPTION_CREATED",locale:"en",config:{email:{} as never,whatsapp:{} as never}});
      assert.equal(result?.outcome,channel==="WHATSAPP"&&frequency!=="MONTHLY"?"SKIPPED":"SENT");
      if(channel!=="WHATSAPP")assert.ok(sent.at(-1)!.renderedBody.toLowerCase().startsWith(cadence.recurringFrequencyLabel(frequency,"en").toLowerCase()),`${channel}/${frequency}: ${sent.at(-1)!.renderedBody}`);
      else assert.equal(sent.at(-1)!.renderedBody,"Monthly donation for Fixture","approved provider text is unchanged");
    }
  }
});
