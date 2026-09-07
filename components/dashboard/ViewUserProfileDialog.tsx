"use client";

import * as React from "react";
import axios from "axios";
import { toast } from "react-hot-toast";
import { useSession } from "next-auth/react";
import {
  Dialog,
  DialogOverlay,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { LOCALE_LABELS } from "@/lib/locales";
import {
  UserCircle,
  Mail,
  Globe,
  Phone,
  Calendar,
  Award,
  MapPin,
  Receipt,
  MessageCircle,
  ExternalLink,
  Loader2,
  Save,
  Settings2,
  Languages,
  Clock,
  Hash,
  Copy,
  Check,
  TrendingUp,
  Cake,
  CircleHelp,
} from "lucide-react";
import type { LucideProps } from "lucide-react";
import ReactCountryFlag from "react-country-flag";
import { useCurrency } from "@/context/CurrencyContext";
import { cn } from "@/lib/utils";
import { ACTION_PERMISSION_ROWS, DASHBOARD_PERMISSION_ROWS } from "@/lib/dashboard/nav-config";
import type { UserProfileCardData } from "@/lib/dashboard/user-profile-card";
import { resolveUserCountry } from "@/lib/dashboard/resolve-user-country";
import {
  GENDER_LABEL_AR,
  ageFromBirthdate,
  formatBirthdateAr,
  normalizeGender,
} from "@/lib/dashboard/user-demographics";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SendTemplateDialog } from "@/components/dashboard/SendTemplateDialog";

