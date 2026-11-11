#!/usr/bin/env node
/**
 * Read-only configured MongoDB identity fingerprint. Runs on authorized VPS.
 * It NEVER connects to MongoDB, prints a URI/user/host/password, or writes data.
 * A fingerprint of a config file alone is NOT proof of the connection PM2 uses.
 */
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { resolve } from "node:path";

try {
  const require = createRequire(resolve(process.cwd(), "package.json"));
  require("@next/env").loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
  const raw = process.env.DATABASE_URL ?? "";
  if (!/^mongodb(?:\+srv)?:\/\//i.test(raw)) throw new Error();
  const rest = raw.slice(raw.indexOf("://") + 3);
  const authority = rest.split("/")[0];
  const at = authority.lastIndexOf("@");
  if (at < 1) throw new Error();
  const hosts = authority.slice(at + 1).split(",").map(x => x.trim().toLowerCase()).sort();
  const db = decodeURIComponent(rest.slice(authority.length + 1).split(/[?#]/)[0]);
  const user = decodeURIComponent(authority.slice(0, at).split(":")[0]);
  if (!hosts.length || !db || !user) throw new Error();
  const identity = createHash("sha256").update(JSON.stringify([hosts, db, user])).digest("hex");
  console.log("CONFIGURED_DB_IDENTITY_SHA256=" + identity);
  console.log("CONFIG_SOURCE=NEXT_ENV_AND_PROCESS");
  console.log("PM2_ACTIVE_CONNECTION_PROVEN=NO");
  console.log("DB_CONNECTIONS=0");
  console.log("DB_WRITES=0");
  console.log("DB_URI_OR_SECRET_PRINTED=NO");
} catch {
  console.error("DB_IDENTITY_NOT_AVAILABLE");
  process.exitCode = 1;
}
