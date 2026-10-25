import { ga4DateRange, type Ga4Selection } from "./ga4-period";
import { fetchGa4Extended, type Ga4ExtendedReport } from "./ga4-extended";
export { isGa4Range, type Ga4Range } from "./ga4-period";

export type Ga4ServiceAccount = {
  type: "service_account";
  client_email: string;
  private_key: string;
};

import type { SearchConsoleReport } from "./search-console";
export type Ga4DashboardReport = {
  organicSearch?: SearchConsoleReport;
  extended?: Ga4ExtendedReport;
  quality?: { timezone: string; thresholded: boolean; sampled: boolean; dataLoss: boolean };
  summary: {
    activeUsers: number;
    totalUsers: number;
    newUsers: number;
    sessions: number;
    screenPageViews: number;
    engagementRate: number;
    bounceRate: number;
    keyEvents: number;
  };
  trend: Array<{ date: string; activeUsers: number; sessions: number; screenPageViews: number }>;
  pages: Array<{ pagePath: string; pageTitle: string; screenPageViews: number; activeUsers: number; sessions: number }>;
  channels: Array<{ channel: string; activeUsers: number; sessions: number; keyEvents: number }>;
  countries: Array<{ country: string; activeUsers: number; sessions: number }>;
  devices: Array<{ device: string; activeUsers: number; sessions: number }>;
  exceptions: Array<{ pagePath: string; eventCount: number }>;
  exceptionCount: number;
};

type Ga4BatchReportRequest = Record<string, unknown>;
type FetchLike = typeof fetch;

const METRICS = {
  activeUsers: { name: "activeUsers" },
  totalUsers: { name: "totalUsers" },
  newUsers: { name: "newUsers" },
  sessions: { name: "sessions" },
  screenPageViews: { name: "screenPageViews" },
  engagementRate: { name: "engagementRate" },
  bounceRate: { name: "bounceRate" },
  keyEvents: { name: "keyEvents" },
  eventCount: { name: "eventCount" },
} as const;

export function parseGa4ServiceAccountJson(value: string): Ga4ServiceAccount | null {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!isRecord(parsed)) return null;
    if (
      parsed.type !== "service_account" ||
      typeof parsed.client_email !== "string" ||
      !parsed.client_email.includes("@") ||
      typeof parsed.private_key !== "string" ||
      !parsed.private_key.includes("PRIVATE KEY")
    ) return null;
    return {
      type: "service_account",
      client_email: parsed.client_email,
      private_key: parsed.private_key,
    };
  } catch {
    return null;
  }
}


function report(
  range: Ga4Selection,
  dimensions: string[],
  metrics: Array<{ name: string }>,
  extra: Record<string, unknown> = {},
): Ga4BatchReportRequest {
  return {
    dateRanges: [ga4DateRange(range)],
    ...(dimensions.length ? { dimensions: dimensions.map((name) => ({ name })) } : {}),
    metrics,
    ...extra,
  };
}

