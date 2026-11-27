"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { SavedCardPicker, type SavedCardOption } from "@/components/minbar/checkout/SavedCardPicker";
import { withLatn } from "@/lib/i18n/latn";
import { ZONE_CITIES } from "@/lib/donations/ramadan-schedule";

type Settings = { amounts: number[]; doubleLast10: boolean; startDate: string; hijriYear: number; startConfirmed: boolean };
type Project = { id: string; title: string; note: string };
type PlanKey = "all" | "fridays" | "last10" | "witr";
type Draft = { step: number; plans: PlanKey[]; picked: number[] | null; amount: number; customAmount: string; doubleLast10: boolean; overrides: Record<number, number>; projectIds: string[]; intent: "self" | "parents" | "other"; onBehalf: string; slot: "fajr" | "maghrib"; remind: boolean };

const RED = "#7A2419", BRICK = "#AB422F", GOLD = "#CD8B2B", CREAM = "#FBF6EE", INK = "#1E2530", MUTED = "#5B6574", LINE = "#E8DFCF";
const DRAFT_KEY = "mia-ramadan-draft";

function dayInfo(startDate: string, n: number, locale: string) {
  const [y, m, d] = startDate.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + n - 1));
  const wd = date.getUTCDay(); // 0 Sunday … 5 Friday
  return { n, date, friday: wd === 5, last10: n >= 21, witr: n >= 21 && n % 2 === 1, col: (wd + 1) % 7, label: new Intl.DateTimeFormat(withLatn(locale), { day: "numeric", month: "long", timeZone: "UTC" }).format(date) };
}
const moonCx = (n: number) => (n <= 15 ? 8 + (n / 15) * 14 : -6 + ((n - 15) / 15) * 14);

