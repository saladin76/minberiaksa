"use client";

import { type ReactElement, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { miaPath } from "@/lib/minbar/routes";
import type { MinbarAccountSummary } from "@/lib/minbar/account";
import { useMinbarMoney } from "@/hooks/useMinbarMoney";
import { Button } from "@/components/minbar/ds";

/**
 * The donor account — ported from `Minbar/حساب المتبرع.dc.html`.
 *
 * The handoff renders whatever props it is handed and an em dash for the rest.
 * This is the signed-in donor's own record: their totals, their donation
 * history with a receipt for each, and their details, editable in place.
 *
 * Only confirmed donations appear. A bank transfer still awaiting a finance
 * officer's match is not yet a donation, and counting it would tell a donor
 * they have given more than they have.
 */

const ICONS: Record<string, ReactElement> = {
  wallet: (
    <>
      <rect x="3" y="7" width="18" height="12" rx="2" />
      <path d="M3 10h18M16 14h2" />
    </>
  ),
  list: (
    <>
      <path d="M8 6h13M8 12h13M8 18h13" />
      <path d="M3.5 6h.01M3.5 12h.01M3.5 18h.01" />
    </>
  ),
  refresh: (
    <>
      <path d="M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3" />
      <path d="M18 3v4h-4M6 21v-4h4" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="3.6" />
      <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
    </>
  ),
  mail: (
    <>
      <rect x="3.5" y="5.5" width="17" height="13" rx="2" />
      <path d="m4 6 8 6 8-6" />
    </>
  ),
  phone: (
    <path d="M4 5.5c0-1 .8-1.5 1.6-1.3l2.7.7c.6.15 1 .65 1.1 1.25l.4 2.4c.1.5-.05 1-.4 1.35l-1.3 1.3a13 13 0 0 0 6 6l1.3-1.3c.35-.35.85-.5 1.35-.4l2.4.4c.6.1 1.1.5 1.25 1.1l.7 2.7c.2.8-.3 1.6-1.3 1.6C10.5 21 3 13.5 4 5.5Z" />
  ),
  calendar: (
    <>
      <rect x="3.5" y="4.5" width="17" height="16" rx="2" />
      <path d="M3.5 9h17M8 3v3M16 3v3" />
    </>
  ),
  pin: <path d="M12 21s-7.5-4.7-7.5-10A4.5 4.5 0 0 1 12 8a4.5 4.5 0 0 1 7.5 3c0 5.3-7.5 10-7.5 10Z" />,
  receipt: (
    <>
      <path d="M7 3h10l2 2v16l-3-2-2 2-2-2-2 2-2-2-3 2V5l2-2Z" />
      <path d="M9 9h6M9 13h6" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.5 15a1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.55-1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87 1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1Z" />
    </>
  ),
  edit: (
    <>
      <path d="M4 20.5 5 16l11-11 3 3-11 11-4 1.5Z" />
      <path d="M14 6.5 17.5 10" />
    </>
  ),
};

function Icon({ name, size = 15 }: { name: string; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONS[name]}
    </svg>
  );
}

const SECTION = { maxWidth: 1240, margin: "0 auto", padding: "0 24px" } as const;
const FIELD = {
  height: 38,
  border: "1px solid var(--border)",
  borderRadius: 8,
  padding: "0 10px",
  fontFamily: "inherit",
  fontSize: 13.5,
  background: "#fff",
} as const;

