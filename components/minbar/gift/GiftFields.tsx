"use client";
import { useEffect, useState, type CSSProperties } from "react";
import { useTranslations } from "next-intl";
import { parseGiftOrder } from "@/lib/donations/gift-order";

/** What a basket line stores for a gift (same shape as a project gift, see lib/minbar/cart.ts). */
export type GiftDraft = {
  recipientName: string;
  recipientPhone: string;
  recipientEmail: string;
  message: string;
  channels: Array<"whatsapp" | "email">;
  showAmount: boolean;
};
export type GiftState = { configured: boolean; ready: boolean; value: GiftDraft | null };

const NOTE_MAX = 90;
const field: CSSProperties = { height: 42, padding: "0 12px", borderRadius: 8, border: "1px solid var(--border)", background: "#fff", fontFamily: "inherit", fontSize: 14, fontWeight: 700, color: "var(--deep)", width: "100%", boxSizing: "border-box" };
const chip = (active: boolean): CSSProperties => ({ height: 36, padding: "0 10px", borderRadius: 999, border: `1px solid ${active ? "var(--gold)" : "var(--border)"}`, background: active ? "rgba(211,154,39,.14)" : "#fff", color: active ? "#8a5d16" : "var(--muted)", fontFamily: "inherit", fontWeight: 800, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, fontSize: 12.5 });
const label: CSSProperties = { fontSize: 11.5, fontWeight: 900, color: "#8a5d16" };

/**
 * The dedication form: the same texts, checks and look as the project gift (DonationPanel), so a
 * donor sees one way of gifting across the site. Reports its state on every change; only a
 * complete gift (a name, and contact details for each chosen channel) is "ready".
 */
