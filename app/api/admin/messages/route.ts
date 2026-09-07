import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/[...nextauth]/options";
import { prisma } from "@/lib/prisma";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { safeCountValue } from "@/lib/dashboard/safe-count";
import {
  decodeMessageBodySubject,
  isMessageSubject,
  type MessageSubject,
} from "@/lib/messages/subjects";
import {
  inboxStatusWhere,
  isInboxStatus,
  NOT_READ_WHERE,
  NOT_REPLIED_WHERE,
  IS_READ_WHERE,
  IS_REPLIED_WHERE,
} from "@/lib/messages/inbox-status";
import { resolveContactPhone, splitTrailingPhone } from "@/lib/messages/contact-phone";

type SortKey = "priority" | "createdAt" | "body";

/**
 * "What needs answering first", as a single stable sort.
 *
 * MongoDB orders null and missing values before real dates, so ascending `repliedAt` puts every
 * unanswered message ahead of every answered one; the `createdAt` tiebreak then orders that
 * unanswered block oldest-first — whoever has been waiting longest is at the top. Doing it in
 * one query (rather than two, or a fetch-then-sort) is what keeps pagination honest.
 */
const PRIORITY_ORDER_BY = [{ repliedAt: "asc" as const }, { createdAt: "asc" as const }];

// GET /api/admin/messages - List messages (admin only) with filters
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const denied = requireAdminOrDashboardPermission(session, "messages");
    if (denied) return denied;

    const { searchParams } = new URL(request.url);
    const locale = searchParams.get("locale") || undefined; // ar, en, fr
    const search = searchParams.get("search")?.trim() || undefined;
    const hasUser = searchParams.get("hasUser"); // "true" | "false" | omit
    const subject = searchParams.get("subject") || "all";
    const statusParam = searchParams.get("status") || "all";
    const status = isInboxStatus(statusParam) ? statusParam : null;
    const sortByParam = searchParams.get("sortBy") || "priority";
    const sortBy: SortKey =
      sortByParam === "createdAt" || sortByParam === "body" ? sortByParam : "priority";
    const sortOrder = (searchParams.get("sortOrder") || "desc") as "asc" | "desc";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") || "10")));
    const skip = (page - 1) * limit;

    // Everything except the triage state. The tab counts are taken against this, so switching
    // tabs never changes the numbers on the tabs themselves.
    const baseWhere: Record<string, unknown> = {};
    const baseAnd: Record<string, unknown>[] = [];
    if (locale) baseWhere.locale = locale;
    if (search && search.length > 0) {
      baseAnd.push({ body: { contains: search } });
    }
    if (subject !== "all" && isMessageSubject(subject)) {
      if (subject === "GENERAL") {
        baseAnd.push({
          OR: [
            { subject: "GENERAL" },
            { subject: null },
            { body: { not: { contains: "[SUBJECT:" } } },
          ],
        });
      } else {
        baseAnd.push({
          OR: [
            { subject: subject as MessageSubject },
            { body: { contains: `[SUBJECT:${subject}]` } },
          ],
        });
      }
    }
    if (hasUser === "true") baseWhere.userId = { not: null };
    if (hasUser === "false") baseWhere.userId = null;

    const withClause = (extra?: Record<string, unknown>) => {
      const and = extra ? [...baseAnd, extra] : baseAnd;
      return and.length > 0 ? { ...baseWhere, AND: and } : { ...baseWhere };
    };

    const where = withClause(status ? inboxStatusWhere(status) : undefined);

    // `priority` is the only multi-key order; the other two keep the caller's direction.
    const orderBy =
      sortBy === "priority"
        ? PRIORITY_ORDER_BY
        : [{ [sortBy]: sortOrder === "asc" ? ("asc" as const) : ("desc" as const) }];

    const [messages, total, unread, pending, replied, all] = await Promise.all([
      prisma.message.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        include: {
          user: {
            select: { id: true, name: true, email: true, image: true, phone: true, countryCode: true },
          },
        },
      }),
      prisma.message.count({ where }),
      // safeCountValue, not `.catch(() => 0)`: a broken count must show up in the logs rather
      // than render as a reassuring "0 بانتظار الرد".
      safeCountValue("inbox.count.unread", () =>
        prisma.message.count({ where: withClause(NOT_READ_WHERE) }),
      ),
      safeCountValue("inbox.count.pending", () =>
        prisma.message.count({ where: withClause({ AND: [IS_READ_WHERE, NOT_REPLIED_WHERE] }) }),
      ),
      safeCountValue("inbox.count.replied", () =>
        prisma.message.count({ where: withClause(IS_REPLIED_WHERE) }),
      ),
      safeCountValue("inbox.count.all", () => prisma.message.count({ where: withClause() })),
    ]);

    const normalized = messages.map((m) => {
      const decoded = decodeMessageBodySubject(m.body);
      // Legacy rows carry the number as a trailing body line; strip it so it is not shown twice
      // once the resolved phone is rendered as its own field.
      const split = splitTrailingPhone(decoded.body);
      const { user, ...rest } = m;
      const { phone, whatsapp } = resolveContactPhone({
        contactPhone: m.contactPhone,
        bodyPhone: split.phone,
        userPhone: user?.phone,
        countryCode: user?.countryCode,
      });
      return {
        ...rest,
        body: split.body,
        subject: isMessageSubject(m.subject) ? m.subject : decoded.subject,
        phone,
        whatsapp,
        user: user
          ? { id: user.id, name: user.name, email: user.email, image: user.image }
          : null,
      };
    });

    return NextResponse.json({
      messages: normalized,
      counts: { all, unread, pending, replied },
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error("Error listing messages:", err);
    return NextResponse.json(
      { error: "Failed to load messages" },
      { status: 500 }
    );
  }
}
