"use client";

import { useSession } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { useRouter } from "@/i18n/routing";
import { Loader2, Phone, Calendar, Users, ArrowRight } from "lucide-react";
import Image from "next/image";
import { PhoneInput } from "react-international-phone";
import "react-international-phone/style.css";
import { useIpCountry } from "@/hooks/useIpCountry";

const MONTH_LABELS: Record<string, string[]> = {
  ar: ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"],
  en: ["January","February","March","April","May","June","July","August","September","October","November","December"],
  fr: ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"],
  tr: ["Ocak","Şubat","Mart","Nisan","Mayıs","Haziran","Temmuz","Ağustos","Eylül","Ekim","Kasım","Aralık"],
  es: ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"],
  pt: ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"],
  id: ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"],
};

function daysInMonth(month: number, year: number) {
  if (!month || !year) return 31;
  return new Date(year, month, 0).getDate();
}

function ChevronDown() {
  return (
    <svg className="w-3 h-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}

const LOGO_URL = "/logometaminber.avif";
// Same field photo the QuickDonate panel uses — here it sits far behind the brand
// wash as a texture, so the auth screen shares the homepage's visual language.
const TEXTURE_URL = "https://i.ibb.co/N2zVsqfg/calisma-alanlarimiz-egitim-sektoru.jpg";

// The page lives inside <main className="pt-12 lg:pt-[88px]">, so a full 100dvh
// would push past the fold. Subtracting the navbar keeps the card on one screen.
const SHELL_HEIGHT = "h-[calc(100dvh-3rem)] max-h-[calc(100dvh-3rem)] lg:h-[calc(100dvh-88px)] lg:max-h-[calc(100dvh-88px)]";

export default function CompleteProfilePage() {
  const { data: session, status } = useSession();
  const router       = useRouter();
  const searchParams = useSearchParams();
  const t            = useTranslations("CompleteProfile");
  const tD           = useTranslations("SignInDialog");
  const locale       = useLocale();
  const isRTL        = locale === "ar";
  const ipCountry    = useIpCountry();

  const callbackUrl = searchParams.get("callbackUrl") || "/";

  const [phone,    setPhone]    = useState("");
  const [dobDay,   setDobDay]   = useState<number | "">("");
  const [dobMonth, setDobMonth] = useState<number | "">("");
  const [dobYear,  setDobYear]  = useState<number | "">("");
  const [gender,   setGender]   = useState("");
  const [needPhone,    setNeedPhone]    = useState(false);
  const [needBirthdate, setNeedBirthdate] = useState(false);
  const [needGender,   setNeedGender]   = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [saving,      setSaving]      = useState(false);
  const [error,       setError]       = useState<string | null>(null);

  const currentYear = new Date().getFullYear();
  const years  = useMemo(() => Array.from({ length: currentYear - 1919 }, (_, i) => currentYear - i), [currentYear]);
  const maxDay = useMemo(() => daysInMonth(dobMonth === "" ? 0 : +dobMonth, dobYear === "" ? 0 : +dobYear), [dobMonth, dobYear]);
  const days   = useMemo(() => Array.from({ length: maxDay }, (_, i) => i + 1), [maxDay]);
  const months = MONTH_LABELS[locale] ?? MONTH_LABELS.en;
  useEffect(() => { if (dobDay !== "" && +dobDay > maxDay) setDobDay(maxDay); }, [maxDay, dobDay]);

  useEffect(() => {
    if (status === "unauthenticated") { router.replace("/auth/signin"); return; }
    if (status !== "authenticated") return;
    fetch(`/api/users/${session.user.id}`)
      .then((r) => r.json())
      .then((data) => {
        const u = data.user;
        // Skip entirely if user has already seen this page once
        if (u?.profileCompletionSeen) { router.replace(callbackUrl); return; }
        const missingPhone     = !u?.phone;
        const missingBirthdate = !u?.birthdate;
        const missingGender    = !u?.gender;
        if (!missingPhone && !missingBirthdate && !missingGender) { router.replace(callbackUrl); return; }
        setNeedPhone(missingPhone);
        setNeedBirthdate(missingBirthdate);
        setNeedGender(missingGender);
        if (u?.phone)     setPhone(u.phone);
        if (u?.gender)    setGender(u.gender);
        if (u?.birthdate) {
          const [y, m, d] = String(u.birthdate).split("-").map(Number);
          if (y) setDobYear(y); if (m) setDobMonth(m); if (d) setDobDay(d);
        }
        setPageLoading(false);
      })
      .catch(() => setPageLoading(false));
  }, [status, session, callbackUrl, locale, router]);

  const handleSave = async () => {
    if (needPhone && !phone.trim()) { setError(t("fillAllFields")); return; }
    if (needBirthdate && (!dobDay || !dobMonth || !dobYear)) { setError(t("fillAllFields")); return; }
    if (needGender && !gender) { setError(t("fillAllFields")); return; }
    setSaving(true); setError(null);
    const birthdate = needBirthdate
      ? `${dobYear}-${String(+dobMonth).padStart(2, "0")}-${String(+dobDay).padStart(2, "0")}`
      : undefined;
    const body: Record<string, unknown> = { profileCompletionSeen: true };
    if (needPhone)     body.phone     = phone.trim();
    if (needBirthdate) body.birthdate = birthdate;
    if (needGender)    body.gender    = gender;
    try {
      const res = await fetch(`/api/users/${session!.user.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error();
      router.replace(callbackUrl);
    } catch {
      setError(t("saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  if (pageLoading || status === "loading") {
    return (
      <div className={`${SHELL_HEIGHT} flex items-center justify-center bg-[#A5243D]`}>
        <Loader2 className="w-6 h-6 animate-spin text-white/60" />
      </div>
    );
  }

  const firstName = session?.user?.name?.split(" ")[0] ?? "";
  const userImage = session?.user?.image;
  const isAr = locale === "ar";
  const greeting = isAr
    ? `أهلاً${firstName ? `، ${firstName}` : ""}!`
    : `Hi${firstName ? `, ${firstName}` : ""}!`;

  const selCls = (filled: boolean) =>
    `w-full border rounded-xl py-2.5 px-3 text-sm outline-none appearance-none cursor-pointer transition-all bg-white
     focus:border-[#A5243D] focus:ring-2 focus:ring-[#A5243D]/10
     ${filled
       ? "text-gray-800 border-[#A5243D]/50"
       : "text-gray-400 border-gray-200 hover:border-gray-300"}`;

  return (
    <div
      className={`${SHELL_HEIGHT} relative overflow-hidden bg-[#A5243D] flex flex-col items-center justify-center px-4 py-5`}
      dir={isRTL ? "rtl" : "ltr"}
    >

      {/* Layered backdrop: photo texture → brand wash → dot grid → radial glow */}
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <Image
          src={TEXTURE_URL}
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover object-center opacity-25"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-burgundy/90 via-burgundy/95 to-deep" />
        <div className="absolute inset-0 opacity-[0.07] bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:18px_18px]" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] rounded-full bg-white/5 blur-3xl" />
      </div>

      {/* Scrolls internally on very short screens so the shell itself never grows */}
      <div className="relative w-full max-w-sm max-h-full overflow-y-auto scrollbar-hide">

        {/* Logo + greeting above card */}
        <div className="text-center mb-4">
          <Image
            src={LOGO_URL}
            alt="Logo"
            width={48}
            height={48}
            className="h-9 w-auto object-contain brightness-0 invert mx-auto mb-3"
          />
          {/* Avatar */}
          <div className="relative inline-flex mb-2.5">
            {userImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={userImage}
                alt={session?.user?.name ?? ""}
                className="w-14 h-14 rounded-full ring-2 ring-white/30 object-cover"
              />
            ) : (
              <div className="w-14 h-14 rounded-full bg-white/10 ring-2 ring-white/20 flex items-center justify-center">
                <Users className="w-6 h-6 text-white/60" />
              </div>
            )}
            <div className="absolute -bottom-0.5 -end-0.5 w-5 h-5 bg-white rounded-full flex items-center justify-center shadow">
              <Image src="/google.svg" alt="Google" width={12} height={12} />
            </div>
          </div>
          <h1 className="text-lg font-bold text-white">{greeting}</h1>
          <p className="text-xs text-white/60 mt-0.5">{t("subtitle")}</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-2xl shadow-black/25 ring-1 ring-black/5 overflow-hidden">

          {/* Gold hairline — the same accent the homepage cards carry */}
          <div className="h-1 w-full bg-gradient-to-r from-gold via-gold/70 to-transparent rtl:bg-gradient-to-l" />

          <div className="px-6 py-5 space-y-3.5">

            {/* Error */}
            {error && (
              <div className="bg-red-50 border border-red-100 rounded-xl px-3.5 py-2.5 text-xs text-red-600">
                {error}
              </div>
            )}

            {/* Phone */}
            {needPhone && (
              <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                  <Phone className="w-3 h-3 text-[#A5243D]" />
                  {t("phoneLabel")}
                </label>
                <div className="overflow-visible phone-input-wrapper">
                  <PhoneInput
                    defaultCountry={ipCountry}
                    value={phone}
                    onChange={setPhone}
                    className="w-full overflow-visible"
                    inputClassName="w-full min-w-0 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#A5243D] focus:ring-2 focus:ring-[#A5243D]/10 transition-all"
                  />
                </div>
              </div>
            )}

            {/* Date of Birth */}
            {needBirthdate && (
              <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                  <Calendar className="w-3 h-3 text-[#A5243D]" />
                  {tD("dateOfBirthLabel")}
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <div className="relative">
                    <select value={dobDay} onChange={(e) => setDobDay(e.target.value === "" ? "" : +e.target.value)} className={selCls(dobDay !== "")}>
                      <option value="">{t("dobDayPlaceholder")}</option>
                      {days.map((d) => <option key={d} value={d}>{d}</option>)}
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 end-2.5 flex items-center"><ChevronDown /></div>
                  </div>
                  <div className="relative">
                    <select value={dobMonth} onChange={(e) => setDobMonth(e.target.value === "" ? "" : +e.target.value)} className={selCls(dobMonth !== "")}>
                      <option value="">{t("dobMonthPlaceholder")}</option>
                      {months.map((name, i) => <option key={i + 1} value={i + 1}>{name}</option>)}
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 end-2.5 flex items-center"><ChevronDown /></div>
                  </div>
                  <div className="relative">
                    <select value={dobYear} onChange={(e) => setDobYear(e.target.value === "" ? "" : +e.target.value)} className={selCls(dobYear !== "")}>
                      <option value="">{t("dobYearPlaceholder")}</option>
                      {years.map((y) => <option key={y} value={y}>{y}</option>)}
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 end-2.5 flex items-center"><ChevronDown /></div>
                  </div>
                </div>
              </div>
            )}

            {/* Gender */}
            {needGender && (
              <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                  <Users className="w-3 h-3 text-[#A5243D]" />
                  {tD("genderLabel")}
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { key: "male",           symbol: "♂", label: tD("genderMale") },
                    { key: "female",         symbol: "♀", label: tD("genderFemale") },
                    { key: "preferNotToSay", symbol: "—", label: tD("genderPreferNotToSay") },
                  ] as const).map(({ key, symbol, label }) => {
                    const active = gender === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setGender(key)}
                        className={`flex flex-col items-center justify-center gap-1 py-3 rounded-xl border transition-all text-center ${
                          active
                            ? "border-[#A5243D] bg-[#A5243D] text-white shadow-sm"
                            : "border-gray-200 bg-white text-gray-500 hover:border-[#A5243D]/40 hover:text-[#A5243D]"
                        }`}
                      >
                        <span className={`text-base leading-none ${active ? "text-white" : "text-gray-400"}`}>{symbol}</span>
                        <span className="text-[10px] font-semibold leading-tight">{label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Save */}
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="w-full flex items-center justify-center gap-2 bg-[#A5243D] hover:bg-[#7D1830] disabled:opacity-60 text-white text-sm font-bold py-3 rounded-xl transition-colors active:scale-[0.98] shadow-sm"
            >
              {saving
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <><span>{t("saveButton")}</span><ArrowRight className={`w-4 h-4 ${isRTL ? "rotate-180" : ""}`} /></>}
            </button>

            {/* Skip */}
            <p className="text-center">
              <button
                type="button"
                onClick={async () => {
                  await fetch(`/api/users/${session!.user.id}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ profileCompletionSeen: true }),
                  });
                  router.replace(callbackUrl);
                }}
                className="text-[11px] text-gray-400 hover:text-gray-500 transition-colors underline underline-offset-2"
              >
                {t("skip")}
              </button>
            </p>

          </div>
        </div>

      </div>
    </div>
  );
}
