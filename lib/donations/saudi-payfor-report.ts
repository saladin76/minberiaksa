/** Read-only MongoDB facets. Pending rows never count as collected revenue. */
export function saudiPayforReportPipeline(from: Date) {
 const paid = { $and: [{ $eq: ["$status", "PAID"] }, { $ne: [{ $ifNull: ["$paidAt", null] }, null] }] };
 const usd = { $ifNull: ["$amountUSD", { $cond: [{ $eq: ["$currency", "USD"] }, "$totalAmount", null] }] };
 return [{ $match: { createdAt: { $gte: { $date: from.toISOString() } }, "providerRaw.paymentRouting.version": 1, "providerRaw.paymentRouting.trialMatched": true } }, { $facet: {
  totals: [{ $group: { _id: null, attempts: { $sum: 1 }, donors: { $addToSet: "$donorId" }, paid: { $sum: { $cond: [paid, 1, 0] } }, paidUSD: { $sum: { $cond: [paid, { $ifNull: [usd, 0] }, 0] } }, unpricedPaid: { $sum: { $cond: [{ $and: [paid, { $eq: [usd, null] }] }, 1, 0] } }, failed: { $sum: { $cond: [{ $eq: ["$status", "FAILED"] }, 1, 0] } }, pending: { $sum: { $cond: [{ $and: [{ $not: [paid] }, { $ne: ["$status", "FAILED"] }] }, 1, 0] } }, newRouting: { $sum: { $cond: ["$providerRaw.paymentRouting.changedGateway", 1, 0] } } } }, { $set: { donors: { $size: "$donors" } } }],
  reasons: [{ $group: { _id: "$providerRaw.paymentRouting.reason", attempts: { $sum: 1 }, paid: { $sum: { $cond: [paid, 1, 0] } } } }],
  declines: [{ $match: { status: "FAILED" } }, { $group: { _id: { $ifNull: ["$providerProcReturnCode", "UNKNOWN"] }, count: { $sum: 1 } } }, { $sort: { count: -1 } }],
 } }];
}
