import type { AdPlatform } from "./detect-source";

const PLATFORMS: Record<string, AdPlatform> = { fb:"meta",facebook:"meta",ig:"meta",instagram:"meta",meta:"meta",google:"google",google_ads:"google",googleads:"google",google_adwords:"google",google_adsense:"google",facebook_ads:"meta",meta_ads:"meta",instagram_ads:"meta",adwords:"google",youtube:"google",yt:"google",gdn:"google",tiktok:"tiktok",tt:"tiktok",twitter:"x",x:"x",snapchat:"snapchat",snap:"snapchat",linkedin:"linkedin",li:"linkedin",reddit:"reddit" };
const CLICKS: Record<string, AdPlatform> = { fbclid:"meta",fbc:"meta",gclid:"google",dclid:"google",gbraid:"google",wbraid:"google",ttclid:"tiktok",twclid:"x",snap_click_id:"snapchat",scid:"snapchat",scclid:"snapchat",li_fat_id:"linkedin",rdt_cid:"reddit" };
const PAID=/^(?:cpc|ppc|paid|paid[_ -]?social|social[_ -]?paid|display|banner|video|retargeting|remarketing)$/i;
export type SourceKind="paid"|"campaign"|"social"|"referral"|"organic"|"direct"|"unknown";
export function attributionText(value:unknown):string|null {
  const text=typeof value==="string"?value.trim():typeof value==="number"&&Number.isFinite(value)?String(value):"";
  return text&&!/\{\{|\}\}|__(?:CAMPAIGN|ADGROUP|AD|PLACEMENT|CREATIVE)_/i.test(text)?text:null;
}
export function resolveDonationSourceSignals(input:Record<string,unknown>|null|undefined) {
  const raw=input||{},attr:Record<string,unknown>={...raw,scclid:raw.scclid||raw.ScCid||raw.sccid||raw.sc_click_id},source=attributionText(attr.utm_source)||attributionText(attr.ga_source)||attributionText(attr.ga4_source),medium=attributionText(attr.utm_medium)||attributionText(attr.ga_medium)||attributionText(attr.ga4_medium);
  const platformHint=source||attributionText(attr.platform)||attributionText(attr.publisher_platform)||attributionText(attr.site_source_name);
  const declared=platformHint?PLATFORMS[platformHint.toLowerCase().replace(/[ .-]+/g,"_")]:undefined;
  const nativeKeys=Object.keys(CLICKS).filter(key=>key!=="fbc"&&Boolean(attributionText(attr[key])));
  // A saved Meta matching cookie must not overrule a fresh click on another platform.
  const clickKeys=[...nativeKeys,...(attributionText(attr.fbc)&&(!declared||declared==="meta")&&!nativeKeys.some(key=>CLICKS[key]!=="meta")&&attr.source_capture!=="referrer"?["fbc"]:[])];
  const clickPlatforms=[...new Set(clickKeys.map(key=>CLICKS[key]))];
  let platform=declared;
  const conflict=Boolean(platform&&clickPlatforms.some(candidate=>candidate!==platform))||clickPlatforms.length>1;
  platform=platform||clickPlatforms[0];
  const inheritedKind=attr.attribution_origin==="subscription_signup"?attributionText(attr.acquisition_kind):null;
  const paidEvidence=Boolean(inheritedKind==="paid"||medium&&PAID.test(medium)||clickKeys.some(key=>!["fbclid","fbc"].includes(key))||platform&&attributionText(attr.ad_id));
  let referrer:string|null=null;
  for(const key of ["first_referrer","referrer","ga_referrer"]) {
    const value=attributionText(attr[key]);if(!value)continue;
    try {const url=new URL(value);if(!/^https?:$/.test(url.protocol))continue;const host=url.hostname.replace(/^www\./,"");const current=attributionText(attr.conversion_page)||attributionText(attr.landing_page);const own=current?new URL(current).hostname.replace(/^www\./,""):"minberiaksa.org";if(host!==own&&host!=="minberiaksa.org"){referrer=host;break;}}catch{}
  }
  const campaign=attributionText(attr.campaign_name)||attributionText(attr.utm_campaign);
  let sourceKind:SourceKind=paidEvidence?"paid":medium&&/^(organic)$/i.test(medium)?"organic":medium&&/^(social|social[_ -]?organic)$/i.test(medium)?"social":source||campaign?"campaign":referrer?"referral":attr.source_capture==="direct"?"direct":"unknown";
  if (inheritedKind && ["paid","campaign","social","referral","organic","direct"].includes(inheritedKind)) sourceKind=inheritedKind as SourceKind;
  if(!platform)platform=paidEvidence?"other-paid":source||campaign||referrer||sourceKind==="direct"||sourceKind==="organic"?"organic":"unknown";
  if(conflict)sourceKind="unknown";
  const sourceLabel=source||referrer||(platform!=="organic"&&platform!=="unknown"?platform:sourceKind==="direct"?"دخول دون مرجع":sourceKind==="organic"?"بحث طبيعي":"مصدر غير معروف");
  const detailKeys=["utm_source","utm_medium","utm_campaign","campaign_name","campaign_id","utm_id","adset_name","ad_group_name","adset_id","ad_group_id","ad_name","ad_id","utm_content","utm_term","placement","publisher_platform","first_landing_page","first_referrer","source_captured_at","attribution_origin"];
  const sourceDetails=detailKeys.flatMap(key=>{const value=attributionText(attr[key]);return value?[{key,value}]:[];});
  return {platform:platform as AdPlatform,sourceKind,sourceLabel,sourceDetails,paidEvidence,conflict,clickKeys,referrer};
}
