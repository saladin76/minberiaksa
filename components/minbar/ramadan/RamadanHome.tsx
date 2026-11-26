"use client";

import { useTranslations } from "next-intl";

/**
 * Ramadan scheduling on the homepage: a banner (top banner slot) and a section. Shown only when
 * the dashboard has switched on the service AND the matching homepage switch; the server decides.
 */
const RED = "#7A2419", BRICK = "#AB422F", GOLD = "#CD8B2B", CREAM = "#FBF6EE";
type Props = { locale: string; hijriYear: number; daysLeft: number; startLabel: string; startDate: string };
const href = (locale: string) => `/${locale}/ramadan`;
const STYLE = `
.mr-banner{position:relative;overflow:hidden;color:#FFF6EA;background:radial-gradient(120% 140% at 85% 0%,${BRICK} 0%,${RED} 55%,#4E150D 100%)}
.mr-banner-in{position:relative;max-width:1240px;margin:0 auto;padding:56px 32px;display:flex;align-items:center;gap:40px}
.mr-banner h2{margin:0;font-size:clamp(28px,4.2vw,52px);line-height:1.2;font-weight:900}
.mr-banner p{margin:0;max-width:54ch;font-size:clamp(15px,1.5vw,19px);line-height:1.9;color:#F6E3D4}
.mr-moon{flex:0 0 300px;display:grid;place-items:center}
.mr-actions{display:flex;flex-wrap:wrap;gap:12px;margin-top:6px}
.mr-btn{display:inline-flex;align-items:center;justify-content:center;min-height:54px;padding:0 26px;border-radius:14px;font-size:17px;font-weight:900;text-decoration:none}
.mr-section-in{max-width:1240px;margin:0 auto;padding:64px 32px;display:flex;align-items:center;gap:56px}
.mr-preview{flex:0 0 460px}
@media (max-width:860px){.mr-banner-in{flex-direction:column;align-items:stretch;padding:28px 20px 34px;gap:14px}.mr-moon{order:-1;flex-basis:auto}.mr-moon svg{width:140px;height:140px}.mr-actions .mr-btn{flex:1 1 100%}.mr-section-in{flex-direction:column;align-items:stretch;padding:36px 18px 40px;gap:20px}.mr-preview{flex-basis:auto;order:2}}
`;
const Moon = () => <svg width="300" height="300" viewBox="0 0 320 320" fill="none" aria-hidden="true"><circle cx="160" cy="160" r="150" stroke="rgba(246,208,139,.28)" /><circle cx="160" cy="160" r="118" stroke="rgba(246,208,139,.2)" strokeDasharray="2 8" /><path d="M196 74a96 96 0 1 0 38 150A80 80 0 1 1 196 74z" fill={GOLD} /><g fill="#FFF6EA"><path d="M246 112l3 9 9 3-9 3-3 9-3-9-9-3 9-3z" /><path d="M262 168l2 6 6 2-6 2-2 6-2-6-6-2 6-2z" opacity=".8" /></g></svg>;
const Lattice = ({ id }: { id: string }) => <svg aria-hidden="true" width="100%" height="100%" style={{ position: "absolute", inset: 0, opacity: 0.1 }}><defs><pattern id={id} width="56" height="56" patternUnits="userSpaceOnUse"><path d="M28 4 L33 23 L52 28 L33 33 L28 52 L23 33 L4 28 L23 23 Z" fill="none" stroke="#F6D08B" /></pattern></defs><rect width="100%" height="100%" fill={`url(#${id})`} /></svg>;

export function RamadanHomeBanner({ locale, hijriYear, daysLeft }: Props) {
  const t = useTranslations("ramadan");
  return <section className="mr-banner" aria-labelledby="mr-banner-title">
    <style>{STYLE}</style>
    <Lattice id="mr-lat-b" />
    <div className="mr-banner-in">
      <div style={{ flex: "1 1 0", minWidth: 0, display: "flex", flexDirection: "column", gap: 16 }}>
        <span style={{ alignSelf: "flex-start", padding: "6px 14px", borderRadius: 999, border: "1px solid rgba(246,208,139,.5)", color: "#F6D08B", fontSize: 13.5, fontWeight: 700 }}>{daysLeft > 0 ? t("homeBadge", { year: hijriYear, days: daysLeft }) : t("homeBadgeNow", { year: hijriYear })}</span>
        <h2 id="mr-banner-title">{t("homeBannerTitle")} <span style={{ color: "#F6D08B" }}>{t("homeBannerAccent")}</span></h2>
        <p>{t("homeBannerText")}</p>
        <div className="mr-actions">
          <a className="mr-btn" href={href(locale)} style={{ background: "#FFF6EA", color: RED }}>{t("homeStart")}</a>
          <a className="mr-btn" href={href(locale)} style={{ border: "1.5px solid rgba(255,246,234,.45)", color: "#FFF6EA", fontWeight: 700 }}>{t("homeHow")}</a>
        </div>
      </div>
      <div className="mr-moon"><Moon /></div>
    </div>
  </section>;
}

