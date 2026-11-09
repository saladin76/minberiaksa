import { createHmac, randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const PRIVATE_STAGES = new Set([
  "api", "dashboard", "auth", "account", "profile", "success", "donation-failed",
  "donation-pending", "payment-failed", "payment-pending", "payment-processing",
  "payment-cancelled", "receipt", "certificates", "reset-password", "verify-email",
]);
const FIELD_ALIASES = {
  session: ["sessionid", "sessionkey", "sessionidentifier"],
  event: ["event", "eventname", "customevent", "customeventname", "eventtype"],
  timestamp: ["eventtimestamp", "timestamp", "eventtime", "datetime", "date", "sessionstart", "firstseen"],
  route: ["url", "pageurl", "page", "pagepath", "landingpage"],
  device: ["device", "devicetype"],
  browser: ["browser", "browsername"],
};
const SENSITIVE_LABEL = /@|https?:\/\/|(?:\b(?:token|secret|password|email|phone|card|donor|user.?id)\b)|\b\d{7,}\b/i;
const SAFE_EVENT = /^[a-z][a-z0-9 ,_.-]{0,79}$/i;

function parseCsv(input) {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"' && field.length === 0) {
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field);
      field = "";
      if (row.some((cell) => cell.length > 0)) rows.push(row);
      row = [];
    } else {
      field += character;
    }
  }
  if (quoted) throw new Error("CSV contains an unterminated quoted field.");
  if (field.length || row.length) {
    row.push(field);
    if (row.some((cell) => cell.length > 0)) rows.push(row);
  }
  if (rows.length === 0) throw new Error("CSV has no header row.");

  const headers = rows[0].map((header) => header.trim().toLowerCase().replace(/[^a-z0-9]/g, ""));
  if (new Set(headers).size !== headers.length) throw new Error("CSV has duplicate normalized headers.");
  return {
    headers,
    rows: rows.slice(1).map((cells) => Object.fromEntries(
      headers.map((header, index) => [header, cells[index] ?? ""]),
    )),
  };
}

function fieldFor(headers, kind) {
  return headers.find((header) => FIELD_ALIASES[kind].includes(header));
}

function parseBoundary(value, name) {
  if (typeof value !== "string" || !/(?:Z|[+-]\d{2}:?\d{2})$/i.test(value)) {
    throw new Error(`${name} must be an ISO timestamp with an explicit UTC offset.`);
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(`${name} is not a valid timestamp.`);
  return parsed;
}

function timestampValue(value) {
  if (!value || !/(?:Z|[+-]\d{2}:?\d{2})$/i.test(value.trim())) return undefined;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

function routeValue(value) {
  try {
    const parsed = new URL(value, "https://minberiaksa.org");
    const path = decodeURIComponent(parsed.pathname);
    if (!path.startsWith("/") || path.startsWith("//")) return "/";
    const segments = path.split("/");
    const locale = /^\/[a-z]{2}(?:-[a-z]{2})?$/i.test(`/${segments[1] ?? ""}`) ? segments[1] : undefined;
    const stageIndex = locale ? 2 : 1;
    const stage = segments[stageIndex]?.toLowerCase();
    if (stage && PRIVATE_STAGES.has(stage)) return `/${[locale, segments[stageIndex]].filter(Boolean).join("/")}`;
    const safeSegments = segments.map((segment) => {
      if (!segment || segment === "." || segment === "..") return segment;
      if (
        segment.includes("@") ||
        segment.length > 80 ||
        /^[0-9]{7,}$/.test(segment) ||
        looksLikePhone(segment) ||
        /^[a-f0-9]{24,}$/i.test(segment) ||
        /^[a-f0-9]{8}-[a-f0-9-]{27,}$/i.test(segment)
      ) return "[redacted]";
      return segment;
    });
    return safeSegments.join("/").slice(0, 180) || "/";
  } catch {
    return "/";
  }
}

function eventValue(value) {
  const name = value.trim();
  if (!name || !SAFE_EVENT.test(name) || SENSITIVE_LABEL.test(name) || looksLikePhone(name)) return "[redacted event label]";
  return name;
}

function looksLikePhone(value) {
  return (value.match(/[+\d(). -]+/g) ?? []).some((candidate) => candidate.replace(/\D/g, "").length >= 7);
}

function category(value, kind) {
  const text = value.trim().toLowerCase();
  if (!text) return "unknown";
  if (kind === "device") {
    if (/tablet|ipad/.test(text)) return "tablet";
    if (/mobile|phone|android|iphone/.test(text)) return "mobile";
    if (/desktop|computer|laptop/.test(text)) return "desktop";
    return "other";
  }
  if (/samsung internet/.test(text)) return "Samsung Internet";
  if (/edge/.test(text)) return "Edge";
  if (/chrome|chromium/.test(text)) return "Chrome";
  if (/firefox/.test(text)) return "Firefox";
  if (/safari/.test(text)) return "Safari";
  if (/opera/.test(text)) return "Opera";
  return "Other";
}

function dateParts(timestamp, timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(timestamp);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return { day: `${values.year}-${values.month}-${values.day}`, hour: values.hour };
}

function addCount(map, key) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function asCounts(map, keyName) {
  return [...map.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, count]) => ({ [keyName]: key, count }));
}

