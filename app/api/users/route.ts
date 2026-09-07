import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from "@/lib/prisma";
import { getServerSession } from 'next-auth';
import { authOptions } from '../auth/[...nextauth]/options';
import { getUserIdsMatchingBadge, getBadgeIdsByUser } from '@/lib/badge-criteria';
import { requireAdminOrDashboardPermission, requireAdminSession } from '@/lib/dashboard/api-auth';
import {
  isDashboardRoutePermissionKey,
  sanitizeDashboardPermissions,
  sessionHasDashboardPermission,
} from '@/lib/dashboard/permissions';
import { writeAuditLog } from '@/lib/audit-log';
import {
  birthdateRangeForAges,
  genderQueryValues,
  parseAgeParam,
  parseGenderParam,
} from '@/lib/dashboard/user-demographics';

type UserScope = 'donors' | 'team' | 'all';

// GET /api/users — scope=donors | scope=team | omit/empty/all = every role (no role filter)
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const { searchParams } = new URL(request.url);
    const trimmedScope = (searchParams.get('scope') ?? '').trim();
    if (
      trimmedScope &&
      trimmedScope !== 'donors' &&
      trimmedScope !== 'team' &&
      trimmedScope !== 'all'
    ) {
      return NextResponse.json(
        { error: 'Invalid scope; use donors, team, all, or omit for all users' },
        { status: 400 }
      );
    }
    const scope: UserScope =
      trimmedScope === 'team' ? 'team' : trimmedScope === 'donors' ? 'donors' : 'all';

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (scope === 'donors') {
      const canListDonors =
        sessionHasDashboardPermission(session, 'donors') ||
        sessionHasDashboardPermission(session, 'revenue') ||
        sessionHasDashboardPermission(session, 'monthly');
      if (!canListDonors) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    } else if (scope === 'team') {
      const denied = requireAdminOrDashboardPermission(session, 'team');
      if (denied) return denied;
    } else {
      const canListAll =
        session.user.role === 'ADMIN' ||
        sessionHasDashboardPermission(session, 'donors') ||
        sessionHasDashboardPermission(session, 'team') ||
        sessionHasDashboardPermission(session, 'revenue') ||
        sessionHasDashboardPermission(session, 'monthly');
      if (!canListAll) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    const preferredLang = searchParams.get('preferredLang') || undefined;
    const badgeId = searchParams.get('badgeId') || undefined;
    const search = searchParams.get('search')?.trim() || undefined;
    const gender = parseGenderParam(searchParams.get('gender'));
    const minAge = parseAgeParam(searchParams.get('minAge'));
    const maxAge = parseAgeParam(searchParams.get('maxAge'));
    const sortBy = (searchParams.get('sortBy') || 'createdAt') as 'createdAt' | 'name' | 'email' | 'donationsCount' | 'totalDonated' | 'role';
    const sortOrder = (searchParams.get('sortOrder') || 'desc') as 'asc' | 'desc';
    const page = parseInt(searchParams.get('page') || '1');
    const limit = Math.min(parseInt(searchParams.get('limit') || '10') || 10, 100);
    const skip = (page - 1) * limit;

    const roleFilter: Record<string, unknown> =
      scope === 'donors'
        ? { role: 'DONOR' as const }
        : scope === 'team'
          ? { role: { in: ['ADMIN', 'STAFF'] as const } }
          : {};

    let where: Record<string, unknown> = {
      ...roleFilter,
      ...(preferredLang && { preferredLang }),
      ...(search && search.length > 0 && {
        OR: [
          { name: { contains: search } },
          { email: { contains: search } },
        ],
      }),
    };

    if (scope === 'team' && session?.user?.id) {
      where = { ...where, NOT: { id: session.user.id } };
    }

    // `gender` is free-form on the model, so match every spelling the app has
    // ever written rather than a single canonical value.
    if (gender) {
      where = { ...where, gender: { in: genderQueryValues(gender) } };
    }

    // `birthdate` is an ISO "YYYY-MM-DD" string, and ISO dates sort
    // lexicographically — so an age range is a plain string range. Users with no
    // birthdate recorded drop out of the result, which is the intended meaning
    // of "donors aged 25-40".
    const birthdateRange = birthdateRangeForAges(minAge, maxAge);
    if (birthdateRange) {
      where = { ...where, birthdate: birthdateRange };
    }

    if (badgeId && scope === 'donors') {
      const badge = await prisma.badge.findUnique({
        where: { id: badgeId },
        select: { criteria: true },
      });
      if (badge) {
        const badgeUserIds = await getUserIdsMatchingBadge(badge.criteria);
        if (badgeUserIds.length === 0) {
          where = { ...where, id: { in: [] } };
        } else {
          where = { ...where, id: { in: badgeUserIds } };
        }
      }
    }

    const total = await prisma.user.count({ where });

    const isAggregateSort = sortBy === 'donationsCount' || sortBy === 'totalDonated';
    let orderedIds: string[] = [];

    if (isAggregateSort && total > 0) {
      const userRows = await prisma.user.findMany({
        where,
        select: { id: true, role: true },
      });

      const sortIdsByDonations = async (ids: string[]) => {
        if (ids.length === 0) return [];
        const gRows = await prisma.donation.groupBy({
          by: ['donorId'],
          where: { donorId: { in: ids }, status: "PAID" },
          _count: { id: true },
          _sum: { amountUSD: true, totalAmount: true },
        });
        const byDonor = new Map(gRows.map((r) => [r.donorId, r]));
        const withZero = ids.map((id) => {
          const g = byDonor.get(id);
          return {
            donorId: id,
            count: g?._count.id ?? 0,
            amountUSD: g?._sum.amountUSD ?? 0,
          };
        });
        const mult = sortOrder === 'desc' ? 1 : -1;
        if (sortBy === 'donationsCount') {
          withZero.sort((a, b) => mult * (a.count - b.count));
        } else {
          withZero.sort((a, b) => mult * (a.amountUSD - b.amountUSD));
        }
        return withZero.map((x) => x.donorId);
      };

      if (scope === 'team') {
        const adminIds = userRows.filter((u) => u.role === 'ADMIN').map((u) => u.id);
        const staffIds = userRows.filter((u) => u.role !== 'ADMIN').map((u) => u.id);
        const [a, s] = await Promise.all([
          sortIdsByDonations(adminIds),
          sortIdsByDonations(staffIds),
        ]);
        orderedIds = [...a, ...s];
      } else {
        const userIds = userRows.map((u) => u.id);
        orderedIds = await sortIdsByDonations(userIds);
      }
    }

    const orderByField = sortBy === 'name' || sortBy === 'email' || sortBy === 'createdAt' || sortBy === 'role'
      ? sortBy
      : 'createdAt';

    const baseSelect = {
      id: true,
      name: true,
      email: true,
      image: true,
      role: true,
      dashboardPermissions: true,
      preferredLang: true,
      country: true,
      countryCode: true,
      countryName: true,
      region: true,
      city: true,
      phone: true,
      gender: true,
      birthdate: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { donations: true } },
    } as const;

    type UserListRow = Prisma.UserGetPayload<{ select: typeof baseSelect }>;
    let users: UserListRow[];

    if (scope === 'team' && !isAggregateSort) {
      const secondary =
        sortBy === 'role'
          ? { createdAt: sortOrder }
          : orderByField === 'createdAt'
            ? { createdAt: sortOrder }
            : { [orderByField]: sortOrder };
      users = await prisma.user.findMany({
        where,
        select: baseSelect,
        orderBy: [{ role: 'asc' }, secondary],
        skip,
        take: limit,
      });
    } else if (isAggregateSort && orderedIds.length > 0) {
      const pageIds = orderedIds.slice(skip, skip + limit);
      const byId = new Map(
        (await prisma.user.findMany({
          where: { id: { in: pageIds } },
          select: baseSelect,
        })).map((u) => [u.id, u])
      );
      users = pageIds
        .map((id) => byId.get(id))
        .filter((u): u is UserListRow => Boolean(u));
    } else {
      users = await prisma.user.findMany({
        where,
        select: baseSelect,
        orderBy: orderByField === 'createdAt' ? { createdAt: sortOrder } : { [orderByField]: sortOrder },
        skip,
        take: limit,
      });
    }

    const userIds = users.map((u) => u.id);
    const totalsByUser =
      userIds.length > 0
        ? await prisma.donation.groupBy({
            by: ["donorId"],
            where: { donorId: { in: userIds }, status: "PAID" },
            _sum: { totalAmount: true, amountUSD: true },
            _max: { createdAt: true },
            _count: { id: true },
          })
        : [];
    const totalByDonorId = new Map(
      totalsByUser.map((r) => [
        r.donorId,
        {
          totalAmount: r._sum.totalAmount ?? 0,
          amountUSD: r._sum.amountUSD ?? 0,
          lastDonationAt: r._max.createdAt ?? null,
          paidDonationCount: r._count.id,
        },
      ])
    );

    const allBadges = await prisma.badge.findMany({
      select: { id: true, criteria: true },
      orderBy: { order: 'asc' },
    });
    const badgeIdsByUser =
      (scope === 'donors' || scope === 'all') &&
      userIds.length > 0 &&
      allBadges.length > 0
        ? await getBadgeIdsByUser(userIds, allBadges)
        : new Map<string, string[]>();

    const usersWithTotals = users.map((u) => ({
      ...u,
      totalDonationsCount: totalByDonorId.get(u.id)?.paidDonationCount ?? 0,
      totalDonatedAmount: totalByDonorId.get(u.id)?.totalAmount ?? 0,
      totalDonatedAmountUSD: totalByDonorId.get(u.id)?.amountUSD ?? 0,
      lastDonationAt: totalByDonorId.get(u.id)?.lastDonationAt ?? null,
      badgeIds: badgeIdsByUser.get(u.id) ?? [],
    }));

    return NextResponse.json({
      users: usersWithTotals,
      pagination: {
        total,
        pages: Math.ceil(total / limit),
        page,
        limit,
      },
      scope,
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    return NextResponse.json(
      { error: 'Failed to fetch users' },
      { status: 500 }
    );
  }
}