export function RamadanHomeSection({ locale, hijriYear, startLabel, startDate }: Props) {
  const [y, m, d] = startDate.split("-").map(Number);
  const t = useTranslations("ramadan");
  const cells = Array.from({ length: 30 }, (_, i) => { const n = i + 1, friday = new Date(Date.UTC(y, m - 1, d + i)).getUTCDay() === 5, last10 = n >= 21; return { n, on: friday || last10, friday, last10 }; });
  return <section aria-labelledby="mr-section-title" style={{ background: CREAM, color: "#1E2530" }}>
    <style>{STYLE}</style>
    <div className="mr-section-in">
      <div style={{ flex: "1 1 0", minWidth: 0, display: "flex", flexDirection: "column", gap: 16 }}>
        <span style={{ alignSelf: "flex-start", padding: "6px 12px", borderRadius: 999, background: "#FBEEDC", color: "#8C5512", fontSize: 13.5, fontWeight: 800 }}>{t("homeSectionBadge", { year: hijriYear })}</span>
        <h2 id="mr-section-title" style={{ margin: 0, fontSize: "clamp(26px,3vw,40px)", lineHeight: 1.25, fontWeight: 900 }}>{t("homeSectionTitle")} <span style={{ color: BRICK }}>{t("homeSectionAccent")}</span></h2>
        <p style={{ margin: 0, maxWidth: "52ch", fontSize: 16.5, lineHeight: 1.9, color: "#3B4453" }}>{t("homeSectionText")}</p>
        <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 14 }}>
          {[1, 2, 3].map((i) => <li key={i} style={{ display: "flex", gap: 14, alignItems: "flex-start" }}><span style={{ flex: "0 0 auto", width: 32, height: 32, display: "grid", placeItems: "center", borderRadius: "50%", background: "#FBEEDC", color: "#8C5512", fontWeight: 900 }}>{i}</span><span style={{ display: "flex", flexDirection: "column", gap: 2 }}><b style={{ fontSize: 16 }}>{t(`homePoint${i}`)}</b><span style={{ fontSize: 14, lineHeight: 1.7, color: "#5B6574" }}>{t(`homePoint${i}Desc`)}</span></span></li>)}
        </ol>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 16, marginTop: 6 }}>
          <a className="mr-btn" href={href(locale)} style={{ background: RED, color: "#fff" }}>{t("homeSectionCta")}</a>
          <span style={{ fontSize: 14, color: "#5B6574" }}>{t("homeStartsOn", { date: startLabel })}</span>
        </div>
      </div>
      <div className="mr-preview" aria-hidden="true">
        <div style={{ background: "#fff", borderRadius: 22, padding: 20, boxShadow: "0 24px 50px -30px rgba(90,26,16,.5)", display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}><b style={{ fontSize: 16 }}>{t("calendarTitle", { year: hijriYear })}</b><span style={{ fontSize: 12, fontWeight: 800, padding: "4px 10px", borderRadius: 999, background: RED, color: "#fff" }}>{t("daysCount", { count: cells.filter((c) => c.on).length })}</span></div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{(["fridays", "last10"] as const).map((k) => <span key={k} style={{ fontSize: 12.5, fontWeight: 700, padding: "5px 10px", borderRadius: 999, background: RED, color: "#FFF6EA" }}>{t(`plan_${k}`)}</span>)}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 6 }}>
            {cells.map((c) => <span key={c.n} style={{ display: "grid", placeItems: "center", height: 40, borderRadius: 10, fontWeight: 800, fontSize: 14, background: c.on ? RED : c.last10 ? "#FBEEDC" : "#FCFAF5", color: c.on ? "#FFF6EA" : "#1E2530", border: c.friday ? `2px solid ${GOLD}` : c.on ? `2px solid ${RED}` : "1px solid #EEE6D8" }}>{c.n}</span>)}
          </div>
        </div>
      </div>
    </div>
  </section>;
}
