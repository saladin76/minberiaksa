import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { conversationMediaResponse } from "@/lib/communication/inbox-media-service";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(request:NextRequest,{params}:{params:Promise<{id:string;itemId:string}>}){
 const denied=requireAdminOrDashboardPermission(await getServerSession(authOptions),"messages");if(denied)return denied;
 try{const {id,itemId}=await params;return await conversationMediaResponse(decodeURIComponent(id),decodeURIComponent(itemId),request.headers.get("range"));}catch{return new Response(null,{status:502,headers:{"Cache-Control":"no-store"}});}
}
