// app/api/campaigns/[id]/route.ts
// Campaign detail endpoint with GET and PUT operations
// GET /api/campaigns/[id] - Returns one specific campaign with all details
// PUT /api/campaigns/[id] - Updates campaign data

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getServerSession } from 'next-auth';
import { authOptions } from "../../auth/[...nextauth]/options";
import {
  parseSuggestedDonations,
  validateSuggestedDonationsBody,
} from "@/lib/campaign/suggested-donations";
import {
  parseSuggestedTeamSupport,
  validateSuggestedTeamSupportBody,
} from "@/lib/campaign/suggested-team-support";
import { parseShareLabels } from "@/lib/campaign/share-labels";
import {
  computeCampaignProgressPercent,
  normalizeFundraisingMode,
  normalizeGoalType,
  parseSuggestedShareCounts,
  showCampaignProgress,
  validateSuggestedShareCountsBody,
  FUNDRAISING_SHARES,
} from "@/lib/campaign/campaign-modes";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { queueAuditLog } from "@/lib/audit-log";
import { writeErrorMessage } from "@/lib/dashboard/write-error-message";
import { pickTranslation, translationLocaleWhere } from "@/lib/i18n/translation-fallback";
import {
  generateUniqueSlug,
  generateUniqueLocaleSlug,
  normalizeUserSlug,
  whereByIdOrAnyLocaleSlug,
  whereByIdOrLocaleSlug,
} from "@/lib/slug";
import { EMPTY_TIPTAP_DOC_JSON } from "@/lib/tiptap-empty-doc";
import { normalizeCategoryIdsInput, parseCategoryPriorities } from "@/lib/campaign/categories";
import { NOT_SOFT_DELETED } from "@/lib/campaign/soft-delete-filter";
import { setCampaignDisplayTotal } from "@/lib/campaign/current-amount";
import { PAID_DONATION_FILTER } from "@/lib/dashboard/donation-usd-revenue";

