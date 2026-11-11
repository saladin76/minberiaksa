#!/usr/bin/env node
/**
 * Fail-closed attestation for the FULL, potentially mutating Playwright suite.
 * No MongoDB credentials are passed to CI: staging proves its own DB role/identity.
 * This script never prints URLs, usernames, tokens, or database connection strings.
 */
import { pathToFileURL } from "node:url";

export class StagingDenied extends Error {
  constructor(code) { super("STAGING_DENIED:" + code); this.name = "StagingDenied"; this.code = code; }
}
const deny = code => { throw new StagingDenied(code); };
const SHA = /^[a-f0-9]{40}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const PUBLIC_PRODUCTION_IPS = new Set(["176.53.96.235"]);
const PRODUCTION_HOSTS = new Set(["minberiaksa.org", "www.minberiaksa.org", "minberiaksa.vercel.app"]);

export function approvedStagingUrl(raw) {
  let url;
  try { url = new URL(raw); } catch { deny("BASE_URL_INVALID"); }
  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (url.protocol !== "https:" || !hostname || url.username || url.password ||
      url.search || url.hash || (url.pathname !== "/" && url.pathname !== "") ||
      (url.port && url.port !== "443")) deny("BASE_URL_NOT_HTTPS_OR_HAS_EXTRAS");
  if (PRODUCTION_HOSTS.has(hostname) || PUBLIC_PRODUCTION_IPS.has(hostname) ||
      hostname === "localhost" || hostname.endsWith(".localhost") ||
      hostname === "127.0.0.1" || hostname === "::1" || hostname.endsWith(".vercel.app")) deny("PRODUCTION_OR_LOCAL_HOST");
  // Reviewers may approve a dedicated domain, but a bare production hostname,
  // an arbitrary domain, or a production lookalike can never be accepted.
  if (!/(^|[.-])(staging|stage|qa)([.-]|$)/i.test(hostname) ||
      hostname.endsWith(".minberiaksa.org") && !/^(staging|qa|stage)[.-]/.test(hostname)) deny("NOT_EXPLICIT_STAGING_HOST");
  return url.origin + "/";
}

export function requiredRunnerConfiguration(env) {
  const keys = [
    "E2E_BASE_URL", "STAGING_APPROVED_BASE_URL", "STAGING_ATTESTATION_TOKEN",
    "STAGING_APPROVED_INSTANCE_ID", "STAGING_APPROVED_DB_IDENTITY_SHA256",
    "STAGING_APPROVED_SHA", "E2E_STAFF_EMAIL", "E2E_STAFF_PASSWORD",
  ];
  for (const key of keys) if (!env[key] || !String(env[key]).trim()) deny("MISSING_" + key);
  if (env.DATABASE_URL) deny("RUNNER_MUST_NOT_HAVE_DATABASE_URL");
  const base = approvedStagingUrl(env.E2E_BASE_URL);
  if (base !== approvedStagingUrl(env.STAGING_APPROVED_BASE_URL)) deny("BASE_URL_NOT_REVIEWED");
  if (!SHA.test(env.STAGING_APPROVED_SHA) || !SHA.test(env.GITHUB_SHA ?? "") ||
      env.STAGING_APPROVED_SHA !== env.GITHUB_SHA) deny("SHA_NOT_REVIEWED");
  if (!DIGEST.test(env.STAGING_APPROVED_DB_IDENTITY_SHA256)) deny("DB_IDENTITY_NOT_REVIEWED");
  if (!/^minber-(?:stage|staging|qa)-[a-z0-9-]{5,64}$/.test(env.STAGING_APPROVED_INSTANCE_ID)) deny("STAGING_INSTANCE_NOT_REVIEWED");
  if ((env.STAGING_ATTESTATION_TOKEN?.length ?? 0) < 32) deny("ATTESTATION_TOKEN_TOO_SHORT");
  return { base, sha: env.STAGING_APPROVED_SHA, instance: env.STAGING_APPROVED_INSTANCE_ID, digest: env.STAGING_APPROVED_DB_IDENTITY_SHA256 };
}

export function checkAttestation(body, approved) {
  if (!body || typeof body !== "object" || body.purpose !== "staging-acceptance" ||
      body.environment !== "staging" || body.instanceId !== approved.instance ||
      body.buildSha !== approved.sha || body.dbIdentitySha256 !== approved.digest ||
      body.dbRoleScope !== "staging-database-only" ||
      body.safety?.cronDisabled !== true || body.safety?.outboundMessagesDisabled !== true ||
      body.safety?.realPaymentCredentialsAbsent !== true) deny("ATTESTATION_MISMATCH");
  return true;
}

export async function verifyRemoteStaging(env, fetcher = fetch) {
  const approved = requiredRunnerConfiguration(env);
  let response;
  try {
    response = await fetcher(approved.base + "api/internal/staging-attestation", {
      method: "GET",
      redirect: "error",
      headers: { authorization: "Bearer " + env.STAGING_ATTESTATION_TOKEN, accept: "application/json" },
      signal: AbortSignal.timeout(15000),
      cache: "no-store",
    });
  } catch { deny("ATTESTATION_UNREACHABLE"); }
  if (!response || response.status !== 200) deny("ATTESTATION_NOT_AUTHORIZED");
  let body;
  try { body = await response.json(); } catch { deny("ATTESTATION_INVALID_JSON"); }
  checkAttestation(body, approved);
  return { ok: true, sha: approved.sha, instance: approved.instance };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  verifyRemoteStaging(process.env).then(
    ({ sha }) => console.log("STAGING_ACCEPTANCE_PREFLIGHT=PASSED SHA=" + sha),
    error => {
      console.error(error instanceof StagingDenied ? error.message : "STAGING_DENIED:UNKNOWN");
      process.exitCode = 1;
    },
  );
}
