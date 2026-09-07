import { randomBytes, timingSafeEqual } from "node:crypto";
import { getCanonicalApplicationUrl } from "./canonical-url";

/**
 * Shared helpers for the query-token protected provider webhooks (Elastic Email delivery events,
 * Brevo SMS events). The token is generated server-side, stored as an encrypted integration secret,
 * and embedded in the URL the admin pastes into the provider console. Comparison is constant-time.
 */

export function generateWebhookToken(): string {
  return randomBytes(32).toString("base64url");
}

export function buildWebhookUrl(path: string, token: string, env: NodeJS.ProcessEnv = process.env): string {
  return `${getCanonicalApplicationUrl(env)}${path}?token=${encodeURIComponent(token)}`;
}

export function webhookTokenMatches(received: string | null, expected: string): boolean {
  if (!received) return false;
  const left = Buffer.from(received, "utf8");
  const right = Buffer.from(expected, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export const ELASTIC_EMAIL_WEBHOOK_PATH = "/api/webhooks/elastic-email";
export const BREVO_WEBHOOK_PATH = "/api/webhooks/brevo/transactional";

export function buildElasticEmailWebhookUrl(token: string, env: NodeJS.ProcessEnv = process.env): string {
  return buildWebhookUrl(ELASTIC_EMAIL_WEBHOOK_PATH, token, env);
}

export function resolveElasticEmailWebhookSecret(activeDatabaseValue: string | null | undefined, env: NodeJS.ProcessEnv = process.env): string | null {
  return activeDatabaseValue || env.ELASTIC_EMAIL_WEBHOOK_SECRET?.trim() || null;
}
