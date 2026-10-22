import "server-only";
import { prisma } from "@/lib/prisma";
import { certificateParameterSlots, certificateParameterOverrides, hasUnsupportedWaqfDonationButton } from "../templates/donation-link-parameters";

export async function donationTemplateValues(input:{componentsSchema:unknown;scopedNames:Record<string,string>;values:Record<string,string|null|undefined>;donationId?:string|null;recipientUserId?:string|null}):Promise<{ok:true;values:Record<string,string|null|undefined>}|{ok:false;reason:string}>{
  const trustedOrigin=process.env.NEXT_PUBLIC_SITE_URL || "https://minberiaksa.org";
  if(hasUnsupportedWaqfDonationButton(input.componentsSchema,input.scopedNames,trustedOrigin)){
    return{ok:false,reason:"DONATION_WAQF_LINK_REQUIRES_CERTIFICATE_ID"};
  }
  const slots=certificateParameterSlots(input.componentsSchema,input.scopedNames,trustedOrigin);
  if(!slots.length)return{ok:true,values:input.values};
  if(!input.donationId)return{ok:false,reason:"DONATION_DOCUMENT_CONTEXT_MISSING"};
  const donation=await prisma.donation.findUnique({where:{id:input.donationId},select:{donorId:true,accessToken:true}}).catch(()=>null);
  if(!donation || donation.donorId!==input.recipientUserId)return{ok:false,reason:"DONATION_DOCUMENT_RECIPIENT_MISMATCH"};
  if(!donation.accessToken || !/^[0-9a-f]{48}$/i.test(donation.accessToken)){
    return{ok:false,reason:"DONATION_DOCUMENT_ACCESS_TOKEN_UNAVAILABLE"};
  }
  const overrides=certificateParameterOverrides(slots,input.donationId,donation.accessToken);
  if(Object.keys(overrides).length!==slots.length)return{ok:false,reason:"DONATION_DOCUMENT_ACCESS_TOKEN_UNAVAILABLE"};
  return{ok:true,values:{...input.values,...overrides}};
}
