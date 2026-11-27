"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { addToCart } from "@/lib/minbar/cart";
import { miaPath } from "@/lib/minbar/routes";
import type { GiftCard } from "@/lib/donations/gift-order";
import { CARD_THEMES, PACKAGE_ICON_PATHS, PAGE_OCCASIONS, giftCartItems, giftDraftProblem, themesFor, type GiftRecipientDraft } from "@/lib/minbar/gift-page";

type Project = { slug: string; title: string };
type Pack = { slug: string; title: string; note: string; price: number; icon: string };
type Occasion = GiftCard["occasion"];

const RED = "#7A2419", BRICK = "#AB422F", GOLD = "#CD8B2B", CREAM = "#FBF6EE", INK = "#1E2530", MUTED = "#5B6574", LINE = "#E8DFCF";
const SERIF = "Amiri, 'Noto Naskh Arabic', 'Traditional Arabic', serif";
const STEP_KEYS = ["value", "occasion", "card", "send"] as const;
const money = (v: number) => "$" + new Intl.NumberFormat("en-US", { maximumFractionDigits: v % 1 ? 2 : 0 }).format(v);
const input: CSSProperties = { minHeight: 48, padding: "0 14px", borderRadius: 12, border: `1.5px solid ${LINE}`, background: "#fff", font: "inherit", fontSize: 16, color: INK, width: "100%", boxSizing: "border-box" };
const label: CSSProperties = { display: "flex", flexDirection: "column", gap: 6, fontSize: 13.5, fontWeight: 700 };
const sel = (on: boolean): CSSProperties => (on ? { background: RED, color: "#FFF6EA", border: `1.5px solid ${RED}` } : { background: "#fff", color: INK, border: `1.5px solid ${LINE}` });
const chip = (on: boolean): CSSProperties => ({ minHeight: 40, padding: "0 14px", borderRadius: 999, font: "inherit", fontSize: 13.5, fontWeight: 700, cursor: "pointer", ...sel(on) });
const Icon = ({ d, size = 22 }: { d: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
);

function localDateInput(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * The gift page (design: canvas "الإهداء"). Phone: four steps — value, occasion, card, delivery —
 * with a bottom bar. Desktop (≥1024px): the same steps beside a live card that follows every choice.
 * A finished gift becomes one basket row per recipient and goes through the ordinary checkout.
 */
export default function GiftPage({ locale, preview, amounts, projects, packages }: { locale: string; preview: boolean; amounts: number[]; projects: Project[]; packages: Pack[] }) {
  const t = useTranslations("giftPage");
  const dir = locale === "ar" || locale === "ur" ? "rtl" : "ltr";
  const router = useRouter();
  const [wide, setWide] = useState(false);
  const [step, setStep] = useState(1);
  const [mode, setMode] = useState<"free" | "package">(projects.length ? "free" : "package");
  const [amount, setAmount] = useState(amounts[1] ?? amounts[0] ?? 50), [custom, setCustom] = useState("");
  const [projectSlug, setProjectSlug] = useState(projects[0]?.slug ?? "");
  const [packSlug, setPackSlug] = useState(packages[0]?.slug ?? ""), [qty, setQty] = useState(1);
  const [occasion, setOccasion] = useState<Occasion>("none");
  const [theme, setTheme] = useState<GiftCard["theme"]>("dome"), [accent, setAccent] = useState<0 | 1 | 2>(0), [font, setFont] = useState<GiftCard["font"]>("naskh");
  const [side, setSide] = useState<"front" | "back">("front");
  const [msgIndex, setMsgIndex] = useState(0), [message, setMessage] = useState<string | null>(null);
  const [recipients, setRecipients] = useState<GiftRecipientDraft[]>([{ name: "", phone: "", email: "" }]);
  const [signature, setSignature] = useState(""), [showAmount, setShowAmount] = useState(false), [anonymous, setAnonymous] = useState(false);
  const [wa, setWa] = useState(true), [mail, setMail] = useState(false);
  const [when, setWhen] = useState<"now" | "date">("now"), [date, setDate] = useState(""), [time, setTime] = useState("09:00");
  const [zone, setZone] = useState(""), [error, setError] = useState(""), [busy, setBusy] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)"), onChange = () => setWide(mq.matches);
    onChange(); mq.addEventListener("change", onChange);
    try { setZone(Intl.DateTimeFormat().resolvedOptions().timeZone || ""); } catch { /* unknown */ }
    setDate(localDateInput(new Date(Date.now() + 86_400_000)));
    return () => mq.removeEventListener("change", onChange);
  }, []);
  useEffect(() => { setError(""); }, [step]);

  const themeIds = themesFor(occasion), themeId = themeIds.includes(theme) ? theme : themeIds[0], look = CARD_THEMES[themeId];
  const bg = look.bg[accent], ink = look.ink, gold = look.accent[accent];
  const pack = packages.find((p) => p.slug === packSlug) ?? packages[0];
  const project = projects.find((p) => p.slug === projectSlug) ?? projects[0];
  const unit = mode === "package" && pack ? pack.price * qty : Number(custom) || amount;
  const named = recipients.filter((r) => r.name.trim());
  const people = named.length || 1, total = Math.round(unit * people * 100) / 100;
  const presetMessages = [t(`occasions.${occasion}.msg1`), t(`occasions.${occasion}.msg2`)];
  const text = message ?? presetMessages[msgIndex] ?? presetMessages[0];
  const giftName = mode === "package" && pack ? (qty > 1 ? qty + " × " : "") + pack.title : t("giftFor", { project: project?.title ?? "" });
  const first = named[0]?.name.trim() || t("recipientFallback");
  const to = people > 1 ? t("andOthers", { name: first, n: people - 1 }) : first;
  const sign = anonymous ? t("anonymousName") : signature.trim() || "—";
  const sendAt = when === "date" && date && time ? new Date(`${date}T${time}`) : null;
  const stepNames = STEP_KEYS.map((k) => t(`steps.${k}`));

  const pickOccasion = (id: Occasion) => { const o = PAGE_OCCASIONS.find((x) => x.id === id)!; setOccasion(id); setTheme(o.theme); setAccent(0); setMsgIndex(0); setMessage(null); };
  const draft = () => ({
    project: mode === "package" && pack ? { slug: pack.slug, title: pack.title } : { slug: project?.slug ?? "", title: project?.title ?? "" },
    unitUSD: unit, recipients, message: text, showAmount,
    card: { occasion, theme: themeId, accent, font, signature: signature.trim() || null, anonymous },
    whatsapp: wa, email: mail, sendAt,
  });
  const problemText = (p: ReturnType<typeof giftDraftProblem>) => (p ? t(`errors.${p.code}`, { name: p.recipient ?? "" }) : "");

  function next() {
    if (step === 1) {
      if (!(unit >= 1) || (mode === "free" && !project) || (mode === "package" && !pack)) return setError(t("errors.amount"));
    }
    if (step === 3 && !named.length) return setError(t("errors.name"));
    if (step < 4) { setStep(step + 1); if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" }); return; }
    const problem = giftDraftProblem(draft());
    if (problem) return setError(problemText(problem));
    try {
      setBusy(true);
      for (const item of giftCartItems(draft())) addToCart(item);
      router.push(miaPath("cart", locale));
    } catch { setBusy(false); setError(t("errors.channel")); }
  }
  const back = () => setStep((s) => Math.max(1, s - 1));

  /* ── the card ─────────────────────────────────────────────────────────── */
  const card = (height: number) => (
    <div style={{ position: "relative", overflow: "hidden", height, padding: "30px 28px 24px", boxSizing: "border-box", borderRadius: 20, background: bg, color: ink,
      boxShadow: `inset 0 0 0 10px rgba(255,255,255,.04), inset 0 0 0 11px ${gold}88, inset 0 0 0 16px ${gold}44, 0 30px 60px -30px rgba(42,12,8,.75)` }}>
      <svg aria-hidden="true" width="100%" height="100%" style={{ position: "absolute", inset: 0, opacity: look.pattern }}><defs><pattern id="gift-star" width="44" height="44" patternUnits="userSpaceOnUse"><path d="M22 3 L26 18 L41 22 L26 26 L22 41 L18 26 L3 22 L18 18 Z" fill="none" stroke={gold} strokeWidth="1" /></pattern></defs><rect width="100%" height="100%" fill="url(#gift-star)" /></svg>
      {look.mark === "dome" ? <svg aria-hidden="true" width="150" height="90" viewBox="0 0 150 90" style={{ position: "absolute", left: "50%", bottom: 0, transform: "translateX(-50%)", opacity: 0.2 }}><path d="M10 90 V60 H140 V90 Z M30 60 Q75 0 120 60 Z M73 6 h4 v-6 h-4 Z" fill={gold} /></svg> : null}
      {look.mark === "moon" ? <svg aria-hidden="true" width="66" height="66" viewBox="0 0 34 34" style={{ position: "absolute", top: 26, insetInlineEnd: 26 }}><path d="M21.5 9.5a8.5 8.5 0 1 0 3 12.6A7 7 0 1 1 21.5 9.5z" fill={gold} /></svg> : null}
      {look.mark === "leaves" ? <svg aria-hidden="true" width="120" height="120" viewBox="0 0 120 120" style={{ position: "absolute", top: -10, insetInlineEnd: -10, opacity: 0.55 }}><path d="M10 110 C40 70 70 50 110 10" stroke={gold} strokeWidth="2" fill="none" /><path d="M40 72 C30 60 34 48 46 44 C50 56 48 66 40 72 Z M62 52 C54 40 58 28 70 26 C72 38 70 46 62 52 Z M82 34 C76 24 80 14 90 12 C92 22 90 30 82 34 Z" fill={gold} /></svg> : null}
      <svg aria-hidden="true" width="100%" height="100%" style={{ position: "absolute", inset: 0, pointerEvents: "none" }}><g fill="none" stroke={gold} strokeWidth="1.3" opacity=".9"><path d="M22 46 V30 Q22 22 30 22 H46" /><path d="M28 40 V34 Q28 28 34 28 H40" /></g></svg>
      <svg aria-hidden="true" width="100%" height="100%" style={{ position: "absolute", inset: 0, pointerEvents: "none", transform: "scaleX(-1)" }}><g fill="none" stroke={gold} strokeWidth="1.3" opacity=".9"><path d="M22 46 V30 Q22 22 30 22 H46" /><path d="M28 40 V34 Q28 28 34 28 H40" /></g></svg>
      <span aria-hidden="true" style={{ position: "absolute", bottom: 20, insetInlineEnd: 22, width: 46, height: 46, borderRadius: "50%", display: "grid", placeItems: "center", border: `1.5px solid ${gold}`, color: gold, fontFamily: SERIF, fontSize: 13, fontWeight: 700, lineHeight: 1 }}>{t("seal")}</span>
      {side === "front" ? (
        <div style={{ position: "relative", display: "flex", flexDirection: "column", gap: 9, height: "100%" }}>
          <span style={{ alignSelf: "center", textAlign: "center", color: gold, fontWeight: 700, ...(occasion === "memory" ? { fontSize: 16, fontFamily: SERIF } : { fontSize: 11.5, letterSpacing: ".12em" }) }}>{occasion === "memory" ? t("memoryKicker") : t("cardKicker")}</span>
          <b style={{ fontFamily: SERIF, fontSize: 34, lineHeight: 1.25, fontWeight: 700, color: gold }}>{t(`occasions.${occasion}.head`)}</b>
          <span style={{ fontSize: 13.5, fontWeight: 700, opacity: 0.9 }}>{t("cardTo", { name: to })}</span>
          <p style={{ margin: 0, overflow: "hidden", ...(font === "naskh" ? { fontFamily: SERIF, fontSize: 17, lineHeight: 1.9 } : { fontSize: 15, lineHeight: 1.85, fontWeight: 500 }) }}>{text}</p>
          <span style={{ alignSelf: "flex-start", fontSize: 12.5, fontWeight: 800, padding: "5px 10px", borderRadius: 999, background: "rgba(255,255,255,.14)", border: `1px solid ${gold}`, color: gold }}>{giftName}</span>
          <span style={{ marginTop: "auto", fontSize: 13, fontWeight: 700, opacity: 0.9 }}>{t("cardFrom", { name: sign })}</span>
        </div>
      ) : (
        <div style={{ position: "relative", display: "flex", flexDirection: "column", gap: 12, height: "100%", justifyContent: "center", textAlign: "center", alignItems: "center" }}>
          <span style={{ color: gold, fontWeight: 700, fontSize: 11.5, letterSpacing: ".12em" }}>{t("aboutGift")}</span>
          <b style={{ fontFamily: SERIF, fontSize: 26, color: gold }}>{giftName}</b>
          {showAmount ? <span style={{ fontSize: 15, fontWeight: 800 }}>{t("valueLine", { amount: money(unit) })}</span> : null}
          <p style={{ margin: 0, maxWidth: "26ch", fontSize: 13.5, lineHeight: 1.8, opacity: 0.9 }}>{t("backNote")}</p>
          <span style={{ fontSize: 12, opacity: 0.8 }}>{t("backNumber")}</span>
        </div>
      )}
    </div>
  );
  const sides = (
    <div role="tablist" aria-label={t("sidesLabel")} style={{ display: "flex", justifyContent: "center", gap: 8 }}>
      {(["front", "back"] as const).map((s) => <button key={s} type="button" role="tab" aria-selected={side === s} onClick={() => setSide(s)} style={chip(side === s)}>{s === "front" ? t("front") : t("backSide")}</button>)}
    </div>
  );
  const mini = (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 16, background: bg, color: ink }}>
      <span style={{ flex: "0 0 auto", width: 34, height: 34, borderRadius: 10, border: `1.5px solid ${gold}`, background: "rgba(255,255,255,.12)" }} />
      <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}><b style={{ fontSize: 14 }}>{t(`occasions.${occasion}.head`)} · {to}</b><span style={{ fontSize: 12, opacity: 0.85, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{giftName}</span></span>
      <b style={{ marginInlineStart: "auto", fontSize: 15 }}>{money(total)}</b>
    </div>
  );

  /* ── the steps ────────────────────────────────────────────────────────── */
  const stepValue = (
    <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {!wide ? (
        <div aria-hidden="true" style={{ position: "relative", height: 150, margin: "4px 0 6px" }}>
          <span style={{ position: "absolute", left: "50%", top: 18, width: 150, height: 110, marginLeft: -150, borderRadius: 14, background: "#F8EDE8", boxShadow: "inset 0 0 0 7px #B35C5C66, 0 16px 30px -18px rgba(42,12,8,.6)", transform: "rotate(-10deg)" }} />
          <span style={{ position: "absolute", left: "50%", top: 18, width: 150, height: 110, marginLeft: 0, borderRadius: 14, background: "radial-gradient(120% 120% at 20% 0%, #2B3A5C 0%, #141C30 75%)", boxShadow: "inset 0 0 0 7px #E9C77F66, 0 16px 30px -18px rgba(42,12,8,.6)", transform: "rotate(10deg)" }} />
          <span style={{ position: "absolute", left: "50%", top: 6, width: 170, height: 124, marginLeft: -85, borderRadius: 16, background: "radial-gradient(130% 120% at 85% 0%, #AB422F 0%, #7A2419 70%)", boxShadow: "inset 0 0 0 8px #F6D08B88, 0 22px 36px -20px rgba(42,12,8,.75)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2, color: "#F6D08B" }}>
            <span style={{ fontSize: 9, letterSpacing: ".14em", fontWeight: 700 }}>{t("occasions.none.head")}</span><b style={{ fontFamily: SERIF, fontSize: 22 }}>{t("occasions.eid.head")}</b>
          </span>
        </div>
      ) : null}
      <h1 style={{ margin: 0, fontSize: wide ? 28 : 23, fontWeight: 900, textAlign: wide ? "start" : "center" }}>{t("heroTitle")}</h1>
      <p style={{ margin: "0 0 4px", fontSize: 14, lineHeight: 1.8, color: MUTED, textAlign: wide ? "start" : "center" }}>{t("heroSub")}</p>
      {projects.length && packages.length ? (
        <div role="tablist" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, padding: 4, borderRadius: 14, background: "#EDE5D6" }}>
          {(["free", "package"] as const).map((m) => <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => setMode(m)} style={{ minHeight: 44, borderRadius: 10, border: 0, font: "inherit", fontSize: 14.5, fontWeight: 800, cursor: "pointer", ...(mode === m ? { background: "#fff", color: INK, boxShadow: "0 2px 8px rgba(90,26,16,.12)" } : { background: "transparent", color: MUTED }) }}>{m === "free" ? t("modeFree") : t("modePackage")}</button>)}
        </div>
      ) : null}
      <p style={{ margin: 0, fontSize: 13, lineHeight: 1.7, color: MUTED }}>{mode === "package" ? t("hintPackage") : t("hintFree")}</p>
      {mode === "free" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${wide ? 6 : 3}, minmax(0, 1fr))`, gap: 8 }}>
            {amounts.map((v) => { const on = !custom && amount === v; return <button key={v} type="button" aria-pressed={on} onClick={() => { setAmount(v); setCustom(""); }} style={{ minHeight: 50, borderRadius: 14, font: "inherit", fontSize: 16, fontWeight: 800, cursor: "pointer", ...sel(on) }}>{money(v)}</button>; })}
          </div>
          <label style={label}>{t("otherAmount")}<input inputMode="numeric" dir="ltr" value={custom} onChange={(e) => setCustom(e.target.value.replace(/[^\d]/g, "").slice(0, 7))} style={input} /></label>
          <span style={{ fontSize: 13.5, fontWeight: 700 }}>{t("goesTo")}</span>
          <div style={{ display: "grid", gridTemplateColumns: wide ? "1fr 1fr" : "1fr", gap: 6 }}>
            {projects.map((p) => <button key={p.slug} type="button" aria-pressed={p.slug === project?.slug} onClick={() => setProjectSlug(p.slug)} style={{ minHeight: 48, padding: "8px 14px", borderRadius: 14, font: "inherit", fontSize: 14.5, fontWeight: 700, textAlign: "start", cursor: "pointer", ...sel(p.slug === project?.slug) }}>{p.title}</button>)}
          </div>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: wide ? "1fr 1fr" : "1fr", gap: 8 }}>
          {packages.map((p) => { const on = p.slug === pack?.slug; return (
            <div key={p.slug} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 18, background: on ? "#FBEEDC" : "#fff", border: `2px solid ${on ? GOLD : "#EEE6D8"}` }}>
              <button type="button" aria-pressed={on} onClick={() => { setPackSlug(p.slug); setQty(1); }} style={{ flex: "1 1 auto", display: "flex", alignItems: "center", gap: 12, padding: 0, border: 0, background: "transparent", font: "inherit", color: INK, textAlign: "start", cursor: "pointer", minWidth: 0 }}>
                <span style={{ flex: "0 0 auto", width: 46, height: 46, borderRadius: 14, display: "grid", placeItems: "center", background: on ? RED : "#F5EFE3", color: on ? "#F6D08B" : "#8C5512" }}><Icon d={PACKAGE_ICON_PATHS[p.icon] ?? PACKAGE_ICON_PATHS.gift} /></span>
                <span style={{ flex: "1 1 auto", display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}><b style={{ fontSize: 15 }}>{p.title}</b>{p.note ? <span style={{ fontSize: 12.5, color: MUTED, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.note}</span> : null}</span>
                <b style={{ fontSize: 16 }}>{money(p.price)}</b>
              </button>
              {on ? (
                <span style={{ display: "flex", alignItems: "center", gap: 6, paddingInlineStart: 10, borderInlineStart: "1px solid #E9CFA3" }}>
                  <button type="button" aria-label={t("decrease")} onClick={() => setQty(Math.max(1, qty - 1))} style={{ width: 34, height: 34, borderRadius: "50%", border: `1.5px solid ${GOLD}`, background: "#fff", font: "inherit", fontSize: 18, cursor: "pointer" }}>−</button>
                  <b style={{ minWidth: 20, textAlign: "center" }}>{qty}</b>
                  <button type="button" aria-label={t("increase")} onClick={() => setQty(Math.min(20, qty + 1))} style={{ width: 34, height: 34, borderRadius: "50%", border: 0, background: RED, color: "#fff", font: "inherit", fontSize: 18, cursor: "pointer" }}>+</button>
                </span>
              ) : null}
            </div>
          ); })}
        </div>
      )}
    </section>
  );

  const stepOccasion = (
    <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <h1 style={{ margin: 0, fontSize: 23, fontWeight: 900 }}>{t("occasionTitle")}</h1>
      <p style={{ margin: 0, fontSize: 14, lineHeight: 1.8, color: MUTED }}>{t("occasionSub")}</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
        {PAGE_OCCASIONS.map((o) => { const on = o.id === occasion; return (
          <button key={o.id} type="button" aria-pressed={on} onClick={() => pickOccasion(o.id)} style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, minHeight: wide ? 112 : 100, borderRadius: 18, font: "inherit", cursor: "pointer", background: "#fff", color: INK, border: `2px solid ${on ? o.tint : "#EEE6D8"}`, boxShadow: on ? `0 12px 24px -16px ${o.tint}` : "none" }}>
            <span style={{ width: 46, height: 46, borderRadius: 14, display: "grid", placeItems: "center", color: on ? "#fff" : o.tint, background: on ? o.tint : o.tint + "1A" }}><Icon d={o.icon} size={24} /></span>
            <span style={{ fontSize: 13.5, fontWeight: 800 }}>{t(`occasions.${o.id}.label`)}</span>
          </button>
        ); })}
      </div>
    </section>
  );

  const stepCard = (
    <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <h1 style={{ margin: 0, fontSize: 23, fontWeight: 900 }}>{t("cardTitle")}</h1>
      {!wide ? <>{card(360)}{sides}</> : null}
      <div role="radiogroup" aria-label={t("themesLabel")} style={{ display: "grid", gridTemplateColumns: `repeat(${themeIds.length}, minmax(0, 1fr))`, gap: 8 }}>
        {themeIds.map((id) => <button key={id} type="button" role="radio" aria-checked={themeId === id} onClick={() => { setTheme(id); setAccent(0); }} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "8px 4px", borderRadius: 14, font: "inherit", cursor: "pointer", background: "#fff", border: `2px solid ${themeId === id ? RED : LINE}` }}><span style={{ width: "100%", height: 40, borderRadius: 10, background: CARD_THEMES[id].bg[0] }} /><span style={{ fontSize: 12, fontWeight: 700 }}>{t(`themes.${id}`)}</span></button>)}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <span role="radiogroup" aria-label={t("color")} style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ fontSize: 13, fontWeight: 700 }}>{t("color")}</span>
          {([0, 1, 2] as const).map((i) => <button key={i} type="button" role="radio" aria-checked={accent === i} aria-label={t("colorN", { n: i + 1 })} onClick={() => setAccent(i)} style={{ width: 44, height: 44, borderRadius: "50%", cursor: "pointer", background: look.bg[i], border: `3px solid ${accent === i ? INK : "#fff"}`, boxShadow: `0 0 0 1px ${LINE}` }} />)}
        </span>
        <span role="radiogroup" aria-label={t("font")} style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ fontSize: 13, fontWeight: 700 }}>{t("font")}</span>
          {(["naskh", "modern"] as const).map((f) => <button key={f} type="button" role="radio" aria-checked={font === f} onClick={() => setFont(f)} style={{ ...chip(font === f), ...(f === "naskh" ? { fontFamily: SERIF, fontSize: 16 } : {}) }}>{f === "naskh" ? t("fontNaskh") : t("fontModern")}</button>)}
        </span>
      </div>
      <span style={{ fontSize: 13.5, fontWeight: 700 }}>{t("readyMessage")}</span>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {presetMessages.map((m, i) => { const on = message === null && msgIndex === i; return <button key={i} type="button" aria-pressed={on} onClick={() => { setMsgIndex(i); setMessage(null); }} style={{ textAlign: "start", padding: "10px 12px", borderRadius: 12, font: "inherit", fontSize: 13, lineHeight: 1.6, cursor: "pointer", ...(on ? { background: "#FBEEDC", border: `1.5px solid ${GOLD}`, color: "#4A3B1C" } : { background: "#fff", border: `1.5px solid ${LINE}`, color: INK }) }}>{m}</button>; })}
      </div>
      <label style={label}>{t("writeMessage")}<textarea rows={3} maxLength={600} value={text} onChange={(e) => setMessage(e.target.value)} style={{ ...input, padding: "12px 14px", fontSize: 15, lineHeight: 1.8, resize: "vertical" }} /></label>
      <span style={{ fontSize: 13.5, fontWeight: 700 }}>{t("toWhom")}</span>
      {recipients.map((r, i) => (
        <span key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input aria-label={t("recipientN", { n: i + 1 })} placeholder={t("namePlaceholder")} maxLength={120} value={r.name} onChange={(e) => setRecipients(recipients.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} style={{ ...input, flex: "1 1 auto" }} />
          {recipients.length > 1 ? <button type="button" aria-label={t("remove")} onClick={() => setRecipients(recipients.filter((_, j) => j !== i))} style={{ flex: "0 0 auto", width: 44, height: 44, borderRadius: 12, border: "1.5px solid #E8C9C2", background: "#fff", color: RED, font: "inherit", fontSize: 18, cursor: "pointer" }}>×</button> : null}
        </span>
      ))}
      {recipients.length < 10 ? <button type="button" onClick={() => setRecipients([...recipients, { name: "", phone: "", email: "" }])} style={{ alignSelf: "flex-start", minHeight: 42, padding: "0 14px", borderRadius: 999, border: `1.5px dashed ${GOLD}`, background: "transparent", color: "#8C5512", font: "inherit", fontSize: 13.5, fontWeight: 800, cursor: "pointer" }}>{t("addRecipient")}</button> : null}
      <label style={label}>{t("signature")}<input placeholder={t("signaturePlaceholder")} maxLength={60} value={signature} disabled={anonymous} onChange={(e) => setSignature(e.target.value)} style={input} /></label>
      <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, cursor: "pointer" }}><input type="checkbox" checked={showAmount} onChange={(e) => setShowAmount(e.target.checked)} style={{ width: 20, height: 20, accentColor: RED }} />{t("showAmount")}</label>
    </section>
  );

  const review: [string, string][] = [
    [t("review.occasion"), t(`occasions.${occasion}.label`)],
    [t("review.gift"), giftName],
    [t("review.to"), named.map((r) => r.name.trim()).join("، ") || "—"],
    [t("review.delivery"), (when === "now" ? t("whenNow") : `${date} ${time}`) + " · " + [wa && t("whatsapp"), mail && t("email")].filter(Boolean).join(" + ")],
    [t("review.each"), money(unit)],
  ];
  const stepSend = (
    <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <h1 style={{ margin: 0, fontSize: 23, fontWeight: 900 }}>{t("sendTitle")}</h1>
      <span style={{ fontSize: 13.5, fontWeight: 700 }}>{t("chooseChannels")}</span>
      <div role="group" aria-label={t("channelsLabel")} style={{ display: "grid", gridTemplateColumns: wide ? "1fr 1fr" : "1fr", gap: 8 }}>
        {([["wa", wa, setWa, t("whatsapp"), t("whatsappNote")], ["mail", mail, setMail, t("email"), t("emailNote")]] as const).map(([id, on, setOn, name, note]) => (
          <button key={id} type="button" role="checkbox" aria-checked={on} onClick={() => setOn(!on)} style={{ display: "flex", alignItems: "center", gap: 12, minHeight: 64, padding: "10px 14px", borderRadius: 14, font: "inherit", cursor: "pointer", background: "#fff", color: INK, border: `2px solid ${on ? RED : "#EEE6D8"}`, textAlign: "start" }}>
            <span style={{ flex: "0 0 auto", width: 22, height: 22, borderRadius: 6, boxSizing: "border-box", ...(on ? { background: RED, border: `2px solid ${RED}`, boxShadow: "inset 0 0 0 3px #fff" } : { border: "2px solid #CFC4B1" }) }} />
            <span style={{ display: "flex", flexDirection: "column", gap: 2 }}><b style={{ fontSize: 15 }}>{name}</b><span style={{ fontSize: 12.5, color: MUTED }}>{note}</span></span>
          </button>
        ))}
      </div>
      {wa || mail ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {recipients.map((r, i) => (r.name.trim() ? (
            <div key={i} style={{ display: "flex", flexDirection: "column", gap: 8, padding: 12, borderRadius: 14, background: "#fff", border: "1px solid #EEE6D8" }}>
              <b style={{ fontSize: 14 }}>{r.name}</b>
              {wa ? <label style={label}>{t("whatsappNumber")}<input dir="ltr" type="tel" inputMode="tel" autoComplete="off" placeholder="+90 5xx xxx xx xx" value={r.phone} onChange={(e) => setRecipients(recipients.map((x, j) => (j === i ? { ...x, phone: e.target.value } : x)))} style={input} /></label> : null}
              {mail ? <label style={label}>{t("emailLabel")}<input dir="ltr" type="email" inputMode="email" autoComplete="off" placeholder="name@example.com" value={r.email} onChange={(e) => setRecipients(recipients.map((x, j) => (j === i ? { ...x, email: e.target.value } : x)))} style={input} /></label> : null}
            </div>
          ) : null))}
        </div>
      ) : null}
      <span style={{ fontSize: 13.5, fontWeight: 700 }}>{t("whenTitle")}</span>
      <div role="radiogroup" aria-label={t("whenLabel")} style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
        {(["now", "date"] as const).map((w) => <button key={w} type="button" role="radio" aria-checked={when === w} onClick={() => setWhen(w)} style={{ minHeight: 46, borderRadius: 12, font: "inherit", fontSize: 14, fontWeight: 800, cursor: "pointer", ...sel(when === w) }}>{w === "now" ? t("whenNow") : t("whenDate")}</button>)}
      </div>
      {when === "date" ? (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <label style={label}>{t("date")}<input type="date" dir="ltr" value={date} min={localDateInput(new Date())} onChange={(e) => setDate(e.target.value)} style={input} /></label>
            <label style={label}>{t("time")}<input type="time" dir="ltr" value={time} onChange={(e) => setTime(e.target.value)} style={input} /></label>
          </div>
          {zone ? <span style={{ fontSize: 12.5, color: MUTED }}>{t("whenNote", { zone })}</span> : null}
        </>
      ) : null}
      <label style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 14, background: "#fff", cursor: "pointer" }}>
        <input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} style={{ width: 22, height: 22, accentColor: RED }} />
        <span style={{ display: "flex", flexDirection: "column", gap: 2 }}><b style={{ fontSize: 14.5 }}>{t("anonymous")}</b><span style={{ fontSize: 12.5, color: MUTED }}>{t("anonymousNote")}</span></span>
      </label>
      <ul style={{ listStyle: "none", margin: 0, padding: "4px 14px", borderRadius: 16, background: "#fff" }}>
        {review.map(([k, v]) => <li key={k} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "11px 0", borderBottom: "1px solid #F0E9DC", fontSize: 14 }}><span style={{ color: MUTED }}>{k}</span><b style={{ textAlign: "end" }}>{v}</b></li>)}
      </ul>
    </section>
  );

  const body: ReactNode = step === 1 ? stepValue : step === 2 ? stepOccasion : step === 3 ? stepCard : stepSend;
  const errorBox = error ? <p role="alert" style={{ margin: 0, padding: "10px 12px", borderRadius: 12, background: "#FBE9E6", color: "#8A1F12", fontSize: 13.5, fontWeight: 700 }}>{error}</p> : null;
  const nextButton = (full: boolean) => (
    <button type="button" onClick={next} disabled={busy} style={{ minHeight: 54, padding: "0 22px", width: full ? "100%" : undefined, borderRadius: 16, border: 0, font: "inherit", fontSize: 16, fontWeight: 800, cursor: busy ? "wait" : "pointer", color: "#fff", background: step === 4 ? BRICK : RED, opacity: busy ? 0.7 : 1 }}>{step === 4 ? t("payAndSend") : t("next")}</button>
  );
  const stepBar = (onDark: boolean) => (
    <ol aria-label={t("stepsLabel")} style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 6 }}>
      {stepNames.map((name, i) => (
        <li key={name}>
          <button type="button" disabled={i + 1 > step} onClick={() => setStep(i + 1)} aria-current={i + 1 === step ? "step" : undefined} style={{ width: "100%", display: "flex", flexDirection: "column", gap: 5, padding: 0, border: 0, background: "transparent", font: "inherit", cursor: i + 1 < step ? "pointer" : "default" }}>
            <span style={{ display: "block", height: 4, borderRadius: 999, background: i + 1 <= step ? GOLD : onDark ? "rgba(255,246,234,.2)" : "#E8DFCF" }} />
            <span style={{ fontSize: 11.5, textAlign: "center", fontWeight: i + 1 === step ? 800 : 500, color: i + 1 === step ? (onDark ? "#FFF6EA" : INK) : onDark ? "#E2C3AC" : MUTED }}>{name}</span>
          </button>
        </li>
      ))}
    </ol>
  );
  const previewNote = preview ? <p role="status" style={{ margin: 0, padding: "10px 12px", borderRadius: 12, background: "#FFF3CD", color: "#6E4410", fontSize: 13 }}>{t("preview")}</p> : null;

  if (!projects.length && !packages.length) {
    return <main dir={dir} style={{ background: CREAM, color: INK, minHeight: "60vh", padding: "48px 16px" }}><div style={{ maxWidth: 640, margin: "0 auto", display: "grid", gap: 12 }}>{previewNote}<h1 style={{ margin: 0 }}>{t("title")}</h1><p style={{ color: MUTED }}>{t("notConfigured")}</p></div></main>;
  }

  /* ── desktop ──────────────────────────────────────────────────────────── */
  if (wide) {
    return (
      <main dir={dir} style={{ background: CREAM, color: INK, paddingBottom: 72 }}>
        <header style={{ background: "radial-gradient(130% 120% at 90% 0%, #AB422F 0%, #7A2419 70%)", color: "#FFF6EA", padding: "40px 28px 72px" }}>
          <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", flexDirection: "column", gap: 18 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}><b style={{ fontSize: 30, fontWeight: 900 }}>{t("title")}</b><span style={{ fontSize: 14, color: "#F1D9C6" }}>{t("stepOf", { n: step, name: stepNames[step - 1] })}</span></div>
            <div style={{ maxWidth: 560 }}>{stepBar(true)}</div>
          </div>
        </header>
        <div style={{ maxWidth: 1200, margin: "-40px auto 0", padding: "0 28px", display: "grid", gridTemplateColumns: "minmax(0, 1fr) 440px", gap: 28, alignItems: "start" }}>
          <div style={{ background: "#fff", borderRadius: 24, padding: 28, boxShadow: "0 20px 50px -30px rgba(42,12,8,.35)", display: "flex", flexDirection: "column", gap: 18 }}>
            {previewNote}
            {body}
            {errorBox}
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, borderTop: `1px solid ${LINE}`, paddingTop: 18 }}>
              {step > 1 ? <button type="button" onClick={back} style={{ ...chip(false), minHeight: 54, padding: "0 22px" }}>{t("back")}</button> : <span />}
              {nextButton(false)}
            </div>
          </div>
          <aside style={{ position: "sticky", top: 120, display: "flex", flexDirection: "column", gap: 12 }}>
            {card(420)}
            {sides}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "14px 18px", borderRadius: 18, background: "#fff", border: `1px solid ${LINE}` }}>
              <span style={{ display: "flex", flexDirection: "column", lineHeight: 1.3 }}><span style={{ fontSize: 12.5, color: MUTED }}>{people > 1 ? t("totalFor", { n: people }) : t("giftValue")}</span><b style={{ fontSize: 26, fontWeight: 900 }}>{money(total)}</b></span>
              {nextButton(false)}
            </div>
          </aside>
        </div>
      </main>
    );
  }

  /* ── phone ────────────────────────────────────────────────────────────── */
  return (
    <main dir={dir} style={{ background: CREAM, color: INK, minHeight: "100vh" }}>
      <header style={{ background: "radial-gradient(130% 120% at 90% 0%, #AB422F 0%, #7A2419 70%)", color: "#FFF6EA", padding: "16px 16px 14px", display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {step > 1 ? <button type="button" onClick={back} aria-label={t("back")} style={{ width: 44, height: 44, borderRadius: 12, border: "1px solid rgba(255,246,234,.25)", background: "transparent", color: "inherit", fontSize: 20, cursor: "pointer" }}>{dir === "rtl" ? "›" : "‹"}</button> : null}
          <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.35 }}><b style={{ fontSize: 19, fontWeight: 900 }}>{t("title")}</b><span style={{ fontSize: 12.5, color: "#F1D9C6" }}>{t("stepOf", { n: step, name: stepNames[step - 1] })}</span></div>
        </div>
        {stepBar(true)}
      </header>
      <div style={{ padding: "16px 16px 130px", display: "flex", flexDirection: "column", gap: 14 }}>
        {previewNote}
        {step === 2 || step === 4 ? mini : null}
        {body}
        {errorBox}
      </div>
      <div style={{ position: "fixed", insetInline: 0, bottom: 0, zIndex: 50, boxShadow: "0 -10px 30px -18px rgba(90,26,16,.35)", padding: "12px 16px calc(14px + env(safe-area-inset-bottom))", background: "rgba(255,255,255,.97)", borderTop: `1px solid ${LINE}`, display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ flex: "1 1 auto", display: "flex", flexDirection: "column", lineHeight: 1.3 }}><span style={{ fontSize: 12, color: MUTED }}>{people > 1 ? t("totalFor", { n: people }) : t("giftValue")}</span><b style={{ fontSize: 22, fontWeight: 900 }}>{money(total)}</b></div>
        {nextButton(false)}
      </div>
    </main>
  );
}
