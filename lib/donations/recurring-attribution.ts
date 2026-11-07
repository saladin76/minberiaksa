import type { Prisma, PrismaClient } from "@prisma/client";
import { sanitizeDonationAttribution } from "../attribution/sanitize";
import { resolveDonationSourceSignals } from "../attribution/source-signals";

const BUSINESS_KEYS=["utm_source","utm_medium","utm_campaign","utm_id","utm_content","utm_term","campaign_id","campaign_name","adset_id","adset_name","ad_group_id","ad_group_name","ad_id","ad_name","creative_id","creative_name","placement","publisher_platform","site_source_name","platform","channel","first_landing_page","landing_page","first_referrer","referrer","source_capture","source_captured_at"];

/** Historical acquisition belongs to the signup, not a new browser visit or click. */
export async function inheritRecurringAttribution(database: Pick<PrismaClient,"donation">, subscriptionId:string, donorId:string):Promise<Prisma.InputJsonValue|undefined> {
  let original: { attribution: Prisma.JsonValue } | null;
  try { original=await database.donation.findFirst({where:{subscriptionId,donorId,status:"PAID",paidAt:{not:null},OR:[{billingReason:"subscription_create"},{billingReason:null},{billingReason:{isSet:false}}]},orderBy:{createdAt:"asc"},select:{attribution:true}}); } catch { return { attribution_origin: "subscription_signup", source_capture: "unavailable" }; }
  if(!original?.attribution||typeof original.attribution!=="object"||Array.isArray(original.attribution))return undefined;
  const source=original.attribution as Record<string,unknown>;
  const inherited=Object.fromEntries(BUSINESS_KEYS.filter(key=>source[key]!=null).map(key=>[key,source[key]]));
  const signals=resolveDonationSourceSignals(source);
  if (signals.platform !== "unknown" && signals.platform !== "organic") inherited.platform=signals.platform;
  if (signals.sourceKind !== "unknown") inherited.acquisition_kind=signals.sourceKind;
  if(!Object.keys(inherited).length)return undefined;
  return sanitizeDonationAttribution({...inherited,attribution_origin:"subscription_signup"});
}