export default function RamadanPage({ locale, signedIn, preview, settings, projects }: { locale: string; signedIn: boolean; preview: boolean; settings: Settings; projects: Project[] }) {
  const t = useTranslations("ramadan"), tc = useTranslations("cart");
  const days = useMemo(() => Array.from({ length: 30 }, (_, i) => dayInfo(settings.startDate, i + 1, locale)), [settings.startDate, locale]);
  const [draft, setDraft] = useState<Draft>({ step: 1, plans: ["all"], picked: null, amount: settings.amounts[1] ?? settings.amounts[0] ?? 50, customAmount: "", doubleLast10: settings.doubleLast10, overrides: {}, projectIds: projects[0] ? [projects[0].id] : [], intent: "parents", onBehalf: "", slot: "maghrib", remind: true });
  const [sheet, setSheet] = useState<{ day: number; amount: number } | null>(null);
  const [cards, setCards] = useState<SavedCardOption[]>([]), [cardId, setCardId] = useState(""), [number, setNumber] = useState(""), [expiry, setExpiry] = useState(""), [holder, setHolder] = useState(""), [cvc, setCvc] = useState(""), [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [done, setDone] = useState<"success" | "failed" | null>(null);
  const [tz, setTz] = useState("Europe/Istanbul");
  const [wide, setWide] = useState(false);
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)"), onChange = () => setWide(mq.matches);
    onChange(); mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  useEffect(() => {
    try { setTz(Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Istanbul"); } catch { /* default */ }
    try { const saved = sessionStorage.getItem(DRAFT_KEY); if (saved) { setDraft((d) => ({ ...d, ...JSON.parse(saved) })); sessionStorage.removeItem(DRAFT_KEY); } } catch { /* nothing saved */ }
    const params = new URLSearchParams(window.location.search), result = params.get("scheduled"), planId = params.get("planId"), verificationId = params.get("verificationId");
    if (result === "failed") setDone("failed");
    if (result === "success" && planId && verificationId && /^[a-f0-9]{24}$/i.test(planId) && /^[a-f0-9]{24}$/i.test(verificationId)) {
      fetch(`/api/users/me/subscriptions/${planId}/card?verificationId=${verificationId}`, { cache: "no-store" }).then((r) => r.json()).then((data) => setDone(data?.verified ? "success" : "failed")).catch(() => setDone("failed"));
    }
  }, []);
  useEffect(() => {
    if ((!wide && draft.step !== 4) || !signedIn) return;
    const controller = new AbortController();
    fetch("/api/credit-cards", { signal: controller.signal, cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((data) => { if (!controller.signal.aborted && Array.isArray(data?.cards)) { setCards(data.cards); if (data.cards[0]) setCardId(data.cards[0].id); } }).catch(() => {});
    return () => controller.abort();
  }, [draft.step, signedIn, wide]);

  const planDays = (k: PlanKey) => days.filter((d) => k === "all" || (k === "fridays" && d.friday) || (k === "last10" && d.last10) || (k === "witr" && d.witr)).map((d) => d.n);
  const selected = useMemo(() => new Set(draft.picked ?? draft.plans.flatMap(planDays)), [draft.picked, draft.plans, days]); // eslint-disable-line react-hooks/exhaustive-deps
  const perDay = Math.max(0, Number(draft.customAmount) || draft.amount);
  const base = (n: number) => (draft.doubleLast10 && settings.doubleLast10 && n >= 21 ? perDay * 2 : perDay);
  const amountFor = (n: number) => draft.overrides[n] ?? base(n);
  const sorted = [...selected].sort((a, b) => a - b);
  const total = sorted.reduce((s, n) => s + amountFor(n), 0);
  // "$50" as everywhere on the site (the Arabic currency format gave "US$", which bidi turned into "$US").
  const money = (v: number) => "$" + new Intl.NumberFormat("en-US", { maximumFractionDigits: v % 1 ? 2 : 0 }).format(v);
  const city = (ZONE_CITIES[tz] && locale === "ar") ? ZONE_CITIES[tz].cityAr : tz.split("/").pop()!.replace(/_/g, " ");
  const chosen = projects.filter((p) => draft.projectIds.includes(p.id));

  function togglePlan(k: PlanKey) {
    if (k === "all") return set({ plans: ["all"], picked: null });
    const cur = draft.plans.filter((x) => x !== "all"), next = cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k];
    set({ plans: next.length ? next : ["all"], picked: null });
  }
  function saveDay(keep: boolean) {
    if (!sheet) return;
    const next = new Set(selected), o = { ...draft.overrides };
    if (keep) { next.add(sheet.day); if (sheet.amount !== base(sheet.day)) o[sheet.day] = sheet.amount; else delete o[sheet.day]; } else { next.delete(sheet.day); delete o[sheet.day]; }
    set({ picked: [...next].sort((a, b) => a - b), overrides: o }); setSheet(null);
  }
  function goSignIn() {
    try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ ...draft, step: 4 })); } catch { /* best effort */ }
    window.location.href = `/auth/signin?callbackUrl=${encodeURIComponent(`/${locale}/ramadan`)}`;
  }
  async function confirm() {
    if (busy || !consent || !sorted.length) return;
    setBusy(true); setError("");
    try {
      let id = cardId;
      if (!id) {
        const saved = await fetch("/api/credit-cards", { method: "POST", signal: AbortSignal.timeout(15000), headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cardNumber: number.replace(/\D/g, ""), expiryDate: expiry, cardholderName: holder, cvc }) });
        const data = await saved.json(); if (!saved.ok || !data.card?.id) throw new Error("CARD"); id = data.card.id;
      }
      const response = await fetch("/api/ramadan/plans", { method: "POST", signal: AbortSignal.timeout(25000), headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days: sorted.map((n) => ({ day: n, amount: amountFor(n) })), slot: draft.slot, timezone: tz, projectIds: draft.projectIds, intent: draft.intent, onBehalf: draft.onBehalf, remind: draft.remind, cardId: id, cvc, consent: true, locale }) });
      const data = await response.json();
      if (!response.ok || typeof data.donationId !== "string") throw new Error(data?.error || "PLAN");
      // The plan's 1 USD first instalment, through the ordinary Albaraka checkout (3D + Sale).
      const pay = await fetch("/api/albaraka/3d/initiate", { method: "POST", signal: AbortSignal.timeout(25000), headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ donationId: data.donationId, savedCardId: id, card: { cvv: cvc }, locale, securityMode: "3D" }) });
      const bank = await pay.json();
      if (!pay.ok || typeof bank.actionUrl !== "string" || !bank.fields || bank.method === "GET" || new URL(bank.actionUrl, window.location.origin).protocol !== "https:") throw new Error(bank?.code || bank?.error || "PLAN");
      const form = document.createElement("form"); form.method = "POST"; form.action = bank.actionUrl; form.style.display = "none"; form.setAttribute("data-clarity-mask", "True");
      for (const [name, value] of Object.entries(bank.fields)) { const input = document.createElement("input"); input.type = "hidden"; input.name = name; input.value = String(value); form.appendChild(input); }
      setCvc(""); document.body.appendChild(form); form.submit();
    } catch (e) { setError(e instanceof Error && e.message === "PROJECT_NOT_OFFERED" ? t("errorProjects") : t("errorGeneric")); setCvc(""); setBusy(false); }
  }

  const chip = (on: boolean) => ({ minHeight: 48, borderRadius: 14, font: "inherit", fontSize: 17, fontWeight: 800, cursor: "pointer", background: on ? RED : "#fff", color: on ? "#FFF6EA" : INK, border: `1.5px solid ${on ? RED : LINE}` } as const);
  const card = { background: "#fff", borderRadius: 18, padding: 16, boxShadow: "0 14px 30px -24px rgba(90,26,16,.45)" } as const;
  const STEPS = [t("stepDays"), t("stepCalendar"), t("stepProjects"), t("stepReview")];

  const cardFields = <>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 900 }}>{t("cardTitle")}</h2>
            <p style={{ margin: 0, fontSize: 13, color: MUTED, lineHeight: 1.8 }}>{t("cardHint")}</p>
            <SavedCardPicker cards={cards} value={cardId} disabled={busy} onChange={(v) => { setCardId(v); setCvc(""); }} />
            {!cardId ? <>
              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>{tc("cardNumber")}<input dir="ltr" inputMode="numeric" autoComplete="cc-number" value={number} onChange={(e) => setNumber(e.target.value.replace(/\D/g, "").slice(0, 19))} disabled={busy} style={{ minHeight: 48, padding: "0 12px", borderRadius: 12, border: `1.5px solid ${LINE}`, font: "inherit", fontSize: 16 }} /></label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>{tc("cardExpiry")}<input dir="ltr" placeholder="MM/YY" autoComplete="cc-exp" value={expiry} onChange={(e) => { const v = e.target.value.replace(/\D/g, "").slice(0, 4); setExpiry(v.length > 2 ? `${v.slice(0, 2)}/${v.slice(2)}` : v); }} disabled={busy} style={{ minHeight: 48, padding: "0 12px", borderRadius: 12, border: `1.5px solid ${LINE}`, font: "inherit", fontSize: 16 }} /></label>
                <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>{tc("cardHolder")}<input autoComplete="cc-name" value={holder} maxLength={120} onChange={(e) => setHolder(e.target.value)} disabled={busy} style={{ minHeight: 48, padding: "0 12px", borderRadius: 12, border: `1.5px solid ${LINE}`, font: "inherit", fontSize: 16 }} /></label>
              </div>
            </> : null}
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>CVC<input dir="ltr" type="password" inputMode="numeric" autoComplete="cc-csc" value={cvc} onChange={(e) => setCvc(e.target.value.replace(/\D/g, "").slice(0, 4))} disabled={busy} style={{ minHeight: 48, padding: "0 12px", borderRadius: 12, border: `1.5px solid ${LINE}`, font: "inherit", fontSize: 16, maxWidth: 140 }} /></label>
            <label style={{ display: "flex", alignItems: "flex-start", gap: 10, fontSize: 13, lineHeight: 1.8, cursor: "pointer" }}><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} style={{ width: 20, height: 20, marginTop: 3, accentColor: RED }} />{t("consent", { total: money(total), count: sorted.length })}</label>
            <p style={{ margin: 0, padding: "10px 12px", borderRadius: 12, background: "#FBEEDC", color: "#6E4410", fontSize: 13, lineHeight: 1.8 }}>{t("dollarNotice")}</p>
            {error ? <p role="alert" style={{ margin: 0, color: "#B42318", fontSize: 13.5 }}>{error}</p> : null}
  </>;
  const canConfirm = !busy && consent && sorted.length > 0 && cvc.length >= 3 && (Boolean(cardId) || (number.length >= 13 && expiry.length === 5 && Boolean(holder.trim())));

  const sheetView = sheet ? <div style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(42,12,8,.5)", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
        <button type="button" aria-label={t("close")} onClick={() => setSheet(null)} style={{ flex: 1, border: 0, background: "transparent", cursor: "pointer" }} />
        <div role="dialog" aria-modal="true" aria-labelledby="ramadan-day" style={{ background: "#fff", borderRadius: "24px 24px 0 0", padding: "10px 18px calc(24px + env(safe-area-inset-bottom, 0px))", maxWidth: 640, width: "100%", margin: "0 auto", display: "flex", flexDirection: "column", gap: 14 }}>
          <span aria-hidden="true" style={{ alignSelf: "center", width: 40, height: 4, borderRadius: 999, background: "#D9CFBE" }} />
          <div><b id="ramadan-day" style={{ fontSize: 22, fontWeight: 900 }}>{t("dayTitle", { day: sheet.day })}</b><div style={{ fontSize: 13, color: MUTED }}>{days[sheet.day - 1].label}{days[sheet.day - 1].friday ? ` · ${t("friday")}` : ""}{days[sheet.day - 1].witr ? ` · ${t("witrNight")}` : ""}</div></div>
          {sheet.day === 27 ? <p style={{ margin: 0, padding: "10px 12px", borderRadius: 12, background: "#FBEEDC", fontSize: 13, lineHeight: 1.8 }}>{t("hint27")}</p> : null}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 8 }}>
            {[...new Set([base(sheet.day), base(sheet.day) * 2, base(sheet.day) * 3, base(sheet.day) * 5])].map((v) => <button key={v} type="button" aria-pressed={sheet.amount === v} onClick={() => setSheet({ ...sheet, amount: v })} style={{ ...chip(sheet.amount === v), fontSize: 16 }}>{money(v)}</button>)}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <button type="button" onClick={() => saveDay(false)} style={{ minHeight: 52, borderRadius: 14, border: `1.5px solid ${LINE}`, background: "#fff", color: BRICK, font: "inherit", fontWeight: 800, cursor: "pointer" }}>{selected.has(sheet.day) ? t("removeDay") : t("cancel")}</button>
            <button type="button" onClick={() => saveDay(true)} style={{ minHeight: 52, borderRadius: 14, border: 0, background: RED, color: "#fff", font: "inherit", fontWeight: 800, cursor: "pointer" }}>{t("saveDay")}</button>
          </div>
        </div>
      </div> : null;

  if (done) return (
    <main dir={locale === "ar" || locale === "ur" ? "rtl" : "ltr"} style={{ background: CREAM, minHeight: "70vh", padding: "48px 16px" }}>
      <div style={{ ...card, maxWidth: 520, margin: "0 auto", textAlign: "center", padding: 28, display: "flex", flexDirection: "column", gap: 12 }}>
        <svg width="56" height="56" viewBox="0 0 34 34" style={{ margin: "0 auto" }} aria-hidden="true"><path d="M21.5 9.5a8.5 8.5 0 1 0 3 12.6A7 7 0 1 1 21.5 9.5z" fill={done === "success" ? GOLD : "#B9B2A6"} /></svg>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 900, color: done === "success" ? RED : INK }}>{done === "success" ? t("successTitle") : t("failedTitle")}</h1>
        <p style={{ margin: 0, color: MUTED, lineHeight: 1.9 }}>{done === "success" ? t("successBody") : t("failedBody")}</p>
        <a href={done === "success" ? `/${locale}/profile?tab=subscriptions` : `/${locale}/ramadan`} style={{ marginTop: 8, display: "inline-flex", justifyContent: "center", alignItems: "center", minHeight: 52, borderRadius: 14, background: RED, color: "#fff", fontWeight: 800, textDecoration: "none" }}>{done === "success" ? t("successCta") : t("failedCta")}</a>
      </div>
    </main>
  );

  // Wide screens: the approved desktop design — every section on one page, a summary that stays in view.
  if (wide) {
    const section = { background: "#fff", borderRadius: 22, padding: 26, boxShadow: "0 18px 40px -26px rgba(90,26,16,.4)" } as const;
    const num = (n: string) => <span style={{ fontSize: 14, color: GOLD, fontWeight: 800 }}>{n}</span>;
    const h2 = { margin: 0, fontSize: 21, fontWeight: 900, display: "flex", alignItems: "center", gap: 12 } as const;
    const max = Math.max(1, ...sorted.map(amountFor));
    return (
      <main dir={locale === "ar" || locale === "ur" ? "rtl" : "ltr"} style={{ background: CREAM, color: INK, minHeight: "100vh" }}>
        <section style={{ background: `radial-gradient(120% 140% at 12% 0%, ${BRICK} 0%, ${RED} 60%)`, color: "#FFF6EA" }}>
          <div style={{ maxWidth: 1200, margin: "0 auto", padding: "64px 28px 72px", display: "flex", gap: 40, alignItems: "center" }}>
            <div style={{ flex: "1 1 0", minWidth: 0, display: "flex", flexDirection: "column", gap: 18 }}>
              {preview ? <span style={{ alignSelf: "flex-start", fontSize: 12.5, fontWeight: 800, padding: "5px 12px", borderRadius: 999, background: "#FFF6EA", color: RED }}>{t("previewBadge")}</span> : null}
              <span style={{ alignSelf: "flex-start", padding: "7px 14px", borderRadius: 999, border: "1px solid rgba(246,208,139,.5)", color: "#F6D08B", fontSize: 13.5, fontWeight: 700 }}>{t("calendarTitle", { year: settings.hijriYear })} · {days[0].label}</span>
              <h1 style={{ margin: 0, fontSize: 52, lineHeight: 1.2, fontWeight: 900 }}>{t("title")}</h1>
              <p style={{ margin: 0, maxWidth: "58ch", fontSize: 18, lineHeight: 1.95, color: "#F6E3D4" }}>{t("introBody")}</p>
            </div>
            <div style={{ flex: "0 0 440px", display: "flex", flexDirection: "column", gap: 14 }}>
              <figure style={{ margin: 0, padding: "18px 20px", borderRadius: 18, background: "rgba(255,255,255,.06)", border: "1px solid rgba(205,139,43,.3)", textAlign: "center" }}>
                <blockquote style={{ margin: 0, fontFamily: "Amiri, serif", fontSize: 21, lineHeight: 2, color: "#F6D08B", textWrap: "balance" }}>﴿شَهْرُ رَمَضَانَ الَّذِي أُنزِلَ فِيهِ الْقُرْآنُ<br />هُدًى لِّلنَّاسِ وَبَيِّنَاتٍ مِّنَ الْهُدَىٰ وَالْفُرْقَانِ﴾</blockquote>
                <figcaption style={{ fontSize: 12.5, color: "#EBCFB9" }}>{t("verseRef")}</figcaption>
              </figure>
              <figure style={{ margin: 0, padding: "16px 20px", borderRadius: 18, background: "rgba(255,255,255,.06)", border: "1px solid rgba(205,139,43,.3)", textAlign: "center" }}>
                <blockquote style={{ margin: 0, fontFamily: "Amiri, serif", fontSize: 18, lineHeight: 1.9, color: "#FFF6EA" }}>«كان رسولُ الله ﷺ أجودَ الناس<br />وكان أجودَ ما يكون في رمضان»</blockquote>
                <figcaption style={{ fontSize: 12.5, color: "#EBCFB9" }}>{t("hadithRef")}</figcaption>
              </figure>
            </div>
          </div>
        </section>

        <div style={{ maxWidth: 1200, margin: "-36px auto 0", position: "relative", padding: "0 28px 72px", display: "flex", gap: 28, alignItems: "flex-start" }}>
          <div style={{ flex: "1 1 0", minWidth: 0, display: "flex", flexDirection: "column", gap: 22 }}>
            <section style={section}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 16 }}><h2 style={h2}>{num("01")}{t("daysTitle")}</h2><span style={{ fontSize: 13, color: MUTED }}>{t("daysHint")}</span></div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12 }}>
                {(["all", "fridays", "last10", "witr"] as PlanKey[]).map((k) => {
                  const on = !draft.picked && draft.plans.includes(k), list = planDays(k);
                  return <button key={k} type="button" aria-pressed={on} onClick={() => togglePlan(k)} style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 8, minHeight: 132, padding: 16, borderRadius: 16, font: "inherit", textAlign: "start", cursor: "pointer", background: on ? RED : "#FCFAF5", color: on ? "#FFF6EA" : INK, border: `1.5px solid ${on ? RED : LINE}` }}>
                    <span style={{ display: "flex", width: "100%", justifyContent: "space-between", alignItems: "center", gap: 8 }}><b style={{ fontSize: 16 }}>{t(`plan_${k}`)}</b><span style={{ fontSize: 12, fontWeight: 800, padding: "3px 9px", borderRadius: 999, background: on ? "#F6D08B" : "#F1E8D6", color: on ? "#2A1E05" : "#7A4A0E" }}>{t("daysCount", { count: list.length })}</span></span>
                    <span style={{ fontSize: 13, lineHeight: 1.7, opacity: .85 }}>{t(`plan_${k}_desc`)}</span>
                    <span style={{ marginTop: "auto", fontSize: 13.5, fontWeight: 800, color: on ? "#F6D08B" : "#8C5512" }}>{money(list.reduce((s2, n) => s2 + amountFor(n), 0))}</span>
                  </button>;
                })}
                <button type="button" aria-pressed={Boolean(draft.picked)} onClick={() => set({ picked: [...selected] })} style={{ minHeight: 132, padding: 16, borderRadius: 16, font: "inherit", fontWeight: 800, cursor: "pointer", background: draft.picked ? RED : "transparent", color: draft.picked ? "#FFF6EA" : "#7A4A0E", border: `1.5px dashed ${GOLD}` }}>{t("plan_custom")}</button>
              </div>
            </section>

            <section style={section}>
              <h2 style={{ ...h2, marginBottom: 16 }}>{num("02")}{t("amountTitle")}</h2>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                {settings.amounts.map((v) => <button key={v} type="button" aria-pressed={!draft.customAmount && draft.amount === v} onClick={() => set({ amount: v, customAmount: "" })} style={{ ...chip(!draft.customAmount && draft.amount === v), minWidth: 96, minHeight: 56, padding: "0 18px" }}>{money(v)}</button>)}
                <label style={{ display: "flex", alignItems: "center", gap: 10, minHeight: 56, padding: "0 16px", borderRadius: 14, border: `1.5px solid ${LINE}`, background: "#FCFAF5", color: MUTED }}>{t("otherAmount")}<input type="number" min={1} inputMode="numeric" value={draft.customAmount} onChange={(e) => set({ customAmount: e.target.value.replace(/\D/g, "") })} aria-label={t("otherAmount")} style={{ width: 90, border: 0, background: "transparent", font: "inherit", fontSize: 18, fontWeight: 800, color: INK, outline: "none" }} /></label>
              </div>
              {settings.doubleLast10 ? <label style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 14, padding: "14px 16px", borderRadius: 16, background: "#FBEEDC", border: "1px solid #E9CFA3", cursor: "pointer" }}>
                <input type="checkbox" checked={draft.doubleLast10} onChange={(e) => set({ doubleLast10: e.target.checked })} style={{ width: 22, height: 22, accentColor: GOLD }} />
                <span style={{ display: "flex", flexDirection: "column", gap: 2 }}><b style={{ fontSize: 15, color: "#7A4A0E" }}>{t("doubleTitle")}</b><span style={{ fontSize: 13, color: "#6E5636" }}>{t("doubleHint")}</span></span>
              </label> : null}
            </section>

            <section style={section}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 16 }}><h2 style={h2}>{num("03")}{t("calendarTitle", { year: settings.hijriYear })}</h2><span style={{ fontSize: 13, color: MUTED }}>{settings.startConfirmed ? t("datesConfirmed") : t("datesEstimated")}</span></div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 8 }}>
                {[0, 1, 2, 3, 4, 5, 6].map((i) => <span key={i} style={{ textAlign: "center", fontSize: 13, fontWeight: 800, padding: "4px 0", color: i === 6 ? "#8C5512" : MUTED }}>{t(`wd${i}`)}</span>)}
                {Array.from({ length: days[0].col }, (_, i) => <span key={`b${i}`} aria-hidden="true" />)}
                {days.map((d) => {
                  const on = selected.has(d.n), bg = on ? RED : d.last10 ? "#FBEEDC" : "#FCFAF5";
                  return <button key={d.n} type="button" onClick={() => setSheet({ day: d.n, amount: on ? amountFor(d.n) : base(d.n) })} aria-label={t("dayAria", { day: d.n, date: d.label, amount: on ? money(amountFor(d.n)) : t("notScheduled") })}
                    style={{ display: "flex", flexDirection: "column", alignItems: "stretch", gap: 6, minHeight: 100, padding: "10px 12px", borderRadius: 14, font: "inherit", textAlign: "start", cursor: "pointer", background: bg, color: on ? "#FFF6EA" : INK, border: d.friday ? `2px solid ${GOLD}` : on ? `2px solid ${RED}` : `1px solid ${d.last10 ? "#E9CFA3" : "#ECE3D3"}` }}>
                    <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}><b style={{ fontSize: 22, lineHeight: 1 }}>{d.n}</b><svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="7" fill={on ? "#F6D08B" : GOLD} /><circle cx={moonCx(d.n)} cy="8" r="7" fill={bg} /></svg></span>
                    <span style={{ fontSize: 11.5, opacity: .8 }}>{d.label}{on && draft.overrides[d.n] != null ? " ●" : ""}</span>
                    <span style={{ marginTop: "auto", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 4 }}><span style={{ fontSize: 13, fontWeight: 800, color: on ? "#F6D08B" : "#A3A9B3" }}>{on ? money(amountFor(d.n)) : "—"}</span>{d.friday || d.witr ? <span style={{ fontSize: 10.5, fontWeight: 800, padding: "2px 7px", borderRadius: 999, background: on ? "rgba(246,208,139,.18)" : "#F1E8D6", color: on ? "#F6D08B" : "#7A4A0E" }}>{d.friday ? t("friday") : t("witrNight")}</span> : null}</span>
                  </button>;
                })}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, marginTop: 16, paddingTop: 14, borderTop: "1px solid #EFE7D8" }}>
                <span style={{ fontSize: 13, color: MUTED, flex: "1 1 260px" }}>{t("calendarHint")}</span>
                <button type="button" onClick={() => set({ picked: [], overrides: {} })} style={{ minHeight: 40, padding: "0 14px", borderRadius: 999, border: "1.5px solid #E8C9C2", background: "transparent", color: RED, font: "inherit", fontSize: 13.5, fontWeight: 700, cursor: "pointer" }}>{t("clearAll")}</button>
              </div>
            </section>

            <section style={section}>
              <h2 style={{ ...h2, marginBottom: 16 }}>{num("04")}{t("projectsTitle")}</h2>
              <div role="group" aria-label={t("projectsTitle")} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
                {projects.map((p) => {
                  const on = draft.projectIds.includes(p.id);
                  return <button key={p.id} type="button" role="checkbox" aria-checked={on} onClick={() => { const next = on ? draft.projectIds.filter((x) => x !== p.id) : [...draft.projectIds, p.id]; set({ projectIds: next.length ? next : [p.id] }); }}
                    style={{ display: "flex", alignItems: "flex-start", gap: 12, minHeight: 84, padding: "14px 16px", borderRadius: 14, font: "inherit", textAlign: "start", cursor: "pointer", background: on ? "#FBEEDC" : "#FCFAF5", color: INK, border: `2px solid ${on ? GOLD : "#ECE3D3"}` }}>
                    <span aria-hidden="true" style={{ flex: "0 0 auto", marginTop: 2, width: 20, height: 20, borderRadius: 6, boxSizing: "border-box", border: `2px solid ${on ? RED : "#CFC4B1"}`, background: on ? RED : "#fff", boxShadow: on ? "inset 0 0 0 3px #FBEEDC" : "none" }} />
                    <span style={{ display: "flex", flexDirection: "column", gap: 4 }}><b style={{ fontSize: 15.5 }}>{p.title}</b>{p.note ? <span style={{ fontSize: 13, lineHeight: 1.7, color: MUTED }}>{p.note}</span> : null}</span>
                  </button>;
                })}
              </div>
              {chosen.length > 1 ? <p style={{ margin: "12px 0 0", padding: "10px 14px", borderRadius: 12, background: "#FBEEDC", fontSize: 13.5, color: "#4A3B1C" }}>{t("splitNote", { count: chosen.length })}</p> : null}
              <div style={{ marginTop: 18, display: "flex", flexWrap: "wrap", gap: 22 }}>
                <div style={{ flex: "1 1 280px", display: "flex", flexDirection: "column", gap: 8 }}>
                  <h3 style={{ margin: 0, fontSize: 15.5, fontWeight: 800 }}>{t("intentTitle")}</h3>
                  <div role="radiogroup" aria-label={t("intentTitle")} style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>{(["self", "parents", "other"] as const).map((k) => <button key={k} type="button" role="radio" aria-checked={draft.intent === k} onClick={() => set({ intent: k })} style={{ ...chip(draft.intent === k), fontSize: 14.5, minHeight: 44, padding: "0 18px", borderRadius: 999 }}>{t(`intent_${k}`)}</button>)}</div>
                  {draft.intent === "other" ? <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, color: MUTED }}>{t("onBehalfLabel")}<input value={draft.onBehalf} maxLength={80} onChange={(e) => set({ onBehalf: e.target.value })} style={{ minHeight: 46, padding: "0 14px", borderRadius: 12, border: `1.5px solid ${LINE}`, background: "#FCFAF5", font: "inherit", fontSize: 15, color: INK }} /></label> : null}
                </div>
                <div style={{ flex: "1 1 280px", display: "flex", flexDirection: "column", gap: 8 }}>
                  <h3 style={{ margin: 0, fontSize: 15.5, fontWeight: 800 }}>{t("timeTitle")}</h3>
                  <div role="radiogroup" aria-label={t("timeTitle")} style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>{(["fajr", "maghrib"] as const).map((k) => <button key={k} type="button" role="radio" aria-checked={draft.slot === k} onClick={() => set({ slot: k })} style={{ ...chip(draft.slot === k), fontSize: 14.5, minHeight: 44, padding: "0 18px", borderRadius: 999 }}>{t(`slot_${k}`)}</button>)}</div>
                  <span style={{ fontSize: 13, color: MUTED }}>{t("timeNote", { city })}</span>
                </div>
              </div>
              <label style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", borderRadius: 14, background: "#FCFAF5", border: "1px solid #ECE3D3", cursor: "pointer" }}>
                <input type="checkbox" checked={draft.remind} onChange={(e) => set({ remind: e.target.checked })} style={{ width: 22, height: 22, accentColor: RED }} />
                <span style={{ display: "flex", flexDirection: "column", gap: 2 }}><b style={{ fontSize: 15 }}>{t("remindTitle")}</b><span style={{ fontSize: 13, color: MUTED }}>{t("remindHint")}</span></span>
              </label>
            </section>

            {signedIn ? <section style={{ ...section, display: "flex", flexDirection: "column", gap: 12 }} data-clarity-mask="True" data-private="">
              <h2 style={h2}>{num("05")}{t("cardTitle")}</h2>
              {cardFields}
            </section> : null}
          </div>

          <aside aria-label={t("summaryTitle")} style={{ flex: "0 0 380px", position: "sticky", top: 120, display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ background: RED, color: "#FFF6EA", borderRadius: 24, padding: 24, display: "flex", flexDirection: "column", gap: 18, boxShadow: "0 30px 60px -30px rgba(90,26,16,.7)" }}>
              <h2 style={{ margin: 0, fontSize: 19, fontWeight: 900 }}>{t("summaryTitle")}</h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <span style={{ fontSize: 13, color: "#EBCFB9" }}>{t("mapTitle")}</span>
                <div role="img" aria-label={t("mapAria", { count: sorted.length })} style={{ display: "grid", gridTemplateColumns: "repeat(30, minmax(0, 1fr))", gap: 3, alignItems: "end", height: 60, padding: "8px 10px", borderRadius: 12, background: "rgba(255,255,255,.06)" }}>
                  {days.map((d) => { const on = selected.has(d.n); return <span key={d.n} style={{ display: "block", height: on ? Math.round(10 + (amountFor(d.n) / max) * 34) : 5, borderRadius: 3, background: on ? (draft.overrides[d.n] != null ? "#F2C27A" : d.last10 ? "#F6D08B" : "#F1D9C6") : "rgba(255,255,255,.14)" }} />; })}
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div style={{ padding: "12px 14px", borderRadius: 14, background: "rgba(255,255,255,.07)" }}><span style={{ fontSize: 12.5, color: "#EBCFB9" }}>{t("rDays")}</span><b style={{ display: "block", marginTop: 4, fontSize: 26 }}>{sorted.length}</b></div>
                <div style={{ padding: "12px 14px", borderRadius: 14, background: "rgba(255,255,255,.07)" }}><span style={{ fontSize: 12.5, color: "#EBCFB9" }}>{t("rDaily")}</span><b style={{ display: "block", marginTop: 4, fontSize: 26 }}>{money(perDay)}</b></div>
              </div>
              <div style={{ padding: 18, borderRadius: 16, background: "linear-gradient(135deg, #F6D08B, #CD8B2B)", color: "#2A1E05" }}>
                <span style={{ fontSize: 13, fontWeight: 700 }}>{t("totalLabel")}</span>
                <b style={{ display: "block", marginTop: 4, fontSize: 40, lineHeight: 1.05 }}>{money(total)}</b>
              </div>
              <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "auto 1fr", gap: "8px 14px", fontSize: 14 }}>
                <dt style={{ color: "#EBCFB9" }}>{t("firstCharge")}</dt><dd style={{ margin: 0, fontWeight: 700 }}>{sorted.length ? `${t("dayTitle", { day: sorted[0] })} · ${days[sorted[0] - 1].label}` : "—"}</dd>
                <dt style={{ color: "#EBCFB9" }}>{t("lastCharge")}</dt><dd style={{ margin: 0, fontWeight: 700 }}>{sorted.length ? `${t("dayTitle", { day: sorted[sorted.length - 1] })} · ${days[sorted[sorted.length - 1] - 1].label}` : "—"}</dd>
                <dt style={{ color: "#EBCFB9" }}>{t("timeTitle")}</dt><dd style={{ margin: 0, fontWeight: 700 }}>{t(`slot_${draft.slot}`)} · {city}</dd>
                <dt style={{ color: "#EBCFB9" }}>{chosen.length > 1 ? t("rProjects") : t("rProject")}</dt><dd style={{ margin: 0, fontWeight: 700 }}>{chosen.map((p) => p.title).join("، ")}</dd>
              </dl>
              {!signedIn ? <button type="button" onClick={goSignIn} disabled={!sorted.length} style={{ minHeight: 56, borderRadius: 16, border: 0, background: "#FFF6EA", color: RED, font: "inherit", fontSize: 16, fontWeight: 900, cursor: "pointer" }}>{t("signInToConfirm")}</button>
                : <button type="button" onClick={() => void confirm()} disabled={!canConfirm} style={{ minHeight: 56, borderRadius: 16, border: 0, background: "#FFF6EA", color: RED, font: "inherit", fontSize: 17, fontWeight: 900, cursor: canConfirm ? "pointer" : "not-allowed", opacity: canConfirm ? 1 : 0.6 }}>{busy ? "…" : t("confirm")}</button>}
              {signedIn && !canConfirm && !busy ? <span style={{ fontSize: 12.5, color: "#EBCFB9", textAlign: "center" }}>{t("completeCardHint")}</span> : null}
            </div>
          </aside>
        </div>
        {sheetView}
      </main>
    );
  }

  return (
    <main dir={locale === "ar" || locale === "ur" ? "rtl" : "ltr"} style={{ background: CREAM, color: INK, minHeight: "100vh", paddingBottom: 110 }}>
      <header style={{ background: `radial-gradient(130% 120% at 90% 0%, ${BRICK} 0%, ${RED} 70%)`, color: "#FFF6EA", padding: "40px 16px 16px" }}>
        <div style={{ maxWidth: 640, margin: "0 auto", display: "flex", flexDirection: "column", gap: 12 }}>
          {preview ? <span style={{ alignSelf: "flex-start", fontSize: 12, fontWeight: 800, padding: "4px 10px", borderRadius: 999, background: "#FFF6EA", color: RED }}>{t("previewBadge")}</span> : null}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {draft.step > 1 ? <button type="button" aria-label={t("back")} onClick={() => set({ step: draft.step - 1 })} style={{ width: 44, height: 44, borderRadius: 12, border: "1px solid rgba(255,246,234,.25)", background: "transparent", color: "inherit", cursor: "pointer", fontSize: 20 }}>‹</button> : null}
            <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.35 }}>
              <b style={{ fontSize: 19, fontWeight: 900 }}>{t("title")}</b>
              <span style={{ fontSize: 12.5, color: "#F1D9C6" }}>{t("stepOf", { step: draft.step, total: 4, name: STEPS[draft.step - 1] })}</span>
            </div>
          </div>
          <ol aria-label={t("stepsLabel")} style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 6 }}>
            {STEPS.map((label, i) => <li key={label} style={{ display: "flex", flexDirection: "column", gap: 5 }}><span style={{ height: 4, borderRadius: 999, background: i + 1 <= draft.step ? GOLD : "rgba(255,246,234,.2)" }} /><span style={{ fontSize: 11.5, textAlign: "center", fontWeight: i + 1 === draft.step ? 800 : 500, color: i + 1 === draft.step ? "#FFF6EA" : "#E2C3AC" }}>{label}</span></li>)}
          </ol>
        </div>
      </header>

      <div style={{ maxWidth: 640, margin: "0 auto", padding: "18px 16px", display: "flex", flexDirection: "column", gap: 16 }}>
        {draft.step === 1 ? <>
          <section style={{ borderRadius: 20, padding: 18, background: `radial-gradient(130% 120% at 90% 0%, ${BRICK} 0%, ${RED} 70%)`, color: "#FFF6EA", textAlign: "center", display: "flex", flexDirection: "column", gap: 8 }}>
            <p style={{ margin: 0, fontFamily: "Amiri, serif", fontSize: 20, lineHeight: 2, color: "#F6D08B", textWrap: "balance" }}>﴿شَهْرُ رَمَضَانَ الَّذِي أُنزِلَ فِيهِ الْقُرْآنُ<br />هُدًى لِّلنَّاسِ وَبَيِّنَاتٍ مِّنَ الْهُدَىٰ وَالْفُرْقَانِ﴾</p>
            <span style={{ fontSize: 12, color: "#EBCFB9" }}>{t("verseRef")}</span>
          </section>
          <section style={{ ...card, display: "flex", flexDirection: "column", gap: 8 }}>
            <h1 style={{ margin: 0, fontSize: 19, fontWeight: 900 }}>{t("introTitle")}</h1>
            <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.9, color: "#2C3647" }}>{t("introBody")}</p>
          </section>
          <h2 style={{ margin: "4px 0 0", fontSize: 18, fontWeight: 900 }}>{t("daysTitle")}</h2>
          <p style={{ margin: 0, fontSize: 13.5, color: MUTED }}>{t("daysHint")}</p>
          {(["all", "fridays", "last10", "witr"] as PlanKey[]).map((k) => {
            const on = !draft.picked && draft.plans.includes(k);
            return <button key={k} type="button" aria-pressed={on} onClick={() => togglePlan(k)} style={{ display: "flex", alignItems: "center", gap: 12, minHeight: 66, padding: "12px 14px", borderRadius: 16, font: "inherit", textAlign: "start", cursor: "pointer", background: on ? RED : "#fff", color: on ? "#FFF6EA" : INK, border: `1.5px solid ${on ? RED : LINE}` }}>
              <span style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}><b style={{ fontSize: 16 }}>{t(`plan_${k}`)}</b><span style={{ fontSize: 13, opacity: .82 }}>{t(`plan_${k}_desc`)}</span></span>
              <span style={{ fontSize: 12, fontWeight: 800, padding: "4px 10px", borderRadius: 999, background: on ? "#F6D08B" : "#F1E8D6", color: on ? "#2A1E05" : "#7A4A0E" }}>{t("daysCount", { count: planDays(k).length })}</span>
            </button>;
          })}
          <button type="button" onClick={() => set({ picked: [...selected], step: 2 })} style={{ minHeight: 52, borderRadius: 14, border: `1.5px dashed ${GOLD}`, background: "transparent", color: "#7A4A0E", font: "inherit", fontWeight: 800, cursor: "pointer" }}>{t("plan_custom")}</button>
          <h2 style={{ margin: "6px 0 0", fontSize: 18, fontWeight: 900 }}>{t("amountTitle")}</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
            {settings.amounts.map((v) => <button key={v} type="button" aria-pressed={!draft.customAmount && draft.amount === v} onClick={() => set({ amount: v, customAmount: "" })} style={chip(!draft.customAmount && draft.amount === v)}>{money(v)}</button>)}
          </div>
          <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, minHeight: 52, padding: "0 14px", borderRadius: 14, border: `1.5px solid ${LINE}`, background: "#fff", color: MUTED }}>
            {t("otherAmount")}<input type="number" min={1} inputMode="numeric" value={draft.customAmount} onChange={(e) => set({ customAmount: e.target.value.replace(/\D/g, "") })} aria-label={t("otherAmount")} style={{ width: 90, border: 0, background: "transparent", font: "inherit", fontSize: 17, fontWeight: 800, color: INK, textAlign: "end", outline: "none" }} />
          </label>
          {settings.doubleLast10 ? <label style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 14, background: "#FBEEDC", border: "1px solid #E9CFA3", cursor: "pointer" }}>
            <input type="checkbox" checked={draft.doubleLast10} onChange={(e) => set({ doubleLast10: e.target.checked })} style={{ width: 22, height: 22, accentColor: GOLD }} />
            <span style={{ display: "flex", flexDirection: "column", gap: 2 }}><b style={{ fontSize: 14.5, color: "#7A4A0E" }}>{t("doubleTitle")}</b><span style={{ fontSize: 12.5, color: "#6E5636" }}>{t("doubleHint")}</span></span>
          </label> : null}
        </> : null}

        {draft.step === 2 ? <>
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 8 }}>
            <div><h1 style={{ margin: 0, fontSize: 21, fontWeight: 900 }}>{t("calendarTitle", { year: settings.hijriYear })}</h1><span style={{ fontSize: 12.5, color: MUTED }}>{settings.startConfirmed ? t("datesConfirmed") : t("datesEstimated")}</span></div>
            <span style={{ fontSize: 12.5, fontWeight: 800, padding: "5px 10px", borderRadius: 999, background: RED, color: "#fff" }}>{t("daysCount", { count: sorted.length })}</span>
          </div>
          <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 2 }}>
            {(["all", "fridays", "last10", "witr"] as PlanKey[]).map((k) => <button key={k} type="button" onClick={() => set({ picked: [...new Set([...(k === "all" ? [] : sorted), ...planDays(k)])].sort((a, b) => a - b) })} style={{ flex: "0 0 auto", minHeight: 40, padding: "0 14px", borderRadius: 999, border: `1.5px solid ${LINE}`, background: "#fff", font: "inherit", fontSize: 13.5, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>{k === "all" ? t("plan_all") : `+ ${t(`plan_${k}`)}`}</button>)}
            <button type="button" onClick={() => set({ picked: [], overrides: {} })} style={{ flex: "0 0 auto", minHeight: 40, padding: "0 14px", borderRadius: 999, border: "1.5px solid #E8C9C2", background: "transparent", color: RED, font: "inherit", fontSize: 13.5, fontWeight: 700, cursor: "pointer" }}>{t("clearAll")}</button>
          </div>
          <div style={{ ...card, padding: "12px 10px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 5 }}>
              {[0, 1, 2, 3, 4, 5, 6].map((i) => <span key={i} style={{ display: "grid", placeItems: "center", height: 24, fontSize: 12, fontWeight: 800, color: i === 6 ? "#8C5512" : MUTED }}>{t(`wd${i}`)}</span>)}
              {Array.from({ length: days[0].col }, (_, i) => <span key={`b${i}`} aria-hidden="true" />)}
              {days.map((d) => {
                const on = selected.has(d.n), bg = on ? RED : d.last10 ? "#FBEEDC" : "#FCFAF5";
                return <button key={d.n} type="button" onClick={() => setSheet({ day: d.n, amount: on ? amountFor(d.n) : base(d.n) })} aria-label={t("dayAria", { day: d.n, date: d.label, amount: on ? money(amountFor(d.n)) : t("notScheduled") })}
                  style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3, height: 58, padding: 0, borderRadius: 12, font: "inherit", cursor: "pointer", background: bg, color: on ? "#FFF6EA" : INK, border: d.friday ? `2px solid ${GOLD}` : on ? `2px solid ${RED}` : `1px solid ${d.last10 ? "#E9CFA3" : "#EEE6D8"}` }}>
                  <svg width="11" height="11" viewBox="0 0 16 16" aria-hidden="true" style={{ position: "absolute", top: 5, insetInlineStart: 5 }}><circle cx="8" cy="8" r="7" fill={on ? "#F6D08B" : GOLD} /><circle cx={moonCx(d.n)} cy="8" r="7" fill={bg} /></svg>
                  {on && draft.overrides[d.n] != null ? <span aria-hidden="true" style={{ position: "absolute", top: 5, insetInlineEnd: 5, width: 6, height: 6, borderRadius: "50%", background: "#F6D08B" }} /> : null}
                  <b style={{ fontSize: 17, lineHeight: 1 }}>{d.n}</b>
                  <span style={{ fontSize: 10.5, fontWeight: 800, color: on ? "#F6D08B" : "transparent" }}>{on ? money(amountFor(d.n)) : "·"}</span>
                </button>;
              })}
            </div>
          </div>
          <p style={{ margin: 0, padding: "12px 14px", borderRadius: 14, background: "#fff", fontSize: 13, lineHeight: 1.8 }}>{t("calendarHint")}</p>
        </> : null}

        {draft.step === 3 ? <>
          <h1 style={{ margin: 0, fontSize: 21, fontWeight: 900 }}>{t("projectsTitle")}</h1>
          <div role="group" aria-label={t("projectsTitle")} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {projects.map((p) => {
              const on = draft.projectIds.includes(p.id);
              return <button key={p.id} type="button" role="checkbox" aria-checked={on} onClick={() => { const next = on ? draft.projectIds.filter((x) => x !== p.id) : [...draft.projectIds, p.id]; set({ projectIds: next.length ? next : [p.id] }); }}
                style={{ display: "flex", alignItems: "center", gap: 12, minHeight: 64, padding: "10px 14px", borderRadius: 14, font: "inherit", textAlign: "start", cursor: "pointer", background: "#fff", color: INK, border: `2px solid ${on ? RED : "#EEE6D8"}` }}>
                <span aria-hidden="true" style={{ flex: "0 0 auto", width: 22, height: 22, borderRadius: 6, boxSizing: "border-box", border: `2px solid ${on ? RED : "#CFC4B1"}`, background: on ? RED : "#fff", boxShadow: on ? "inset 0 0 0 3px #fff" : "none" }} />
                <span style={{ display: "flex", flexDirection: "column", gap: 2 }}><b style={{ fontSize: 15 }}>{p.title}</b>{p.note ? <span style={{ fontSize: 12.5, color: MUTED }}>{p.note}</span> : null}</span>
              </button>;
            })}
          </div>
          {chosen.length > 1 ? <p style={{ margin: 0, padding: "10px 12px", borderRadius: 12, background: "#FBEEDC", fontSize: 13, color: "#4A3B1C" }}>{t("splitNote", { count: chosen.length })}</p> : null}
          <h2 style={{ margin: "6px 0 0", fontSize: 16, fontWeight: 900 }}>{t("intentTitle")}</h2>
          <div role="radiogroup" aria-label={t("intentTitle")} style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
            {(["self", "parents", "other"] as const).map((k) => <button key={k} type="button" role="radio" aria-checked={draft.intent === k} onClick={() => set({ intent: k })} style={{ ...chip(draft.intent === k), fontSize: 14.5 }}>{t(`intent_${k}`)}</button>)}
          </div>
          {draft.intent === "other" ? <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, color: MUTED }}>{t("onBehalfLabel")}<input value={draft.onBehalf} maxLength={80} onChange={(e) => set({ onBehalf: e.target.value })} style={{ minHeight: 50, padding: "0 14px", borderRadius: 14, border: `1.5px solid ${LINE}`, background: "#fff", font: "inherit", fontSize: 16, color: INK }} /></label> : null}
          <h2 style={{ margin: "6px 0 0", fontSize: 16, fontWeight: 900 }}>{t("timeTitle")}</h2>
          <div role="radiogroup" aria-label={t("timeTitle")} style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8, padding: 4, borderRadius: 14, background: "#EDE5D6" }}>
            {(["fajr", "maghrib"] as const).map((k) => <button key={k} type="button" role="radio" aria-checked={draft.slot === k} onClick={() => set({ slot: k })} style={{ minHeight: 44, borderRadius: 10, border: 0, font: "inherit", fontSize: 14.5, fontWeight: 800, cursor: "pointer", background: draft.slot === k ? "#fff" : "transparent", color: draft.slot === k ? INK : MUTED, boxShadow: draft.slot === k ? "0 2px 8px rgba(90,26,16,.12)" : "none" }}>{t(`slot_${k}`)}</button>)}
          </div>
          <span style={{ fontSize: 12.5, color: MUTED }}>{t("timeNote", { city })}</span>
          <label style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 14, background: "#fff", cursor: "pointer" }}>
            <input type="checkbox" checked={draft.remind} onChange={(e) => set({ remind: e.target.checked })} style={{ width: 22, height: 22, accentColor: RED }} />
            <span style={{ display: "flex", flexDirection: "column", gap: 2 }}><b style={{ fontSize: 14.5 }}>{t("remindTitle")}</b><span style={{ fontSize: 12.5, color: MUTED }}>{t("remindHint")}</span></span>
          </label>
        </> : null}

        {draft.step === 4 ? <>
          <h1 style={{ margin: 0, fontSize: 21, fontWeight: 900 }}>{t("reviewTitle")}</h1>
          <section style={{ borderRadius: 20, padding: 18, background: `radial-gradient(130% 120% at 90% 0%, ${BRICK} 0%, ${RED} 70%)`, color: "#FFF6EA", display: "flex", flexDirection: "column", gap: 12 }}>
            <span style={{ fontSize: 13, color: "#F1D9C6" }}>{t("totalLabel")}</span>
            <b style={{ fontSize: 40, lineHeight: 1, color: "#F6D08B" }}>{money(total)}</b>
            <div role="img" aria-label={t("mapAria", { count: sorted.length })} style={{ display: "grid", gridTemplateColumns: "repeat(30, minmax(0, 1fr))", gap: 2, alignItems: "end", height: 44 }}>
              {days.map((d) => { const on = selected.has(d.n), max = Math.max(1, ...sorted.map(amountFor)); return <span key={d.n} style={{ display: "block", height: on ? Math.round(8 + (amountFor(d.n) / max) * 34) : 4, borderRadius: 2, background: on ? (draft.overrides[d.n] != null ? "#F2C27A" : d.last10 ? GOLD : "#EBCFB9") : "rgba(255,255,255,.14)" }} />; })}
            </div>
          </section>
          <ul style={{ ...card, listStyle: "none", margin: 0, padding: "4px 14px" }}>
            {[[t("rDays"), t("daysCount", { count: sorted.length }), 2], [t("rDaily"), money(perDay), 1], [chosen.length > 1 ? t("rProjects") : t("rProject"), chosen.map((p) => p.title).join("، "), 3], [t("intentTitle"), draft.intent === "other" && draft.onBehalf ? draft.onBehalf : t(`intent_${draft.intent}`), 3], [t("timeTitle"), `${t(`slot_${draft.slot}`)} · ${city}`, 3]].map(([k, v, step]) =>
              <li key={String(k)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, minHeight: 56, borderBottom: "1px solid #F0E9DC" }}>
                <span style={{ display: "flex", flexDirection: "column", gap: 2 }}><span style={{ fontSize: 12.5, color: MUTED }}>{k}</span><b style={{ fontSize: 14.5 }}>{v}</b></span>
                <button type="button" onClick={() => set({ step: Number(step) })} style={{ minHeight: 44, padding: "0 10px", border: 0, background: "transparent", color: BRICK, font: "inherit", fontWeight: 800, cursor: "pointer" }}>{t("edit")}</button>
              </li>)}
          </ul>
          {!signedIn ? <button type="button" onClick={goSignIn} style={{ minHeight: 54, borderRadius: 16, border: 0, background: RED, color: "#fff", font: "inherit", fontSize: 16, fontWeight: 800, cursor: "pointer" }}>{t("signInToConfirm")}</button> : <section style={{ ...card, display: "flex", flexDirection: "column", gap: 12 }} data-clarity-mask="True" data-private="">
            {cardFields}
          </section>}
        </> : null}
      </div>

      <div style={{ position: "fixed", insetInline: 0, bottom: 0, zIndex: 50, background: "rgba(255,255,255,.97)", borderTop: `1px solid ${LINE}`, boxShadow: "0 -10px 30px -18px rgba(90,26,16,.35)", padding: "12px 16px calc(14px + env(safe-area-inset-bottom, 0px))" }}>
        <div style={{ maxWidth: 640, margin: "0 auto", display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", lineHeight: 1.3 }}><span style={{ fontSize: 12, color: MUTED }}>{t("barCaption", { count: sorted.length })}</span><b style={{ fontSize: 22, fontWeight: 900 }}>{money(total)}</b></div>
          {draft.step < 4 ? <button type="button" disabled={!sorted.length} onClick={() => set({ step: draft.step + 1 })} style={{ minHeight: 54, padding: "0 24px", borderRadius: 16, border: 0, font: "inherit", fontSize: 16, fontWeight: 800, cursor: sorted.length ? "pointer" : "not-allowed", background: sorted.length ? RED : "#D9D3C7", color: sorted.length ? "#fff" : "#6B6457" }}>{t("next")}</button>
            : signedIn ? <button type="button" disabled={!canConfirm} onClick={() => void confirm()} style={{ minHeight: 54, padding: "0 22px", borderRadius: 16, border: 0, font: "inherit", fontSize: 16, fontWeight: 800, cursor: "pointer", background: BRICK, color: "#fff", opacity: busy || !consent ? 0.6 : 1 }}>{busy ? "…" : t("confirm")}</button> : null}
        </div>
      </div>

      {sheetView}
    </main>
  );
}
