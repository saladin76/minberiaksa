import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { approvedStagingDatabase, approvedStagingRoles } from "../../lib/staging/isolation";

const host = "cluster-qa.example.invalid:27017";
const name = "minber_staging";
const user = "minber_staging_rw";
const fingerprint = createHash("sha256").update(JSON.stringify([[host], name, user])).digest("hex");
const approved = (): NodeJS.ProcessEnv => ({
  MINBER_RUNTIME_ROLE: "staging",
  STAGING_DISABLE_CRON: "1",
  STAGING_DISABLE_MESSAGES: "1",
  STAGING_PAYMENT_MODE: "mock",
  STAGING_PROVIDER_NETWORK_DISABLED: "1",
  STAGING_EGRESS_POLICY: "deny-external",
  STAGING_APPROVED_SHA: "a".repeat(40),
  STAGING_APPROVED_DB_IDENTITY_SHA256: fingerprint,
  STAGING_APPROVED_DB_NAME: name,
  STAGING_APPROVED_DB_USER: user,
  STAGING_APPROVED_DB_HOSTS: host,
  PRODUCTION_DB_IDENTITY_SHA256: "b".repeat(64),
  DATABASE_URL: `mongodb://${user}:fixture@${host}/${name}?authSource=admin`,
});
const rejected = (env: NodeJS.ProcessEnv) => assert.throws(() => approvedStagingDatabase(env), /STAGING_ISOLATION_DENIED:/);

test("approved synthetic database identity derives from exact host/database/user; no external connection", () => {
  assert.equal(approvedStagingDatabase(approved()).digest, fingerprint);
});

test("staging database guard rejects production roles, hosts, users and shared identity", () => {
  rejected({ ...approved(), MINBER_RUNTIME_ROLE: "production" });
  rejected({ ...approved(), STAGING_DISABLE_CRON: "0" });
  rejected({ ...approved(), STAGING_DISABLE_MESSAGES: "0" });
  rejected({ ...approved(), STAGING_PAYMENT_MODE: "live" });
  rejected({ ...approved(), STAGING_PROVIDER_NETWORK_DISABLED: "0" });
  rejected({ ...approved(), STAGING_EGRESS_POLICY: "allow-all" });
  rejected({ ...approved(), DATABASE_URL: "mongodb://minber_staging_rw:fixture@minberiaksa.org:27017/minber_staging" });
  rejected({ ...approved(), DATABASE_URL: "mongodb://minber_production:fixture@cluster-qa.example.invalid:27017/minber_production" });
  rejected({ ...approved(), DATABASE_URL: "mongodb://minber_staging_rw:fixture@cluster-qa.example.invalid:27017/minber_production" });
  rejected({ ...approved(), STAGING_APPROVED_DB_USER: "minber_prod_user" });
  rejected({ ...approved(), STAGING_APPROVED_DB_HOSTS: "production.example.invalid" });
  rejected({ ...approved(), DATABASE_URL: `mongodb://${user}:fixture@cluster-qa.example.invalid:27018/${name}` });
  rejected({ ...approved(), PRODUCTION_DB_IDENTITY_SHA256: fingerprint });
  rejected({ ...approved(), ALBARAKA_ENC_KEY: "synthetic-prod-key" });
  rejected({ ...approved(), META_WHATSAPP_ACCESS_TOKEN: "synthetic-token" });
});

test("only a scoped readWrite staging user can attest; admin and broad roles denied", () => {
  const users = [{ user, db: "admin" }];
  const stage = { database: name, user };
  assert.equal(approvedStagingRoles(users, [{ role: "readWrite", db: name }], stage), true);
  assert.equal(approvedStagingRoles(users, [{ role: "dbOwner", db: name }], stage), false);
  assert.equal(approvedStagingRoles(users, [{ role: "readWriteAnyDatabase", db: "admin" }], stage), false);
  assert.equal(approvedStagingRoles(users, [{ role: "readWrite", db: name }, { role: "read", db: "production" }], stage), false);
  assert.equal(approvedStagingRoles([{ user: "real_production", db: "admin" }], [{ role: "readWrite", db: name }], stage), false);
  assert.equal(approvedStagingRoles([], [{ role: "readWrite", db: name }], stage), false);
});
