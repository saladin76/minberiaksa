import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { prisma } from "@/lib/prisma";
import { paymentPublicOrigin } from "@/lib/payment-public-origin";
import { SITE_ACTIVITY_WHERE, SITE_PAYMENT_WHERE, siteActivityNotification, sitePaymentNotification, notificationTimeWhere } from "@/lib/dashboard/site-notifications";
export const dynamic = "force-dynamic";
const response = (body: unknown, status=200) => NextResponse.json(body,{status,headers:{"Cache-Control":"private, no-store"}});

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "logs"); if (denied) return denied;
  try {
    const limit=30, before=request.nextUrl.searchParams.get("before"), parts=before?.split("|");
    const cutoff=parts ? new Date(parts[0]) : new Date(), cursor=parts?.[1] || null, countOnly=request.nextUrl.searchParams.get("countOnly")==="1";
    if (before && (!cursor || !/^(?:activity|payment):[a-f0-9]{24}$/i.test(cursor))) return response({error:"Invalid cursor"},400);
    if (!Number.isFinite(cutoff.getTime())) return response({error:"Invalid cursor"},400);
    const read = await prisma.auditLog.findFirst({where:{actorId:session!.user!.id,action:"SITE_NOTIFICATIONS_READ",stream:"TEAM"},orderBy:{createdAt:"desc"},select:{createdAt:true}});
    const seen=read?.createdAt || new Date(0);
    const [activities,settled,unsettled,activityUnread,paymentUnread] = await Promise.all([
      countOnly ? Promise.resolve([]) : prisma.auditLog.findMany({where:{AND:[SITE_ACTIVITY_WHERE,notificationTimeWhere("createdAt","activity",cutoff,cursor)]},orderBy:[{createdAt:"desc"},{id:"desc"}],take:limit+1,select:{id:true,createdAt:true,action:true,messageAr:true,entityType:true,entityId:true}}),
      countOnly ? Promise.resolve([]) : prisma.donation.findMany({where:{AND:[SITE_PAYMENT_WHERE,{status:"PAID",paidAt:{not:null}},notificationTimeWhere("paidAt","payment",cutoff,cursor)]},orderBy:[{paidAt:"desc"},{id:"desc"}],take:limit+1,select:{id:true,createdAt:true,paidAt:true,status:true,billingReason:true,subscriptionId:true,currency:true,totalAmount:true}}),
      countOnly ? Promise.resolve([]) : prisma.donation.findMany({where:{AND:[SITE_PAYMENT_WHERE,{OR:[{paidAt:null},{paidAt:{isSet:false}}]},notificationTimeWhere("createdAt","payment",cutoff,cursor)]},orderBy:[{createdAt:"desc"},{id:"desc"}],take:limit+1,select:{id:true,createdAt:true,paidAt:true,status:true,billingReason:true,subscriptionId:true,currency:true,totalAmount:true}}),
      prisma.auditLog.count({where:{AND:[SITE_ACTIVITY_WHERE,{createdAt:{gt:seen}}]}}),
      prisma.donation.count({where:{AND:[SITE_PAYMENT_WHERE,{OR:[{paidAt:{gt:seen}},{paidAt:null,createdAt:{gt:seen}},{paidAt:{isSet:false},createdAt:{gt:seen}}]}]}}),
    ]);
    const all=[...activities.map(siteActivityNotification),...[...settled,...unsettled].map(sitePaymentNotification)].sort((a,b)=>b.at.localeCompare(a.at)||b.id.localeCompare(a.id));
    const items=all.slice(0,limit).map(row=>({...row,read:new Date(row.at)<=seen}));
    return response({items,unread:activityUnread+paymentUnread,nextBefore:all.length>limit ? `${items.at(-1)!.at}|${items.at(-1)!.id}` : null});
  } catch { return response({error:"Unable to load site notifications"},503); }
}

export async function POST(request: NextRequest) {
  const session=await getServerSession(authOptions);
  const denied=requireAdminOrDashboardPermission(session,"logs");if(denied)return denied;
  if(request.headers.get("origin")!==paymentPublicOrigin(request.url)||!request.headers.get("content-type")?.includes("application/json"))return response({error:"Forbidden"},403);
  const body=await request.json().catch(()=>null);
  if(body?.action!=="MARK_ALL_READ")return response({error:"Invalid action"},400);
  try {
    await prisma.auditLog.create({data:{actorId:session!.user!.id,actorRole:session!.user!.role||"ADMIN",action:"SITE_NOTIFICATIONS_READ",stream:"TEAM",messageAr:"قراءة إشعارات أحداث الموقع"}});
    return response({ok:true});
  } catch { return response({error:"Unable to update read status"},503); }
}
