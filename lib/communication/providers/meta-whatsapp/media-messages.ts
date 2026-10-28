import { graphFetch } from "./graph";
import type { MetaGraphConfig, SendResult } from "./types";
import type { InboxMediaKind } from "../../inbox-media";

// Meta's official collection: postman.com/meta/whatsapp-business-platform (Media and Audio).
export async function uploadMessageMedia(config: MetaGraphConfig, phoneNumberId: string, blob: Blob, filename: string): Promise<{ok:true;id:string}|{ok:false;reason:string}> {
  if (!/^\d+$/.test(phoneNumberId)) return {ok:false,reason:"META_SENDER_MISSING_PHONE_NUMBER_ID"};
  const form = new FormData();form.set("messaging_product","whatsapp");form.set("type",blob.type);form.set("file",blob,filename);
  try {
    const response=await fetch(`https://graph.facebook.com/${config.graphVersion}/${phoneNumberId}/media`,{method:"POST",headers:{Authorization:`Bearer ${config.accessToken}`},body:form,signal:AbortSignal.timeout(45000)});
    const body=await response.json().catch(()=>null);
    return response.ok && typeof body?.id === "string" && /^\d+$/.test(body.id) ? {ok:true,id:body.id} : {ok:false,reason:"MEDIA_UPLOAD_FAILED"};
  } catch {return {ok:false,reason:"MEDIA_UPLOAD_UNCONFIRMED"};}
}
export async function sendMediaMessage(config: MetaGraphConfig, input: {phoneNumberId:string;to:string;kind:InboxMediaKind;id:string;caption?:string;filename?:string;voice?:boolean;replyToMessageId?:string|null}):Promise<SendResult>{
  if (!/^\d+$/.test(input.id)||!/^\d+$/.test(input.phoneNumberId))return {ok:false,reason:"INVALID_MEDIA_ID"};
  const media={id:input.id,...(input.kind!=="audio"&&input.caption?{caption:input.caption.slice(0,1024)}:{}),...(input.kind==="document"&&input.filename?{filename:input.filename}:{}),...(input.kind==="audio"&&input.voice?{voice:true}:{})};
  const result=await graphFetch(config,`${input.phoneNumberId}/messages`,{method:"POST",signal:AbortSignal.timeout(30000),body:JSON.stringify({messaging_product:"whatsapp",to:input.to,type:input.kind,[input.kind]:media,...(input.replyToMessageId?{context:{message_id:input.replyToMessageId}}:{})})});
  if(!result.ok)return {ok:false,reason:result.retryable && (!result.status || result.status >= 500) ? "MEDIA_SEND_UNCONFIRMED" : result.reason};
  const id=(result.data as {messages?:{id?:unknown}[]}|null)?.messages?.[0]?.id;
  return typeof id==="string"&&id?{ok:true,providerMessageId:id}:{ok:false,reason:"META_INVALID_RESPONSE"};
}
