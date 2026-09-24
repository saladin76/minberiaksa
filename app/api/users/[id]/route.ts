import { NextRequest, NextResponse } from 'next/server';
import { prisma } from "@/lib/prisma";
import { getServerSession } from 'next-auth';
import { authOptions } from '../../auth/[...nextauth]/options';
import {
  isDashboardRoutePermissionKey,
  sanitizeDashboardPermissions,
  userCanViewUserProfilesInDashboard,
} from '@/lib/dashboard/permissions';
import { requireAdminSession } from '@/lib/dashboard/api-auth';
import { writeAuditLog } from '@/lib/audit-log';
import { getBadgeIdsByUser } from '@/lib/badge-criteria';

function roleLabelAr(r: string) {
  if (r === 'ADMIN') return 'مدير';
  if (r === 'STAFF') return 'طاقم';
  return 'متبرع';
}

// GET /api/users/[id] - Get user by ID
export async function GET(
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

    const canViewOthers =
      session.user.role === 'ADMIN' ||
      userCanViewUserProfilesInDashboard(session.user);
    if (!canViewOthers && session.user.id !== id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        donations: {
          include: {
            subscription: {
              select: {
                id: true,
                status: true,
                frequency: true,
                nextBillingDate: true,
              },
            },
            items: {
              include: {
                campaign: {
                  select: {
                    title: true,
                    images: true,
                  },
                },
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
        _count: { select: { donations: true } },
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    const oneTimeDonations = user.donations.filter((d) => d.subscriptionId == null);
    const monthlyDonations = user.donations.filter((d) => d.subscriptionId != null);

    const withType = (d: typeof user.donations[0], type: 'ONE_TIME' | 'MONTHLY') => {
      const sub = d.subscription;
      return {
        ...d,
        type,
        /** Donation charge status (PAID / FAILED) — unchanged for revenue totals */
        paymentStatus: d.status,
        status: type === 'MONTHLY' ? (sub?.status ?? null) : d.status,
        /** The plan's cadence — DAILY | FRIDAY | MONTHLY. `type` stays "MONTHLY" for every plan: it means "recurring" to every consumer. */
        frequency: type === 'MONTHLY' ? (sub?.frequency ?? 'MONTHLY') : null,
        nextBillingDate: type === 'MONTHLY' ? (sub?.nextBillingDate ?? null) : null,
      };
    };

    const donationsForUser = [
      ...oneTimeDonations.map((d) => withType(d, 'ONE_TIME')),
      ...monthlyDonations.map((d) => withType(d, 'MONTHLY')),
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const [totalsRows, allBadges, activeSubs] = await Promise.all([
      prisma.donation.groupBy({
        by: ['donorId'],
        where: {
          donorId: id,
          status: 'PAID',
          // One-time donations need a settled paidAt to count; subscription
          // donations count on status=PAID alone since recurring charges fire
          // without a donor click (no abandonment moment to guard against).
          OR: [
            { paidAt: { not: null } },
            { subscriptionId: { not: null } },
          ],
        },
        _sum: { totalAmount: true, amountUSD: true },
        _max: { createdAt: true },
        _count: { id: true },
      }),
      prisma.badge.findMany({
        select: { id: true, criteria: true },
        orderBy: { order: 'asc' },
      }),
      prisma.subscription.findMany({
        where: { donorId: id, status: 'ACTIVE' },
        select: { id: true, amountUSD: true, amount: true, currency: true },
      }),
    ]);
    const t = totalsRows[0];
    const badgeIdsByUser =
      allBadges.length > 0 ? await getBadgeIdsByUser([id], allBadges) : new Map<string, string[]>();

    // Currently-active monthly recurring revenue from this donor (USD).
    // Falls back to local-currency amount only when amountUSD wasn't captured
    // at subscription create time.
    const currentMonthlyMrrUSD = activeSubs.reduce(
      (sum, s) => sum + (s.amountUSD ?? s.amount ?? 0),
      0
    );

    // Distinct supported campaigns. Subscription donations count even without
    // paidAt — they're treated as ناجح across dashboards/UI.
    const supportedCampaignIds = new Set<string>();
    for (const donation of user.donations) {
      if (donation.status !== 'PAID') continue;
      if (donation.paidAt == null && donation.subscriptionId == null) continue;
      for (const item of donation.items) supportedCampaignIds.add(item.campaignId);
    }

    // Consecutive-month streak: count back from the current month, breaking
    // as soon as we hit a month with no paid donation. Caps at 24 so a very
    // long-tail donor doesn't blow up the loop.
    const paidMonthKeys = new Set(
      user.donations
        // Settlement-only, matching PAID_DONATION_FILTER: an unsettled subscription row
        // must not mark a month as "donated in" on the donor's streak.
        .filter((d) => d.status === 'PAID' && d.paidAt != null)
        .map((d) => {
          const dt = d.paidAt ?? d.createdAt;
          return `${dt.getUTCFullYear()}-${dt.getUTCMonth()}`;
        })
    );
    let streakMonths = 0;
    const cursor = new Date();
    cursor.setUTCDate(1);
    for (let i = 0; i < 24; i++) {
      const key = `${cursor.getUTCFullYear()}-${cursor.getUTCMonth()}`;
      if (paidMonthKeys.has(key)) {
        streakMonths += 1;
        cursor.setUTCMonth(cursor.getUTCMonth() - 1);
      } else {
        break;
      }
    }

    const profileCard = {
      totalDonationsCount: t?._count.id ?? 0,
      totalDonatedAmount: t?._sum.totalAmount ?? 0,
      totalDonatedAmountUSD: t?._sum.amountUSD ?? 0,
      lastDonationAt: t?._max.createdAt ?? null,
      badgeIds: badgeIdsByUser.get(id) ?? [],
      currentMonthlyMrrUSD,
      activeSubscriptionsCount: activeSubs.length,
      supportedCampaignsCount: supportedCampaignIds.size,
      streakMonths,
    };

    // Don't leak the password hash to the client. The profile UI only needs
    // a boolean to know whether to show the "current password" field.
    const { password: _omitPwd, ...userWithoutPwd } = user;
    void _omitPwd;
    const safeUser = {
      ...userWithoutPwd,
      hasPassword: Boolean(user.password),
      donations: donationsForUser,
      ...profileCard,
    };

    return NextResponse.json({
      user: safeUser,
      oneTimeDonations: oneTimeDonations.map((d) => withType(d, 'ONE_TIME')),
      monthlyDonations: monthlyDonations.map((d) => withType(d, 'MONTHLY')),
    });
  } catch (error) {
    console.error('Error fetching user:', error);
    return NextResponse.json(
      { error: 'Failed to fetch user' },
      { status: 500 }
    );
  }
}

// PUT /api/users/[id] - Update user
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
    const {
      name,
      email,
      country,
      countryCode,
      countryName,
      region,
      city,
      phone,
      birthdate,
      gender,
      image,
      emailNotifications,
      smsNotifications,
      profileCompletionSeen,
      role,
      preferredLang,
      dashboardPermissions: rawDashboardPermissions,
      clarityId: rawClarityId,
    } = body;

    const isSelf = session.user.id === id;
    const wantsAuthorityChange =
      role !== undefined || rawDashboardPermissions !== undefined;
    const wantsClarityIdChange = rawClarityId !== undefined;

    const existing = await prisma.user.findUnique({
      where: { id },
      select: {
        role: true,
        dashboardPermissions: true,
        name: true,
        email: true,
      },
    });
    if (!existing) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const isAdmin = session.user.role === 'ADMIN';

    if (!isSelf && !isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (wantsAuthorityChange && !isAdmin) {
      return NextResponse.json(
        { error: 'Only admins can change roles or dashboard access' },
        { status: 403 }
      );
    }

    // Clarity ID is an internal session-replay identifier the admin attaches
    // to a donor. The donor themselves must never edit it.
    if (wantsClarityIdChange && !isAdmin) {
      return NextResponse.json(
        { error: 'Only admins can set the Clarity ID' },
        { status: 403 }
      );
    }

    let nextClarityId: string | null | undefined;
    if (wantsClarityIdChange) {
      if (rawClarityId === null || rawClarityId === '') {
        nextClarityId = null;
      } else if (typeof rawClarityId === 'string') {
        const trimmed = rawClarityId.trim();
        if (trimmed.length === 0) {
          nextClarityId = null;
        } else if (trimmed.length > 200) {
          return NextResponse.json(
            { error: 'clarityId is too long (max 200 chars)' },
            { status: 400 }
          );
        } else {
          nextClarityId = trimmed;
        }
      } else {
        return NextResponse.json(
          { error: 'clarityId must be a string' },
          { status: 400 }
        );
      }
    }

    if (email) {
      const existingUser = await prisma.user.findFirst({
        where: {
          email,
          NOT: {
            id,
          },
        },
      });

      if (existingUser) {
        return NextResponse.json(
          { error: 'Email already exists' },
          { status: 400 }
        );
      }
    }

    let nextDashboardPermissions: string[] | undefined;

    if (
      isAdmin &&
      (role !== undefined || rawDashboardPermissions !== undefined)
    ) {
      const effectiveRole = role ?? existing.role;

      if (role !== undefined) {
        if (role === 'STAFF') {
          nextDashboardPermissions =
            rawDashboardPermissions !== undefined
              ? sanitizeDashboardPermissions(rawDashboardPermissions)
              : (existing.dashboardPermissions ?? []);
          if (!nextDashboardPermissions.some(isDashboardRoutePermissionKey)) {
            return NextResponse.json(
              {
                error:
                  'Staff members need at least one dashboard section enabled',
              },
              { status: 400 }
            );
          }
        } else {
          nextDashboardPermissions = [];
        }
      } else if (
        rawDashboardPermissions !== undefined &&
        effectiveRole === 'STAFF'
      ) {
        nextDashboardPermissions = sanitizeDashboardPermissions(
          rawDashboardPermissions
        );
        if (!nextDashboardPermissions.some(isDashboardRoutePermissionKey)) {
          return NextResponse.json(
            {
              error:
                'Staff members need at least one dashboard section enabled',
            },
            { status: 400 }
          );
        }
      }
    }

    const updatedUser = await prisma.user.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(email !== undefined && { email }),
        ...(countryCode !== undefined && {
          countryCode: countryCode === "" ? null : countryCode,
        }),
        ...(countryName !== undefined && {
          countryName: countryName === "" ? null : countryName,
          ...(country === undefined && {
            country: countryName === "" ? null : countryName,
          }),
        }),
        ...(country !== undefined && {
          country: country === "" ? null : country,
          ...(countryName === undefined && {
            countryName: country === "" ? null : country,
          }),
        }),
        ...(region !== undefined && { region: region === "" ? null : region }),
        ...(city !== undefined && { city: city === "" ? null : city }),
        ...(phone !== undefined && { phone }),
        ...(birthdate !== undefined && { birthdate }),
        ...(gender !== undefined && { gender: gender === "" ? null : gender }),
        ...(image !== undefined && { image: image === "" ? null : image }),
        ...(emailNotifications !== undefined && {
          emailNotifications: Boolean(emailNotifications),
        }),
        ...(smsNotifications !== undefined && {
          smsNotifications: Boolean(smsNotifications),
        }),
        ...(profileCompletionSeen !== undefined && { profileCompletionSeen }),
        ...(role !== undefined && { role }),
        ...(preferredLang !== undefined && {
          preferredLang: preferredLang === '' ? null : preferredLang,
        }),
        ...(nextDashboardPermissions !== undefined && {
          dashboardPermissions: nextDashboardPermissions,
        }),
        ...(nextClarityId !== undefined && { clarityId: nextClarityId }),
      },
    });

    if (isAdmin && wantsAuthorityChange) {
      const actor = session.user;
      const targetName = existing.name ?? existing.email ?? id;
      const newR = role ?? existing.role;
      await writeAuditLog({
        actorId: actor.id,
        actorName: actor.name,
        actorRole: actor.role ?? 'ADMIN',
        action: 'USER_AUTHORITY_UPDATE',
        messageAr: `${actor.name ?? 'مدير'} عدّل صلاحيات ${targetName}: الدور ${roleLabelAr(newR)}`,
        messageEn: `${actor.name ?? 'Admin'} updated authority for ${targetName} → ${newR}`,
        entityType: 'User',
        entityId: id,
        metadata: {
          role: newR,
          dashboardPermissions: updatedUser.dashboardPermissions,
        },
      });
    }

    return NextResponse.json(updatedUser);
  } catch (error) {
    console.error('Error updating user:', error);
    return NextResponse.json(
      { error: 'Failed to update user' },
      { status: 500 }
    );
  }
}

/** Placeholder identity written over a deleted account. `.invalid` is a reserved
 * TLD, so nothing is ever delivered to it, and the id keeps `email` unique. */
const DELETED_DONOR_NAME = 'متبرع محذوف';
function deletedEmailFor(id: string) {
  return `deleted+${id}@deleted.invalid`;
}

// DELETE /api/users/[id] - Close an account (admin only).
//
// Financial records are append-only, so this never deletes the user row or
// anything that hangs off it financially. Donations, subscriptions, receipts
// and certificates keep pointing at the same donorId. What goes is the person:
// their personal data is overwritten, sign-in is made impossible, and saved
// cards, OAuth links, sessions and cart are removed.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    const adminDenied = requireAdminSession(session);
    if (adminDenied) return adminDenied;

    if (session!.user.id === id) {
      return NextResponse.json({ error: 'You cannot delete your own account' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, name: true, email: true, role: true },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // A live plan would keep charging a card whose owner no longer has an
    // account to manage it. Cancel it first (the monthly dashboard cancels at
    // the provider), then close the account.
    const livePlans = await prisma.subscription.count({
      where: { donorId: id, status: { in: ['ACTIVE', 'PAUSED'] } },
    });
    if (livePlans > 0) {
      return NextResponse.json(
        {
          error: 'ACTIVE_SUBSCRIPTIONS',
          message: `This donor has ${livePlans} active or paused recurring plan(s). Cancel them before deleting the account.`,
        },
        { status: 409 }
      );
    }

    const donationCount = await prisma.donation.count({ where: { donorId: id } });

    await prisma.$transaction(async (tx) => {
      await tx.account.deleteMany({ where: { userId: id } });
      await tx.session.deleteMany({ where: { userId: id } });
      await tx.cartItem.deleteMany({ where: { userId: id } });
      await tx.creditCard.deleteMany({ where: { userId: id } });
      await tx.user.update({
        where: { id },
        data: {
          name: DELETED_DONOR_NAME,
          email: deletedEmailFor(id),
          emailVerified: null,
          image: null,
          password: null,
          phone: null,
          birthdate: null,
          gender: null,
          city: null,
          region: null,
          clarityId: null,
          role: 'DONOR',
          dashboardPermissions: [],
          emailNotifications: false,
          smsNotifications: false,
        },
      });
    });

    const actor = session!.user;
    await writeAuditLog({
      actorId: actor.id,
      actorName: actor.name,
      actorRole: actor.role ?? 'ADMIN',
      action: 'USER_DELETE',
      messageAr: `${actor.name ?? 'مدير'} حذف حساب المستخدم ${user.name ?? user.email ?? id} (أُخفيت بياناته الشخصية وبقيت سجلاته المالية: ${donationCount} تبرع)`,
      messageEn: `${actor.name ?? 'Admin'} closed and anonymized user ${user.email ?? id}; ${donationCount} donation record(s) kept`,
      entityType: 'User',
      entityId: id,
      metadata: { previousRole: user.role, donationsKept: donationCount },
    });

    return NextResponse.json(
      {
        message: 'Account closed. Personal data removed; donation and subscription records kept.',
        donationsKept: donationCount,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error deleting user:', error);
    return NextResponse.json(
      { error: 'Failed to delete user' },
      { status: 500 }
    );
  }
}
