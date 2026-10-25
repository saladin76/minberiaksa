import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { runInNewContext } from "node:vm";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- VM fixtures cover heterogeneous Prisma query/result shapes within this test only.
type FixtureRow = Record<string, any>;
async function routeFixture(path: string) {
  const paidAt = new Date("2026-10-25T11:49:00Z");
  const plans: FixtureRow[] = [
    { id: "daily", frequency: "DAILY", amount: 1, nextBillingDate: new Date("2026-10-26T11:30:00Z"), scheduleRule: {kind:"daily",hour:14,minute:30} },
    { id: "friday", frequency: "FRIDAY", amount: 2, nextBillingDate: new Date("2026-10-30T06:00:00Z"), scheduleRule: {kind:"weekday",weekday:5,hour:9,minute:0} },
    { id: "monthly", frequency: "MONTHLY", amount: 3, nextBillingDate: new Date("2026-10-28T11:30:00Z"), scheduleRule: {kind:"monthDay",day:28,hour:14,minute:30} },
    { id: "paused", frequency: "DAILY", amount: 100, status: "PAUSED", nextBillingDate: paidAt },
    { id: "unpaid", frequency: "DAILY", amount: 200, settled: false, nextBillingDate: paidAt },
  ].map(row => ({ status: "ACTIVE", settled: true, amountUSD: row.amount, currency: "USD", timezone: "Europe/Istanbul", createdAt: paidAt, lastBillingDate: paidAt, donor: null, items: [], categoryItems: [], referral: null, ...row }));
  const donations = [
    {id:"first",subscriptionId:"daily",amount:1,totalAmount:1,amountUSD:1,status:"PAID",paidAt},
    {id:"pending",subscriptionId:"daily",amount:500,amountUSD:500,status:"PAID",paidAt:null},
    {id:"previous-month",subscriptionId:"daily",amount:500,amountUSD:500,status:"PAID",paidAt:new Date("2026-09-25T11:49:00Z")},
    {id:"failed",subscriptionId:"daily",amount:500,amountUSD:500,status:"FAILED",paidAt},
  ].map(row => ({currency:"USD",createdAt:paidAt,donor:null,items:[],categoryItems:[],referral:null,subscription:plans[0],...row}));
  let reads = 0;
  const cadenceMatches = (row: FixtureRow, where: FixtureRow) => !where.frequency || row.frequency === where.frequency;
  const database = {
    subscription: { findMany: async ({where}: FixtureRow) => {
      reads++;
      if (where.frequency?.in) return plans.filter(row => where.frequency.in.includes(row.frequency) && where.id.in.includes(row.id));
      assert.equal(where.status, "ACTIVE");
      assert.equal(where.donations.some.status, "PAID");
      assert.ok(where.donations.some.paidAt);
      return plans.filter(row => row.status === where.status && row.settled && cadenceMatches(row,where) && (!where.NOT || row.frequency === "MONTHLY"));
    } },
    donation: { findMany: async ({where}: FixtureRow) => {
      reads++;
      assert.equal(where.status,"PAID");
      assert.ok(where.subscriptionId.not === null);
      assert.equal(where.paidAt.gte.toISOString(),"2026-09-30T21:00:00.000Z");
      assert.equal(where.paidAt.lte.toISOString(),"2026-10-31T20:59:59.999Z");
      return donations.filter(row => row.status === where.status && row.paidAt && row.paidAt >= where.paidAt.gte && row.paidAt <= where.paidAt.lte && cadenceMatches(plans[0],where.subscription?.is ?? {}));
    } },
  };
  const result = await build({entryPoints:[path],bundle:true,platform:"node",format:"cjs",write:false,packages:"external",logLevel:"silent",plugins:[{
    name:"calendar-read-only-fixture",setup(builder) {
      builder.onResolve({filter:/^(next\/server|next-auth|@\/lib\/prisma|@\/lib\/dashboard\/api-auth|@\/app\/api\/auth\/)/},args => ({path:args.path,namespace:"fixture"}));
      builder.onLoad({filter:/.*/,namespace:"fixture"},args => ({contents:
        args.path === "next/server" ? 'export const NextResponse={json:(body,options)=>({status:options?.status??200,json:async()=>body})};' :
        args.path === "next-auth" ? 'export const getServerSession=async()=>globalThis.session;' :
        args.path === "@/lib/prisma" ? 'export const prisma=globalThis.database;' :
        args.path.includes("api-auth") ? 'export const requireAdminOrDashboardPermission=(session)=>session?null:{status:401};' :
        'export const authOptions={};',loader:"js"}));
    }
  }]});
  const context: FixtureRow = { database,session:{user:{role:"ADMIN"}},module:{exports:{}},exports:{},require,console };
  runInNewContext(result.outputFiles[0].text,context);
  return { context, reads:()=>reads, get: async(query:string) => {
    const nextUrl = new URL(`https://fixture.test/?${query}`);
    if (!nextUrl.searchParams.has("month")) nextUrl.searchParams.set("month","2026-10");
    const response = await context.module.exports.GET({nextUrl});
    return {status:response.status, body:response.json?await response.json():null};
  } };
}

test("calendar API and every day drill-down reconcile across all cadences; unsettled money and inactive plans stay out", async () => {
  const aggregate = await routeFixture("app/api/admin/subscriptions/overview/day-of-month/route.ts");
  const details = await routeFixture("app/api/admin/subscriptions/overview/day-of-month/details/route.ts");
  for (const frequency of ["", "DAILY", "FRIDAY", "MONTHLY"]) {
    const filter = `frequency=${frequency}`;
    const result = await aggregate.get(filter);
    assert.equal(result.status,200);
    assert.equal(result.body.expected.length,31);
    if (!frequency) {
      assert.equal(result.body.totals.expectedUSD,11); // 6 daily + 1 Friday * 2 + 1 monthly * 3
      assert.equal(result.body.totals.collectedUSD,1);
    }
    for (const mode of ["expected","collected"]) {
      for (const cell of result.body[mode]) {
        const drill = await details.get(`${filter}&mode=${mode}&day=${cell.day}`);
        assert.equal(drill.status,200);
        assert.equal(drill.body.totals.amountUSD,cell.amountUSD,`${frequency}/${mode}/${cell.day} amount`);
        assert.equal(drill.body.totals.count,cell.count,`${frequency}/${mode}/${cell.day} count`);
        if (mode === "expected") for (const row of drill.body.rows) {
          assert.equal(new Date(row.scheduledAt).getUTCDate(),cell.day);
          assert.ok(!frequency || row.frequency === frequency);
        }
      }
    }
  }
});
test("calendar route rejects invalid dates before reading the database", async () => {
  const fixture = await routeFixture("app/api/admin/subscriptions/overview/day-of-month/details/route.ts");
  assert.equal((await fixture.get("month=invalid&day=1")).status,400);
  assert.equal((await fixture.get("day=32")).status,400);
  assert.equal(fixture.reads(),0);
});
test("calendar routes require authorization before any database read", async () => {
  for (const path of ["app/api/admin/subscriptions/overview/day-of-month/route.ts","app/api/admin/subscriptions/overview/day-of-month/details/route.ts"]) {
    const fixture = await routeFixture(path);
    fixture.context.session = null;
    assert.equal((await fixture.get("day=26")).status,401);
    assert.equal(fixture.reads(),0);
  }
});
