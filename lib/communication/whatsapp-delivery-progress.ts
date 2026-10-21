/** Later provider events imply earlier delivery stages, even when webhooks arrive out of order. */
export function whatsappDeliveryProgress(row:{status:string;providerMessageId?:string|null;sentAt?:unknown;deliveredAt?:unknown;readAt?:unknown;repliedAt?:unknown}){
  const replied=Boolean(row.repliedAt)||row.status==="REPLIED";
  const read=Boolean(row.readAt)||row.status==="READ"||replied;
  const delivered=Boolean(row.deliveredAt)||row.status==="DELIVERED"||read;
  const accepted=Boolean(row.providerMessageId)||Boolean(row.sentAt)||["SENT","SENT_TO_PROVIDER"].includes(row.status)||delivered;
  const failed=["FAILED","BOUNCED"].includes(row.status);
  return{accepted,delivered,read,replied,failed,attempted:accepted||failed};
}
