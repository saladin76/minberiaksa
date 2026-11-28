"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { GiftCard } from "@/lib/donations/gift-order";
import GiftCardView from "./GiftCardView";

const RED = "#7A2419", CREAM = "#FBF6EE", INK = "#1E2530", MUTED = "#5B6574";

/** The recipient's envelope: closed with the giver's name, then the card, the certificate and the project. */
export default function GiftOpen({ locale, waiting, card, recipient, giver, message, giftName, amount, waqf, certificateUrl, projectUrl, giftUrl }: {
  locale: string; waiting: boolean; card: GiftCard; recipient: string; giver: string; message: string; giftName: string; amount: string | null; waqf: boolean; certificateUrl: string; projectUrl: string; giftUrl: string;
}) {
  const t = useTranslations("giftPage");
  const dir = locale === "ar" || locale === "ur" ? "rtl" : "ltr";
  const [open, setOpen] = useState(false), [side, setSide] = useState<"front" | "back">("front");
  const head = card.headline || t(`occasions.${card.occasion}.head`);
  const button = { display: "inline-flex", alignItems: "center", justifyContent: "center", minHeight: 52, padding: "0 20px", borderRadius: 16, font: "inherit", fontSize: 15.5, fontWeight: 800, textDecoration: "none", cursor: "pointer" } as const;
  return (
    <main dir={dir} style={{ minHeight: "100vh", background: `radial-gradient(120% 80% at 50% 0%, #F6E7D2 0%, ${CREAM} 60%)`, color: INK, padding: "32px 16px 64px" }}>
      <div style={{ maxWidth: 460, margin: "0 auto", display: "flex", flexDirection: "column", gap: 18, alignItems: "stretch" }}>
        {waiting ? (
          <section style={{ textAlign: "center", padding: "48px 20px", borderRadius: 24, background: "#fff" }}><h1 style={{ margin: 0, fontSize: 22 }}>{t("openNotYet")}</h1></section>
        ) : !open ? (
          <section style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 18, textAlign: "center" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/minbar/assets/logo-horizontal.png" alt={t("logoAlt")} style={{ height: 40, width: "auto" }} />
            <h1 style={{ margin: 0, fontSize: 26, fontWeight: 900 }}>{t("openHello", { name: recipient })}</h1>
            <p style={{ margin: 0, fontSize: 16, lineHeight: 1.9, color: MUTED }}>{t("openFrom", { name: giver })}</p>
            <button type="button" onClick={() => setOpen(true)} aria-label={t("openButton")} style={{ position: "relative", width: "100%", maxWidth: 360, aspectRatio: "4 / 3", border: 0, borderRadius: 22, cursor: "pointer", background: "radial-gradient(130% 120% at 85% 0%, #AB422F 0%, #7A2419 70%)", boxShadow: "inset 0 0 0 8px #F6D08B55, 0 30px 60px -30px rgba(42,12,8,.75)", overflow: "hidden" }}>
              <svg aria-hidden="true" viewBox="0 0 360 270" width="100%" height="100%" style={{ position: "absolute", inset: 0 }}><path d="M0 0 L180 140 L360 0" fill="none" stroke="#F6D08B" strokeWidth="2" opacity=".8" /><path d="M0 270 L150 120 M360 270 L210 120" fill="none" stroke="#F6D08B" strokeWidth="1.2" opacity=".45" /></svg>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/minbar/assets/cert-seal-alpha.png" alt="" width={88} height={88} style={{ position: "absolute", left: "50%", top: "52%", transform: "translate(-50%, -50%)", filter: "drop-shadow(0 6px 12px rgba(0,0,0,.35))" }} />
            </button>
            <button type="button" onClick={() => setOpen(true)} style={{ ...button, border: 0, background: RED, color: "#fff", width: "100%", maxWidth: 360 }}>{t("openButton")}</button>
          </section>
        ) : (
          <section style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <GiftCardView height={520} card={card} head={head} to={recipient} message={message} giftName={giftName} sign={giver} side={side} showValue={Boolean(amount)}
              kicker={card.occasion === "memory" ? t("memoryKicker") : t("cardKicker")}
              labels={{ to: t("cardTo"), from: t("cardFrom"), wishes: t("cardWishes"), about: t("aboutGift"), value: t("valueLine", { amount: amount ?? "" }), backNote: waqf ? t("backNoteWaqf") : t("backNote"), number: "", logo: t("logoAlt"), seal: t("sealAlt") }} />
            <div role="tablist" aria-label={t("sidesLabel")} style={{ display: "flex", justifyContent: "center", gap: 8 }}>
              {(["front", "back"] as const).map((s) => <button key={s} type="button" role="tab" aria-selected={side === s} onClick={() => setSide(s)} style={{ minHeight: 40, padding: "0 14px", borderRadius: 999, font: "inherit", fontSize: 13.5, fontWeight: 700, cursor: "pointer", ...(side === s ? { background: RED, color: "#FFF6EA", border: `1.5px solid ${RED}` } : { background: "#fff", color: INK, border: "1.5px solid #E8DFCF" }) }}>{s === "front" ? t("front") : t("backSide")}</button>)}
            </div>
            <a href={certificateUrl} style={{ ...button, background: RED, color: "#fff" }}>{waqf ? t("openCertWaqf") : t("openCert")}</a>
            <a href={projectUrl} style={{ ...button, background: "#fff", color: INK, border: "1.5px solid #E8DFCF" }}>{t("openProject")}</a>
            <a href={giftUrl} style={{ ...button, background: "transparent", color: "#8C5512", border: "1.5px dashed #CD8B2B" }}>{t("openGiftBack")}</a>
          </section>
        )}
      </div>
    </main>
  );
}
