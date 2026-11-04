import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { donorMayBeClaimedByPhone, identityKey, loginContact, loginHash, newLoginCode, newLoginTicket, type LoginChannel } from "./donor-login-policy";
import { deliverLoginCode } from "./donor-login-delivery";
import { phoneMatchVariants } from "@/lib/communication/phone";

const MINUTE = 60_000;
const activeUser = { OR: [{ mergedIntoUserId: null }, { mergedIntoUserId: { isSet: false } }] };

async function reserveThrottle(key: string, limit: number, windowMs: number) {
  const id = loginHash(`throttle:${key}`), now = new Date();
  const reset = await prisma.donorLoginThrottle.updateMany({ where: { id, expiresAt: { lte: now } }, data: { attempts: 1, expiresAt: new Date(Date.now() + windowMs) } });
  if (reset.count) return;
  try {
    await prisma.donorLoginThrottle.create({ data: { id, expiresAt: new Date(Date.now() + windowMs) } });
    return;
  } catch (e) { if ((e as { code?: string }).code !== "P2002") throw e; }
  const taken = await prisma.donorLoginThrottle.updateMany({ where: { id, attempts: { lt: limit }, expiresAt: { gt: now } }, data: { attempts: { increment: 1 } } });
  if (!taken.count) throw new Error("RATE_LIMITED");
}

export async function requestDonorLogin(input: { channel: LoginChannel; contact: string; locale: string; requestKey: string; linkUserId?: string; invitationUserId?: string }) {
  const contact = loginContact(input.channel, input.contact);
  // Global address cooldown also applies to link/invitation routes and concurrent requests.
  await reserveThrottle(`contact-minute:${input.channel}:${contact}`, 1, MINUTE);
  await reserveThrottle(`contact-window:${input.channel}:${contact}`, 5, 15 * MINUTE);
  await reserveThrottle(`request:${input.requestKey}`, 15, 15 * MINUTE);
  const code = newLoginCode(), ticket = newLoginTicket(), id = newLoginTicket();
  await prisma.donorLoginChallenge.create({ data: { id, channel: input.channel, contact,
    codeHash: loginHash(`${id}:${code}`), ticketHash: loginHash(ticket), linkUserId: input.linkUserId || null,
    invitationUserId: input.invitationUserId || null, expiresAt: new Date(Date.now() + 10 * MINUTE) } });
  let loginUrl: string | undefined;
  if (input.invitationUserId) {
    const origin = new URL(process.env.NEXTAUTH_URL || "https://minberiaksa.org").origin;
    loginUrl = `${origin}/${encodeURIComponent(input.locale)}/auth/signin?challenge=${id}&ticket=${ticket}`;
  }
  try {
    const delivery = await deliverLoginCode({ ...input, contact, code, loginUrl, userId: input.invitationUserId || input.linkUserId });
    await prisma.$transaction(async tx => {
      await tx.donorLoginChallenge.updateMany({ where: { channel: input.channel, contact, linkUserId: input.linkUserId || null, id: { not: id }, consumed: false }, data: { consumed: true } });
      await tx.donorLoginChallenge.update({ where: { id }, data: { sent: true, providerMessageId: delivery.providerMessageId } });
    });
    if (input.invitationUserId) await prisma.donorAccountInvitation.upsert({ where: { id: input.invitationUserId }, create: { id: input.invitationUserId, userId: input.invitationUserId, channel: input.channel, status: "SENT", deliveryId: delivery.deliveryId, sentAt: new Date() }, update: { channel: input.channel, status: "SENT", deliveryId: delivery.deliveryId, sentAt: new Date() } });
    return { challengeId: id, ticket, expiresIn: 600 };
  } catch {
    await prisma.donorLoginChallenge.update({ where: { id }, data: { consumed: true } });
    if (input.invitationUserId) await prisma.donorAccountInvitation.upsert({ where: { id: input.invitationUserId }, create: { id: input.invitationUserId, userId: input.invitationUserId, channel: input.channel, status: "FAILED" }, update: { status: "FAILED" } });
    throw new Error("DELIVERY_UNAVAILABLE");
  }
}