export default function GiftFields({ onChange, showError, previewLine }: { onChange: (s: GiftState) => void; showError: boolean; previewLine: string }) {
  const tCart = useTranslations("cart");
  const tGift = useTranslations("Gift");
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [channels, setChannels] = useState({ whatsapp: false, email: false });
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [showAmount, setShowAmount] = useState(true);

  const configured = open || Boolean(name.trim()) || channels.whatsapp || channels.email;
  const parsed = parseGiftOrder({ recipientName: name, recipientPhone: channels.whatsapp ? phone : null, recipientEmail: channels.email ? email : null,
    channels: [...(channels.whatsapp ? ["WHATSAPP"] : []), ...(channels.email ? ["EMAIL"] : [])] });
  const ready = parsed.ok && parsed.gift !== null;

  useEffect(() => {
    onChange({ configured, ready, value: ready ? {
      recipientName: name.trim(), recipientPhone: channels.whatsapp ? phone.trim() : "", recipientEmail: channels.email ? email.trim() : "",
      message: note.trim(), channels: [...(channels.whatsapp ? ["whatsapp" as const] : []), ...(channels.email ? ["email" as const] : [])], showAmount,
    } : null });
  }, [configured, ready, name, channels, phone, email, note, showAmount, onChange]);

  return (
    <div style={{ display: "grid", gap: 10, paddingTop: 14, borderTop: "1px solid var(--border)" }}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
        style={{ display: "flex", alignItems: "center", gap: 11, padding: 12, borderRadius: 11, border: `1px solid ${open ? "rgba(211,154,39,.6)" : "var(--border)"}`, background: open ? "var(--sand)" : "#fff", cursor: "pointer", fontFamily: "inherit", width: "100%", textAlign: "start" }}>
        <span style={{ display: "grid", placeItems: "center", width: 36, height: 36, borderRadius: 9, background: "rgba(211,154,39,.16)", border: "1px solid rgba(211,154,39,.45)", flex: "0 0 auto" }}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#8a5d16" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 11h16v9H4zM3 7h18v4H3zM12 7v13" /><path d="M12 7S9.5 3.5 7.5 4.6C5.8 5.5 7 7 7 7M12 7s2.5-3.5 4.5-2.4C18.2 5.5 17 7 17 7" />
          </svg>
        </span>
        <span style={{ display: "grid", gap: 2, minWidth: 0, flex: "1 1 auto" }}>
          <b style={{ fontSize: 14, lineHeight: 1.4 }}>{tCart("giftThisDonation")}</b>
          <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {name ? tCart("inNameOf", { name }) : tCart("giftCertHint")}
          </span>
        </span>
      </button>
      {showError && configured && !ready ? <p role="alert" style={{ color: "#a93428", fontSize: 13, margin: 0 }}>{tGift("validationError")}</p> : null}
      {open ? (
        <div style={{ display: "grid", gap: 12, padding: 16, background: "var(--sand)", border: "1px solid rgba(211,154,39,.42)", borderRadius: 11 }}>
          <span style={{ display: "grid", gap: 5 }}>
            <span style={label}>{tCart("giftRecipientName")}</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder={tCart("certNamePh")} style={field} />
          </span>
          <span style={{ display: "grid", gap: 6 }}>
            <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <span style={label}>{tCart("certSendMethod")}</span>
              <span style={{ fontSize: 11, fontWeight: 800, color: "var(--muted)" }}>
                {channels.whatsapp && channels.email ? tCart("giftBothLong") : channels.whatsapp || channels.email ? tCart("giftSentVia") : tCart("giftChannelChoose")}
              </span>
            </span>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: 6 }}>
              <button type="button" data-pick={channels.whatsapp ? "1" : ""} onClick={() => setChannels((c) => ({ ...c, whatsapp: !c.whatsapp }))} style={chip(channels.whatsapp)}>{tCart("sendViaWhatsapp")}</button>
              <button type="button" data-pick={channels.email ? "1" : ""} onClick={() => setChannels((c) => ({ ...c, email: !c.email }))} style={chip(channels.email)}>{tCart("giftChannelEmail")}</button>
            </div>
          </span>
          {channels.whatsapp ? <input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" inputMode="tel" dir="ltr" placeholder={tCart("recipientWhatsapp")} aria-label={tCart("recipientWhatsapp")} style={{ ...field, unicodeBidi: "isolate" }} /> : null}
          {channels.email ? <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" dir="ltr" placeholder="name@example.com" aria-label={tCart("giftChannelEmail")} style={{ ...field, unicodeBidi: "isolate" }} /> : null}
          <span style={{ display: "grid", gap: 5 }}>
            <span style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
              <span style={label}>{tCart("giftMessage")}</span>
              <span dir="ltr" style={{ unicodeBidi: "isolate", fontSize: 11, fontWeight: 800, color: "var(--muted)" }}>{note.length}/{NOTE_MAX}</span>
            </span>
            <input value={note} onChange={(e) => setNote(e.target.value.slice(0, NOTE_MAX))} maxLength={NOTE_MAX} placeholder={tCart("writeYourMessagePh")} style={field} />
          </span>
          {ready ? (
            <span style={{ display: "grid", gap: 6, padding: "12px 14px", background: "#fff", border: "1px solid rgba(31,122,77,.35)", borderInlineStart: "3px solid var(--green)", borderRadius: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 900, color: "var(--green)" }}>{tCart("certPreview")}</span>
              <b style={{ fontSize: 13.5, lineHeight: 1.6 }}>{tCart("inNameOf", { name })}</b>
              <span style={{ fontSize: 12.5, lineHeight: 1.75, color: "var(--muted)" }}>{note || previewLine}</span>
            </span>
          ) : null}
          <button type="button" onClick={() => setShowAmount((v) => !v)} aria-pressed={showAmount}
            style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 13px", background: "#fff", border: "1px solid var(--border)", borderRadius: 9, cursor: "pointer", fontFamily: "inherit", textAlign: "start" }}>
            <span aria-hidden="true" style={{ display: "grid", placeItems: "center", width: 20, height: 20, flex: "0 0 auto", borderRadius: 6, border: `1px solid ${showAmount ? "var(--green)" : "var(--border)"}`, background: showAmount ? "var(--green)" : "#fff" }}>
              {showAmount ? <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 5 5L19 7" /></svg> : null}
            </span>
            <span style={{ display: "grid", gap: 2, minWidth: 0 }}>
              <b style={{ fontSize: 13, lineHeight: 1.4 }}>{tCart("showAmountOnCert")}</b>
              <span style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)" }}>{showAmount ? tCart("amountShownNote") : tCart("amountHiddenNote")}</span>
            </span>
          </button>
          <span style={{ fontSize: 11.5, lineHeight: 1.75, color: "var(--muted)" }}>{tCart("giftPrivacyNote")}</span>
        </div>
      ) : null}
    </div>
  );
}
