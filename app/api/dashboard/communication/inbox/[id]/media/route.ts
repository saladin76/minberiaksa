import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { auditActorFromDashboardSession } from "@/lib/audit-log";
import { sendConversationReply } from "@/lib/communication/conversation-reply-service";
import { inboxMediaSpec } from "@/lib/communication/inbox-media";
export const runtime = "nodejs";
export const maxDuration = 120;
const MAX_REQUEST = 101 * 1024 * 1024;
export async function POST(request: NextRequest, { params }: {params:Promise<{id:string}>}) {
  const session=await getServerSession(authOptions),denied=requireAdminOrDashboardPermission(session,"messages");if(denied)return denied;
  try {
    if(Number(request.headers.get("content-length"))>MAX_REQUEST)return NextResponse.json({error:"MEDIA_TYPE_OR_SIZE_INVALID"},{status:413});
    let bytes=0;
    const limited=request.body?.pipeThrough(new TransformStream<Uint8Array,Uint8Array>({transform(chunk,controller){bytes+=chunk.byteLength;if(bytes>MAX_REQUEST)throw new RangeError("UPLOAD_TOO_LARGE");controller.enqueue(chunk);}}));
    const form=await new Request(request.url,{method:"POST",headers:request.headers,body:limited,duplex:"half"} as RequestInit & {duplex:"half"}).formData();
    const file=form.get("file"),voice=form.get("voice")==="true",body=form.get("body")||"";
    if(!(file instanceof File)||typeof body!=="string"||body.length>1024||!inboxMediaSpec(file.type,file.size,voice))return NextResponse.json({error:"MEDIA_TYPE_OR_SIZE_INVALID"},{status:400});
    const {id}=await params;
    const result=await sendConversationReply(decodeURIComponent(id),body,auditActorFromDashboardSession(session!),{file,voice});
    if(!result.ok)return NextResponse.json({error:result.reason},{status:result.reason==="REPLY_WINDOW_CLOSED"?409:result.reason==="DO_NOT_CONTACT"?403:502});
    return NextResponse.json(result,{headers:{"Cache-Control":"no-store"}});
  } catch(error) {return NextResponse.json({error:error instanceof RangeError?"MEDIA_TYPE_OR_SIZE_INVALID":"MEDIA_SEND_UNCONFIRMED"},{status:error instanceof RangeError?413:502});}
}
