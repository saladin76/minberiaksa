"use client";

import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { toast } from "react-hot-toast";
import { Loader2, Save, TestTube2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PlatformConnectionsMovedNotice } from "@/components/dashboard/PlatformConnectionsMovedNotice";

type Platform = "meta" | "ga4" | "google_ads" | "tiktok" | "x";
type SecretKey = "facebookAccessToken" | "gaApiSecret" | "tiktokAccessToken" | "xAccessToken";

type Settings = {
  id: string | null;
  facebookPixelId: string | null;
  facebookTestEventCode: string | null;
  metaDatasetId: string | null;
  metaDonateEventName: string | null;
  gaMeasurementId: string | null;
  gaPropertyId: string | null;
  gaStreamId: string | null;
  gaDebugMode: boolean;
  googleAdsConversionId: string | null;
  googleAdsConversionLabel: string | null;
  googleAdsCustomerId: string | null;
  googleAdsConversionActionId: string | null;
  googleAdsEnhancedConversionsEnabled: boolean;
  tiktokPixelId: string | null;
  tiktokAdvertiserId: string | null;
  tiktokTestEventCode: string | null;
  tiktokEventsApiEnabled: boolean;
  xPixelId: string | null;
  xConversionEventId: string | null;
  xAdAccountId: string | null;
  xConversionsApiEnabled: boolean;
  facebookAccessTokenPresent: boolean;
  gaApiSecretPresent: boolean;
  tiktokAccessTokenPresent: boolean;
  xAccessTokenPresent: boolean;
};

type EventSummary = {
  eventName: string | null;
  eventId: string | null;
  status: string | null;
  channel: string | null;
  updatedAt: string | null;
  error: string | null;
};

type DiagnosticItem = {
  browser: { state: string; label: string; missingFields: string[] };
  server: { state: string; label: string; missingFields: string[] };
  latest: EventSummary | null;
  latestBrowser: EventSummary | null;
  latestServer: EventSummary | null;
};

type Diagnostics = Partial<Record<Platform, DiagnosticItem>>;

const defaults: Settings = {
  id: null,
  facebookPixelId: null,
  facebookTestEventCode: null,
  metaDatasetId: null,
  metaDonateEventName: "Donate",
  gaMeasurementId: null,
  gaPropertyId: null,
  gaStreamId: null,
  gaDebugMode: false,
  googleAdsConversionId: null,
  googleAdsConversionLabel: null,
  googleAdsCustomerId: null,
  googleAdsConversionActionId: null,
  googleAdsEnhancedConversionsEnabled: false,
  tiktokPixelId: null,
  tiktokAdvertiserId: null,
  tiktokTestEventCode: null,
  tiktokEventsApiEnabled: false,
  xPixelId: null,
  xConversionEventId: null,
  xAdAccountId: null,
  xConversionsApiEnabled: false,
  facebookAccessTokenPresent: false,
  gaApiSecretPresent: false,
  tiktokAccessTokenPresent: false,
  xAccessTokenPresent: false,
};

const presence: Record<SecretKey, keyof Settings> = {
  facebookAccessToken: "facebookAccessTokenPresent",
  gaApiSecret: "gaApiSecretPresent",
  tiktokAccessToken: "tiktokAccessTokenPresent",
  xAccessToken: "xAccessTokenPresent",
};

const eventRows = [
  ["PageView", "PageView", "page_view", "page_view", "PageView", "PageView"],
  ["ViewContent", "ViewContent", "view_item", "-", "ViewContent", "ContentView"],
  ["AddToCart", "AddToCart", "add_to_cart", "-", "AddToCart", "AddToCart"],
  ["InitiateCheckout", "InitiateCheckout", "begin_checkout", "-", "InitiateCheckout", "CheckoutInitiated"],
  ["AddPaymentInfo", "AddPaymentInfo", "add_payment_info", "-", "AddPaymentInfo", "PaymentInfoAdded"],
  ["Donate/Paid", "Donate", "purchase", "conversion", "CompletePayment", "Purchase"],
  ["DonateFailed", "DonateFailed", "payment_failed", "-", "-", "-"],
];

