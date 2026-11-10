import { createHash } from "node:crypto";
import { MongoClient } from "mongodb";

/**
 * Operator-approved staging identity. No credentials, URI, usernames, or hostnames
 * are ever included in response bodies, errors, or logs.
 */
const fail = (reason: string): never => { throw new Error("STAGING_ISOLATION_DENIED:" + reason); };
const digest = (text: string) => createHash("sha256").update(text).digest("hex");
const isSha = (value: string | undefined): value is string => /^[0-9a-f]{40}$/.test(value ?? "");
const isDigest = (value: string | undefined): value is string => /^[0-9a-f]{64}$/.test(value ?? "");

export type StagingDatabaseIdentity = { digest: string; database: string; user: string; hosts: string[] };

/** No bank, email, Meta or marketing provider credentials in generic staging E2E. */
export function assertNoExternalProviderCredentials(env: NodeJS.ProcessEnv): void {
  const forbidden = [
    "ALBARAKA_ENC_KEY", "ALBARAKA_2D_ENC_KEY", "ALBARAKA_RECURRING_ENC_KEY",
    "PAYFOR_USER_PASS", "PAYFOR_MERCHANT_PASS", "PAYPAL_CLIENT_SECRET",
    "STRIPE_SECRET_KEY", "META_ACCESS_TOKEN", "META_WHATSAPP_ACCESS_TOKEN",
    "SENDGRID_API_KEY", "BREVO_API_KEY", "ELASTIC_EMAIL_API_KEY",
    "GA4_API_SECRET",
  ];
  if (forbidden.some(key => Boolean(env[key]))) return fail("EXTERNAL_CREDENTIALS_PRESENT");
  if (env.STAGING_EGRESS_POLICY !== "deny-external") return fail("EGRESS_POLICY_UNREVIEWED");
}


function parseMongoUrl(raw: string): { database: string; user: string; hosts: string[] } {
  if (!/^mongodb(?:\+srv)?:\/\//i.test(raw)) return fail("MONGO_SCHEME");
  const rest = raw.slice(raw.indexOf("://") + 3);
  const authority = rest.split("/")[0];
  const lastAt = authority.lastIndexOf("@");
  if (lastAt <= 0) return fail("MONGO_AUTH_REQUIRED");
  let user = "";
  try { user = decodeURIComponent(authority.slice(0, lastAt).split(":")[0]); } catch { return fail("MONGO_USER_ENCODING"); }
  const hosts = authority.slice(lastAt + 1).split(",").map(h => h.trim().toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "")).sort();
  const rawDb = rest.slice(authority.length + 1).split(/[?#]/)[0];
  let database = "";
  try { database = decodeURIComponent(rawDb); } catch { return fail("MONGO_DB_ENCODING"); }
  if (!user || !database || !hosts.length || hosts.some(h => !h || !/^[a-z0-9.-]+$/.test(h))) return fail("MONGO_IDENTITY_INCOMPLETE");
  return { database, user, hosts };
}

export function approvedStagingDatabase(env: NodeJS.ProcessEnv): StagingDatabaseIdentity {
  if (env.MINBER_RUNTIME_ROLE !== "staging") return fail("RUNTIME_ROLE");
  assertNoExternalProviderCredentials(env);
  if (env.STAGING_DISABLE_CRON !== "1" || env.STAGING_DISABLE_MESSAGES !== "1" ||
    env.STAGING_PAYMENT_MODE !== "mock" || env.STAGING_PROVIDER_NETWORK_DISABLED !== "1") return fail("SIDE_EFFECTS_ENABLED");
  if (!isSha(env.STAGING_APPROVED_SHA) || !isDigest(env.STAGING_APPROVED_DB_IDENTITY_SHA256) ||
      !env.STAGING_APPROVED_DB_NAME || !env.STAGING_APPROVED_DB_USER || !env.STAGING_APPROVED_DB_HOSTS ||
      !env.DATABASE_URL) return fail("MISSING_REVIEWED_IDENTITY");
  const parsed = parseMongoUrl(env.DATABASE_URL);
  const hosts = env.STAGING_APPROVED_DB_HOSTS.split(",").map(s => s.trim().toLowerCase().replace(/\.$/, "")).sort();
  if (hosts.length !== parsed.hosts.length || hosts.some((h,i) => h !== parsed.hosts[i])) return fail("MONGO_HOST_MISMATCH");
  if (parsed.database !== env.STAGING_APPROVED_DB_NAME || parsed.user !== env.STAGING_APPROVED_DB_USER) return fail("MONGO_USER_OR_DB_MISMATCH");
  if (!/(?:stage|staging|_qa|qa_)/i.test(parsed.database) || !/(?:stage|staging|_qa|qa_)/i.test(parsed.user)) return fail("MONGO_IDENTITY_NOT_STAGING");
  if (parsed.hosts.some(h => ["localhost","127.0.0.1","::1","minberiaksa.org","www.minberiaksa.org"].includes(h))) return fail("MONGO_HOST_FORBIDDEN");
  const identityDigest = digest(JSON.stringify([parsed.hosts, parsed.database, parsed.user]));
  if (identityDigest !== env.STAGING_APPROVED_DB_IDENTITY_SHA256 ||
      identityDigest === env.PRODUCTION_DB_IDENTITY_SHA256) return fail("MONGO_FINGERPRINT_MISMATCH");
  return { digest: identityDigest, database: parsed.database, user: parsed.user, hosts: parsed.hosts };
}

/** Read-only database role verification, no writes or schema changes. */
export async function verifyStagingDatabase(env: NodeJS.ProcessEnv): Promise<StagingDatabaseIdentity> {
  const identity = approvedStagingDatabase(env);
  const client = new MongoClient(env.DATABASE_URL!, { serverSelectionTimeoutMS: 5000, connectTimeoutMS: 5000 });
  try {
    await client.connect();
    const status = await client.db(identity.database).command({ connectionStatus: 1, showPrivileges: false });
    const users = status?.authInfo?.authenticatedUsers as Array<{user?:string;db?:string}> | undefined;
    const roles = status?.authInfo?.authenticatedUserRoles as Array<{role?:string;db?:string}> | undefined;
    if (!Array.isArray(users) || !users.some(u => u.user === identity.user) ||
      !Array.isArray(roles) || !roles.some(r => r.db === identity.database && ["readWrite"].includes(r.role ?? "")) ||
      roles.some(r => r.db !== identity.database || !["readWrite"].includes(r.role ?? ""))) return fail("MONGO_ROLE_SCOPE_MISMATCH");
    return identity;
  } catch { return fail("MONGO_ATTESTATION_UNVERIFIED"); }
  finally { await client.close().catch(() => {}); }
}
