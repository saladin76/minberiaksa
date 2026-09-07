"use client";

import { useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { miaPath } from "@/lib/minbar/routes";
import { addToCart, type CartFreqKey } from "@/lib/minbar/cart";
import { useMinbarMoney } from "@/hooks/useMinbarMoney";
import type { MinbarProject } from "@/lib/minbar/projects";

/**
 * The sticky donation panel on a project page — ported from the `#pd-aside`
 * block of `Minbar/تفاصيل مشروع.dc.html`.
 *
 * Amount, frequency, and an optional dedication ("give this in someone's name")
 * that produces a thank-you certificate sent by WhatsApp, email, or both.
 *
 * Contract notes carried over:
 *  - only identifiers reach the cart (`projectId`, `freqKey`, numeric amount,
 *    ISO currency) — the displayed title is resolved live from the locale;
 *  - the certificate itself is generated server-side after payment is
 *    confirmed, never in the browser (`DONATION_LOGIC_SPEC §2`). What this panel
 *    collects is the dedication data that will go on it;
 *  - "Donate now" adds to the basket and routes to the cart, the same path as
 *    every other add-to-basket on the site, so the donor always sees their
 *    basket before paying.
 */

const AMOUNTS = [25, 50, 100, 250, 500, 750, 1000, 2500];

const FREQUENCIES: ReadonlyArray<{ id: CartFreqKey; key: string }> = [
  { id: "once", key: "oneTime" },
  { id: "daily", key: "daily" },
  { id: "friday", key: "everyFriday" },
  { id: "monthly", key: "monthly" },
];

/** Note length that fits the certificate's dedication line. */
const NOTE_MAX = 90;

export default function DonationPanel({ project }: { project: MinbarProject }) {
  const locale = useLocale();
  const router = useRouter();
  const t = useTranslations("common");
  const tCart = useTranslations("cart");
  const tProjects = useTranslations("projects");
  const { format, formatNumber } = useMinbarMoney();

  const amounts = project.suggestedAmounts?.length ? project.suggestedAmounts : AMOUNTS;

  const [picked, setPicked] = useState(amounts[0]);
  const [custom, setCustom] = useState("");
  const [freq, setFreq] = useState<CartFreqKey>("once");
  const [giftOpen, setGiftOpen] = useState(false);
  const [giftName, setGiftName] = useState("");
  const [channels, setChannels] = useState<{ whatsapp: boolean; email: boolean }>({
    whatsapp: false,
    email: false,
  });
  const [giftPhone, setGiftPhone] = useState("");
  const [giftEmail, setGiftEmail] = useState("");
  const [giftNote, setGiftNote] = useState("");
  const [showAmount, setShowAmount] = useState(true);
  const [added, setAdded] = useState(false);

  const amount = custom ? Number(custom) : picked;
  const hasFinancials = project.goal != null && project.goal > 0;
  const pct = hasFinancials ? Math.min((project.raised / (project.goal as number)) * 100, 100) : 0;
  const giftReady = giftName.trim().length > 0 && (channels.whatsapp ? giftPhone.trim() : true) && (channels.email ? giftEmail.trim() : true);

  const chip = (active: boolean, height: number, radius: number): CSSProperties => ({
    height,
    padding: height > 38 ? "0 6px" : "0 10px",
    borderRadius: radius,
    border: `1px solid ${active ? "var(--deep)" : "var(--border)"}`,
    background: active ? "var(--deep)" : "#fff",
    color: active ? "#fff" : "var(--muted)",
    fontFamily: "inherit",
    fontSize: height > 38 ? 14 : 13,
    fontWeight: active ? 900 : 800,
    whiteSpace: "nowrap",
    cursor: "pointer",
    transition: "all .18s ease",
  });

  const field: CSSProperties = {
    height: 44,
    padding: "0 14px",
    borderRadius: 10,
    border: "1px solid var(--border)",
    background: "#fff",
    fontFamily: "inherit",
    fontSize: 14.5,
    fontWeight: 800,
    color: "var(--deep)",
    boxSizing: "border-box",
    width: "100%",
  };

  const buildItem = () => ({
    projectId: project.slug,
    title: project.title,
    typeKey: "project" as const,
    freqKey: freq,
    amount,
    currency: "USD",
  });

  const onDonate = () => {
    if (!(amount > 0)) return;
    addToCart(buildItem());
    router.push(miaPath("cart", locale));
  };

  const onAddToBasket = () => {
    if (!(amount > 0)) return;
    addToCart(buildItem());
    setAdded(true);
    window.setTimeout(() => setAdded(false), 2400);
  };

  const onShare = async () => {
    const url = window.location.href;
    if (navigator.share) await navigator.share({ title: project.title, url }).catch(() => {});
    else if (navigator.clipboard) await navigator.clipboard.writeText(url).catch(() => {});
  };

  return (
    <div
      id="pd-aside"
      style={{
        position: "sticky",
        top: 122,
        display: "grid",
        gap: 14,
        padding: 24,
        background: "#fff",
        border: "1px solid var(--border)",
        borderTop: "3px solid var(--red)",
        borderRadius: 14,
        boxShadow: "0 12px 32px rgba(16,33,43,.07)",
      }}
    >
      {hasFinancials ? (
        <div style={{ display: "grid", gap: 9 }}>
          <span style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
            <b dir="ltr" style={{ unicodeBidi: "isolate", fontSize: 25, fontWeight: 900, color: "var(--deep)" }}>
              {format(project.raised)}
            </b>
            <span style={{ fontSize: 12.5, fontWeight: 800, color: "var(--muted)" }}>
              {t("raisedOfGoal", { raised: format(project.raised), goal: format(project.goal as number) })}
            </span>
          </span>
          <span style={{ display: "block", height: 7, borderRadius: 999, background: "rgba(169,52,40,.13)", overflow: "hidden" }}>
            <span style={{ display: "block", height: "100%", borderRadius: 999, width: `${pct}%`, background: "linear-gradient(-90deg, var(--red), var(--gold))" }} />
          </span>
          <span style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 800, color: "var(--muted)" }}>
            <span>{tProjects("pctOfGoal", { pct: formatNumber(Math.round(pct)) })}</span>
          </span>
        </div>
      ) : (
        /* No fixed target: say so plainly rather than drawing a bar against a
           number that does not exist. */
        <span style={{ fontSize: 13, fontWeight: 800, color: "var(--muted)", lineHeight: 1.7 }}>
          {tProjects("noTargetNote")}
        </span>
      )}

      <div style={{ display: "grid", gap: 8 }}>
        <span style={{ fontSize: 11.5, fontWeight: 900, letterSpacing: ".06em", color: "var(--muted)" }}>{tCart("chooseAmount")}</span>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 6 }}>
          {amounts.map((value) => (
            <button
              key={value}
              type="button"
              data-pick={picked === value && !custom ? "1" : ""}
              onClick={() => {
                setPicked(value);
                setCustom("");
              }}
              style={chip(picked === value && !custom, 40, 10)}
            >
              <span dir="ltr" style={{ unicodeBidi: "isolate" }}>
                {format(value)}
              </span>
            </button>
          ))}
        </div>
        <input
          value={custom}
          onChange={(e) => setCustom(e.target.value.replace(/[^0-9]/g, ""))}
          inputMode="decimal"
          placeholder={tCart("customAmountPh")}
          aria-label={tCart("customAmountPh")}
          style={field}
        />
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        <span style={{ fontSize: 11.5, fontWeight: 900, letterSpacing: ".06em", color: "var(--muted)" }}>{t("frequency")}</span>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: 6 }}>
          {FREQUENCIES.map((f) => (
            <button key={f.id} type="button" data-pick={freq === f.id ? "1" : ""} onClick={() => setFreq(f.id)} style={chip(freq === f.id, 36, 999)}>
              {t(f.key)}
            </button>
          ))}
        </div>
      </div>

      {/* ── Dedication ─────────────────────────────────────────────────── */}
      <div style={{ display: "grid", gap: 10, paddingTop: 14, borderTop: "1px solid var(--border)" }}>
        <button
          type="button"
          onClick={() => setGiftOpen((v) => !v)}
          aria-expanded={giftOpen}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 11,
            padding: 12,
            borderRadius: 11,
            border: `1px solid ${giftOpen ? "rgba(211,154,39,.6)" : "var(--border)"}`,
            background: giftOpen ? "var(--sand)" : "#fff",
            cursor: "pointer",
            fontFamily: "inherit",
            width: "100%",
            textAlign: "start",
          }}
        >
          <span style={{ display: "grid", placeItems: "center", width: 36, height: 36, borderRadius: 9, background: "rgba(211,154,39,.16)", border: "1px solid rgba(211,154,39,.45)", flex: "0 0 auto" }}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#8a5d16" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 11h16v9H4zM3 7h18v4H3zM12 7v13" />
              <path d="M12 7S9.5 3.5 7.5 4.6C5.8 5.5 7 7 7 7M12 7s2.5-3.5 4.5-2.4C18.2 5.5 17 7 17 7" />
            </svg>
          </span>
          <span style={{ display: "grid", gap: 2, minWidth: 0, flex: "1 1 auto" }}>
            <b style={{ fontSize: 14, lineHeight: 1.4 }}>{tCart("giftThisDonation")}</b>
            <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {giftName ? tCart("inNameOf", { name: giftName }) : tCart("giftCertHint")}
            </span>
          </span>
          <span aria-hidden="true" style={{ color: "var(--gold)", transform: giftOpen ? "rotate(180deg)" : undefined, transition: "transform .2s ease", flex: "0 0 auto" }}>
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m6 9 6 6 6-6" />
            </svg>
          </span>
        </button>

        {giftOpen ? (
          <div style={{ display: "grid", gap: 12, padding: 16, background: "var(--sand)", border: "1px solid rgba(211,154,39,.42)", borderRadius: 11 }}>
            <span style={{ display: "grid", gap: 5 }}>
              <span style={{ fontSize: 11.5, fontWeight: 900, color: "#8a5d16" }}>{tCart("giftRecipientName")}</span>
              <input value={giftName} onChange={(e) => setGiftName(e.target.value)} placeholder={tCart("certNamePh")} style={field} />
            </span>

            <span style={{ display: "grid", gap: 6 }}>
              <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                <span style={{ fontSize: 11.5, fontWeight: 900, color: "#8a5d16" }}>{tCart("certSendMethod")}</span>
                <span style={{ fontSize: 11, fontWeight: 800, color: "var(--muted)" }}>
                  {channels.whatsapp && channels.email
                    ? tCart("giftBothLong")
                    : channels.whatsapp || channels.email
                      ? tCart("giftSentVia")
                      : tCart("giftChannelChoose")}
                </span>
              </span>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: 6 }}>
                <button
                  type="button"
                  data-pick={channels.whatsapp ? "1" : ""}
                  onClick={() => setChannels((c) => ({ ...c, whatsapp: !c.whatsapp }))}
                  style={{ ...chip(channels.whatsapp, 36, 999), display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, fontSize: 12.5 }}
                >
                  {tCart("sendViaWhatsapp")}
                </button>
                <button
                  type="button"
                  data-pick={channels.email ? "1" : ""}
                  onClick={() => setChannels((c) => ({ ...c, email: !c.email }))}
                  style={{ ...chip(channels.email, 36, 999), display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, fontSize: 12.5 }}
                >
                  {tCart("giftChannelEmail")}
                </button>
              </div>
            </span>

            {channels.whatsapp ? (
              <input
                value={giftPhone}
                onChange={(e) => setGiftPhone(e.target.value)}
                type="tel"
                inputMode="tel"
                /* A phone number is Latin-script data — isolated so bidi cannot
                   reorder its digits inside an Arabic panel. */
                dir="ltr"
                placeholder={tCart("recipientWhatsapp")}
                aria-label={tCart("recipientWhatsapp")}
                style={{ ...field, unicodeBidi: "isolate" }}
              />
            ) : null}
            {channels.email ? (
              <input
                value={giftEmail}
                onChange={(e) => setGiftEmail(e.target.value)}
                type="email"
                dir="ltr"
                placeholder="name@example.com"
                aria-label={tCart("giftChannelEmail")}
                style={{ ...field, unicodeBidi: "isolate" }}
              />
            ) : null}

            <span style={{ display: "grid", gap: 5 }}>
              <span style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
                <span style={{ fontSize: 11.5, fontWeight: 900, color: "#8a5d16" }}>{tCart("giftMessage")}</span>
                <span dir="ltr" style={{ unicodeBidi: "isolate", fontSize: 11, fontWeight: 800, color: "var(--muted)" }}>
                  {giftNote.length}/{NOTE_MAX}
                </span>
              </span>
              <input
                value={giftNote}
                onChange={(e) => setGiftNote(e.target.value.slice(0, NOTE_MAX))}
                maxLength={NOTE_MAX}
                placeholder={tCart("writeYourMessagePh")}
                style={field}
              />
            </span>

            {giftReady ? (
              <span style={{ display: "grid", gap: 6, padding: "12px 14px", background: "#fff", border: "1px solid rgba(31,122,77,.35)", borderInlineStart: "3px solid var(--green)", borderRadius: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 900, color: "var(--green)" }}>{tCart("certPreview")}</span>
                <b style={{ fontSize: 13.5, lineHeight: 1.6 }}>{tCart("inNameOf", { name: giftName })}</b>
                <span style={{ fontSize: 12.5, lineHeight: 1.75, color: "var(--muted)" }}>
                  {giftNote || project.title}
                </span>
              </span>
            ) : null}

            <button
              type="button"
              onClick={() => setShowAmount((v) => !v)}
              aria-pressed={showAmount}
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 13px", background: "#fff", border: "1px solid var(--border)", borderRadius: 9, cursor: "pointer", fontFamily: "inherit", textAlign: "start", width: "100%" }}
            >
              <span
                aria-hidden="true"
                style={{
                  display: "grid",
                  placeItems: "center",
                  width: 20,
                  height: 20,
                  flex: "0 0 auto",
                  borderRadius: 6,
                  border: `1px solid ${showAmount ? "var(--green)" : "var(--border)"}`,
                  background: showAmount ? "var(--green)" : "#fff",
                }}
              >
                {showAmount ? (
                  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m5 12 5 5L19 7" />
                  </svg>
                ) : null}
              </span>
              <span style={{ display: "grid", gap: 2, minWidth: 0 }}>
                <b style={{ fontSize: 13, lineHeight: 1.4 }}>{tCart("showAmountOnCert")}</b>
                <span style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)" }}>
                  {showAmount ? tCart("amountShownNote") : tCart("amountHiddenNote")}
                </span>
              </span>
            </button>

            <span style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 11.5, lineHeight: 1.75, color: "var(--muted)" }}>
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="var(--green)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: "0 0 auto", marginTop: 3 }}>
                <path d="M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6l7-3Z" />
                <path d="m9 12 2 2 4-4" />
              </svg>
              {tCart("giftPrivacyNote")}
            </span>
          </div>
        ) : null}
      </div>

      <span style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
        <span style={{ fontSize: 13, fontWeight: 800, color: "var(--muted)" }}>
          {freq === "once" ? tCart("totalDonation") : tCart("perInstalment")}
        </span>
        <b dir="ltr" style={{ unicodeBidi: "isolate", fontSize: 21, fontWeight: 900, color: "var(--red)" }}>
          {format(amount)}
        </b>
      </span>

      <button
        type="button"
        onClick={onDonate}
        className="mia-card-cta"
        style={{ height: 52, border: 0, borderRadius: 10, background: "var(--red)", color: "#fff", fontFamily: "inherit", fontSize: 16.5, fontWeight: 900, cursor: "pointer", transition: "filter .18s ease" }}
      >
        {t("donateNow")}
      </button>

      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          onClick={onAddToBasket}
          style={{
            flex: "1 1 auto",
            height: 44,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            border: `1px solid ${added ? "var(--green)" : "var(--border)"}`,
            borderRadius: 10,
            background: added ? "rgba(31,122,77,.08)" : "#fff",
            color: added ? "var(--green)" : "var(--deep)",
            fontFamily: "inherit",
            fontSize: 14,
            fontWeight: 900,
            cursor: "pointer",
            transition: "all .18s ease",
          }}
        >
          <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m4 8 2 11h12l2-11H4Z" />
            <path d="m9 8 3-4 3 4M9 12v3M15 12v3" />
          </svg>
          {added ? t("added") : t("addToCart")}
        </button>
        <button
          type="button"
          onClick={onShare}
          title={t("share")}
          aria-label={t("share")}
          className="mia-share-btn"
          style={{ flex: "0 0 auto", width: 44, height: 44, display: "grid", placeItems: "center", border: "1px solid var(--border)", borderRadius: 10, background: "#fff", color: "var(--deep)", cursor: "pointer", transition: "all .18s ease" }}
        >
          <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="18" cy="5" r="3" />
            <circle cx="6" cy="12" r="3" />
            <circle cx="18" cy="19" r="3" />
            <path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" />
          </svg>
        </button>
      </div>

      <span style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 12, fontWeight: 700, color: "var(--muted)", lineHeight: 1.7 }}>
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="var(--green)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: "0 0 auto" }}>
          <path d="M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6l7-3Z" />
          <path d="m9 12 2 2 4-4" />
        </svg>
        {tCart("platformSecure")}
      </span>
    </div>
  );
}
