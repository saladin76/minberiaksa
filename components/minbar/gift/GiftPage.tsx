"use client";

import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { addToCart } from "@/lib/minbar/cart";
import { miaPath } from "@/lib/minbar/routes";
import type { GiftCard } from "@/lib/donations/gift-order";
import { CARD_THEMES, GIFT_ICON_PATHS, PAGE_OCCASIONS, giftCartItems, giftDraftProblem, themesFor, waqfUnitsFor, type GiftChoice, type GiftRecipientDraft } from "@/lib/minbar/gift-page";
import GiftCardView from "./GiftCardView";

type Occasion = GiftCard["occasion"];
export type GiftCatalog = {
  amounts: number[];
  waqf: { share: number | null; meter: number | null; intentions: Occasion[]; max: number };
  impact: { id: string; slug: string; project: string; name: string; note: string; icon: string; intentions: Occasion[] }[];
  open: { slug: string; title: string } | null;
};
type Item = { key: string; kind: "waqf" | "impact" | "open"; name: string; note: string; icon: string; badge: string; intentions: Occasion[]; unit?: "share" | "meter"; price?: number; slug?: string; project?: string };

const RED = "#7A2419", BRICK = "#AB422F", GOLD = "#CD8B2B", CREAM = "#FBF6EE", INK = "#1E2530", MUTED = "#5B6574", LINE = "#E8DFCF";
const SERIF = "Amiri, 'Noto Naskh Arabic', 'Traditional Arabic', serif";
const STEP_KEYS = ["intention", "gift", "card", "send"] as const;
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
 * The gift page (design: canvas "صفحة الإهداء"). Four steps — intention and value, gift, card,
 * delivery — on the phone with a bottom bar; on desktop beside a live card. The intention suggests
 * gifts; waqf gifts become waqf rows (waqf certificate in the recipient's name), the others project
 * rows. One basket row per recipient, paid through the ordinary checkout.
 */
export default function GiftPage({ locale, preview, catalog }: { locale: string; preview: boolean; catalog: GiftCatalog }) {
  const t = useTranslations("giftPage");
  const router = useRouter();
  const dir = locale === "ar" || locale === "ur" ? "rtl" : "ltr";
  const [wide, setWide] = useState(false);
  const [step, setStep] = useState(1);
  const [occasion, setOccasion] = useState<Occasion>("none");
  const [pick, setPick] = useState<number | null>(catalog.amounts.length ? 0 : null), [custom, setCustom] = useState("");
  const [giftKey, setGiftKey] = useState<string | null>(null);
  const [theme, setTheme] = useState<GiftCard["theme"]>("dome"), [accent, setAccent] = useState<0 | 1 | 2>(0);
  const [layout, setLayout] = useState<NonNullable<GiftCard["layout"]>>("classic"), [pattern, setPattern] = useState(true);
  const [font, setFont] = useState<GiftCard["font"]>("naskh"), [size, setSize] = useState<NonNullable<GiftCard["size"]>>("m");
  const [showLogo, setShowLogo] = useState(true), [showSeal, setShowSeal] = useState(true);
  const [headline, setHeadline] = useState(""), [customHead, setCustomHead] = useState(false);
  const [side, setSide] = useState<"front" | "back">("front"), [tab, setTab] = useState<"design" | "text" | "names">("design");
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

  const items: Item[] = useMemo(() => [
    ...(catalog.waqf.share ? [{ key: "waqf-share", kind: "waqf" as const, unit: "share" as const, price: catalog.waqf.share, name: t("waqfShare"), note: t("waqfShareNote"), icon: GIFT_ICON_PATHS.waqf, badge: t("badgeWaqf"), intentions: catalog.waqf.intentions }] : []),
    ...(catalog.waqf.meter ? [{ key: "waqf-meter", kind: "waqf" as const, unit: "meter" as const, price: catalog.waqf.meter, name: t("waqfMeter"), note: t("waqfMeterNote"), icon: GIFT_ICON_PATHS.meter, badge: t("badgeWaqf"), intentions: catalog.waqf.intentions }] : []),
    ...catalog.impact.map((g) => ({ key: "impact-" + g.id, kind: "impact" as const, slug: g.slug, project: g.project, name: g.name, note: g.note, icon: GIFT_ICON_PATHS[g.icon] ?? GIFT_ICON_PATHS.gift, badge: t("badgeGift"), intentions: g.intentions })),
    ...(catalog.open ? [{ key: "open", kind: "open" as const, slug: catalog.open.slug, project: catalog.open.title, name: t("openName"), note: t("openNote"), icon: GIFT_ICON_PATHS.open, badge: t("badgeGift"), intentions: [] as Occasion[] }] : []),
  ], [catalog, t]);
  const suggested = items.filter((i) => i.intentions.includes(occasion));
  const others = items.filter((i) => !i.intentions.includes(occasion));
  const item = items.find((i) => i.key === giftKey) ?? null;

  const value = Number(custom) || (pick !== null ? catalog.amounts[pick] ?? 0 : 0);
  const waqfCount = item?.kind === "waqf" && item.price ? waqfUnitsFor(value, item.price, catalog.waqf.max) : 0;
  const unit = item?.kind === "waqf" && item.price ? waqfCount * item.price : value;
  const adjusted = item?.kind === "waqf" && value > 0 && unit !== value;
  const named = recipients.filter((r) => r.name.trim());
  const people = named.length || 1, total = Math.round(unit * people * 100) / 100;

  const themeIds = themesFor(occasion), themeId = themeIds.includes(theme) ? theme : themeIds[0], look = CARD_THEMES[themeId];
  const presetMessages = [t(`occasions.${occasion}.msg1`), t(`occasions.${occasion}.msg2`)];
  const text = message ?? presetMessages[msgIndex] ?? presetMessages[0];
  const giftName = !item ? t("pickGift") : item.kind === "waqf" ? `${item.name}${waqfCount > 1 ? " × " + waqfCount : ""}` : item.kind === "open" ? t("openShort") : item.name;
  const first = named[0]?.name.trim() || t("recipientFallback");
  const to = people > 1 ? t("andOthers", { name: first, n: people - 1 }) : first;
  const head = customHead && headline.trim() ? headline.trim() : t(`occasions.${occasion}.head`);
  const sendAt = when === "date" && date && time ? new Date(`${date}T${time}`) : null;
  const stepNames = STEP_KEYS.map((k) => t(`steps.${k}`));
  const card: GiftCard = { occasion, theme: themeId, accent, font, signature: signature.trim() || null, anonymous, layout, pattern, size, headline: customHead && headline.trim() ? headline.trim() : null, showLogo, showSeal };

  const pickOccasion = (id: Occasion) => { const o = PAGE_OCCASIONS.find((x) => x.id === id)!; setOccasion(id); setTheme(o.theme); setAccent(0); setMsgIndex(0); setMessage(null); };
  const choice = (): GiftChoice | null => {
    if (!item) return null;
    if (item.kind === "waqf" && item.unit && item.price) return { kind: "waqf", unit: item.unit, count: waqfCount, unitPriceUSD: item.price, title: item.name };
    return { kind: "project", slug: item.slug ?? "", title: item.kind === "impact" ? item.name : item.project ?? "", valueUSD: value };
  };

  function next() {
    if (step === 1 && !(value >= 1)) return setError(t("errors.amount"));
    if (step === 2) {
      if (!item) return setError(t("errors.gift"));
    }
    if (step === 3 && !named.length) return setError(t("errors.name"));
    if (step === 1 && !giftKey) setGiftKey(suggested[0]?.key ?? items[0]?.key ?? null);
    if (step < 4) { setStep(step + 1); window.scrollTo({ top: 0, behavior: "smooth" }); return; }
    const c = choice();
    if (!c) return setError(t("errors.gift"));
    const draft = { choice: c, recipients, message: text, showAmount, card, giverName: anonymous ? t("anonymousName") : signature.trim() || t("anonymousName"), whatsapp: wa, email: mail, sendAt };
    const problem = giftDraftProblem(draft);
    if (problem) return setError(t(`errors.${problem.code}`, { name: problem.recipient ?? "" }));
    try {
      setBusy(true);
      for (const row of giftCartItems(draft)) addToCart(row);
      router.push(miaPath("cart", locale));
    } catch { setBusy(false); setError(t("errors.generic")); }
  }
  const back = () => setStep((s) => Math.max(1, s - 1));

  const cardView = (height: number) => (
    <GiftCardView height={height} card={card} head={head} to={to} message={text} giftName={giftName} sign={anonymous ? t("anonymousName") : signature.trim() || "—"}
      kicker={occasion === "memory" ? t("memoryKicker") : t("cardKicker")} side={side} labels={{ to: t("cardTo"), from: t("cardFrom"), wishes: t("cardWishes"), about: t("aboutGift"), value: t("valueLine", { amount: money(unit) }), backNote: item?.kind === "waqf" ? t("backNoteWaqf") : t("backNote"), number: t("backNumber"), logo: t("logoAlt"), seal: t("sealAlt") }}
      showValue={showAmount} />
  );
  const sides = (
    <div role="tablist" aria-label={t("sidesLabel")} style={{ display: "flex", justifyContent: "center", gap: 8 }}>
      {(["front", "back"] as const).map((s) => <button key={s} type="button" role="tab" aria-selected={side === s} onClick={() => setSide(s)} style={chip(side === s)}>{s === "front" ? t("front") : t("backSide")}</button>)}
    </div>
  );

  /* ── step 1: intention and value ──────────────────────────────────────── */
  const valueBox = (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: 14, borderRadius: 18, background: "#FBEEDC", border: "1.5px solid #E9CFA3" }}>
      <b style={{ fontSize: 15 }}>{t("valueTitle")}</b>
      {catalog.amounts.length ? (
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${wide ? 4 : 2}, minmax(0, 1fr))`, gap: 8 }}>
          {catalog.amounts.map((v, i) => { const on = !custom && pick === i; return <button key={v} type="button" aria-pressed={on} onClick={() => { setPick(i); setCustom(""); }} style={{ minHeight: 52, borderRadius: 14, font: "inherit", fontSize: 17, fontWeight: 800, cursor: "pointer", ...sel(on) }}>{money(v)}</button>; })}
        </div>
      ) : null}
      <label style={label}>{t("otherValue")}<input inputMode="numeric" dir="ltr" value={custom} onChange={(e) => setCustom(e.target.value.replace(/[^\d]/g, "").slice(0, 7))} style={input} /></label>
    </div>
  );
  const stepIntention = (
    <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <h1 style={{ margin: 0, fontSize: wide ? 28 : 23, fontWeight: 900, textAlign: wide ? "start" : "center" }}>{t("intentionTitle")}</h1>
      <p style={{ margin: "0 0 4px", fontSize: 14, lineHeight: 1.8, color: MUTED, textAlign: wide ? "start" : "center" }}>{t("intentionSub")}</p>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${wide ? 5 : 3}, minmax(0, 1fr))`, gap: 8 }}>
        {PAGE_OCCASIONS.map((o) => { const on = o.id === occasion; return (
          <button key={o.id} type="button" aria-pressed={on} onClick={() => pickOccasion(o.id)} style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, minHeight: 100, padding: 6, borderRadius: 18, font: "inherit", cursor: "pointer", background: "#fff", color: INK, border: `2px solid ${on ? o.tint : "#EEE6D8"}`, boxShadow: on ? `0 12px 24px -16px ${o.tint}` : "none" }}>
            <span style={{ width: 46, height: 46, borderRadius: 14, display: "grid", placeItems: "center", color: on ? "#fff" : o.tint, background: on ? o.tint : o.tint + "1A" }}><Icon d={o.icon} size={24} /></span>
            <span style={{ fontSize: 13.5, fontWeight: 800, textAlign: "center" }}>{t(`occasions.${o.id}.label`)}</span>
          </button>
        ); })}
      </div>
      {valueBox}
    </section>
  );

  /* ── step 2: the gift ─────────────────────────────────────────────────── */
  const giftCardButton = (g: Item) => {
    const on = g.key === giftKey;
    const price = g.kind === "waqf" && g.price ? money(g.price) + " / " + (g.unit === "meter" ? t("perMeter") : t("perShare")) : money(value || 0);
    return (
      <button key={g.key} type="button" aria-pressed={on} onClick={() => setGiftKey(g.key)} style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 6, minHeight: 172, padding: 14, borderRadius: 20, font: "inherit", cursor: "pointer", textAlign: "start", boxSizing: "border-box", ...(on ? { background: "radial-gradient(130% 120% at 85% 0%, #AB422F 0%, #7A2419 70%)", color: "#FFF6EA", border: `2px solid ${GOLD}`, boxShadow: "0 18px 34px -20px rgba(122,36,25,.8)" } : { background: "#fff", color: INK, border: `2px ${g.kind === "open" ? "dashed #E0D3BC" : "solid #EEE6D8"}` }) }}>
        <span style={{ width: 44, height: 44, borderRadius: 14, display: "grid", placeItems: "center", ...(on ? { background: "rgba(246,208,139,.18)", color: "#F6D08B" } : { background: "#F5EFE3", color: "#8C5512" }) }}><Icon d={g.icon} /></span>
        <b style={{ fontSize: 15.5, lineHeight: 1.35 }}>{g.name}</b>
        {g.note ? <span style={{ fontSize: 12, lineHeight: 1.6, color: on ? "#F1D9C6" : MUTED }}>{g.note}</span> : null}
        <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, width: "100%", marginTop: "auto" }}>
          <b style={{ fontSize: 15 }}>{price}</b>
          <span style={{ fontSize: 11, fontWeight: 800, padding: "4px 8px", borderRadius: 999, whiteSpace: "nowrap", ...(on ? { background: "#F6D08B", color: "#5E1A12" } : g.kind === "waqf" ? { background: RED, color: "#F6D08B" } : { background: "#FBEEDC", color: "#8C5512" }) }}>{g.badge}</span>
        </span>
      </button>
    );
  };
  const grid = (list: Item[]) => <div style={{ display: "grid", gridTemplateColumns: `repeat(${wide ? 3 : 2}, minmax(0, 1fr))`, gap: 10 }}>{list.map(giftCardButton)}</div>;
  const stepGift = (
    <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <h1 style={{ margin: 0, fontSize: 23, fontWeight: 900 }}>{t("giftTitle")}</h1>
      {suggested.length ? <><span style={{ fontSize: 14, fontWeight: 900, color: "#8C5512" }}>{t("suggestedFor", { intention: t(`occasions.${occasion}.label`) })}</span>{grid(suggested)}</> : null}
      {others.length ? <><span style={{ fontSize: 14, fontWeight: 900, color: "#8C5512", marginTop: 4 }}>{suggested.length ? t("otherGifts") : t("allGifts")}</span>{grid(others)}</> : null}
      {adjusted ? <p role="status" style={{ margin: 0, padding: "10px 12px", borderRadius: 12, background: "#FBEEDC", color: "#6E4410", fontSize: 13.5, lineHeight: 1.7 }}>{t("waqfAdjusted", { value: money(value), total: money(unit), count: waqfCount, unit: item?.unit === "meter" ? t("perMeter") : t("perShare") })}</p> : null}
    </section>
  );

  /* ── step 3: the card ─────────────────────────────────────────────────── */
  const designTab = (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div role="radiogroup" aria-label={t("themesLabel")} style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
        {themeIds.map((id) => <button key={id} type="button" role="radio" aria-checked={themeId === id} onClick={() => { setTheme(id); setAccent(0); }} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "8px 4px", borderRadius: 14, font: "inherit", cursor: "pointer", background: "#fff", border: `2px solid ${themeId === id ? RED : LINE}` }}><span style={{ width: "100%", height: 40, borderRadius: 10, border: "1px solid #EEE6D8", background: CARD_THEMES[id].bg[0] }} /><span style={{ fontSize: 12, fontWeight: 700 }}>{t(`themes.${id}`)}</span></button>)}
      </div>
      <span role="radiogroup" aria-label={t("color")} style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ fontSize: 13, fontWeight: 700, minWidth: 64 }}>{t("color")}</span>
        {([0, 1, 2] as const).map((i) => <button key={i} type="button" role="radio" aria-checked={accent === i} aria-label={t("colorN", { n: i + 1 })} onClick={() => setAccent(i)} style={{ width: 44, height: 44, borderRadius: "50%", cursor: "pointer", background: look.bg[i], border: `3px solid ${accent === i ? INK : "#fff"}`, boxShadow: `0 0 0 1px ${LINE}, inset 0 0 0 6px ${look.accent[i]}` }} />)}
      </span>
      <span role="radiogroup" aria-label={t("layout")} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6 }}><span style={{ fontSize: 13, fontWeight: 700, minWidth: 64 }}>{t("layout")}</span>
        {(["classic", "center", "minimal"] as const).map((l) => <button key={l} type="button" role="radio" aria-checked={layout === l} onClick={() => setLayout(l)} style={chip(layout === l)}>{t(`layouts.${l}`)}</button>)}
      </span>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "12px 14px", borderRadius: 14, background: "#fff" }}>
        {([[pattern, setPattern, t("pattern")], [showLogo, setShowLogo, t("showLogo")], [showSeal, setShowSeal, t("showSeal")]] as const).map(([v, setV, name]) => (
          <label key={name} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, cursor: "pointer" }}><input type="checkbox" checked={v} onChange={(e) => setV(e.target.checked)} style={{ width: 20, height: 20, accentColor: RED }} />{name}</label>
        ))}
      </div>
    </div>
  );
  const textTab = (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <span style={{ fontSize: 13.5, fontWeight: 700 }}>{t("headlineTitle")}</span>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        <button type="button" aria-pressed={!customHead} onClick={() => setCustomHead(false)} style={chip(!customHead)}>{t(`occasions.${occasion}.head`)}</button>
        <button type="button" aria-pressed={customHead} onClick={() => setCustomHead(true)} style={chip(customHead)}>{t("headlineOwn")}</button>
      </div>
      {customHead ? <input aria-label={t("headlineTitle")} placeholder={t("headlinePlaceholder")} maxLength={40} value={headline} onChange={(e) => setHeadline(e.target.value)} style={input} /> : null}
      <span role="radiogroup" aria-label={t("font")} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6 }}><span style={{ fontSize: 13, fontWeight: 700, minWidth: 52 }}>{t("font")}</span>
        {(["naskh", "ruqaa", "modern"] as const).map((f) => <button key={f} type="button" role="radio" aria-checked={font === f} onClick={() => setFont(f)} style={{ ...chip(font === f), ...(f !== "modern" ? { fontFamily: f === "ruqaa" ? "'Aref Ruqaa', " + SERIF : SERIF, fontSize: 16 } : {}) }}>{t(`fonts.${f}`)}</button>)}
      </span>
      <span role="radiogroup" aria-label={t("size")} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6 }}><span style={{ fontSize: 13, fontWeight: 700, minWidth: 52 }}>{t("size")}</span>
        {(["s", "m", "l"] as const).map((z) => <button key={z} type="button" role="radio" aria-checked={size === z} onClick={() => setSize(z)} style={chip(size === z)}>{t(`sizes.${z}`)}</button>)}
      </span>
      <span style={{ fontSize: 13.5, fontWeight: 700 }}>{t("readyMessage")}</span>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {presetMessages.map((m, i) => { const on = message === null && msgIndex === i; return <button key={i} type="button" aria-pressed={on} onClick={() => { setMsgIndex(i); setMessage(null); }} style={{ textAlign: "start", padding: "10px 12px", borderRadius: 12, font: "inherit", fontSize: 13, lineHeight: 1.6, cursor: "pointer", ...(on ? { background: "#FBEEDC", border: `1.5px solid ${GOLD}`, color: "#4A3B1C" } : { background: "#fff", border: `1.5px solid ${LINE}`, color: INK }) }}>{m}</button>; })}
      </div>
      <label style={label}>{t("writeMessage")}<textarea rows={3} maxLength={600} value={text} onChange={(e) => setMessage(e.target.value)} style={{ ...input, padding: "12px 14px", fontSize: 15, lineHeight: 1.8, resize: "vertical" }} /></label>
    </div>
  );
  const namesTab = (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
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
    </div>
  );
  const stepCard = (
    <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <h1 style={{ margin: 0, fontSize: 23, fontWeight: 900 }}>{t("cardTitle")}</h1>
      {!wide ? <>{cardView(470)}{sides}</> : null}
      {wide ? <>{designTab}{textTab}{namesTab}</> : (
        <>
          <div role="tablist" aria-label={t("tabsLabel")} style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 6, padding: 4, borderRadius: 14, background: "#EDE5D6" }}>
            {(["design", "text", "names"] as const).map((k) => <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} style={{ minHeight: 42, borderRadius: 10, border: 0, font: "inherit", fontSize: 14, fontWeight: 800, cursor: "pointer", ...(tab === k ? { background: "#fff", color: INK, boxShadow: "0 2px 8px rgba(90,26,16,.12)" } : { background: "transparent", color: MUTED }) }}>{t(`tabs.${k}`)}</button>)}
          </div>
          {tab === "design" ? designTab : tab === "text" ? textTab : namesTab}
        </>
      )}
    </section>
  );

  /* ── step 4: delivery ─────────────────────────────────────────────────── */
  const review: [string, string][] = [
    [t("review.intention"), t(`occasions.${occasion}.label`)],
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

  const body: ReactNode = step === 1 ? stepIntention : step === 2 ? stepGift : step === 3 ? stepCard : stepSend;
  const errorBox = error ? <p role="alert" style={{ margin: 0, padding: "10px 12px", borderRadius: 12, background: "#FBE9E6", color: "#8A1F12", fontSize: 13.5, fontWeight: 700 }}>{error}</p> : null;
  const nextButton = (
    <button type="button" onClick={next} disabled={busy} style={{ minHeight: 54, padding: "0 22px", borderRadius: 16, border: 0, font: "inherit", fontSize: 16, fontWeight: 800, cursor: busy ? "wait" : "pointer", color: "#fff", background: step === 4 ? BRICK : RED, opacity: busy ? 0.7 : 1 }}>{step === 4 ? t("payAndSend") : t("next")}</button>
  );
  const stepBar = (
    <ol aria-label={t("stepsLabel")} style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 6 }}>
      {stepNames.map((name, i) => (
        <li key={name}>
          <button type="button" disabled={i + 1 > step} onClick={() => setStep(i + 1)} aria-current={i + 1 === step ? "step" : undefined} style={{ width: "100%", display: "flex", flexDirection: "column", gap: 5, padding: 0, border: 0, background: "transparent", font: "inherit", cursor: i + 1 < step ? "pointer" : "default" }}>
            <span style={{ display: "block", height: 4, borderRadius: 999, background: i + 1 <= step ? GOLD : "rgba(255,246,234,.2)" }} />
            <span style={{ fontSize: 11.5, textAlign: "center", fontWeight: i + 1 === step ? 800 : 500, color: i + 1 === step ? "#FFF6EA" : "#E2C3AC" }}>{name}</span>
          </button>
        </li>
      ))}
    </ol>
  );
  const totalBox = (big: boolean) => (
    <span style={{ display: "flex", flexDirection: "column", lineHeight: 1.3 }}><span style={{ fontSize: 12.5, color: MUTED }}>{people > 1 ? t("totalFor", { n: people }) : t("giftValue")}</span><b style={{ fontSize: big ? 26 : 22, fontWeight: 900 }}>{total > 0 ? money(total) : "—"}</b></span>
  );
  const previewNote = preview ? <p role="status" style={{ margin: 0, padding: "10px 12px", borderRadius: 12, background: "#FFF3CD", color: "#6E4410", fontSize: 13 }}>{t("preview")}</p> : null;

  if (!items.length) {
    return <main dir={dir} style={{ background: CREAM, color: INK, minHeight: "60vh", padding: "48px 16px" }}><div style={{ maxWidth: 640, margin: "0 auto", display: "grid", gap: 12 }}>{previewNote}<h1 style={{ margin: 0 }}>{t("title")}</h1><p style={{ color: MUTED }}>{t("notConfigured")}</p></div></main>;
  }

  if (wide) {
    return (
      <main dir={dir} style={{ background: CREAM, color: INK, paddingBottom: 72 }}>
        <header style={{ background: "radial-gradient(120% 140% at 12% 0%, #AB422F 0%, #7A2419 60%)", color: "#FFF6EA", padding: "44px 28px 80px" }}>
          <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", flexDirection: "column", gap: 14 }}>
            <span style={{ alignSelf: "flex-start", padding: "6px 14px", borderRadius: 999, border: "1px solid rgba(246,208,139,.5)", color: "#F6D08B", fontSize: 13.5, fontWeight: 700 }}>{t("badge")}</span>
            <h1 style={{ margin: 0, fontSize: 44, lineHeight: 1.2, fontWeight: 900 }}>{t("heroTitle")}</h1>
            <p style={{ margin: 0, maxWidth: "60ch", fontSize: 17, lineHeight: 1.9, color: "#F6E3D4" }}>{t("heroSub")}</p>
            <div style={{ maxWidth: 560, marginTop: 6 }}>{stepBar}</div>
          </div>
        </header>
        <div style={{ maxWidth: 1200, margin: "-44px auto 0", padding: "0 28px", display: "grid", gridTemplateColumns: "minmax(0, 1fr) 440px", gap: 28, alignItems: "start" }}>
          <div style={{ background: "#fff", borderRadius: 24, padding: 28, boxShadow: "0 20px 50px -30px rgba(42,12,8,.35)", display: "flex", flexDirection: "column", gap: 18 }}>
            {previewNote}{body}{errorBox}
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, borderTop: `1px solid ${LINE}`, paddingTop: 18 }}>
              {step > 1 ? <button type="button" onClick={back} style={{ ...chip(false), minHeight: 54, padding: "0 22px" }}>{t("back")}</button> : <span />}
              {nextButton}
            </div>
          </div>
          <aside style={{ position: "sticky", top: 120, display: "flex", flexDirection: "column", gap: 12 }}>
            {cardView(540)}{sides}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "14px 18px", borderRadius: 18, background: "#fff", border: `1px solid ${LINE}` }}>{totalBox(true)}{nextButton}</div>
          </aside>
        </div>
      </main>
    );
  }

  return (
    <main dir={dir} style={{ background: CREAM, color: INK, minHeight: "100vh" }}>
      <header style={{ background: "radial-gradient(130% 120% at 90% 0%, #AB422F 0%, #7A2419 70%)", color: "#FFF6EA", padding: "16px 16px 14px", display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {step > 1 ? <button type="button" onClick={back} aria-label={t("back")} style={{ width: 44, height: 44, borderRadius: 12, border: "1px solid rgba(255,246,234,.25)", background: "transparent", color: "inherit", fontSize: 20, cursor: "pointer" }}>{dir === "rtl" ? "›" : "‹"}</button> : null}
          <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.35 }}><b style={{ fontSize: 19, fontWeight: 900 }}>{t("title")}</b><span style={{ fontSize: 12.5, color: "#F1D9C6" }}>{t("stepOf", { n: step, name: stepNames[step - 1] })}</span></div>
        </div>
        {stepBar}
      </header>
      <div style={{ padding: "16px 16px 130px", display: "flex", flexDirection: "column", gap: 14 }}>
        {previewNote}
        {step === 4 ? <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 16, background: look.bg[accent], color: look.ink }}><span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}><b style={{ fontSize: 14 }}>{head} · {to}</b><span style={{ fontSize: 12, opacity: 0.85, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{giftName}</span></span><b style={{ marginInlineStart: "auto", fontSize: 15 }}>{money(total)}</b></div> : null}
        {body}
        {errorBox}
      </div>
      <div style={{ position: "fixed", insetInline: 0, bottom: 0, zIndex: 50, boxShadow: "0 -10px 30px -18px rgba(90,26,16,.35)", padding: "12px 16px calc(14px + env(safe-area-inset-bottom))", background: "rgba(255,255,255,.97)", borderTop: `1px solid ${LINE}`, display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ flex: "1 1 auto" }}>{totalBox(false)}</div>
        {nextButton}
      </div>
    </main>
  );
}