// lucide-react is pinned at 0.474, which predates its `Mars`/`Venus` icons.
// They are redrawn here with lucide's own geometry and default attributes so
// they sit beside `CircleHelp` unchanged, without moving the whole icon set.
const lucideDefaults = {
  xmlns: "http://www.w3.org/2000/svg",
  width: 24,
  height: 24,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

const Mars = ({ size, ...props }: LucideProps) => (
  <svg {...lucideDefaults} {...props} width={size ?? props.width ?? 24} height={size ?? props.height ?? 24}>
    <path d="M16 3h5v5" />
    <path d="m21 3-6.75 6.75" />
    <circle cx="10" cy="14" r="6" />
  </svg>
);

const Venus = ({ size, ...props }: LucideProps) => (
  <svg {...lucideDefaults} {...props} width={size ?? props.width ?? 24} height={size ?? props.height ?? 24}>
    <path d="M12 15v7" />
    <path d="M9 19h6" />
    <circle cx="12" cy="9" r="6" />
  </svg>
);
import { DonorAttributionJourney } from "@/components/dashboard/DonorAttributionJourney";

const CLARITY_PROJECT_ID =
  process.env.NEXT_PUBLIC_CLARITY_ID?.trim() || "u614k028k2";

/** Google Maps search URL from a list of optional location parts. */
function buildGoogleMapsUrl(parts: Array<string | null | undefined>): string | null {
  const q = parts
    .map((p) => (typeof p === "string" ? p.trim() : ""))
    .filter(Boolean)
    .join(", ");
  if (!q) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

/** Microsoft Clarity recordings URL filtered by user-id. */
function buildClarityUrl(clarityId: string): string {
  return `https://clarity.microsoft.com/projects/view/${encodeURIComponent(
    CLARITY_PROJECT_ID
  )}/impressions?CustomFilter=User-id%3DIs%3D${encodeURIComponent(clarityId)}`;
}

export interface ViewUserBadgeOption {
  id: string;
  name: string;
  translatedName?: string;
  color: string;
}

const ROLE_STYLE: Record<string, { label: string; cls: string }> = {
  ADMIN: { label: "مدير", cls: "bg-brand-orange text-white" },
  STAFF: { label: "طاقم", cls: "bg-brand text-white" },
  DONOR: { label: "متبرع", cls: "bg-white/15 text-white" },
};

function formatDateAr(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("ar-EG", { dateStyle: "medium" });
}

/** One label/value row inside a Card; keeps spacing consistent and dense. */
function InfoRow({
  icon: Icon,
  label,
  children,
  mono,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  label: string;
  children: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 text-[13px] min-w-0">
      {Icon ? <Icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" /> : null}
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span
        className={cn(
          "font-medium text-foreground min-w-0 flex-1 truncate text-right",
          mono && "font-mono text-xs"
        )}
      >
        {children}
      </span>
    </div>
  );
}

function StatBox({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-border bg-muted/30 px-3 py-2 min-w-0">
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Icon className="w-3.5 h-3.5" />
        <span className="truncate">{label}</span>
      </div>
      <div className="mt-1 text-sm font-semibold text-foreground truncate">
        {value}
      </div>
    </div>
  );
}

function SectionCard({
  title,
  icon: Icon,
  children,
  className,
}: {
  title?: string;
  icon?: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-md border border-border bg-muted/30 p-3", className)}>
      {title ? (
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 mb-2">
          {Icon ? <Icon className="w-3.5 h-3.5" /> : null}
          {title}
        </h3>
      ) : null}
      {children}
    </div>
  );
}

/** Compact Clarity ID editor — hidden behind a footer popover so it stays out of the donor profile view. */
function ClaritySettingsPopover({
  userId,
  initialClarityId,
}: {
  userId: string;
  initialClarityId: string | null;
}) {
  const [input, setInput] = React.useState(initialClarityId ?? "");
  const [saved, setSaved] = React.useState<string | null>(initialClarityId);
  const [saving, setSaving] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    setInput(initialClarityId ?? "");
    setSaved(initialClarityId);
  }, [userId, initialClarityId]);

  const trimmed = input.trim();
  const dirty = trimmed !== (saved ?? "");

  const save = async () => {
    if (!dirty) return;
    setSaving(true);
    try {
      const next = trimmed.length ? trimmed : null;
      await axios.put(`/api/users/${userId}`, { clarityId: next });
      setSaved(next);
      toast.success(next ? "تم حفظ معرّف Clarity" : "تمت إزالة معرّف Clarity");
    } catch (e) {
      const msg =
        axios.isAxiosError(e) && e.response?.data?.error
          ? String(e.response.data.error)
          : "تعذّر حفظ المعرّف";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const copyId = async () => {
    if (!saved) return;
    try {
      await navigator.clipboard.writeText(saved);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard rejected — silent */
    }
  };

  return (
    <div dir="rtl" className="space-y-3">
      <div>
        <div className="text-sm font-semibold text-foreground">معرّف Microsoft Clarity</div>
        <p className="text-[11px] leading-5 text-muted-foreground mt-0.5">
          اختياري — اربط معرّفًا لمراجعة جلسات هذا المستخدم في Clarity لاحقًا.
        </p>
      </div>

      <div className="flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="user-id"
          className="font-mono text-left h-8 text-xs"
          dir="ltr"
          disabled={saving}
        />
        <Button
          type="button"
          size="sm"
          onClick={save}
          disabled={saving || !dirty}
          className="h-8 gap-1.5 bg-brand hover:bg-brand/90"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          حفظ
        </Button>
      </div>

      {saved ? (
        <div className="flex items-center gap-2 pt-1 border-t border-border">
          <button
            type="button"
            onClick={copyId}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            title="نسخ المعرّف"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? "تم النسخ" : "نسخ"}
          </button>
          <span className="w-px h-3 bg-border" />
          <a
            href={buildClarityUrl(saved)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-brand hover:underline"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            فتح Clarity
          </a>
        </div>
      ) : null}
    </div>
  );
}

export function ViewUserProfileDialog({
  open,
  user,
  badges,
  loading,
  onOpenChange,
}: {
  open: boolean;
  user: UserProfileCardData | null;
  badges: ViewUserBadgeOption[];
  loading?: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { convertToCurrency } = useCurrency();
  const { data: session } = useSession();
  const viewerIsAdmin = session?.user?.role === "ADMIN";
  const [sendDialog, setSendDialog] = React.useState<{
    open: boolean;
    channel: "email" | "whatsapp";
  }>({ open: false, channel: "email" });
  const [idCopied, setIdCopied] = React.useState(false);

  const formatMoney = (n: number) => {
    const r = convertToCurrency(n);
    if (r?.convertedValue != null && r?.currency) {
      const sym =
        r.currency === "USD"
          ? "$"
          : r.currency === "EUR"
            ? "€"
            : r.currency === "GBP"
              ? "£"
              : r.currency;
      const v = typeof r.convertedValue === "number" ? r.convertedValue : 0;
      return `${sym}${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
    }
    return `$${(typeof n === "number" ? n : 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  };

  // Flag + name share one resolver so they can never disagree (the legacy
  // `country` text field used to drift from `countryCode`, producing a flag of
  // one country next to the name of another).
  const resolvedCountry = user ? resolveUserCountry(user) : null;
  const mapsUrl = user
    ? buildGoogleMapsUrl([user.city, user.region, resolvedCountry?.name])
    : null;

  // `gender` is free text on the model, so normalise before picking a label or
  // an icon; `birthdate` is an ISO string, and the age beside it saves the
  // reader doing the arithmetic.
  const normalizedGender = normalizeGender(user?.gender);
  const genderIcon =
    normalizedGender === "male" ? Mars : normalizedGender === "female" ? Venus : CircleHelp;
  const birthdateLabel = formatBirthdateAr(user?.birthdate);
  const age = ageFromBirthdate(user?.birthdate);

  const copyUserId = async () => {
    if (!user?.id) return;
    try {
      await navigator.clipboard.writeText(user.id);
      setIdCopied(true);
      window.setTimeout(() => setIdCopied(false), 1500);
    } catch {
      /* silent */
    }
  };

  const roleStyle = ROLE_STYLE[user?.role ?? "DONOR"] ?? ROLE_STYLE.DONOR;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogOverlay className="fixed inset-0 bg-black/40" />
      <DialogContent
        className="fixed left-1/2 top-1/2 w-[calc(100%-2rem)] max-w-2xl max-h-[90vh] p-0 transform -translate-x-1/2 -translate-y-1/2 border border-border rounded-xl shadow-2xl bg-card overflow-hidden flex flex-col"
        {...({
          closeClassName:
            "left-3 top-3 right-auto text-white hover:text-white opacity-90 hover:opacity-100",
        } as React.ComponentProps<typeof DialogContent>)}
        dir="rtl"
        aria-labelledby="view-user-title-global"
      >
        {loading && (
          <>
            <DialogTitle className="sr-only">جاري تحميل ملف المستخدم</DialogTitle>
            <div className="p-12 flex items-center justify-center bg-background">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              <span className="ms-2 text-sm text-muted-foreground">جاري تحميل الملف…</span>
            </div>
          </>
        )}

        {!loading && user && (
          <>
            <DialogTitle id="view-user-title-global" className="sr-only">
              ملف المستخدم — {user.name ?? user.email ?? user.id}
            </DialogTitle>

            {/* ── Header ─────────────────────────────────────────────────────── */}
            <div className="bg-gradient-to-br from-slate-800 to-slate-700 text-white px-4 py-3 shrink-0">
              <div className="flex items-center gap-3 pl-9">
                <div className="w-12 h-12 rounded-full bg-white/15 flex items-center justify-center overflow-hidden shrink-0 ring-2 ring-white/10">
                  {user.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={user.image} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <UserCircle className="w-7 h-7 text-white/80" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <h2 className="text-base font-bold truncate">{user.name || "—"}</h2>
                    <span
                      className={cn(
                        "px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide shrink-0",
                        roleStyle.cls
                      )}
                    >
                      {roleStyle.label}
                    </span>
                  </div>
                  <p className="text-white/70 text-xs truncate mt-0.5">
                    {user.email || "—"}
                    {user.phone ? <span className="mx-2 opacity-60">·</span> : null}
                    {user.phone ? <span dir="ltr">{user.phone}</span> : null}
                  </p>
                </div>
              </div>
            </div>

            {/* ── Body (scrollable) ──────────────────────────────────────────── */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 bg-background">
              {/* Stats strip */}
              <div className="grid grid-cols-3 gap-2">
                <StatBox
                  icon={Receipt}
                  label="عدد التبرعات"
                  value={user.totalDonationsCount ?? 0}
                />
                <StatBox
                  icon={TrendingUp}
                  label="الإجمالي"
                  value={
                    <span dir="ltr">
                      {user.totalDonatedAmountUSD != null
                        ? formatMoney(user.totalDonatedAmountUSD)
                        : "—"}
                    </span>
                  }
                />
                <StatBox
                  icon={Clock}
                  label="آخر تبرع"
                  value={user.lastDonationAt ? formatDateAr(user.lastDonationAt) : "—"}
                />
              </div>

              {/* Two-column info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <SectionCard title="معلومات التواصل" icon={UserCircle}>
                  <div className="space-y-1.5">
                    <InfoRow icon={Mail} label="البريد">
                      <span title={user.email ?? undefined}>{user.email ?? "—"}</span>
                    </InfoRow>
                    <InfoRow icon={Phone} label="الهاتف">
                      <span dir="ltr">{user.phone ?? "—"}</span>
                    </InfoRow>
                    <InfoRow icon={Globe} label="الدولة">
                      <span className="inline-flex items-center gap-1.5 min-w-0">
                        {resolvedCountry?.code ? (
                          <ReactCountryFlag
                            countryCode={resolvedCountry.code}
                            svg
                            style={{ width: "1.05em", height: "1.05em" }}
                            title={resolvedCountry.code}
                          />
                        ) : null}
                        <span className="truncate">
                          {resolvedCountry?.name ?? "—"}
                        </span>
                      </span>
                    </InfoRow>
                    <InfoRow icon={MapPin} label="الموقع">
                      {mapsUrl ? (
                        <a
                          href={mapsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-brand hover:underline inline-flex items-center gap-1 min-w-0"
                          title="فتح في خرائط Google"
                        >
                          <span className="truncate">
                            {[user.city, user.region].filter(Boolean).join(" — ") || "—"}
                          </span>
                          <ExternalLink className="w-3 h-3 shrink-0 opacity-70" aria-hidden />
                        </a>
                      ) : (
                        <span>{[user.city, user.region].filter(Boolean).join(" — ") || "—"}</span>
                      )}
                    </InfoRow>
                  </div>
                </SectionCard>

                <SectionCard title="بيانات الحساب" icon={Calendar}>
                  <div className="space-y-1.5">
                    <InfoRow icon={Languages} label="اللغة">
                      {LOCALE_LABELS[user.preferredLang as keyof typeof LOCALE_LABELS] ?? "—"}
                    </InfoRow>
                    {/* Collected at signup, at complete-profile and inside the donation
                        dialog, but never shown to the team until now. */}
                    <InfoRow icon={genderIcon} label="الجنس">
                      {normalizedGender ? GENDER_LABEL_AR[normalizedGender] : "—"}
                    </InfoRow>
                    <InfoRow icon={Cake} label="تاريخ الميلاد">
                      {birthdateLabel ? (
                        <span>
                          {birthdateLabel}
                          {age !== null && (
                            <span className="text-muted-foreground"> · {age} سنة</span>
                          )}
                        </span>
                      ) : (
                        "—"
                      )}
                    </InfoRow>
                    <InfoRow icon={Calendar} label="التسجيل">
                      {formatDateAr(user.createdAt)}
                    </InfoRow>
                    <InfoRow icon={Clock} label="آخر تحديث">
                      {formatDateAr(user.updatedAt)}
                    </InfoRow>
                    <div className="flex items-center gap-2 text-[13px] min-w-0">
                      <Hash className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <span className="text-muted-foreground shrink-0">المعرّف</span>
                      <button
                        type="button"
                        onClick={copyUserId}
                        title={user.id}
                        className="font-mono text-xs text-foreground min-w-0 flex-1 truncate text-right hover:text-brand inline-flex items-center justify-end gap-1"
                      >
                        <span className="truncate" dir="ltr">{user.id}</span>
                        {idCopied ? (
                          <Check className="w-3 h-3 text-emerald-600 shrink-0" />
                        ) : (
                          <Copy className="w-3 h-3 opacity-60 shrink-0" />
                        )}
                      </button>
                    </div>
                  </div>
                </SectionCard>
              </div>

              {/* Roles & permissions — STAFF only (admins are obvious from the header). */}
              {user.role === "STAFF" && (
                <SectionCard title="الصلاحيات">
                  {(user.dashboardPermissions ?? []).length === 0 ? (
                    <p className="text-xs text-muted-foreground">لا توجد صلاحيات مفعّلة</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {(user.dashboardPermissions ?? []).map((key) => {
                        const row =
                          DASHBOARD_PERMISSION_ROWS.find((r) => r.key === key) ??
                          ACTION_PERMISSION_ROWS.find((r) => r.key === key);
                        if (!row) return null;
                        const isAction = ACTION_PERMISSION_ROWS.some((r) => r.key === key);
                        return (
                          <span
                            key={key}
                            className={cn(
                              "inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium text-white",
                              isAction ? "bg-slate-600" : "bg-brand"
                            )}
                          >
                            {row.title}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </SectionCard>
              )}

              {/* Badges */}
              {(user.badgeIds ?? []).length > 0 && (
                <SectionCard title="الشارات" icon={Award}>
                  <div className="flex flex-wrap gap-1.5">
                    {user.badgeIds.map((bid) => {
                      const badge = badges.find((b) => b.id === bid);
                      if (!badge) return null;
                      return (
                        <span
                          key={bid}
                          className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium text-white"
                          style={{ backgroundColor: badge.color }}
                        >
                          {badge.translatedName || badge.name}
                        </span>
                      );
                    })}
                  </div>
                </SectionCard>
              )}

              {/* Attribution journey */}
              {user.totalDonationsCount > 0 && user.role !== "ADMIN" && (
                <DonorAttributionJourney donorId={user.id} />
              )}
            </div>

            {/* ── Footer (sticky) ────────────────────────────────────────────── */}
            <div className="px-4 py-2.5 border-t border-border bg-card shrink-0 flex items-center justify-between gap-2">
              <div className="flex items-center">
                {viewerIsAdmin && (
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className={cn(
                          "h-8 w-8 text-muted-foreground hover:text-foreground",
                          user.clarityId && "text-brand"
                        )}
                        title={
                          user.clarityId ? "معرّف Clarity مرتبط" : "ربط معرّف Clarity (اختياري)"
                        }
                        aria-label="إعدادات متقدمة"
                      >
                        <Settings2 className="w-4 h-4" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent align="start" side="top" className="w-80 p-3">
                      <ClaritySettingsPopover
                        userId={user.id}
                        initialClarityId={user.clarityId}
                      />
                    </PopoverContent>
                  </Popover>
                )}
              </div>

              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={() => setSendDialog({ open: true, channel: "whatsapp" })}
                  disabled={!user.phone}
                  title={!user.phone ? "لا يوجد رقم هاتف" : undefined}
                  className="h-8 gap-1.5 bg-[#25D366] hover:bg-[#25D366]/90 text-white"
                >
                  <MessageCircle className="w-3.5 h-3.5" /> واتساب
                </Button>
                <Button
                  size="sm"
                  onClick={() => setSendDialog({ open: true, channel: "email" })}
                  disabled={!user.email}
                  title={!user.email ? "لا يوجد بريد إلكتروني" : undefined}
                  className="h-8 gap-1.5 bg-brand hover:bg-brand/90"
                >
                  <Mail className="w-3.5 h-3.5" /> بريد
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>

      {user && (
        <SendTemplateDialog
          open={sendDialog.open}
          onOpenChange={(open) => setSendDialog((prev) => ({ ...prev, open }))}
          channel={sendDialog.channel}
          target={{ kind: "user", userId: user.id }}
        />
      )}
    </Dialog>
  );
}
