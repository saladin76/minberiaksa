import { timingSafeEqual } from "node:crypto";

export function isCronAuthorizationValid(authorization: string | null, env: NodeJS.ProcessEnv = process.env): boolean {
  // Staging must never execute scheduled billing, sync, messaging or renewals,
  // even when a copied CRON_SECRET or an authenticated request exists.
  if (env.MINBER_RUNTIME_ROLE === "staging" || env.STAGING_DISABLE_CRON === "1") return false;
  const secret = env.CRON_SECRET;
  if (!secret || !authorization) return false;
  const expected = Buffer.from(`Bearer ${secret}`, "utf8");
  const received = Buffer.from(authorization, "utf8");
  if (expected.length !== received.length) return false;
  return timingSafeEqual(expected, received);
}

export function cronInfrastructureStatus(env: NodeJS.ProcessEnv = process.env) {
  const disabled = env.MINBER_RUNTIME_ROLE === "staging" || env.STAGING_DISABLE_CRON === "1";
  const secret = disabled ? undefined : env.CRON_SECRET;
  return {
    secretConfigured: !!secret,
    secretValid: !!secret && secret.length >= 32 && !/[\r\n]/.test(secret),
    routeProtected: !!secret,
  };
}
