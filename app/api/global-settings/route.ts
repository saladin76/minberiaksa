import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { prisma } from "@/lib/prisma";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import {
  parseSuggestedTeamSupport,
  validateSuggestedTeamSupportBody,
} from "@/lib/campaign/suggested-team-support";
import { Prisma } from "@prisma/client";
import { isMainGateway, parseMainGateway } from "@/lib/payment-gateway";
import { albarakaConfig, isAlbarakaConfigured } from "@/lib/albaraka";

/** Fetch the single GlobalSettings record, creating an empty one on first read. */
async function getOrCreateSettings() {
  const existing = await prisma.globalSettings.findFirst({
    orderBy: { createdAt: "asc" },
  });
  if (existing) return existing;
  return prisma.globalSettings.create({ data: {} });
}

/** Public GET — exposes only the donation-flow defaults clients need. */
export async function GET() {
  try {
    const settings = await prisma.globalSettings.findFirst({
      orderBy: { createdAt: "asc" },
      select: { suggestedTeamSupport: true, payforEnabled: true, mainGateway: true },
    });
    const albaraka = albarakaConfig();
    return NextResponse.json({
      suggestedTeamSupport: parseSuggestedTeamSupport(settings?.suggestedTeamSupport),
      // Default true — first read before any record exists must still let
      // PayFor remain available for TRY donors.
      payforEnabled: settings?.payforEnabled ?? true,
      mainGateway: parseMainGateway(settings?.mainGateway),
      // Neither flag is a secret; the checkout dialogs need them to decide whether
      // to render our own card form (Albaraka signs the card fields into the MAC,
      // so with the bank's hosted page turned on we must not collect them).
      albarakaUseOOS: albaraka.useOOS,
      albarakaConfigured: isAlbarakaConfigured(albaraka),
    });
  } catch (e) {
    console.error("Error fetching global settings:", e);
    return NextResponse.json(
      { error: "Failed to fetch global settings" },
      { status: 500 }
    );
  }
}

/**
 * PUT — partial update. Each field has its own permission requirement:
 *   - suggestedTeamSupport → `campaigns` perm
 *   - payforEnabled       → `generalSettings` perm
 *   - mainGateway         → `generalSettings` perm
 * A single request mixing them must satisfy every matching check.
 */
export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    const body = (await request.json().catch(() => null)) as
      | Record<string, unknown>
      | null;
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    if (body.suggestedTeamSupport !== undefined) {
      const denied = requireAdminOrDashboardPermission(session, "campaigns");
      if (denied) return denied;
    }
    if (body.payforEnabled !== undefined || body.mainGateway !== undefined) {
      const denied = requireAdminOrDashboardPermission(session, "generalSettings");
      if (denied) return denied;
    }

    const updateData: Prisma.GlobalSettingsUpdateInput = {};

    if (body.suggestedTeamSupport !== undefined) {
      try {
        if (body.suggestedTeamSupport === null) {
          updateData.suggestedTeamSupport = Prisma.JsonNull;
        } else {
          const v = validateSuggestedTeamSupportBody(body.suggestedTeamSupport);
          if (v) {
            updateData.suggestedTeamSupport = v as unknown as Prisma.InputJsonValue;
          }
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Invalid suggestedTeamSupport";
        return NextResponse.json({ error: msg }, { status: 400 });
      }
    }

    if (body.payforEnabled !== undefined) {
      if (typeof body.payforEnabled !== "boolean") {
        return NextResponse.json(
          { error: "payforEnabled must be a boolean" },
          { status: 400 }
        );
      }
      updateData.payforEnabled = body.payforEnabled;
    }

    if (body.mainGateway !== undefined) {
      if (!isMainGateway(body.mainGateway)) {
        return NextResponse.json(
          { error: 'mainGateway must be "STRIPE" or "ALBARAKA"' },
          { status: 400 }
        );
      }
      // Refuse to nominate a gateway that can't actually take a payment — without
      // the encryption key every MAC we build would be rejected by the bank, and
      // donors would hit a dead checkout.
      if (body.mainGateway === "ALBARAKA" && !isAlbarakaConfigured()) {
        return NextResponse.json(
          {
            error:
              "Albaraka is not configured on the server (ALBARAKA_ENC_KEY is missing).",
          },
          { status: 400 }
        );
      }
      updateData.mainGateway = body.mainGateway;
    }

    const existing = await getOrCreateSettings();
    const saved = await prisma.globalSettings.update({
      where: { id: existing.id },
      data: updateData,
      select: { suggestedTeamSupport: true, payforEnabled: true, mainGateway: true },
    });

    return NextResponse.json({
      suggestedTeamSupport: parseSuggestedTeamSupport(saved.suggestedTeamSupport),
      payforEnabled: saved.payforEnabled,
      mainGateway: parseMainGateway(saved.mainGateway),
    });
  } catch (e) {
    console.error("Error updating global settings:", e);
    return NextResponse.json(
      { error: "Failed to update global settings" },
      { status: 500 }
    );
  }
}
