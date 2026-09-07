import { NextRequest, NextResponse } from 'next/server';
import { prisma } from "@/lib/prisma";
import { getServerSession } from 'next-auth';
import { authOptions } from '../../auth/[...nextauth]/options';
import { Prisma, SubscriptionStatus } from '@prisma/client';
import { userHasDashboardPermission } from '@/lib/dashboard/permissions';
import { isRevenueDashboardUser } from '@/lib/dashboard/api-auth';
import { convertAmountInCurrencyToUsd, normalizeDonationCurrencyCode } from '@/lib/exchange/convert-amount-in-currency-to-usd';
import {
  writeAuditLog,
  auditActorFromDashboardSession,
  auditActorFromSiteSession,
  auditStreamForRole,
} from '@/lib/audit-log';
import Stripe from 'stripe';
import { dispatchDonationPaid } from "@/lib/events/dispatch";
import {
  recomputeCampaignCurrentAmount as sharedRecomputeCampaign,
  recomputeCategoryCurrentAmount as sharedRecomputeCategory,
} from "@/lib/campaign/current-amount";

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2026-03-25.dahlia' })
  : null;

/**
 * Self-heal donations whose webhook never landed: if Stripe already has the
 * PaymentIntent marked succeeded, set paidAt and increment campaign/category
 * totals. Idempotent — a paidAt guard inside the transaction prevents double
 * increments if the webhook arrives between the Stripe lookup and the update.
 */
async function reconcileStripeDonation(donationId: string) {
  if (!stripe) return;
  const row = await prisma.donation.findUnique({
    where: { id: donationId },
    select: { provider: true, providerOrderId: true, paidAt: true },
  });
  if (!row || row.paidAt || row.provider !== 'STRIPE' || !row.providerOrderId) return;
  if (!row.providerOrderId.startsWith('pi_')) return;

  let intent: Stripe.PaymentIntent;
  try {
    intent = await stripe.paymentIntents.retrieve(row.providerOrderId);
  } catch (err) {
    console.error('[donation reconcile] Stripe retrieve failed:', err);
    return;
  }
  if (intent.status !== 'succeeded') return;

  try {
    await prisma.$transaction(async (tx) => {
      const fresh = await tx.donation.findUnique({
        where: { id: donationId },
        include: { items: true, categoryItems: true },
      });
      if (!fresh || fresh.paidAt) return;

      await tx.donation.update({
        where: { id: donationId },
        data: {
          status: 'PAID',
          paidAt: new Date(),
          providerAuthCode: intent.id,
          providerTxnResult: 'Success',
        },
      });
      for (const item of fresh.items) {
        await tx.campaign.update({
          where: { id: item.campaignId },
          data: { currentAmount: { increment: item.amountUSD ?? item.amount } },
        });
      }
      for (const item of fresh.categoryItems) {
        await tx.category.update({
          where: { id: item.categoryId },
          data: { currentAmount: { increment: item.amountUSD ?? item.amount } },
        });
      }
    });
    void dispatchDonationPaid(donationId);
  } catch (err) {
    console.error('[donation reconcile] Finalize failed:', err);
  }
}