// POST /api/users — admin only
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const denied = requireAdminSession(session);
    if (denied) return denied;

    const body = await request.json();
    const { name, email, role, dashboardPermissions: rawPerms } = body;

    if (!name || !email) {
      return NextResponse.json(
        { error: 'Name and email are required' },
        { status: 400 }
      );
    }

    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: 'Email already exists' },
        { status: 400 }
      );
    }

    const r = role || 'DONOR';
    const perms =
      r === 'STAFF' ? sanitizeDashboardPermissions(rawPerms) : [];
    if (r === 'STAFF' && !perms.some(isDashboardRoutePermissionKey)) {
      return NextResponse.json(
        { error: 'Staff members need at least one dashboard section enabled' },
        { status: 400 }
      );
    }

    const user = await prisma.user.create({
      data: {
        name,
        email,
        role: r,
        dashboardPermissions: perms,
      },
    });

    const actor = session!.user;
    await writeAuditLog({
      actorId: actor.id,
      actorName: actor.name,
      actorRole: actor.role ?? 'ADMIN',
      action: 'USER_CREATE',
      messageAr: `${actor.name ?? 'مسؤول'} أنشأ مستخدمًا جديدًا: ${name} (${email}) بدور ${r === 'ADMIN' ? 'مدير' : r === 'STAFF' ? 'طاقم' : 'متبرع'}`,
      messageEn: `${actor.name ?? 'Admin'} created user ${name} (${email}) as ${r}`,
      entityType: 'User',
      entityId: user.id,
      metadata: { role: r },
    });

    return NextResponse.json(user);
  } catch (error) {
    console.error('Error creating user:', error);
    return NextResponse.json(
      { error: 'Failed to create user' },
      { status: 500 }
    );
  }
}
