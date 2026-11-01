const GLOBAL_CONTROL_ID = "000000000000000000000001";
const saudiState = row => ({ enabled: row.payforSaudiRoutingEnabled === true, payforMasterEnabled: row.payforEnabled !== false });
const audit = (action, entityType, entityId, messageAr, metadata) => ({ actorRole: "SYSTEM", action, entityType, entityId, stream: "TEAM", messageAr, metadata });

export async function configureSaudiRouting(prisma, mode, env = process.env) {
  if (!["--status", "--enable", "--disable"].includes(mode)) throw new Error("Invalid routing mode; nothing changed.");
  const original = await prisma.globalSettings.findFirst({ orderBy: { createdAt: "asc" } });
  if (!original) throw new Error("Payment settings do not exist; nothing changed.");
  const readOnly = mode === "--status", enable = mode === "--enable";
  if (enable) {
    if (original.payforEnabled === false) throw new Error("The PayFor master switch is disabled; nothing changed.");
    const required = ["PAYFOR_3DPAY_URL", "PAYFOR_MBR_ID", "PAYFOR_MERCHANT_ID", "PAYFOR_MERCHANT_PASS", "PAYFOR_USER_CODE", "PAYFOR_USER_PASS"];
    if (required.some(name => !env[name]?.trim())) throw new Error("PayFor configuration is incomplete; nothing changed.");
    const url = new URL(env.PAYFOR_3DPAY_URL);
    if (url.protocol !== "https:" || url.username || url.password || /^(localhost|127\.|\[::1\])/.test(url.hostname)) throw new Error("PayFor HTTPS endpoint is invalid; nothing changed.");
  }
  const changed = !readOnly && saudiState(original).enabled !== enable;
  if (changed) await prisma.$transaction(async tx => {
    const current = await tx.globalSettings.findUnique({ where: { id: original.id } });
    if (!current || saudiState(current).enabled !== saudiState(original).enabled || enable && current.payforEnabled === false) throw new Error("Payment settings changed concurrently; nothing changed.");
    await tx.globalSettings.update({ where: { id: original.id }, data: { payforSaudiRoutingEnabled: enable } });
    // Audit and setting commit together; no dependency on a Next request scope.
    await tx.auditLog.create({ data: audit("PAYMENT_SAUDI_ROUTING_UPDATE", "GlobalSettings", original.id, `توجيه السعودية إلى PayFor: ${enable ? "مفعّل" : "معطّل"} بطلب مالك الموقع`, { oldValue: saudiState(current).enabled, newValue: enable, paymentCaptures: 0, recipientMessages: 0 }) });
  });
  const check = await prisma.globalSettings.findUnique({ where: { id: original.id } });
  if (!check || !readOnly && saudiState(check).enabled !== enable) throw new Error("Settings verification failed.");
  return { readOnly, changed, ...saudiState(check), scope: "new one-time card attempts only", paymentCaptures: 0, recipientMessages: 0 };
}

function campaignState(row, env) {
  return { emergencyStop: String(env.COMMUNICATION_CAMPAIGN_EMERGENCY_STOP ?? "").toLowerCase() === "true" || row?.emergencyStop === true,
    whatsappMarketingCooldownDays: row?.whatsappMarketingCooldownConfigured === true ? row.whatsappMarketingCooldownDays ?? 0 : 0 };
}
export async function configureCampaignInterval(prisma, days, apply, env = process.env) {
  if (!Number.isInteger(days) || days < 0 || days > 365) throw new Error("The interval must be an integer from 0 to 365.");
  const original = await prisma.communicationGlobalControl.findUnique({ where: { id: GLOBAL_CONTROL_ID } });
  const current = campaignState(original, env);
  const changed = apply && (!original?.whatsappMarketingCooldownConfigured || current.whatsappMarketingCooldownDays !== days);
  if (changed) await prisma.$transaction(async tx => {
    const fresh = await tx.communicationGlobalControl.findUnique({ where: { id: GLOBAL_CONTROL_ID } });
    if (JSON.stringify(campaignState(fresh, env)) !== JSON.stringify(current)) throw new Error("Sending settings changed concurrently; nothing changed.");
    await tx.communicationGlobalControl.upsert({ where: { id: GLOBAL_CONTROL_ID },
      create: { id: GLOBAL_CONTROL_ID, emergencyStop: false, whatsappMarketingCooldownDays: days, whatsappMarketingCooldownConfigured: true, updatedBy: null },
      update: { whatsappMarketingCooldownDays: days, whatsappMarketingCooldownConfigured: true, updatedBy: null } });
    await tx.auditLog.create({ data: audit("communication.campaign.whatsapp-marketing-cooldown.updated", "CommunicationGlobalControl", GLOBAL_CONTROL_ID, `تم ضبط الفاصل بين الرسائل التسويقية عبر واتساب إلى ${days} يومًا`, { whatsappMarketingCooldownDays: days, externalCall: false }) });
  });
  const saved = campaignState(await prisma.communicationGlobalControl.findUnique({ where: { id: GLOBAL_CONTROL_ID } }), env);
  if (apply && saved.whatsappMarketingCooldownDays !== days || saved.emergencyStop !== current.emergencyStop) throw new Error("Sending settings verification failed; inspect before retrying.");
  return { readOnly: !apply, changed, current: saved, requestedWhatsappCooldownDays: days, recipientMessages: 0, providerCalls: 0, paymentCalls: 0 };
}