// GET /api/donations/[id] - Get donation (transaction) by ID; include type/status from subscription when applicable
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: 'Donation ID required' }, { status: 400 });
    }
    const session = await getServerSession(authOptions);

    // Self-heal: if Stripe already confirmed the payment but the webhook
    // hasn't landed yet (common in dev / with slow webhook delivery), finalize
    // the donation and increment campaign totals here so the success page
    // reflects reality. Safe for guests and logged-in donors alike.
    await reconcileStripeDonation(id);

    const donation = await prisma.donation.findUnique({
      where: { id },
      omit: {
        cardDetails: true,
      },
      include: {
        donor: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
            phone: true,
            gender: true,
            birthdate: true,
            countryCode: true,
            city: true,
            region: true,
          },
        },
        subscription: {
          select: {
            status: true,
            nextBillingDate: true,
            lastBillingDate: true,
          },
        },
        items: {
          include: {
            campaign: {
              select: {
                title: true,
                images: true,
                translations: {
                  select: { locale: true, title: true },
                },
              },
            },
          },
        },
        categoryItems: {
          include: {
            category: {
              select: {
                name: true,
                image: true,
                translations: {
                  select: { locale: true, name: true },
                },
              },
            },
          },
        },
      },
    });

    if (!donation) {
      return NextResponse.json(
        { error: 'Donation not found' },
        { status: 404 }
      );
    }

    // Guest donations have no session — the unguessable donation id acts as
    // the access token (same posture as Stripe checkout session IDs). For
    // authenticated users, still require ownership or revenue-dashboard
    // permission to prevent cross-account snooping.
    if (session) {
      const canViewAllDonations =
        userHasDashboardPermission(session.user, 'revenue') ||
        userHasDashboardPermission(session.user, 'donationsEdit');
      if (!canViewAllDonations && session.user.id !== donation.donorId) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    const sub = donation.subscription;
    const response = {
      ...donation,
      type: donation.subscriptionId ? ('MONTHLY' as const) : ('ONE_TIME' as const),
      // Default to CARD on read for legacy rows where the field was never
      // written. Every current create path sets CARD or PAYPAL explicitly,
      // so this only kicks in for historical donations.
      paymentMethod: donation.paymentMethod ?? 'CARD',
      paymentStatus: donation.status,
      subscriptionStatus: sub?.status ?? null,
      nextBillingDate: sub?.nextBillingDate ?? null,
      lastBillingDate: sub?.lastBillingDate ?? null,
    };
    return NextResponse.json(response);
  } catch (error) {
    console.error('Error fetching donation:', error);
    return NextResponse.json(
      { error: 'Failed to fetch donation' },
      { status: 500 }
    );
  }
}

// PUT /api/donations/[id] - Update the linked subscription's status. The billing
// cadence is owned by Stripe (the donor can't pick a day), so only `status` is
// writable here.
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { status } = body;

    const currentDonation = await prisma.donation.findUnique({
      where: { id },
      include: {
        items: true,
        subscription: {
          select: { id: true, status: true, nextBillingDate: true, lastBillingDate: true },
        },
      },
    });

    if (!currentDonation) {
      return NextResponse.json(
        { error: 'Donation not found' },
        { status: 404 }
      );
    }

    const isAdmin = isRevenueDashboardUser(session);
    const isOwner = session.user.id === currentDonation.donorId;

    if (!currentDonation.subscriptionId) {
      return NextResponse.json(
        { error: 'Only subscriptions can be updated; this donation is one-time' },
        { status: 400 }
      );
    }

    const sub = currentDonation.subscription;
    if (!sub) {
      return NextResponse.json(
        { error: 'Subscription not found' },
        { status: 404 }
      );
    }

    const updates: { status?: SubscriptionStatus } = {};
    if (status !== undefined) {
      if (!['ACTIVE', 'PAUSED', 'CANCELLED'].includes(String(status))) {
        return NextResponse.json(
          { error: 'Invalid status; use ACTIVE, PAUSED or CANCELLED' },
          { status: 400 }
        );
      }
      updates.status = status as SubscriptionStatus;
    }

    if (Object.keys(updates).length === 0) {
      const out = await prisma.donation.findUnique({
        where: { id },
        omit: { cardDetails: true },
        include: {
          donor: { select: { name: true, email: true, image: true } },
          subscription: { select: { status: true, nextBillingDate: true, lastBillingDate: true } },
          items: { include: { campaign: { select: { title: true, images: true, translations: { select: { locale: true, title: true } } } } } },
          categoryItems: { include: { category: { select: { name: true, image: true, translations: { select: { locale: true, name: true } } } } } },
        },
      });
      if (!out) return NextResponse.json({ error: 'Not found' }, { status: 404 });
      const s = out.subscription;
      return NextResponse.json({
        ...out,
        type: 'MONTHLY' as const,
        status: s?.status ?? null,
        nextBillingDate: s?.nextBillingDate ?? null,
        lastBillingDate: s?.lastBillingDate ?? null,
      });
    }

    if (!isAdmin && !isOwner) {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      );
    }

    if (!isAdmin && isOwner && status === 'CANCELLED') {
      return NextResponse.json(
        { error: 'Only admin can cancel a subscription' },
        { status: 403 }
      );
    }

    await prisma.subscription.update({
      where: { id: currentDonation.subscriptionId },
      data: updates,
    });

    const subActor = isAdmin
      ? auditActorFromDashboardSession(session!)
      : auditActorFromSiteSession(session!);
    const subStream = isAdmin
      ? ("TEAM" as const)
      : auditStreamForRole(subActor.actorRole);
    await writeAuditLog({
      ...subActor,
      action: "SUBSCRIPTION_UPDATE",
      messageAr: `${subActor.actorName ?? "مستخدم"} عدّل الاشتراك الشهري المرتبط بالتبرع (${Object.keys(updates).join("، ")})`,
      entityType: "Subscription",
      entityId: currentDonation.subscriptionId!,
      metadata: {
        donationId: id,
        ...(updates.status !== undefined && { status: updates.status }),
      },
      stream: subStream,
    });

    const updatedDonation = await prisma.donation.findUnique({
      where: { id },
      omit: { cardDetails: true },
      include: {
        donor: { select: { name: true, email: true, image: true } },
        subscription: { select: { status: true, nextBillingDate: true, lastBillingDate: true } },
        items: { include: { campaign: { select: { title: true, images: true, translations: { select: { locale: true, title: true } } } } } },
        categoryItems: { include: { category: { select: { name: true, image: true, translations: { select: { locale: true, name: true } } } } } },
      },
    });

    if (!updatedDonation) {
      return NextResponse.json({ error: 'Donation not found' }, { status: 404 });
    }

    const s = updatedDonation.subscription;
    return NextResponse.json({
      ...updatedDonation,
      type: 'MONTHLY' as const,
      status: s?.status ?? null,
      nextBillingDate: s?.nextBillingDate ?? null,
      lastBillingDate: s?.lastBillingDate ?? null,
    });
  } catch (error) {
    console.error('Error updating donation:', error);
    return NextResponse.json(
      { error: 'Failed to update donation', details: (error as Error).message },
      { status: 500 }
    );
  }
}