async function mergeDonor(tx: Prisma.TransactionClient, sourceId: string, targetId: string) {
  if (sourceId === targetId) return;
  const source = await tx.user.findUniqueOrThrow({ where: { id: sourceId } });
  const target = await tx.user.findUniqueOrThrow({ where: { id: targetId } });
  if (source.role !== "DONOR" || target.role !== "DONOR" || source.mergedIntoUserId || target.mergedIntoUserId || source.email?.endsWith("@deleted.invalid") || target.email?.endsWith("@deleted.invalid")) throw new Error("ACCOUNT_CONFLICT");
  const billing = await tx.subscription.count({ where: { donorId: sourceId, billingLeaseUntil: { gt: new Date() } } });
  const verification = await tx.subscriptionCardVerification.count({ where: { donorId: sourceId, status: "PENDING", expiresAt: { gt: new Date() } } });
  if (billing || verification) throw new Error("ACCOUNT_CONFLICT");
  const originalOwnerMissing = { OR: [{ originalDonorId: null }, { originalDonorId: { isSet: false } }] };
  await tx.donation.updateMany({ where: { donorId: sourceId, ...originalOwnerMissing }, data: { originalDonorId: sourceId } });
  await tx.subscription.updateMany({ where: { donorId: sourceId, ...originalOwnerMissing }, data: { originalDonorId: sourceId } });
  await tx.donation.updateMany({ where: { donorId: sourceId }, data: { donorId: targetId } });
  await tx.subscription.updateMany({ where: { donorId: sourceId }, data: { donorId: targetId } });
  await tx.subscriptionServiceRequest.updateMany({ where: { donorId: sourceId }, data: { donorId: targetId } });
  await tx.subscriptionCardVerification.updateMany({ where: { donorId: sourceId }, data: { donorId: targetId } });
  await tx.certificate.updateMany({ where: { donorId: sourceId }, data: { donorId: targetId } });
  await tx.creditCard.updateMany({ where: { userId: sourceId }, data: { userId: targetId } });
  await tx.account.updateMany({ where: { userId: sourceId }, data: { userId: targetId } });
  if (source.email && source.emailVerified) {
    const contact = source.email.toLowerCase();
    const key = identityKey("EMAIL", contact);
    const previous = await tx.donorLoginIdentity.findUnique({ where: { id: key } });
    if (previous && previous.userId !== sourceId && previous.userId !== targetId) throw new Error("ACCOUNT_CONFLICT");
    if (!previous) await tx.donorLoginIdentity.create({ data: { id: key, userId: targetId, channel: "EMAIL", contact, verifiedAt: source.emailVerified } });
  }
  await tx.donorLoginIdentity.updateMany({ where: { userId: sourceId }, data: { userId: targetId } });
  await tx.session.deleteMany({ where: { userId: sourceId } });
  await tx.donorCommunicationProfile.updateMany({ where: { userId: sourceId }, data: { doNotContact: true } });
  await tx.user.update({ where: { id: sourceId }, data: { mergedIntoUserId: targetId, mergedOriginalEmail: source.email, mergedOriginalPhone: source.phone, email: null, phone: null, password: null, emailNotifications: false, smsNotifications: false } });
  await tx.auditLog.create({ data: { actorId: targetId, actorRole: "DONOR", stream: "DONOR", action: "DONOR_ACCOUNT_LINKED", messageAr: "ربط حساب متبرع بعد إثبات ملكية وسيلة الدخول", entityType: "User", entityId: targetId, metadata: { sourceId, targetId } } });
}