// This file used to build its own `new PrismaClient()` behind a global that is
// only assigned when NODE_ENV !== "production". The comment claimed it was a
// singleton, but in production it was the opposite: a second connection pool,
// separate from `@/lib/prisma`, opened per serverless instance. Under load that
// is how a MongoDB deployment runs out of connections and starts erroring on
// perfectly ordinary saves.

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params; // Campaign ID from URL
    const url = new URL(request.url);
    const locale =
      request.headers.get("x-locale") ||
      url.searchParams.get("locale") ||
      "ar";

    // ✅ STEP 1: Fetch campaign with ONLY current locale translations
    // Accept an ObjectId, the base slug, or a translation slug from ANY locale —
    // deliberately not just `locale`'s own. A locale with no slug of its own falls
    // back to the English one (see pickLocaleSlug), so /tr/campaign/<english-slug>
    // is a canonical URL the page renders without redirecting; matching only the
    // requested locale here 404'd exactly those pages. Locale still decides which
    // translation is returned below, it just doesn't gate which slugs resolve.
    // Soft-deleted campaigns 404 here so public detail pages and the edit form
    // can't surface them — historical donation joins go through other queries.
    const campaign = await prisma.campaign.findFirst({
      where: {
        AND: [
          whereByIdOrAnyLocaleSlug(id),
          NOT_SOFT_DELETED,
        ],
      },
      select: {
        // Basic fields
        id: true,
        slug: true,
        title: true,        // Arabic default
        description: true,  // Arabic default
        images: true,
        videoUrl: true,
        currentAmount: true,
        targetAmount: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        suggestedDonations: true,
        suggestedTeamSupport: true,
        goalType: true,
        fundraisingMode: true,
        sharePriceUSD: true,
        suggestedShareCounts: true,
        shareLabels: true,

        // Requested locale + English fallback (base Arabic is on the model itself)
        translations: {
          where: translationLocaleWhere(locale),
          select: {
            locale: true,
            title: true,
            description: true,
            image: true,
            videoUrl: true,
            slug: true,
          },
          take: 2,
        },

        // Categories (m2m) with translation
        categories: {
          select: {
            id: true,
            slug: true,
            name: true,
            icon: true,
            translations: {
              where: translationLocaleWhere(locale),
              select: { locale: true, name: true, slug: true },
              take: 2,
            },
          },
        },
        categoryIds: true,
        categoryPriorities: true,

        // Updates with translations (limit to 20)
        updates: {
          select: {
            id: true,
            title: true,
            description: true,
            image: true,
            videoUrl: true,
            createdAt: true,
            translations: {
              where: translationLocaleWhere(locale),
              select: {
                locale: true,
                title: true,
                description: true,
              },
              take: 2,
            },
          },
          orderBy: { createdAt: "desc" },
          take: 20, // Limit to prevent huge payloads
        },
      },
    });

    // If campaign not found
    if (!campaign) {
      return NextResponse.json(
        { error: "Campaign not found" },
        { status: 404 }
      );
    }

    // ✅ STEP 2: Get donation stats with PARALLEL queries
    // Instead of loading 100+ donations, we get only what we need
    // Use the resolved Prisma id (since the URL param may have been a slug)
    const realId = campaign.id;

    // Orphaned items (item whose parent Donation was deleted out-of-band — MongoDB
    // doesn't enforce FK integrity) make Prisma throw on the required `donation` relation.
    // Fetch item + donor in two steps so one orphan can't 500 the whole page.
    type DonationStat = { amount: number; donor: string | null } | null;
    const pickStat = async (
      orderBy: Prisma.DonationItemOrderByWithRelationInput
    ): Promise<DonationStat> => {
      const item = await prisma.donationItem.findFirst({
        where: { campaignId: realId },
        orderBy,
        select: { amount: true, donationId: true },
      });
      if (!item) return null;
      const donation = await prisma.donation.findUnique({
        where: { id: item.donationId },
        select: { donor: { select: { name: true } } },
      });
      return { amount: item.amount, donor: donation?.donor?.name ?? null };
    };

    const [donationCount, firstDonation, lastDonation, largestDonation] =
      await Promise.all([
        // See app/api/campaigns/main/route.ts — must join `donation` so unsettled and
        // orphaned items don't inflate the campaign's donation count.
        prisma.donationItem.count({ where: { campaignId: realId, donation: PAID_DONATION_FILTER } }),
        pickStat({ createdAt: "asc" }),
        pickStat({ createdAt: "desc" }),
        pickStat({ amount: "desc" }),
      ]);

    const goalType = normalizeGoalType(campaign.goalType);
    const fundraisingMode = normalizeFundraisingMode(campaign.fundraisingMode);
    const showProgress = showCampaignProgress(goalType);

    const tCampaign = pickTranslation(campaign.translations, locale);
    const localizedCategories = (campaign.categories ?? []).map((cat) => {
      const tCat = pickTranslation(cat.translations, locale);
      return {
        id: cat.id,
        slug:
          (tCat as { slug?: string | null } | undefined)?.slug ||
          cat.slug ||
          null,
        name: tCat?.name || cat.name,
        icon: cat.icon,
      };
    });

    // ✅ STEP 3: Transform data to match frontend expectations
    const transformedCampaign = {
      id: campaign.id,
      // Locale-aware slug: per-locale translation slug → base slug → null. Public callers
      // use this for canonical URLs in the requested locale.
      slug: tCampaign?.slug || campaign.slug || null,
      baseSlug: campaign.slug ?? null,

      // Requested locale → English → Arabic (base) fallback
      title: tCampaign?.title || campaign.title,
      description: tCampaign?.description || campaign.description,

      // When a translation supplies its own cover image, swap images[0] with it; rest of the
      // gallery is shared across locales (single source of truth on the campaign model).
      images:
        tCampaign?.image && Array.isArray(campaign.images)
          ? [tCampaign.image, ...campaign.images.slice(1)]
          : campaign.images,
      videoUrl: tCampaign?.videoUrl || campaign.videoUrl,
      currentAmount: campaign.currentAmount,
      targetAmount: campaign.targetAmount,
      amountRaised: campaign.currentAmount, // Alias for compatibility
      donationCount: donationCount,
      progress: computeCampaignProgressPercent(
        campaign.currentAmount,
        campaign.targetAmount,
        goalType
      ),
      showProgress,
      goalType,
      fundraisingMode,
      sharePriceUSD: campaign.sharePriceUSD ?? null,
      suggestedShareCounts: parseSuggestedShareCounts(campaign.suggestedShareCounts),
      shareLabels: parseShareLabels(campaign.shareLabels),
      isActive: campaign.isActive,

      // All categories this campaign belongs to. `category` is kept as a
      // single-value alias (first entry) for legacy consumers that haven't
      // migrated to the many-to-many list yet.
      categories: localizedCategories,
      category: localizedCategories[0] ?? null,
      categoryIds: campaign.categoryIds ?? [],
      categoryPriorities: parseCategoryPriorities(campaign.categoryPriorities),

      // Updates with translations
      updates: campaign.updates.map((update) => {
        const tU = pickTranslation(update.translations, locale);
        return {
          id: update.id,
          title: tU?.title || update.title,
          description: tU?.description || update.description,
          image: update.image,
          videoUrl: update.videoUrl,
          createdAt: update.createdAt.toISOString(),
        };
      }),
      
      // Donation statistics
      donationStats: {
        first: firstDonation ? {
          amount: firstDonation.amount,
          donor: firstDonation.donor || "Anonymous",
        } : null,

        largest: largestDonation ? {
          amount: largestDonation.amount,
          donor: largestDonation.donor || "Anonymous",
        } : null,

        last: lastDonation ? {
          amount: lastDonation.amount,
          donor: lastDonation.donor || "Anonymous",
        } : null,
      },

      suggestedDonations: parseSuggestedDonations(campaign.suggestedDonations),
      suggestedTeamSupport: parseSuggestedTeamSupport(campaign.suggestedTeamSupport),

      createdAt: campaign.createdAt.toISOString(),
      updatedAt: campaign.updatedAt.toISOString(),
    };

    // Return with cache headers.
    //
    // The 5-minute shared cache is right for the public campaign page, but it
    // was also serving the dashboard edit form — so an admin who saved and
    // reopened a campaign could be handed their own pre-edit copy and conclude
    // the save had silently failed. `?fresh=1` (sent by the dashboard) opts that
    // one caller out; the URL differs, so public traffic still hits the cache.
    const wantsFresh = url.searchParams.get("fresh") === "1";
    return NextResponse.json(transformedCampaign, {
      headers: {
        "Cache-Control": wantsFresh
          ? "no-store"
          : "public, s-maxage=300, stale-while-revalidate=600",
      },
    });
    
  } catch (error) {
    console.error("Error fetching campaign:", error);
    return NextResponse.json(
      { error: "Failed to fetch campaign" },
      { status: 500 }
    );
  }
}