/** A donation only contributed to campaign/category totals if it was actually
 * paid. Mirrors webhook semantics — increments happen on paidAt set. Using a
 * blanket decrement (the legacy DELETE behavior) corrupts totals for any row
 * that was abandoned mid-checkout (status=PAID, paidAt=null).
 */
function donationContributedToTotals(d: { status: string; paidAt: Date | null }) {
  return d.status === "PAID" && d.paidAt !== null;
}

function findDuplicateKey(keys: string[]) {
  const seen = new Set<string>();
  for (const key of keys) {
    if (seen.has(key)) return key;
    seen.add(key);
  }
  return null;
}

async function recomputeCampaignCurrentAmount(
  tx: Prisma.TransactionClient,
  campaignId: string
) {
  // Delegates to lib/campaign/current-amount.ts so the campaign's manually-entered
  // `baselineAmount` (offline/legacy donations) is added back. This used to be an absolute
  // overwrite from donation rows only, which meant editing or deleting ONE donation wiped
  // the entire offline baseline off a campaign permanently.
  await sharedRecomputeCampaign(tx, campaignId);
}

async function recomputeCategoryCurrentAmount(
  tx: Prisma.TransactionClient,
  categoryId: string
) {
  // Same baseline-preserving delegation as recomputeCampaignCurrentAmount above.
  await sharedRecomputeCategory(tx, categoryId);
}

// DELETE /api/donations/[id]
// Permitted for ADMIN, or STAFF with the explicit `donationsEdit` action permission.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const allowed =
      session.user.role === 'ADMIN' ||
      userHasDashboardPermission(session.user, 'donationsEdit');
    if (!allowed) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const donation = await prisma.donation.findUnique({
      where: { id },
      include: { items: true, categoryItems: true },
    });

    if (!donation) {
      return NextResponse.json(
        { error: 'Donation not found' },
        { status: 404 }
      );
    }

    const shouldRevert = donationContributedToTotals(donation);
    const touchedCampaignIds = [...new Set(donation.items.map((item) => item.campaignId))];
    const touchedCategoryIds = [...new Set(donation.categoryItems.map((item) => item.categoryId))];

    await prisma.$transaction(async (tx) => {
      await tx.donationItem.deleteMany({ where: { donationId: id } });
      await tx.donationCategoryItem.deleteMany({ where: { donationId: id } });
      await tx.comment.updateMany({ where: { donationId: id }, data: { donationId: null } });
      await tx.donation.delete({ where: { id } });
      if (shouldRevert) {
        for (const campaignId of touchedCampaignIds) {
          await recomputeCampaignCurrentAmount(tx, campaignId);
        }
        for (const categoryId of touchedCategoryIds) {
          await recomputeCategoryCurrentAmount(tx, categoryId);
        }
      }
    });

    const actor = auditActorFromDashboardSession(session);
    await writeAuditLog({
      ...actor,
      action: "DONATION_DELETE",
      messageAr: shouldRevert
        ? `${actor.actorName ?? "مسؤول"} حذف تبرعًا ناجحًا من السجلات (تم خصمه من إجماليات المشاريع/الحملات)`
        : `${actor.actorName ?? "مسؤول"} حذف تبرعًا غير مكتمل (لم يكن مساهمًا في الإجماليات)`,
      entityType: "Donation",
      entityId: id,
      metadata: {
        amount: donation.amount,
        amountUSD: donation.amountUSD,
        currency: donation.currency,
        status: donation.status,
        revertedTotals: shouldRevert,
      },
    });

    return NextResponse.json(
      { message: 'Donation deleted successfully' },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error deleting donation:', error);
    return NextResponse.json(
      { error: 'Failed to delete donation' },
      { status: 500 }
    );
  }
}