function txt(v: string | null | undefined) { return v ?? ""; }
function fieldList(fields: string[]) { return fields.length ? fields.join(", ") : "—"; }
function shortDate(value?: string | null) { return value ? new Date(value).toLocaleString("ar-EG") : "—"; }

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return <div className="space-y-1.5"><Label className="text-xs text-slate-600">{label}</Label><Input className="font-mono text-xs" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} /></div>;
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return <label className="flex items-center gap-2 rounded-lg border p-2 text-xs"><input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />{label}</label>;
}

function Status({ label, status }: { label: string; status: string }) {
  const cls = status === "متصل" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : status === "غير مفعّل" ? "border-slate-200 bg-slate-50 text-slate-600" : "border-amber-200 bg-amber-50 text-amber-700";
  return <Card><CardContent className="p-4"><p className="mb-2 text-xs text-slate-500">{label}</p><span className={`rounded-full border px-2 py-1 text-xs ${cls}`}>{status}</span></CardContent></Card>;
}

function DiagnosticBadge({ state, label }: { state: string; label: string }) {
  const cls = state === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : state === "not_required" ? "border-slate-200 bg-slate-50 text-slate-600" : "border-amber-200 bg-amber-50 text-amber-700";
  return <span className={`rounded-full border px-2 py-0.5 ${cls}`}>{label}</span>;
}

