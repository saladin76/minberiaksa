import "server-only";
import { prisma } from "@/lib/prisma";
import { certificateParameterSlots, certificateParameterOverrides } from "../templates/donation-link-parameters";

export async function donationTemplateValues(input:{componentsSchema:unknown;scopedNames:Record<string,string>;values:Record<string,string|null|undefined>;donationId?:string|null;recipientUserId?:string|null}):Promise<{ok:true;values:Record<string,string|null|undefined>}|{ok:false;reason:string}>{
  const slots=certificateParameterSlots(input.componentsSchema,input.scopedNames,process.env.NEXT_PUBLIC_SITE_URL || "https://minberiaksa.org");
  if(!slots.length||!input.donationId)return{ok:true,values:input.values};
  const donation=await prisma.donation.findUnique({where:{id:input.donationId},select:{donorId:true,accessToken:true}}).catch(()=>null);
  if(!donation || donation.donorId!==input.recipientUserId)return{ok:false,reason:"DONATION_DOCUMENT_RECIPIENT_MISMATCH"};
  // Reuse the existing donor access token; never mint, persist or log a new credential.
  return{ok:true,values:{...input.values,...certificateParameterOverrides(slots,input.donationId,donation.accessToken)}};
}