export default function AccountPage({ summary }: { summary: MinbarAccountSummary }) {
  const locale = useLocale();
  const t = useTranslations("account");
  const { format, formatNumber } = useMinbarMoney();

  const { profile, donations, totalDonatedUSD, donationCount, activeSubscriptions } = summary;

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: profile.name ?? "",
    email: profile.email ?? "",
    phone: profile.phone ?? "",
    birthdate: profile.birthdate ?? "",
    address: profile.address ?? "",
  });
  /* What the read view shows. Kept beside the form so a save updates the page
     without a reload, and a cancel restores what the server last confirmed. */
  const [saved, setSaved] = useState(form);

  const donorName = saved.name.trim() || t("dearDonor");
  const dash = "—";
  const dateFormat = new Intl.DateTimeFormat(locale, { year: "numeric", month: "long", day: "numeric" });

  /* A past donation is shown in the currency it was actually charged in, never
     re-converted into today's selected currency: the receipt says one number
     and the history must say the same one. */
  const chargedAmount = (amount: number, currency: string) => {
    try {
      return new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
    } catch {
      return `${currency} ${formatNumber(Math.round(amount))}`;
    }
  };
  const monthFormat = new Intl.DateTimeFormat(locale, { year: "numeric", month: "long" });

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/users/${profile.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          email: form.email.trim(),
          phone: form.phone.trim(),
          birthdate: form.birthdate.trim(),
          /* The design offers one address line; the profile stores country,
             region and city separately, and this is its free-text part. The
             other two are set in the full settings screen. */
          city: form.address.trim(),
        }),
      });
      if (!res.ok) throw new Error("save failed");
      setSaved(form);
      setEditing(false);
    } catch {
      /* Keep the form open with what was typed so it can be sent again. */
    } finally {
      setSaving(false);
    }
  };

  const cancel = () => {
    setForm(saved);
    setEditing(false);
  };

  const stats: Array<{ icon: string; value: string; label: string }> = [
    { icon: "wallet", value: format(totalDonatedUSD), label: t("totalDonated") },
    { icon: "list", value: formatNumber(donationCount), label: t("donationCount") },
    { icon: "refresh", value: formatNumber(activeSubscriptions), label: t("activeSubs") },
  ];

  const details: Array<{ icon: string; value: string; ltr?: boolean }> = [
    { icon: "user", value: saved.name.trim() || dash },
    { icon: "mail", value: saved.email.trim() || dash, ltr: true },
    { icon: "phone", value: saved.phone.trim() || dash, ltr: true },
    { icon: "calendar", value: saved.birthdate.trim() || dash, ltr: true },
    { icon: "pin", value: saved.address.trim() || dash },
  ];

  return (
    <div className="acc-page">
      <section style={{ position: "relative", padding: "46px 0 62px", background: "var(--sand)", borderBottom: "1px solid var(--border)", overflow: "hidden" }}>
        <div aria-hidden="true" className="acc-pattern" />
        <div className="acc-in" style={{ ...SECTION, position: "relative", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <span aria-hidden="true" style={{ display: "grid", placeItems: "center", width: 64, height: 64, borderRadius: "50%", background: "#fff", color: "var(--deep)", fontSize: 22, fontWeight: 900, border: "2px solid rgba(211,154,39,.5)", boxShadow: "0 8px 18px rgba(16,33,43,.08)" }}>
              {donorName.trim().charAt(0)}
            </span>
            <div>
              <h1 style={{ margin: 0, fontSize: "clamp(22px,2.6vw,28px)", fontWeight: 900 }}>{donorName}</h1>
              <span style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--muted)", fontSize: 14 }}>
                <Icon name="pin" size={13} />
                {t("memberSince", { date: monthFormat.format(new Date(profile.memberSince)) })}
              </span>
            </div>
          </div>

          {/* The handoff points this at the contact page — plainly a placeholder.
              It leads to the real settings screen, where a donor can also change
              their password, country and notification preferences. */}
          <Link href={`/${locale}/profile`} className="acc-settings" style={{ display: "inline-flex", alignItems: "center", gap: 7, height: 40, padding: "0 16px", borderRadius: 8, border: "1px solid rgba(211,154,39,.5)", background: "#fff", fontSize: 13.5, fontWeight: 800, color: "var(--deep)", transition: "all .18s ease" }}>
            <Icon name="settings" />
            {t("settings")}
          </Link>
        </div>
      </section>

      <section style={{ padding: "34px 0 70px" }}>
        <div className="acc-stats" style={{ ...SECTION, display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 18, marginBottom: 34, marginTop: -30 }}>
          {stats.map((stat) => (
            <div key={stat.label} className="acc-row acc-card acc-in acc-in-1" style={{ display: "flex", alignItems: "center", gap: 12, padding: 22, background: "#fff", border: "1px solid var(--border)", borderRadius: 12 }}>
              <span aria-hidden="true" style={{ display: "grid", placeItems: "center", width: 38, height: 38, borderRadius: 10, background: "var(--sand)", color: "var(--gold)", flex: "0 0 auto" }}>
                <Icon name={stat.icon} size={17} />
              </span>
              <span style={{ display: "grid", gap: 3, minWidth: 0 }}>
                <b dir="ltr" style={{ unicodeBidi: "isolate", fontSize: 24, fontWeight: 900 }}>{stat.value}</b>
                <span style={{ color: "var(--muted)", fontSize: 13 }}>{stat.label}</span>
              </span>
            </div>
          ))}
        </div>

        <div className="acc-body" style={{ ...SECTION, display: "grid", gridTemplateColumns: "minmax(0,1.2fr) minmax(0,.8fr)", gap: 30, alignItems: "start" }}>
          <div style={{ display: "grid", gap: 14 }}>
            <h2 style={{ margin: 0, fontSize: 19, fontWeight: 900 }}>{t("donationHistory")}</h2>
            <div style={{ display: "grid", gap: 10 }}>
              {donations.map((donation) => (
                <div key={donation.id} className="acc-row acc-card acc-in" style={{ display: "flex", alignItems: "center", gap: 16, padding: "16px 18px", background: "#fff", border: "1px solid var(--border)", borderRadius: 10 }}>
                  <span style={{ flex: "1 1 auto", minWidth: 0 }}>
                    <b style={{ display: "block", fontSize: 15 }}>
                      {donation.titles.length ? donation.titles.join("، ") : t("dearDonor")}
                    </b>
                    <span style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--muted)", fontSize: 12.5, marginTop: 2 }}>
                      <time dateTime={donation.date}>{dateFormat.format(new Date(donation.date))}</time>
                      {donation.recurring ? (
                        <>
                          <span aria-hidden="true" style={{ width: 3, height: 3, borderRadius: "50%", background: "var(--muted)" }} />
                          <span style={{ display: "inline-flex", padding: "2px 8px", borderRadius: 999, background: "var(--sand)", color: "var(--gold)", fontWeight: 800 }}>
                            {t("recurringTitle")}
                          </span>
                        </>
                      ) : null}
                    </span>
                  </span>
                  <b dir="ltr" style={{ unicodeBidi: "isolate", whiteSpace: "nowrap" }}>
                    {chargedAmount(donation.amount, donation.currency)}
                  </b>
                  {/* The receipt is the server-generated PDF, not a page: it is
                      the document a donor keeps, and it is issued per donation. */}
                  <a
                    href={`/api/donations/${donation.id}/receipt?locale=${encodeURIComponent(locale)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="acc-receipt"
                    style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 32, padding: "0 12px", borderRadius: 8, border: "1px solid var(--border)", background: "#fff", fontSize: 12.5, fontWeight: 800, color: "var(--deep)", whiteSpace: "nowrap", transition: "all .18s ease" }}
                  >
                    <Icon name="receipt" size={13} />
                    {t("receipt")}
                  </a>
                </div>
              ))}

              {donations.length === 0 ? (
                <p style={{ margin: 0, padding: 24, textAlign: "center", color: "var(--muted)", background: "#fff", border: "1px solid var(--border)", borderRadius: 10, fontSize: 14 }}>
                  {t("noDonationsYet")}{" "}
                  <Link href={miaPath("projects", locale)} style={{ color: "var(--gold)", fontWeight: 800 }}>
                    {t("browseProjects")}
                  </Link>{" "}
                  {t("toStart")}
                </p>
              ) : null}
            </div>
          </div>

          <div style={{ display: "grid", gap: 12 }}>
            <div className="acc-in acc-in-1" style={{ display: "grid", gap: 10, padding: 22, background: "var(--sand)", borderRadius: 12 }}>
              <b style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 15 }}>
                <Icon name="user" size={16} />
                {t("myInfo")}
              </b>

              {editing ? (
                <>
                  <span style={{ display: "grid", gap: 8 }}>
                    <EditField label={t("fullName")} value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} autoComplete="name" />
                    <EditField label={t("email")} value={form.email} onChange={(v) => setForm((f) => ({ ...f, email: v }))} type="email" dir="ltr" autoComplete="email" />
                    <EditField label={t("phone")} value={form.phone} onChange={(v) => setForm((f) => ({ ...f, phone: v }))} type="tel" dir="ltr" autoComplete="tel" />
                    <EditField label={t("birthDate")} value={form.birthdate} onChange={(v) => setForm((f) => ({ ...f, birthdate: v }))} type="date" dir="ltr" />
                    <EditField label={t("address")} value={form.address} onChange={(v) => setForm((f) => ({ ...f, address: v }))} autoComplete="address-level2" />
                  </span>
                  <span style={{ display: "flex", gap: 8, marginTop: 4 }}>
                    <button type="button" onClick={save} disabled={saving} style={{ flex: "1 1 auto", height: 38, border: 0, borderRadius: 8, background: "var(--gold)", color: "#10212B", fontFamily: "inherit", fontWeight: 900, fontSize: 13, cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.7 : 1 }}>
                      {t("save")}
                    </button>
                    <button type="button" onClick={cancel} style={{ flex: "0 0 auto", height: 38, padding: "0 14px", borderRadius: 8, border: "1px solid var(--border)", background: "#fff", color: "var(--muted)", fontFamily: "inherit", fontWeight: 800, fontSize: 13, cursor: "pointer" }}>
                      {t("cancel")}
                    </button>
                  </span>
                </>
              ) : (
                <>
                  <span style={{ display: "grid", gap: 8 }}>
                    {details.map((detail) => (
                      <span key={detail.icon} style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--muted)", fontSize: 14 }}>
                        <span style={{ flex: "0 0 auto", color: "var(--gold)", display: "inline-flex" }}>
                          <Icon name={detail.icon} size={14} />
                        </span>
                        {detail.ltr ? (
                          <span dir="ltr" style={{ unicodeBidi: "isolate" }}>{detail.value}</span>
                        ) : (
                          detail.value
                        )}
                      </span>
                    ))}
                  </span>
                  <button type="button" onClick={() => setEditing(true)} className="acc-edit" style={{ display: "inline-flex", alignItems: "center", gap: 7, width: "fit-content", height: 38, padding: "0 16px", marginTop: 4, borderRadius: 8, border: "1px solid var(--border)", background: "#fff", fontSize: 13, fontWeight: 800, color: "var(--deep)", cursor: "pointer", transition: "all .18s ease" }}>
                    <Icon name="edit" size={14} />
                    {t("editInfo")}
                  </button>
                </>
              )}
            </div>

            <div className="acc-in acc-in-2" style={{ display: "grid", gap: 10, padding: 22, background: "#fff", border: "1px solid var(--border)", borderRadius: 12 }}>
              <b style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 15 }}>
                <span aria-hidden="true" style={{ display: "grid", placeItems: "center", width: 30, height: 30, borderRadius: 9, background: "var(--sand)", color: "var(--gold)" }}>
                  <Icon name="refresh" />
                </span>
                {t("recurringTitle")}
              </b>
              <span style={{ color: "var(--muted)", fontSize: 14, lineHeight: 1.8 }}>
                {activeSubscriptions > 0 ? `${formatNumber(activeSubscriptions)} ${t("activeSubs")}` : t("noActivePlan")}
              </span>
              <Button variant="light" href={miaPath("recurring", locale)} style={{ whiteSpace: "nowrap" }}>
                {t("startRecurring")}
              </Button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function EditField({
  label,
  value,
  onChange,
  type = "text",
  dir,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  dir?: "ltr";
  autoComplete?: string;
}) {
  return (
    <label style={{ display: "grid", gap: 4 }}>
      <span style={{ fontSize: 11, fontWeight: 800, color: "var(--muted)" }}>{label}</span>
      <input
        type={type}
        dir={dir}
        value={value}
        autoComplete={autoComplete}
        onChange={(event) => onChange(event.target.value)}
        style={{ ...FIELD, ...(dir === "ltr" ? { textAlign: "end" as const } : {}) }}
      />
    </label>
  );
}
