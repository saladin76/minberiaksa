import { timingSafeEqual } from "node:crypto";
import { realpathSync } from "node:fs";
import { NextRequest, NextResponse } from "next/server";
import { verifyStagingDatabase } from "@/lib/staging/isolation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Authenticated, read-only attestation for the approved Staging E2E runner.
 * Deliberately unavailable in production and does not disclose DB/credentials.
 * A GitHub Environment reviewer must independently verify the network policy.
 */
export async function GET(request: NextRequest) {
  const headers = { "Cache-Control": "no-store, private" };
  const reject = () => NextResponse.json({ error: "STAGING_ATTESTATION_UNAVAILABLE" }, { status: 403, headers });
  if (process.env.MINBER_RUNTIME_ROLE !== "staging") return reject();
  const secret = process.env.STAGING_ATTESTATION_TOKEN;
  const sent = request.headers.get("authorization") ?? "";
  if (!secret || secret.length < 32) return reject();
  const a = Buffer.from(sent), b = Buffer.from("Bearer " + secret);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return reject();

  const env = process.env;
  const expectedSha = env.STAGING_APPROVED_SHA;
  const buildSha = env.MINBER_BUILD_SHA;
  const instance = env.STAGING_APPROVED_INSTANCE_ID;
  const approvedRoot = env.STAGING_APPROVED_ROOT;
  const approvedPort = env.STAGING_APPROVED_PORT;
  if (!approvedRoot || !/(stage|staging|[-_]qa)(\\/|$)/i.test(approvedRoot) ||
      approvedRoot === "/root/minberiaksa" ||
      !approvedPort || !/^[0-9]{4,5}$/.test(approvedPort) ||
      approvedPort === "3000" || approvedPort !== env.PORT ||
      instance !== env.PM2_APP) return reject();
  try { if (realpathSync(approvedRoot) !== realpathSync(process.cwd())) return reject(); }
  catch { return reject(); }
  if (!expectedSha || !/^[a-f0-9]{40}$/.test(expectedSha) ||
      buildSha !== expectedSha || !instance ||
      !/^minber-(stage|staging|qa)-[a-z0-9-]{5,64}$/.test(instance)) return reject();

  // A QA copy must contain no real provider secrets in its environment.
  // Any sandbox-connected provider acceptance uses a distinct, independently
  // approved workflow and not this fixture-only browser route.
  const forbidden = [
    "ALBARAKA_ENC_KEY", "ALBARAKA_2D_ENC_KEY", "ALBARAKA_RECURRING_ENC_KEY",
    "PAYFOR_USER_PASS", "PAYFOR_MERCHANT_PASS", "PAYPAL_CLIENT_SECRET",
    "STRIPE_SECRET_KEY", "META_ACCESS_TOKEN", "META_WHATSAPP_ACCESS_TOKEN",
    "SENDGRID_API_KEY", "BREVO_API_KEY", "ELASTIC_EMAIL_API_KEY",
    "GA4_API_SECRET",
  ];
  if (forbidden.some(key => Boolean(env[key]))) return reject();
  if (env.STAGING_EGRESS_POLICY !== "deny-external") return reject();
  try {
    const db = await verifyStagingDatabase(env);
    return NextResponse.json({
      purpose: "staging-acceptance",
      environment: "staging",
      instanceId: instance,
      buildSha,
      dbIdentitySha256: db.digest,
      dbRoleScope: "staging-database-only",
      safety: {
        cronDisabled: true,
        outboundMessagesDisabled: true,
        realPaymentCredentialsAbsent: true,
      },
    }, { headers });
  } catch {
    return reject();
  }
}