/** Called only after consuming a valid challenge or Google's verified-email proof. */
async function resolveIdentity(tx: Prisma.TransactionClient, channel: LoginChannel, contact: string, linkUserId?: string, invitationUserId?: string, allowPrivilegedEmail = false) {
  const key = identityKey(channel, contact);
  const identity = await tx.donorLoginIdentity.findUnique({ where: { id: key } });
  const matches = await tx.user.findMany({ where: { ...activeUser, ...(channel === "EMAIL" ? { email: { equals: contact, mode: "insensitive" } } : { phone: { in: phoneMatchVariants(contact) } }) }, include: { accounts: { select: { id: true } } }, orderBy: { createdAt: "asc" }, take: 50 });
  if (matches.length === 50) throw new Error("ACCOUNT_CONFLICT");
  // A valid code proves this contact. Reuse its existing donor record on first
  // sign-in too: historical guest profiles do not need an earlier email login.
  // A shared phone on several established accounts is ambiguous, not a merge instruction.
  const established = channel === "WHATSAPP" ? matches.filter(u => !donorMayBeClaimedByPhone(u)) : [];
  if (channel === "WHATSAPP" && established.length > 1) throw new Error("ACCOUNT_CONFLICT");
  const matchedId = channel === "WHATSAPP" ? established[0]?.id || matches[0]?.id : matches[0]?.id;
  const targetId = linkUserId || identity?.userId || matchedId;
  let target = targetId ? await tx.user.findUniqueOrThrow({ where: { id: targetId } }) : null;
  if (target && (target.mergedIntoUserId || target.email?.endsWith("@deleted.invalid"))) throw new Error("ACCOUNT_CONFLICT");
  if (target && target.role !== "DONOR") {
    // Email OTP may authenticate the exact existing staff/admin record. It must
    // never link identities, merge records, or promote a donor to a staff role.
    if (allowPrivilegedEmail && channel === "EMAIL" && !linkUserId && !invitationUserId
      && (target.role === "ADMIN" || target.role === "STAFF")
      && target.email?.toLowerCase() === contact && matches.length === 1
      && matches[0].id === target.id && (!identity || identity.userId === target.id)) return target;
    throw new Error("ACCOUNT_CONFLICT");
  }
  if (!target) target = await tx.user.create({ data: { email: channel === "EMAIL" ? contact : null, phone: channel === "WHATSAPP" ? contact : null, role: "DONOR", verifiedAt: new Date(), registeredAt: new Date(), emailVerified: channel === "EMAIL" ? new Date() : null } });
  const candidates = new Set(matches.map(u => u.id));
  if (identity) candidates.add(identity.userId);
  if (invitationUserId && !candidates.has(invitationUserId) && target.id !== invitationUserId) throw new Error("ACCOUNT_CONFLICT");
  for (const id of candidates) await mergeDonor(tx, id, target.id);
  await tx.donorLoginIdentity.upsert({ where: { id: key }, create: { id: key, userId: target.id, channel, contact }, update: { userId: target.id } });
  target = await tx.user.update({ where: { id: target.id }, data: { registeredAt: target.registeredAt || new Date(), verifiedAt: target.verifiedAt || new Date(), ...(channel === "EMAIL" && !target.email ? { email: contact, emailVerified: new Date() } : channel === "EMAIL" && target.email?.toLowerCase() === contact ? { emailVerified: new Date() } : {}) } });
  await tx.donorAccountInvitation.updateMany({ where: { userId: { in: [...candidates, target.id] } }, data: { status: "ACTIVATED", activatedAt: new Date() } });
  return target;
}

export async function verifyDonorLogin(input: { challengeId: string; ticket: string; code: string; linkUserId?: string }) {
  if (!/^[a-f0-9]{64}$/.test(input.challengeId) || !/^[a-f0-9]{64}$/.test(input.ticket) || !/^\d{6}$/.test(input.code)) throw new Error("INVALID_CODE");
  const record = await prisma.donorLoginChallenge.findUnique({ where: { id: input.challengeId } });
  if (!record || record.ticketHash !== loginHash(input.ticket) || (record.linkUserId || undefined) !== input.linkUserId) throw new Error("INVALID_CODE");
  return consumeChallenge(record, input.code, input.linkUserId);
}

async function consumeChallenge(record: { id: string; channel: string; contact: string; invitationUserId: string | null }, code: string, linkUserId?: string) {
  const reserved = await prisma.donorLoginChallenge.updateMany({ where: { id: record.id, consumed: false, sent: true, attempts: { lt: 5 }, expiresAt: { gt: new Date() } }, data: { attempts: { increment: 1 } } });
  if (!reserved.count) throw new Error("INVALID_CODE");
  return prisma.$transaction(async tx => {
    const consumed = await tx.donorLoginChallenge.updateMany({ where: { id: record.id, consumed: false, codeHash: loginHash(`${record.id}:${code}`), sent: true, expiresAt: { gt: new Date() } }, data: { consumed: true } });
    if (!consumed.count) throw new Error("INVALID_CODE");
    return resolveIdentity(tx, record.channel as LoginChannel, record.contact, linkUserId, record.invitationUserId || undefined, true);
  }, { timeout: 30_000, maxWait: 10_000 });
}

/** Contact-and-code entry also accepts ordinary sign-in codes after a reload or
 * opening the existing-code form. Linking proofs remain scoped to their session. */
export async function verifyDonorInvitation(channel: LoginChannel, value: string, code: string) {
  if (!/^\d{6}$/.test(code)) throw new Error("INVALID_CODE");
  const contact = loginContact(channel, value);
  const record = await prisma.donorLoginChallenge.findFirst({ where: { channel, contact, linkUserId: null, sent: true }, orderBy: { createdAt: "desc" } });
  if (!record) throw new Error("INVALID_CODE");
  return consumeChallenge(record, code);
}

export async function verifiedGoogleIdentity(email: string) {
  return prisma.$transaction(tx => resolveIdentity(tx, "EMAIL", loginContact("EMAIL", email)), { timeout: 30_000, maxWait: 10_000 });
}