export default function PixelsSettingsPage() {
  const [settings, setSettings] = useState<Settings>(defaults);
  const [diagnostics, setDiagnostics] = useState<Diagnostics>({});
  const [secrets, setSecrets] = useState<Record<SecretKey, string>>({ facebookAccessToken: "", gaApiSecret: "", tiktokAccessToken: "", xAccessToken: "" });
  const [clearSecrets, setClearSecrets] = useState<Record<SecretKey, boolean>>({ facebookAccessToken: false, gaApiSecret: false, tiktokAccessToken: false, xAccessToken: false });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<Platform | null>(null);
  const [refreshingDiagnostics, setRefreshingDiagnostics] = useState(false);
  const [lastTest, setLastTest] = useState<Partial<Record<Platform, string>>>({});

  useEffect(() => { void load(); }, []);

  const status = useMemo(() => ({
    meta: !settings.facebookPixelId && !settings.facebookAccessTokenPresent ? "غير مفعّل" : settings.facebookPixelId && settings.facebookAccessTokenPresent ? "متصل" : "إعدادات ناقصة",
    ga4: !settings.gaMeasurementId && !settings.gaApiSecretPresent ? "غير مفعّل" : settings.gaMeasurementId && settings.gaApiSecretPresent ? "متصل" : "إعدادات ناقصة",
    google_ads: !settings.googleAdsConversionId && !settings.googleAdsConversionLabel ? "غير مفعّل" : settings.googleAdsConversionId && settings.googleAdsConversionLabel ? "متصل" : "إعدادات ناقصة",
    tiktok: !settings.tiktokPixelId && !settings.tiktokAccessTokenPresent ? "غير مفعّل" : settings.tiktokPixelId && settings.tiktokAccessTokenPresent ? "متصل" : "إعدادات ناقصة",
    x: !settings.xPixelId && !settings.xConversionEventId && !settings.xAccessTokenPresent ? "غير مفعّل" : (settings.xPixelId || settings.xConversionEventId) && settings.xAccessTokenPresent && settings.xAdAccountId ? "متصل" : "إعدادات ناقصة",
  }), [settings]);

  async function load() {
    try {
      const res = await axios.get<Partial<Settings>>("/api/admin/tracking");
      setSettings({ ...defaults, ...res.data, metaDonateEventName: res.data.metaDonateEventName ?? "Donate" });
      await loadDiagnostics();
    } catch { toast.error("فشل تحميل إعدادات التتبع"); }
    finally { setLoading(false); }
  }

  async function loadDiagnostics() {
    setRefreshingDiagnostics(true);
    try {
      const res = await axios.get<{ ok: boolean; diagnostics: Diagnostics }>("/api/admin/tracking/diagnostics");
      if (res.data.ok) setDiagnostics(res.data.diagnostics ?? {});
    } catch { toast.error("فشل تحميل تشخيص التتبع"); }
    finally { setRefreshingDiagnostics(false); }
  }

  function set<K extends keyof Settings>(key: K, value: Settings[K]) { setSettings((s) => ({ ...s, [key]: value })); }

  function secretField(key: SecretKey, label: string) {
    const isPresent = Boolean(settings[presence[key]]);
    return <div className="space-y-1.5"><Label className="text-xs text-slate-600">{label}</Label><Input type="password" className="font-mono text-xs" value={secrets[key]} placeholder={isPresent ? "محفوظ — اتركه فارغًا للإبقاء عليه" : "أدخل السر"} onChange={(e) => setSecrets((s) => ({ ...s, [key]: e.target.value }))} />{isPresent ? <label className="flex items-center gap-2 text-[11px] text-rose-600"><input type="checkbox" checked={clearSecrets[key]} onChange={(e) => setClearSecrets((s) => ({ ...s, [key]: e.target.checked }))} />مسح السر المحفوظ</label> : null}</div>;
  }

  async function save() {
    setSaving(true);
    try {
      const payload: Record<string, unknown> = { ...settings };
      delete payload.id;
      (Object.keys(secrets) as SecretKey[]).forEach((k) => { if (secrets[k].trim()) payload[k] = secrets[k].trim(); });
      payload.clearFacebookAccessToken = clearSecrets.facebookAccessToken;
      payload.clearGaApiSecret = clearSecrets.gaApiSecret;
      payload.clearTiktokAccessToken = clearSecrets.tiktokAccessToken;
      payload.clearXAccessToken = clearSecrets.xAccessToken;
      const res = await axios.put<Partial<Settings>>("/api/admin/tracking", payload);
      setSettings({ ...defaults, ...res.data, metaDonateEventName: res.data.metaDonateEventName ?? "Donate" });
      setSecrets({ facebookAccessToken: "", gaApiSecret: "", tiktokAccessToken: "", xAccessToken: "" });
      setClearSecrets({ facebookAccessToken: false, gaApiSecret: false, tiktokAccessToken: false, xAccessToken: false });
      await loadDiagnostics();
      toast.success("تم حفظ إعدادات التتبع بنجاح");
    } catch { toast.error("فشل حفظ الإعدادات"); }
    finally { setSaving(false); }
  }

  async function test(platform: Platform) {
    setTesting(platform);
    try {
      const res = await axios.post<{ message: string; status: string }>("/api/admin/tracking/test", { platform });
      setLastTest((s) => ({ ...s, [platform]: `${res.data.message} — ${new Date().toLocaleString("ar-EG")}` }));
      res.data.status === "success" ? toast.success(res.data.message) : toast(res.data.message);
      await loadDiagnostics();
    } catch (e) {
      const message = axios.isAxiosError(e) && typeof e.response?.data?.message === "string" ? e.response.data.message : "فشل اختبار التتبع";
      setLastTest((s) => ({ ...s, [platform]: message }));
      toast.error(message);
    } finally { setTesting(null); }
  }

  function TestBox({ platform }: { platform: Platform }) {
    const d = diagnostics[platform];
    const latest = d?.latest;
    return <div className="rounded-lg border bg-slate-50 p-3 text-xs text-slate-600">
      <div className="grid gap-2 md:grid-cols-2">
        <span>Browser Pixel status: {d ? <DiagnosticBadge state={d.browser.state} label={d.browser.label} /> : "—"}</span>
        <span>Server API status: {d ? <DiagnosticBadge state={d.server.state} label={d.server.label} /> : "—"}</span>
        <span>Browser missing: {d ? fieldList(d.browser.missingFields) : "—"}</span>
        <span>Server missing: {d ? fieldList(d.server.missingFields) : "—"}</span>
        <span>Last conversion: {latest?.eventName ?? "—"} {latest?.status ? `(${latest.status})` : ""}</span>
        <span>Last sent/update: {shortDate(latest?.updatedAt)}</span>
        <span className="md:col-span-2">Last error: {latest?.error ?? "—"}</span>
      </div>
      <div className="mt-2 border-t pt-2">آخر اختبار: {lastTest[platform] ?? "لم يتم اختباره"}</div>
    </div>;
  }

  if (loading) return <div className="flex min-h-[200px] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;

  return <div className="space-y-6" dir="rtl">
    <PlatformConnectionsMovedNotice href="/dashboard/platform-connections/tracking" label="فتح بكسلات التتبع" text="تم نقل إعدادات البكسلات إلى ربط المنصات والإرسال." />
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-xl sm:text-2xl font-bold tracking-tight">إعدادات البكسلات والتتبع</h1><p className="mt-1 text-muted-foreground">إدارة معرفات البكسل وواجهات التحويل من الخادم، واختبار جاهزية التتبع لكل منصة.</p></div><Button variant="outline" onClick={loadDiagnostics} disabled={refreshingDiagnostics} className="gap-2">{refreshingDiagnostics ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}تحديث التشخيص</Button></div>
    <div className="grid gap-3 md:grid-cols-5"><Status label="Meta" status={status.meta} /><Status label="GA4" status={status.ga4} /><Status label="Google Ads" status={status.google_ads} /><Status label="TikTok" status={status.tiktok} /><Status label="X" status={status.x} /></div>

    <PlatformCard title="فيسبوك / Meta" desc="Pixel + Conversion API" platform="meta" testing={testing} test={test}><Field label="Pixel ID" value={txt(settings.facebookPixelId)} onChange={(v) => set("facebookPixelId", v || null)} /><Field label="Dataset ID اختياري" value={txt(settings.metaDatasetId)} onChange={(v) => set("metaDatasetId", v || null)} />{secretField("facebookAccessToken", "Conversion API Access Token")}<Field label="Test Event Code" value={txt(settings.facebookTestEventCode)} onChange={(v) => set("facebookTestEventCode", v || null)} /><Field label="Donate Event Name" value={txt(settings.metaDonateEventName)} onChange={(v) => set("metaDonateEventName", v || "Donate")} /><TestBox platform="meta" /></PlatformCard>
    <PlatformCard title="Google Analytics 4" desc="Measurement Protocol" platform="ga4" testing={testing} test={test}><Field label="Measurement ID" value={txt(settings.gaMeasurementId)} onChange={(v) => set("gaMeasurementId", v || null)} />{secretField("gaApiSecret", "API Secret")}<Field label="Property ID اختياري" value={txt(settings.gaPropertyId)} onChange={(v) => set("gaPropertyId", v || null)} /><Field label="Stream ID اختياري" value={txt(settings.gaStreamId)} onChange={(v) => set("gaStreamId", v || null)} /><Toggle label="Debug Mode" checked={settings.gaDebugMode} onChange={(v) => set("gaDebugMode", v)} /><TestBox platform="ga4" /></PlatformCard>
    <PlatformCard title="Google Ads — Enhanced Conversions" desc="Conversions settings" platform="google_ads" testing={testing} test={test}><Field label="Conversion ID" value={txt(settings.googleAdsConversionId)} onChange={(v) => set("googleAdsConversionId", v || null)} /><Field label="Conversion Label" value={txt(settings.googleAdsConversionLabel)} onChange={(v) => set("googleAdsConversionLabel", v || null)} /><Field label="Customer ID اختياري" value={txt(settings.googleAdsCustomerId)} onChange={(v) => set("googleAdsCustomerId", v || null)} /><Field label="Conversion Action ID اختياري" value={txt(settings.googleAdsConversionActionId)} onChange={(v) => set("googleAdsConversionActionId", v || null)} /><Toggle label="Enhanced Conversions Enabled" checked={settings.googleAdsEnhancedConversionsEnabled} onChange={(v) => set("googleAdsEnhancedConversionsEnabled", v)} /><TestBox platform="google_ads" /></PlatformCard>
    <PlatformCard title="TikTok Pixel + Events API" desc="Pixel and server events" platform="tiktok" testing={testing} test={test}><Field label="Pixel Code" value={txt(settings.tiktokPixelId)} onChange={(v) => set("tiktokPixelId", v || null)} />{secretField("tiktokAccessToken", "Access Token")}<Field label="Advertiser ID اختياري" value={txt(settings.tiktokAdvertiserId)} onChange={(v) => set("tiktokAdvertiserId", v || null)} /><Field label="Test Event Code اختياري" value={txt(settings.tiktokTestEventCode)} onChange={(v) => set("tiktokTestEventCode", v || null)} /><Toggle label="Events API Enabled" checked={settings.tiktokEventsApiEnabled} onChange={(v) => set("tiktokEventsApiEnabled", v)} /><TestBox platform="tiktok" /></PlatformCard>
    <PlatformCard title="X / Twitter Ads" desc="X Pixel and Conversions API" platform="x" testing={testing} test={test}><Field label="X Pixel ID" value={txt(settings.xPixelId)} onChange={(v) => set("xPixelId", v || null)} /><Field label="X Conversion Event ID" value={txt(settings.xConversionEventId)} onChange={(v) => set("xConversionEventId", v || null)} />{secretField("xAccessToken", "X Access Token")}<Field label="X Ad Account ID" value={txt(settings.xAdAccountId)} onChange={(v) => set("xAdAccountId", v || null)} /><Toggle label="X Conversions API Enabled" checked={settings.xConversionsApiEnabled} onChange={(v) => set("xConversionsApiEnabled", v)} /><TestBox platform="x" /></PlatformCard>

    <Card><CardHeader><CardTitle>خريطة الأحداث</CardTitle><CardDescription>ربط أحداث الموقع بأسماء الأحداث داخل المنصات.</CardDescription></CardHeader><CardContent className="overflow-x-auto"><table className="min-w-full text-right text-xs"><thead className="border-b bg-slate-50"><tr>{["Website Event", "Meta", "GA4", "Google Ads", "TikTok", "X"].map((h) => <th className="p-2" key={h}>{h}</th>)}</tr></thead><tbody>{eventRows.map((r) => <tr key={r[0]} className="border-b last:border-0">{r.map((c, i) => <td key={`${r[0]}-${i}`} className="p-2 font-mono">{c}</td>)}</tr>)}</tbody></table></CardContent></Card>
    <div className="sticky bottom-4 z-10 flex justify-end"><Button onClick={save} disabled={saving} className="gap-2 shadow-lg">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}حفظ الإعدادات</Button></div>
  </div>;
}

function PlatformCard({ title, desc, platform, testing, test, children }: { title: string; desc: string; platform: Platform; testing: Platform | null; test: (p: Platform) => void; children: React.ReactNode }) {
  return <Card><CardHeader><CardTitle>{title}</CardTitle><CardDescription>{desc}</CardDescription></CardHeader><CardContent className="space-y-4"><div className="grid gap-3 md:grid-cols-2">{children}</div><Button onClick={() => test(platform)} disabled={testing === platform} className="gap-2"><TestTube2 className="h-4 w-4" />{testing === platform ? "جاري الاختبار..." : "إرسال حدث اختبار"}</Button></CardContent></Card>;
}