export function parseClarityExport(csv, {
  fromUtc,
  toUtc,
  timeZone = "Europe/Istanbul",
  reviewSalt = randomBytes(32),
} = {}) {
  const start = parseBoundary(fromUtc, "fromUtc");
  const end = parseBoundary(toUtc, "toUtc");
  if (start >= end) throw new Error("fromUtc must be earlier than toUtc.");
  new Intl.DateTimeFormat("en", { timeZone });

  const { headers, rows } = parseCsv(csv);
  const fields = Object.fromEntries(Object.keys(FIELD_ALIASES).map((kind) => [kind, fieldFor(headers, kind)]));
  const eventExport = Boolean(fields.event);
  const included = [];
  let rowsWithoutTimestamp = 0;
  let rowsOutsideWindow = 0;

  for (const row of rows) {
    const timestamp = fields.timestamp ? timestampValue(row[fields.timestamp]) : undefined;
    if (timestamp === undefined) {
      rowsWithoutTimestamp += 1;
      continue;
    }
    if (timestamp < start || timestamp >= end) {
      rowsOutsideWindow += 1;
      continue;
    }
    included.push({ row, timestamp });
  }

  const sessionKeys = new Map();
  const firstSeenBySession = new Map();
  for (const item of included) {
    const rawSession = fields.session ? item.row[fields.session].trim() : "";
    if (!rawSession) continue;
    const key = createHmac("sha256", reviewSalt).update(rawSession).digest("hex").slice(0, 12);
    sessionKeys.set(rawSession, `S-${key}`);
    firstSeenBySession.set(rawSession, Math.min(firstSeenBySession.get(rawSession) ?? Infinity, item.timestamp));
  }

  const events = new Map();
  const routes = new Map();
  const hours = new Map();
  const devices = new Map();
  const browsers = new Map();
  const timeline = [];
  for (const { row, timestamp } of included) {
    const rawSession = fields.session ? row[fields.session].trim() : "";
    const reviewKey = rawSession ? sessionKeys.get(rawSession) : undefined;
    const event = eventExport ? eventValue(row[fields.event] ?? "") : undefined;
    const route = fields.route ? routeValue(row[fields.route] ?? "") : "/";
    const localTime = dateParts(timestamp, timeZone);
    const device = fields.device ? category(row[fields.device], "device") : "unknown";
    const browser = fields.browser ? category(row[fields.browser], "browser") : "unknown";

    if (event) addCount(events, event);
    addCount(routes, route);
    addCount(hours, `${localTime.day}T${localTime.hour}`);
    addCount(devices, device);
    addCount(browsers, browser);
    if (eventExport) {
      timeline.push({
        ...(reviewKey ? { review_key: reviewKey } : {}),
        day: localTime.day,
        hour_istanbul: localTime.hour,
        ...(reviewKey ? { offset_from_first_in_window_ms: timestamp - firstSeenBySession.get(rawSession) } : {}),
        route,
        event,
        device,
        browser,
      });
    }
  }

  return {
    window: {
      from_utc: new Date(start).toISOString(),
      to_utc_exclusive: new Date(end).toISOString(),
      time_zone: timeZone,
    },
    export_kind: eventExport ? "event_rows" : "recording_index",
    input_rows: rows.length,
    rows_in_window: included.length,
    rows_without_explicit_timestamp: rowsWithoutTimestamp,
    rows_outside_window: rowsOutsideWindow,
    distinct_sessions_in_window: sessionKeys.size,
    inventory_row_basis: "Included timestamped CSV rows; distinct_sessions_in_window is deduplicated by session ID.",
    replay_videos_reviewed: 0,
    event_inventory: asCounts(events, "name"),
    route_inventory: asCounts(routes, "route"),
    hourly_inventory: asCounts(hours, "local_day_hour"),
    device_inventory: asCounts(devices, "device"),
    browser_inventory: asCounts(browsers, "browser"),
    timeline,
    notes: [
      "CSV rows do not prove that a replay video or its Events timeline was reviewed.",
      "Review keys use a random per-run salt; they are stable only within this report and cannot join separate runs.",
      "Timestamps without an explicit UTC offset are excluded from the bounded window.",
      "Routes contain no query string or hostname; private-route identifiers are removed.",
      "Do not commit this generated report; retain only reviewed, privacy-safe findings.",
    ],
  };
}

function argumentValue(args, name) {
  const index = args.indexOf(name);
  return index < 0 ? undefined : args[index + 1];
}

async function main() {
  const args = process.argv.slice(2);
  const inputPath = argumentValue(args, "--input");
  const fromUtc = argumentValue(args, "--from-utc");
  const toUtc = argumentValue(args, "--to-utc");
  const timeZone = argumentValue(args, "--timezone") ?? "Europe/Istanbul";
  if (!inputPath || !fromUtc || !toUtc) {
    throw new Error("Usage: node scripts/clarity-export-inventory.mjs --input <local.csv> --from-utc <ISO> --to-utc <ISO> [--timezone Europe/Istanbul]");
  }
  let csv;
  try {
    csv = await readFile(inputPath, "utf8");
  } catch {
    throw new Error("Unable to read the local input CSV.");
  }
  process.stdout.write(`${JSON.stringify(parseClarityExport(csv, { fromUtc, toUtc, timeZone }), null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