// ✅ PUT - Update campaign
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    const denied = requireAdminOrDashboardPermission(session, "campaigns");
    if (denied) return denied;

    const { id: idOrSlug } = await params;
    const body = await request.json();

    // ✅ STEP 1: Validate campaign exists (param may be id, base slug, or locale slug)
    // `categoryPriorities` is selected here even though only the category branch
    // needs it: it costs nothing to carry on a row we are already reading, and
    // it removes a second findUnique for the same document further down. On this
    // deployment a round trip is ~0.5s, so every avoided one is visible.
    const existingCampaign = await prisma.campaign.findFirst({
      where: whereByIdOrLocaleSlug(idOrSlug, "ar"),
      select: {
        id: true,
        fundraisingMode: true,
        goalType: true,
        title: true,
        categoryPriorities: true,
      },
    });

    if (!existingCampaign) {
      return NextResponse.json(
        { error: "Campaign not found" },
        { status: 404 }
      );
    }
    const id = existingCampaign.id;

    // ✅ STEP 2: Prepare update data
    // Separate main fields from translation fields
    const updateData: any = {};
    const translationUpdates: { locale: string; data: any }[] = [];

    // Main campaign fields (Arabic default)
    if (body.title !== undefined) updateData.title = body.title;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.targetAmount !== undefined) updateData.targetAmount = body.targetAmount;
    // `currentAmount` is applied AFTER the main update via setCampaignDisplayTotal, so the
    // portion not explained by settled donations is recorded as `baselineAmount` (offline /
    // legacy money). Writing it directly here would leave baselineAmount stale, and the next
    // donation edit would silently reset the campaign to the donation-only figure.
    const desiredDisplayTotal =
      typeof body.currentAmount === "number" && Number.isFinite(body.currentAmount)
        ? body.currentAmount
        : null;
    if (body.images !== undefined) updateData.images = body.images;
    if (body.videoUrl !== undefined) updateData.videoUrl = body.videoUrl;
    if (body.isActive !== undefined) updateData.isActive = body.isActive;
    if (body.priority !== undefined) updateData.priority = body.priority;

    // categoryIds / categoryId — accept either. The new client sends an array;
    // older code paths (and the dashboard quick-toggle) still send a single id.
    if (body.categoryIds !== undefined || body.categoryId !== undefined) {
      const nextCategoryIds = normalizeCategoryIdsInput(body);
      if (!nextCategoryIds || nextCategoryIds.length === 0) {
        return NextResponse.json(
          { error: "At least one category is required" },
          { status: 400 }
        );
      }
      // Verify every requested category still exists before mutating the relation.
      const found = await prisma.category.findMany({
        where: { id: { in: nextCategoryIds } },
        select: { id: true },
      });
      if (found.length !== nextCategoryIds.length) {
        const have = new Set(found.map((c) => c.id));
        const missing = nextCategoryIds.filter((id) => !have.has(id));
        return NextResponse.json(
          { error: `Invalid category ID(s): ${missing.join(", ")}` },
          { status: 400 }
        );
      }
      // `set` replaces the relation list to exactly match the requested ids.
      updateData.categories = { set: nextCategoryIds.map((id) => ({ id })) };

      // Prune `categoryPriorities` entries that point at categories the
      // campaign no longer belongs to, so the per-category ordering map stays
      // in sync with the relation. (Read as part of STEP 1 — this used to be a
      // second findUnique for the row we had already fetched, and it shadowed
      // the outer `existingCampaign` binding while doing so.)
      const currentPriorities = parseCategoryPriorities(
        existingCampaign.categoryPriorities
      );
      const keptPriorities: Record<string, number> = {};
      for (const [catId, order] of Object.entries(currentPriorities)) {
        if (nextCategoryIds.includes(catId)) keptPriorities[catId] = order;
      }
      // For a nullable Json field, pass `null` (plain literal) to clear.
      // The Prisma sentinels `Prisma.JsonNull` / `Prisma.DbNull` are only valid
      // when typed as `NullableJsonNullValueInput`; casting through
      // `InputJsonValue` drops that union and the runtime engine rejects the
      // sentinel object as "Expected Json or Null, provided Enum".
      updateData.categoryPriorities =
        Object.keys(keptPriorities).length > 0
          ? (keptPriorities as unknown as Prisma.InputJsonValue)
          : null;
    }

    if (body.goalType !== undefined) {
      updateData.goalType = normalizeGoalType(body.goalType);
    }
    if (body.fundraisingMode !== undefined) {
      updateData.fundraisingMode = normalizeFundraisingMode(body.fundraisingMode);
    }
    if (body.sharePriceUSD !== undefined) {
      const nextMode =
        body.fundraisingMode !== undefined
          ? normalizeFundraisingMode(body.fundraisingMode)
          : normalizeFundraisingMode(existingCampaign.fundraisingMode);
      const sp = Number(body.sharePriceUSD);
      if (nextMode === FUNDRAISING_SHARES) {
        if (!Number.isFinite(sp) || sp <= 0) {
          return NextResponse.json(
            { error: "sharePriceUSD must be a positive number for share-based campaigns" },
            { status: 400 }
          );
        }
      }
      updateData.sharePriceUSD =
        Number.isFinite(sp) && sp > 0 ? sp : null;
    }
    if (body.suggestedShareCounts !== undefined) {
      try {
        if (body.suggestedShareCounts === null) {
          updateData.suggestedShareCounts = null;
        } else {
          const v = validateSuggestedShareCountsBody(body.suggestedShareCounts);
          if (v) updateData.suggestedShareCounts = v as unknown as Prisma.InputJsonValue;
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Invalid suggestedShareCounts";
        return NextResponse.json({ error: msg }, { status: 400 });
      }
    }

    if (body.shareLabels !== undefined) {
      if (body.shareLabels === null) {
        updateData.shareLabels = null;
      } else {
        const v = parseShareLabels(body.shareLabels);
        updateData.shareLabels = v == null ? null : (v as unknown as Prisma.InputJsonValue);
      }
    }

    if (body.suggestedDonations !== undefined) {
      try {
        if (body.suggestedDonations === null) {
          updateData.suggestedDonations = null;
        } else {
          const v = validateSuggestedDonationsBody(body.suggestedDonations);
          if (v) updateData.suggestedDonations = v as unknown as Prisma.InputJsonValue;
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Invalid suggestedDonations";
        return NextResponse.json({ error: msg }, { status: 400 });
      }
    }

    if (body.suggestedTeamSupport !== undefined) {
      try {
        if (body.suggestedTeamSupport === null) {
          updateData.suggestedTeamSupport = null;
        } else {
          const v = validateSuggestedTeamSupportBody(body.suggestedTeamSupport);
          // v can be empty-amounts/empty-overrides; treat as "unset" → null
          if (v && (v.amounts.length || Object.keys(v.byCurrency).length)) {
            updateData.suggestedTeamSupport = v as unknown as Prisma.InputJsonValue;
          } else {
            updateData.suggestedTeamSupport = null;
          }
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Invalid suggestedTeamSupport";
        return NextResponse.json({ error: msg }, { status: 400 });
      }
    }

    // Base (Arabic) slug: admin override or auto from main Arabic title first (no AR translation row),
    // then new/saved English title if Arabic is unavailable.
    if (body.slug !== undefined) {
      const cleaned = normalizeUserSlug(body.slug);
      let base = cleaned ?? "";
      if (!base) {
        const newArTitle =
          typeof body.title === "string" ? body.title.trim() : "";
        if (newArTitle) {
          base = newArTitle;
        } else {
          const newEnTitle =
            typeof body?.translations?.en?.title === "string"
              ? body.translations.en.title.trim()
              : "";
          if (newEnTitle) {
            base = newEnTitle;
          } else {
            const existingEn = await prisma.campaignTranslation.findFirst({
              where: { campaignId: id, locale: "en" },
              select: { title: true },
            });
            base =
              existingCampaign.title?.trim() ||
              existingEn?.title?.trim() ||
              "";
          }
        }
      }
      updateData.slug = await generateUniqueSlug(prisma.campaign as any, base, {
        fallbackPrefix: "campaign",
        currentId: id,
      });
    }

    // ✅ STEP 3: Handle translations if provided
    // Expected format: { translations: { en: { title, description }, fr: {...} } }
    if (body.translations && typeof body.translations === 'object') {
      for (const [locale, data] of Object.entries(body.translations)) {
        if (locale !== 'ar' && data && typeof data === 'object') {
          translationUpdates.push({
            locale,
            data: data as any,
          });
        }
      }
    }

    // Read every existing translation ONCE, before the transaction opens.
    // The loop below used to issue a `findUnique` per locale inside the
    // transaction — 7 extra sequential round trips (~3.5s here) to fetch rows a
    // single query returns, while holding the transaction open the whole time.
    const existingTranslations = translationUpdates.length
      ? await prisma.campaignTranslation.findMany({
          where: {
            campaignId: id,
            locale: { in: translationUpdates.map((t) => t.locale) },
          },
          select: { id: true, locale: true, title: true, description: true, slug: true },
        })
      : [];
    const existingByLocale = new Map(existingTranslations.map((t) => [t.locale, t]));

    // ✅ STEP 4: Execute update in transaction. The generous timeout stays because
    // the per-locale slug generation below genuinely has to run in order; what
    // used to make it necessary — a findUnique per locale — has moved out.
    // The transaction's return value is not bound to a name: STEP 5 re-reads the
    // row with the full select the client needs.
    await prisma.$transaction(
      async (tx) => {
        await tx.campaign.update({
          where: { id },
          data: updateData,
        });

        // Split an admin-entered total into settled donations + offline baseline so a later
        // donation edit can't wipe the offline part. See lib/campaign/current-amount.ts.
        if (desiredDisplayTotal !== null) {
          await setCampaignDisplayTotal(tx, id, desiredDisplayTotal);
        }

        // Process upserts sequentially because the locale-slug uniqueness check inside
        // generateUniqueLocaleSlug must see prior writes within this transaction.
        for (const { locale, data } of translationUpdates) {
          const existingTrans = existingByLocale.get(locale);

          const translationData: Record<string, string | null> = {};
          if (data.title !== undefined) translationData.title = data.title;
          if (data.description !== undefined) {
            const d = data.description;
            translationData.description =
              d == null || d === ""
                ? EMPTY_TIPTAP_DOC_JSON
                : String(d);
          }
          if (data.image !== undefined) {
            translationData.image =
              typeof data.image === "string" && data.image.trim() ? data.image.trim() : null;
          }
          if (data.videoUrl !== undefined) {
            translationData.videoUrl =
              typeof data.videoUrl === "string" && data.videoUrl.trim()
                ? data.videoUrl.trim()
                : null;
          }

          const mergedTitle =
            (typeof translationData.title === "string" && translationData.title.trim()
              ? translationData.title
              : existingTrans?.title
            )?.trim() || existingCampaign.title;

          // Every translation row must have a non-empty slug. Explicit slug → normalize +
          // dedupe; omitted slug → keep existing when set; empty/null slug in body →
          // auto-generate from merged title (never persist null).
          const slugKeyPresent = Object.prototype.hasOwnProperty.call(data, "slug");
          const existingSlug = existingTrans?.slug?.trim() || "";
          const userSlug = slugKeyPresent
            ? normalizeUserSlug((data as Record<string, unknown>).slug)
            : null;

          // The edit form posts every locale's slug back on every save, so the
          // usual case is "unchanged". Re-running the uniqueness search for a
          // slug that already belongs to this very row is a guaranteed-miss
          // query per locale; when it is unchanged there is nothing to check.
          if (slugKeyPresent && userSlug && userSlug === existingSlug) {
            // Leave `translationData.slug` unset — the stored value stands.
          } else if (slugKeyPresent) {
            const baseForSlug = userSlug ?? mergedTitle;
            translationData.slug = await generateUniqueLocaleSlug(
              tx.campaignTranslation as any,
              baseForSlug,
              {
                locale,
                fallbackPrefix: "campaign",
                currentTranslationId: existingTrans?.id,
              }
            );
          } else if (!existingSlug) {
            translationData.slug = await generateUniqueLocaleSlug(
              tx.campaignTranslation as any,
              mergedTitle,
              {
                locale,
                fallbackPrefix: "campaign",
                currentTranslationId: existingTrans?.id,
              }
            );
          }

          if (Object.keys(translationData).length === 0) continue;
          // Skip only when nothing meaningful was supplied.
          if (
            !translationData.title &&
            !translationData.description &&
            !translationData.image &&
            !translationData.videoUrl &&
            !translationData.slug
          )
            continue;
          // upsert.create requires title + description (NOT NULL); fall back to empty strings so
          // an image/video/slug-only update still creates the row.
          const createData = {
            ...translationData,
            title: typeof translationData.title === "string" ? translationData.title : "",
            description:
              typeof translationData.description === "string" ? translationData.description : "",
          };
          await tx.campaignTranslation.upsert({
            where: {
              campaignId_locale: {
                campaignId: id,
                locale,
              },
            },
            update: translationData,
            create: {
              campaign: { connect: { id } },
              locale,
              ...createData,
            },
          });
        }
      },
      { maxWait: 10_000, timeout: 60_000 }
    );

    // ✅ STEP 5: Fetch updated campaign with all translations
    const fullCampaign = await prisma.campaign.findUnique({
      where: { id },
      select: {
        id: true,
        slug: true,
        title: true,
        description: true,
        targetAmount: true,
        currentAmount: true,
        images: true,
        videoUrl: true,
        isActive: true,
        priority: true,
        categoryIds: true,
        categoryPriorities: true,
        createdAt: true,
        updatedAt: true,
        suggestedDonations: true,
        suggestedTeamSupport: true,
        goalType: true,
        fundraisingMode: true,
        sharePriceUSD: true,
        suggestedShareCounts: true,
        shareLabels: true,
        translations: {
          select: {
            locale: true,
            title: true,
            description: true,
          },
        },
        categories: {
          select: { id: true, slug: true, name: true, icon: true },
        },
      },
    });

    const actor = session!.user;
    const t = fullCampaign?.title ?? body.title ?? "مشروع";
    queueAuditLog({
      actorId: actor.id,
      actorName: actor.name,
      actorRole: actor.role ?? "ADMIN",
      action: "CAMPAIGN_UPDATE",
      messageAr: `${actor.name ?? "مسؤول"} عدّل المشروع: ${t}`,
      messageEn: `${actor.name ?? "Admin"} updated campaign ${t}`,
      entityType: "Campaign",
      entityId: id,
    });

    return NextResponse.json(fullCampaign, {
      status: 200,
      // A save must never be answered from, or land in, a shared cache — the GET
      // below advertises s-maxage=300, and without this an admin who saved and
      // reopened the campaign could be handed their pre-edit copy.
      headers: { "Cache-Control": "no-store" },
    });

  } catch (error) {
    console.error("Error updating campaign:", error);

    // Handle specific Prisma errors
    if (error instanceof Error) {
      if (error.message.includes("Foreign key constraint")) {
        return NextResponse.json(
          { error: "Invalid category ID" },
          { status: 400 }
        );
      }
    }

    return NextResponse.json(
      { error: writeErrorMessage(error, "تعذّر حفظ المشروع") },
      { status: 500 }
    );
  }
}

// DELETE - Soft-delete only. We flip isDeleted=true and isActive=false so the
// row disappears from every listing + checkout flow (existing endpoints already
// gate on isActive), but DonationItem / SubscriptionItem rows keep referencing
// the same campaignId — totals, receipts, and historical reports stay valid.
// CartItem rows are removed because they're transient and would otherwise let
// a stale cart re-surface a deleted campaign at payment time.
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    const denied = requireAdminOrDashboardPermission(session, 'campaigns');
    if (denied) return denied;

    const { id: idOrSlug } = await params;

    const camp = await prisma.campaign.findFirst({
      where: whereByIdOrLocaleSlug(idOrSlug, "ar"),
      select: { id: true, title: true, isDeleted: true },
    });
    if (!camp) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }
    if (camp.isDeleted) {
      return NextResponse.json({ message: 'تم مسح المشروع' }, { status: 200 });
    }
    const id = camp.id;

    // Both writes in one batch transaction: previously they were two separate
    // awaited round trips, so a failure on the second left the campaign flagged
    // deleted while stale carts still held it. The array form is a single
    // batched call — atomic and half the latency of the sequential pair.
    await prisma.$transaction([
      prisma.campaign.update({
        where: { id },
        data: { isDeleted: true, isActive: false },
      }),
      prisma.cartItem.deleteMany({ where: { campaignId: id } }),
    ]);

    const actor = session!.user;
    queueAuditLog({
      actorId: actor.id,
      actorName: actor.name,
      actorRole: actor.role ?? "ADMIN",
      action: "CAMPAIGN_DELETE",
      messageAr: `${actor.name ?? "مسؤول"} حذف المشروع (حذف ناعم): ${camp.title}`,
      entityType: "Campaign",
      entityId: id,
    });

    return NextResponse.json(
      { message: 'تم مسح المشروع' },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error('Error soft-deleting campaign:', error);
    return NextResponse.json({ error: writeErrorMessage(error, 'تعذّر حذف المشروع') }, { status: 500 });
  }
}

// ✅ Next.js ISR: Regenerate every 5 minutes
export const revalidate = 300;