// PATCH /api/donations/[id] - Admin edit: amount, status, reassign items/categoryItems.
// Recomputes each campaign/category currentAmount by diffing OLD vs NEW contribution.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const allowed =
      session.user.role === 'ADMIN' ||
      userHasDashboardPermission(session.user, 'donationsEdit');
    if (!allowed) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = (await request.json()) as {
      status?: 'PAID' | 'FAILED';
      confirmPaidAt?: boolean;
      items?: { campaignId: string; amount: number }[];
      categoryItems?: { categoryId: string; amount: number }[];
    };

    const existing = await prisma.donation.findUnique({
      where: { id },
      include: { items: true, categoryItems: true },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Donation not found' }, { status: 404 });
    }

    const nextStatus = body.status ?? existing.status;
    if (nextStatus !== 'PAID' && nextStatus !== 'FAILED') {
      return NextResponse.json(
        { error: 'Invalid status; use PAID or FAILED' },
        { status: 400 }
      );
    }

    const itemsInput = Array.isArray(body.items) ? body.items : null;
    const catItemsInput = Array.isArray(body.categoryItems) ? body.categoryItems : null;

    if (itemsInput) {
      for (const it of itemsInput) {
        if (!it.campaignId || !Number.isFinite(Number(it.amount)) || Number(it.amount) <= 0) {
          return NextResponse.json({ error: 'Invalid items entry' }, { status: 400 });
        }
      }
    }
    if (catItemsInput) {
      for (const it of catItemsInput) {
        if (!it.categoryId || !Number.isFinite(Number(it.amount)) || Number(it.amount) <= 0) {
          return NextResponse.json({ error: 'Invalid categoryItems entry' }, { status: 400 });
        }
      }
    }

    if (itemsInput || catItemsInput) {
      const nextLineCount =
        (itemsInput ?? existing.items).length +
        (catItemsInput ?? existing.categoryItems).length;
      if (nextLineCount === 0) {
        return NextResponse.json(
          { error: 'Donation must keep at least one item' },
          { status: 400 }
        );
      }
    }

    const duplicateItemKey = findDuplicateKey(itemsInput?.map((it) => it.campaignId) ?? []);
    if (duplicateItemKey) {
      return NextResponse.json(
        { error: 'Duplicate campaign item in donation edit' },
        { status: 400 }
      );
    }
    const duplicateCategoryKey = findDuplicateKey(catItemsInput?.map((it) => it.categoryId) ?? []);
    if (duplicateCategoryKey) {
      return NextResponse.json(
        { error: 'Duplicate category item in donation edit' },
        { status: 400 }
      );
    }

    if (itemsInput) {
      const campaignIds = [...new Set(itemsInput.map((it) => it.campaignId))];
      const foundCampaigns = await prisma.campaign.count({ where: { id: { in: campaignIds } } });
      if (foundCampaigns !== campaignIds.length) {
        return NextResponse.json(
          { error: 'One or more campaigns were not found' },
          { status: 404 }
        );
      }
    }
    if (catItemsInput) {
      const categoryIds = [...new Set(catItemsInput.map((it) => it.categoryId))];
      const foundCategories = await prisma.category.count({ where: { id: { in: categoryIds } } });
      if (foundCategories !== categoryIds.length) {
        return NextResponse.json(
          { error: 'One or more categories were not found' },
          { status: 404 }
        );
      }
    }

    const currencyCode = normalizeDonationCurrencyCode(existing.currency);
    const itemAmountUSD = async (amount: number) =>
      convertAmountInCurrencyToUsd(amount, currencyCode);

    // Pre-compute USD for the new shape so we can both persist and diff.
    const newItems = itemsInput
      ? await Promise.all(
          itemsInput.map(async (it) => ({
            campaignId: it.campaignId,
            amount: Number(it.amount),
            amountUSD: await itemAmountUSD(Number(it.amount)),
            shareCount: existing.items.find((old) => old.campaignId === it.campaignId)?.shareCount ?? undefined,
          }))
        )
      : null;
    const newCatItems = catItemsInput
      ? await Promise.all(
          catItemsInput.map(async (it) => ({
            categoryId: it.categoryId,
            amount: Number(it.amount),
            amountUSD: await itemAmountUSD(Number(it.amount)),
          }))
        )
      : null;

    // Derived donation-level fields (only if items/categoryItems changed).
    const newLineSum = (newItems ?? existing.items).reduce((s, i) => s + i.amount, 0)
      + (newCatItems ?? existing.categoryItems).reduce((s, i) => s + i.amount, 0);

    const newAmount = (newItems || newCatItems) ? newLineSum : existing.amount;
    // totalAmount = donation amount + teamSupport + fees(if coverFees). Preserve
    // teamSupport/fees as-is — the admin is editing the donation portion only.
    const carriedExtras = existing.teamSupport + (existing.coverFees ? existing.fees : 0);
    const newTotalAmount = (newItems || newCatItems) ? newAmount + carriedExtras : existing.totalAmount;
    const newAmountUSD = (newItems || newCatItems)
      ? await convertAmountInCurrencyToUsd(newTotalAmount, currencyCode)
      : existing.amountUSD;
    // Stamp paidAt when:
    //  - FAILED → PAID with no paidAt (legacy auto-stamp), OR
    //  - donation was PAID but قيد التأكيد (paidAt=null) and admin explicitly
    //    confirms via `confirmPaidAt`. Without the explicit flag, leave it as
    //    قيد التأكيد so webhooks remain the source of truth.
    const shouldStampPaidAt =
      nextStatus === 'PAID' &&
      existing.paidAt === null &&
      (existing.status !== 'PAID' || body.confirmPaidAt === true);
    const nextPaidAt = shouldStampPaidAt ? new Date() : existing.paidAt;

    // Build OLD vs NEW contribution maps. A donation only contributes to
    // campaign/category totals when status=PAID && paidAt is set.
    const oldContributes = donationContributedToTotals(existing);
    const newContributes = nextStatus === 'PAID' && nextPaidAt !== null;

    const oldCampaignContrib = new Map<string, number>();
    const oldCategoryContrib = new Map<string, number>();
    if (oldContributes) {
      for (const i of existing.items) {
        oldCampaignContrib.set(
          i.campaignId,
          (oldCampaignContrib.get(i.campaignId) ?? 0) + (i.amountUSD ?? i.amount)
        );
      }
      for (const i of existing.categoryItems) {
        oldCategoryContrib.set(
          i.categoryId,
          (oldCategoryContrib.get(i.categoryId) ?? 0) + (i.amountUSD ?? i.amount)
        );
      }
    }

    const newCampaignContrib = new Map<string, number>();
    const newCategoryContrib = new Map<string, number>();
    if (newContributes) {
      for (const i of newItems ?? existing.items) {
        newCampaignContrib.set(
          i.campaignId,
          (newCampaignContrib.get(i.campaignId) ?? 0) + (i.amountUSD ?? i.amount)
        );
      }
      for (const i of newCatItems ?? existing.categoryItems) {
        newCategoryContrib.set(
          i.categoryId,
          (newCategoryContrib.get(i.categoryId) ?? 0) + (i.amountUSD ?? i.amount)
        );
      }
    }

    const campaignDeltas = new Map<string, number>();
    const categoryDeltas = new Map<string, number>();
    for (const [k, v] of newCampaignContrib) campaignDeltas.set(k, (campaignDeltas.get(k) ?? 0) + v);
    for (const [k, v] of oldCampaignContrib) campaignDeltas.set(k, (campaignDeltas.get(k) ?? 0) - v);
    for (const [k, v] of newCategoryContrib) categoryDeltas.set(k, (categoryDeltas.get(k) ?? 0) + v);
    for (const [k, v] of oldCategoryContrib) categoryDeltas.set(k, (categoryDeltas.get(k) ?? 0) - v);
    const touchedCampaignIds = [
      ...new Set([...oldCampaignContrib.keys(), ...newCampaignContrib.keys()]),
    ];
    const touchedCategoryIds = [
      ...new Set([...oldCategoryContrib.keys(), ...newCategoryContrib.keys()]),
    ];

    await prisma.$transaction(async (tx) => {
      if (newItems) {
        await tx.donationItem.deleteMany({ where: { donationId: id } });
        if (newItems.length > 0) {
          await tx.donationItem.createMany({
            data: newItems.map((i) => ({
              donationId: id,
              campaignId: i.campaignId,
              amount: i.amount,
              amountUSD: i.amountUSD,
              ...(i.shareCount != null ? { shareCount: i.shareCount } : {}),
            })),
          });
        }
      }
      if (newCatItems) {
        await tx.donationCategoryItem.deleteMany({ where: { donationId: id } });
        if (newCatItems.length > 0) {
          await tx.donationCategoryItem.createMany({
            data: newCatItems.map((i) => ({
              donationId: id,
              categoryId: i.categoryId,
              amount: i.amount,
              amountUSD: i.amountUSD,
            })),
          });
        }
      }

      await tx.donation.update({
        where: { id },
        data: {
          amount: newAmount,
          amountUSD: newAmountUSD,
          totalAmount: newTotalAmount,
          status: nextStatus,
          ...(shouldStampPaidAt && { paidAt: nextPaidAt }),
          // Self-heal legacy rows: any admin edit stamps paymentMethod=CARD
          // if it was never written. New donations always have it set, so
          // this is a one-shot backfill triggered organically by edits.
          ...(existing.paymentMethod == null && { paymentMethod: 'CARD' }),
        },
      });

      for (const campaignId of touchedCampaignIds) {
        await recomputeCampaignCurrentAmount(tx, campaignId);
      }
      for (const categoryId of touchedCategoryIds) {
        await recomputeCategoryCurrentAmount(tx, categoryId);
      }
    });

    const actor = auditActorFromDashboardSession(session);
    await writeAuditLog({
      ...actor,
      action: 'DONATION_EDIT',
      messageAr: `${actor.actorName ?? 'مسؤول'} عدّل تبرعًا يدويًا (مع تحديث إجماليات المشاريع/الحملات)`,
      entityType: 'Donation',
      entityId: id,
      metadata: {
        before: {
          amount: existing.amount,
          amountUSD: existing.amountUSD,
          status: existing.status,
          paidAt: existing.paidAt,
          items: existing.items.map((i) => ({ campaignId: i.campaignId, amount: i.amount })),
          categoryItems: existing.categoryItems.map((i) => ({ categoryId: i.categoryId, amount: i.amount })),
        },
        after: {
          amount: newAmount,
          amountUSD: newAmountUSD,
          status: nextStatus,
          paidAt: nextPaidAt,
          items: newItems ?? null,
          categoryItems: newCatItems ?? null,
        },
        deltas: {
          campaigns: Object.fromEntries(campaignDeltas),
          categories: Object.fromEntries(categoryDeltas),
        },
      },
    });

    const refreshed = await prisma.donation.findUnique({
      where: { id },
      include: {
        donor: { select: { id: true, name: true, email: true, image: true } },
        items: { include: { campaign: { select: { id: true, title: true, images: true } } } },
        categoryItems: { include: { category: { select: { id: true, name: true } } } },
        referral: { select: { id: true, code: true, name: true } },
      },
    });
    return NextResponse.json({
      donation: refreshed
        ? {
            ...refreshed,
            type: refreshed.subscriptionId ? ('MONTHLY' as const) : ('ONE_TIME' as const),
          }
        : null,
    });
  } catch (error) {
    console.error('Error editing donation:', error);
    return NextResponse.json(
      { error: 'Failed to edit donation', details: (error as Error).message },
      { status: 500 }
    );
  }
} 
