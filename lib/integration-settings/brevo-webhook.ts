import { BREVO_WEBHOOK_PATH, buildWebhookUrl, generateWebhookToken, webhookTokenMatches } from "./provider-webhook";

/** Brevo SMS webhook token helpers. Thin aliases over the shared provider-webhook primitives. */

export function generateBrevoWebhookToken(): string {
  return generateWebhookToken();
}

export function buildBrevoWebhookUrl(token: string, env: NodeJS.ProcessEnv = process.env): string {
  return buildWebhookUrl(BREVO_WEBHOOK_PATH, token, env);
}

export function resolveBrevoWebhookSecret(activeDatabaseValue: string | null | undefined, env: NodeJS.ProcessEnv = process.env): string | null {
  return activeDatabaseValue || env.BREVO_SMS_WEBHOOK_SECRET?.trim() || null;
}

export function brevoWebhookTokenMatches(received: string | null, expected: string): boolean {
  return webhookTokenMatches(received, expected);
}
