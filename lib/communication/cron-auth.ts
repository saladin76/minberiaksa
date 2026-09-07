import { timingSafeEqual } from "node:crypto";

export function isCronAuthorizationValid(authorization: string | null, env: NodeJS.ProcessEnv = process.env): boolean {
  const secret = env.CRON_SECRET;
  if (!secret || !authorization) return false;
  const expected = Buffer.from(`Bearer ${secret}`, "utf8");
  const received = Buffer.from(authorization, "utf8");
  if (expected.length !== received.length) return false;
  return timingSafeEqual(expected, received);
}

export function cronInfrastructureStatus(env: NodeJS.ProcessEnv = process.env) {
  const secret = env.CRON_SECRET;
  return {
    secretConfigured: !!secret,
    secretValid: !!secret && secret.length >= 32 && !/[\r\n]/.test(secret),
    routeProtected: !!secret,
  };
}
