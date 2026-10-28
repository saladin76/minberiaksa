import "server-only";
import { prisma } from "../prisma";
import { parseConversationId } from "./conversation-service";
import { phoneMatchVariants } from "./phone";
import { getActiveMetaWhatsappRuntimeConfig } from "./runtime-config";
import { graphFetch } from "./providers/meta-whatsapp/graph";
import { inboxMediaFilename, inboxMediaSpec, trustedMetaMediaUrl } from "./inbox-media";

/** Resolve an archive item within this exact business-number/contact conversation. */
export async function conversationMediaResponse(conversation: string, itemId: string, range: string | null): Promise<Response> {
  const {senderId,phone}=parseConversationId(conversation),[type,id]=itemId.split(":");
  if(!/^[a-f0-9]{24}$/i.test(id||"")||(senderId&&!/^[a-f0-9]{24}$/i.test(senderId)))return new Response(null,{status:404});
  const scope=senderId?{senderId}:{OR:[{senderId:null},{senderId:{isSet:false}}]};
  const variants=phoneMatchVariants(phone);
  let raw:unknown;
  if(type==="event"){
    const event=await prisma.communicationProviderEvent.findFirst({where:{id,channel:"WHATSAPP",eventType:{in:["inbound_message","outbound_echo"]},recipient:{in:variants},...scope},select:{payloadSanitized:true}});
    raw=(event?.payloadSanitized as {media?:unknown}|null)?.media;
  }else if(type==="delivery"){
    const delivery=await prisma.communicationDelivery.findFirst({where:{id,channel:"WHATSAPP",recipientPhone:{in:variants},...scope},select:{variables:true}});
    raw=(delivery?.variables as {media?:unknown}|null)?.media;
  }
  const media=raw as {mediaId?:unknown;filename?:unknown;mimeType?:unknown}|null;
  if(!media||typeof media.mediaId!=="string"||!/^\d+$/.test(media.mediaId))return new Response(null,{status:404});
  const runtime=await getActiveMetaWhatsappRuntimeConfig();if(!runtime.configured)return new Response(null,{status:503});
  const sender=senderId?await prisma.communicationSender.findUnique({where:{id:senderId},select:{phoneNumberId:true}}):null;
  const phoneNumberId=sender?.phoneNumberId||(!senderId?runtime.values.defaultPhoneNumberId:null);
  if(!phoneNumberId)return new Response(null,{status:503});
  const metadata=await graphFetch(runtime.values,`${media.mediaId}?phone_number_id=${encodeURIComponent(phoneNumberId)}`,{signal:AbortSignal.timeout(12000)});
  if(!metadata.ok)return new Response(null,{status:502});
  const info=metadata.data as {url?:unknown;mime_type?:unknown;file_size?:unknown};
  const url=trustedMetaMediaUrl(info.url);if(!url)return new Response(null,{status:502});
  const mime=typeof info.mime_type==="string"?info.mime_type:"";
  const size=Number(info.file_size)||1,spec=inboxMediaSpec(mime,size);
  if(!spec&&!(mime==="image/webp"&&size<=500*1024))return new Response(null,{status:415});
  const upstream=await fetch(url,{headers:{Authorization:`Bearer ${runtime.values.accessToken}`,...(range&&/^bytes=\d+-\d*$/.test(range)?{Range:range}:{})},redirect:"error",signal:AbortSignal.timeout(30000),cache:"no-store"});
  if(!upstream.ok||!upstream.body)return new Response(null,{status:502});
  const maximum=spec?.maximum||500*1024;let received=0;
  const body=upstream.body.pipeThrough(new TransformStream<Uint8Array,Uint8Array>({transform(chunk,controller){received+=chunk.byteLength;if(received>maximum)throw new Error("MEDIA_TOO_LARGE");controller.enqueue(chunk);}}));
  const filename=inboxMediaFilename(typeof media.filename==="string"?media.filename:"attachment");
  const headers=new Headers({"Content-Type":mime,"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff","Content-Disposition":`${spec?.kind==="document"?"attachment":"inline"}; filename*=UTF-8''${encodeURIComponent(filename).replace(/[!'()*]/g, character => "%" + character.charCodeAt(0).toString(16).toUpperCase())}`,"Content-Security-Policy":"default-src 'none'; sandbox"});
  for(const field of ["content-length","content-range","accept-ranges"]){const value=upstream.headers.get(field);if(value)headers.set(field,value);}
  return new Response(body,{status:upstream.status,headers});
}