/** Ordered requests; the response mapper below intentionally uses the same stable order. */
export function buildGa4BatchRequests(range: Ga4Selection): Ga4BatchReportRequest[] {
  return [
    report(range, [], [
      METRICS.activeUsers,
      METRICS.totalUsers,
      METRICS.newUsers,
      METRICS.sessions,
      METRICS.screenPageViews,
      METRICS.engagementRate,
      METRICS.bounceRate,
      METRICS.keyEvents,
    ]),
    report(range, ["date"], [METRICS.activeUsers, METRICS.sessions, METRICS.screenPageViews], {
      orderBys: [{ dimension: { dimensionName: "date" } }],
    }),
    report(range, ["pagePath"], [METRICS.screenPageViews, METRICS.activeUsers, METRICS.sessions], {
      orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
      limit: "25",
    }),
    report(range, ["sessionDefaultChannelGroup"], [METRICS.activeUsers, METRICS.sessions, METRICS.keyEvents], {
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit: "25",
    }),
    report(range, ["country"], [METRICS.activeUsers, METRICS.sessions], {
      orderBys: [{ metric: { metricName: "activeUsers" }, desc: true }],
      limit: "25",
    }),
    report(range, ["deviceCategory"], [METRICS.activeUsers, METRICS.sessions], {
      orderBys: [{ metric: { metricName: "activeUsers" }, desc: true }],
      limit: "5",
    }),
    report(range, ["pagePath"], [METRICS.eventCount], {
      dimensionFilter: {
        filter: {
          fieldName: "eventName",
          stringFilter: { matchType: "EXACT", value: "exception" },
        },
      },
      orderBys: [{ metric: { metricName: "eventCount" }, desc: true }],
      limit: "25",
    }),
    report(range, [], [METRICS.eventCount], {
      dimensionFilter: {
        filter: {
          fieldName: "eventName",
          stringFilter: { matchType: "EXACT", value: "exception" },
        },
      },
    }),
  ];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function rowsAt(response: unknown): Array<Record<string, unknown>> {
  if (!isRecord(response) || !Array.isArray(response.rows)) return [];
  return response.rows.filter(isRecord);
}

function dimension(row: Record<string, unknown>, index: number): string {
  const values = row.dimensionValues;
  if (!Array.isArray(values) || !isRecord(values[index])) return "";
  const value = values[index].value;
  return typeof value === "string" ? value : "";
}

function metric(row: Record<string, unknown>, index: number): number {
  const values = row.metricValues;
  if (!Array.isArray(values) || !isRecord(values[index])) return 0;
  const parsed = Number(values[index].value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getRows(response: unknown) {
  return rowsAt(response);
}

export function parseGa4BatchResponse(value: unknown): Ga4DashboardReport {
  const reports = isRecord(value) && Array.isArray(value.reports) ? value.reports : [];
  const response = (index: number) => reports[index];
  const summaryRows = getRows(response(0));
  const summaryRow = summaryRows[0] ?? {};

  const metadata = reports.map((value) => isRecord(value) && isRecord(value.metadata) ? value.metadata : {});
  return {
    quality: { timezone: String(metadata[0]?.timeZone ?? ""), thresholded: metadata.some((row) => row.subjectToThresholding === true), sampled: metadata.some((row) => Array.isArray(row.samplingMetadatas) && row.samplingMetadatas.length > 0), dataLoss: metadata.some((row) => row.dataLossFromOtherRow === true) },
    summary: {
      activeUsers: metric(summaryRow, 0),
      totalUsers: metric(summaryRow, 1),
      newUsers: metric(summaryRow, 2),
      sessions: metric(summaryRow, 3),
      screenPageViews: metric(summaryRow, 4),
      engagementRate: metric(summaryRow, 5),
      bounceRate: metric(summaryRow, 6),
      keyEvents: metric(summaryRow, 7),
    },
    trend: getRows(response(1)).map((row) => ({
      date: dimension(row, 0),
      activeUsers: metric(row, 0),
      sessions: metric(row, 1),
      screenPageViews: metric(row, 2),
    })),
    pages: getRows(response(2)).map((row) => ({
      pagePath: dimension(row, 0),
      pageTitle: dimension(row, 1),
      screenPageViews: metric(row, 0),
      activeUsers: metric(row, 1),
      sessions: metric(row, 2),
    })),
    channels: getRows(response(3)).map((row) => ({
      channel: dimension(row, 0),
      activeUsers: metric(row, 0),
      sessions: metric(row, 1),
      keyEvents: metric(row, 2),
    })),
    countries: getRows(response(4)).map((row) => ({
      country: dimension(row, 0),
      activeUsers: metric(row, 0),
      sessions: metric(row, 1),
    })),
    devices: getRows(response(5)).map((row) => ({
      device: dimension(row, 0),
      activeUsers: metric(row, 0),
      sessions: metric(row, 1),
    })),
    exceptions: getRows(response(6)).map((row) => ({
      pagePath: dimension(row, 0),
      eventCount: metric(row, 0),
    })),
    exceptionCount: metric(getRows(response(7))[0] ?? {}, 0),
  };
}

export class Ga4ApiError extends Error {
  constructor(readonly status: number) {
    super("Google Analytics report request failed");
    this.name = "Ga4ApiError";
  }
}

export async function fetchGa4DashboardReport(options: {
  propertyId: string;
  accessToken: string;
  range: Ga4Selection;
  fetchImpl?: FetchLike;
  includeExtended?: boolean;
}): Promise<Ga4DashboardReport> {
  const { propertyId, accessToken, range } = options;
  const fetchImpl = options.fetchImpl ?? fetch;
  const endpoint = `https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(propertyId)}:batchRunReports`;
  const requests = buildGa4BatchRequests(range);
  // Google limits batchRunReports to five reports per request.
  const batches = [requests.slice(0, 5), requests.slice(5)];
  const responses = await Promise.all(batches.map(async (batch) => {
    const response = await fetchImpl(endpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ requests: batch }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Ga4ApiError(response.status);
    const payload: unknown = await response.json();
    if (!isRecord(payload) || !Array.isArray(payload.reports) || payload.reports.length !== batch.length) throw new Ga4ApiError(502);
    return payload;
  }));
  const reports = responses.flatMap((result) =>
    isRecord(result) && Array.isArray(result.reports) ? result.reports : []
  );
  const parsed = parseGa4BatchResponse({ reports });
  if (options.includeExtended) parsed.extended = await fetchGa4Extended({ propertyId, accessToken, range, fetchImpl });
  return parsed;
}
