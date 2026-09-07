"use client";

import React, { useEffect, useState } from "react";
import axios from "axios";
import { useSession, signOut } from "next-auth/react";
import { useLocale, useTranslations } from "next-intl";
import { Toaster, toast } from "react-hot-toast";
import ReactCountryFlag from "react-country-flag";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Bell,
  Calendar,
  Check,
  CheckCircle2,
  ChevronRight,
  CreditCard,
  Globe,
  HandHeart,
  Headphones,
  Loader2,
  LogOut,
  Mail,
  MapPin,
  PauseCircle,
  Phone,
  PlayCircle,
  Receipt,
  Repeat,
  Settings,
  Shield,
  User,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { useCurrency } from "@/context/CurrencyContext";
import EditDialog from "./_components/EditDialog";
import AvatarUploader from "./_components/AvatarUploader";
import CountryPicker, { CountryRow } from "./_components/CountryPicker";
import ChangePasswordDialog from "./_components/ChangePasswordDialog";
import ImpactCard, { ImpactCompact } from "./_components/ImpactCard";
import SupportForm from "./_components/SupportForm";

interface DonationForProfile {
  id: string;
  amount: number;
  amountUSD?: number | null;
  totalAmount: number;
  currency: string;
  type: string;
  paymentStatus?: string | null;
  paymentMethod?: string | null;
  paidAt?: string | null;
  status: string | null;
  subscriptionId?: string | null;
  nextBillingDate?: string | null;
  createdAt: string;
  subscriptionStartedAt?: string;
  teamSupport?: number;
  fees?: number;
  coverFees?: boolean;
  items: Array<{
    id: string;
    amount: number;
    amountUSD?: number | null;
    campaignId: string;
    shareCount?: number | null;
    campaign?: { title?: string; images?: string[] };
  }>;
  [key: string]: unknown;
}

interface UserProfile {
  id?: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
  country?: string | null;
  countryCode?: string | null;
  countryName?: string | null;
  region?: string | null;
  city?: string | null;
  phone?: string | null;
  birthdate?: string | null;
  gender?: string | null;
  emailNotifications?: boolean;
  smsNotifications?: boolean;
  hasPassword?: boolean;
  /** Filled server-side: true if user.password is set */
  password?: string | null;
  // Impact stats from GET /api/users/[id]
  totalDonationsCount?: number;
  totalDonatedAmountUSD?: number;
  currentMonthlyMrrUSD?: number;
  activeSubscriptionsCount?: number;
  supportedCampaignsCount?: number;
  streakMonths?: number;
  badgeIds?: string[];
  lastDonationAt?: string | null;
  donations?: DonationForProfile[];
  [key: string]: unknown;
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "$",
  EUR: "€",
  GBP: "£",
  TRY: "₺",
  SAR: "ر.س",
  AED: "د.إ",
};

function formatDonationAmount(amount: number, currency: string = "USD") {
  const sym = CURRENCY_SYMBOLS[currency] || currency + " ";
  const value = typeof amount === "number" ? amount : 0;
  const formatted = value.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  return `${sym}${formatted}`;
}

function donationPaymentChargeStatus(d: Pick<DonationForProfile, "paymentStatus">) {
  return String(d.paymentStatus ?? "").toUpperCase();
}

function donationReceiptAllowed(d: Pick<DonationForProfile, "paymentStatus">) {
  return donationPaymentChargeStatus(d) === "PAID";
}

const ProfilePage = () => {
  const t = useTranslations("Profile");
  const { data: session } = useSession();
  const locale = useLocale();
  const isRtl = locale === "ar";
  const { convertToCurrency } = useCurrency();

  const navigationItems = [
    { id: "account", label: t("nav.myinfo"), icon: User, description: t("nav.accountDesc") },
    { id: "donations", label: t("nav.donations"), icon: HandHeart, description: t("nav.donationsDesc") },
    { id: "settings", label: t("nav.settings"), icon: Settings, description: t("nav.settingsDesc") },
    { id: "support", label: t("nav.support"), icon: Headphones, description: t("nav.supportDesc") },
  ];

  const [user, setUser] = useState<UserProfile | null>(null);
  const [activeTab, setActiveTab] = useState("account");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [selectedPeriod, setSelectedPeriod] = useState("all");
  const [paymentFilter, setPaymentFilter] = useState<"all" | "PAID" | "FAILED">("all");
  const [isLoading, setIsLoading] = useState(false);
  const [isDownloading, setIsDownloading] = useState<string | null>(null);
  const [isPauseDialogOpen, setIsPauseDialogOpen] = useState(false);
  const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false);
  const [selectedDonation, setSelectedDonation] = useState<DonationForProfile | null>(null);
  const [subscriptionSettingsDonation, setSubscriptionSettingsDonation] =
    useState<DonationForProfile | null>(null);
  const [countryPickerOpen, setCountryPickerOpen] = useState(false);
  const [savingNotifications, setSavingNotifications] = useState<"email" | "sms" | null>(null);

  const id = session?.user?.id;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const tabParam = params.get("tab");
    if (tabParam && navigationItems.some((item) => item.id === tabParam)) {
      setActiveTab(tabParam);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await axios.get(`/api/users/${id}`);
        if (!cancelled) setUser(res.data.user as UserProfile);
      } catch (err) {
        if (!cancelled) setError(t("misc.failedToFetchUser"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, t]);

  const handleLogout = async () => {
    await signOut({ callbackUrl: "/" });
  };

  const handleUpdateField = async (field: string, value: string) => {
    if (!id) return;
    try {
      await axios.put(`/api/users/${id}`, { [field]: value });
      setUser((prev) => {
        if (!prev) return prev;
        const next = { ...prev, [field]: value } as UserProfile;
        if (field === "countryName") next.country = value;
        return next;
      });
      toast.success(t("toast.updateSuccess"));
    } catch {
      toast.error(t("toast.updateFailed"));
    }
  };

  const handleCountrySelect = async (countryCode: string, countryName: string) => {
    if (!id) return;
    try {
      await axios.put(`/api/users/${id}`, { countryCode, countryName });
      setUser((prev) =>
        prev ? { ...prev, countryCode, countryName, country: countryName } : prev
      );
      toast.success(t("toast.updateSuccess"));
      setCountryPickerOpen(false);
    } catch {
      toast.error(t("toast.updateFailed"));
    }
  };

  const handleNotificationToggle = async (kind: "email" | "sms", value: boolean) => {
    if (!id) return;
    setSavingNotifications(kind);
    try {
      const field = kind === "email" ? "emailNotifications" : "smsNotifications";
      await axios.put(`/api/users/${id}`, { [field]: value });
      setUser((prev) => (prev ? { ...prev, [field]: value } : prev));
      toast.success(t("toast.notificationsUpdated"));
    } catch {
      toast.error(t("toast.updateFailed"));
    } finally {
      setSavingNotifications(null);
    }
  };

  // ─────────────────────────── donations / subscriptions ───────────────────

  const handleToggleSubscription = (donation: DonationForProfile) => {
    setSelectedDonation(donation);
    setIsPauseDialogOpen(true);
  };

  const handleConfirmToggle = async () => {
    if (!selectedDonation) return;
    setIsLoading(true);
    try {
      const newStatus = selectedDonation.status === "ACTIVE" ? "PAUSED" : "ACTIVE";
      const response = await axios.put(`/api/donations/${selectedDonation.id}`, {
        status: newStatus,
      });
      const updated = response.data as DonationForProfile;
      setUser((prev) => {
        if (!prev || !prev.donations) return prev;
        return {
          ...prev,
          donations: prev.donations.map((d) =>
            d.id === selectedDonation.id ? { ...d, ...updated } : d
          ),
        };
      });
      if (subscriptionSettingsDonation?.id === selectedDonation.id) {
        setSubscriptionSettingsDonation((prev) => (prev ? { ...prev, ...updated } : null));
      }
      toast.success(
        newStatus === "ACTIVE"
          ? t("toast.subscriptionActivated")
          : t("toast.subscriptionPaused")
      );
    } catch {
      toast.error(t("toast.subscriptionUpdateError"));
    } finally {
      setIsLoading(false);
      setIsPauseDialogOpen(false);
      setSelectedDonation(null);
    }
  };

  const handleCancelSubscription = async () => {
    if (!subscriptionSettingsDonation) return;
    setIsLoading(true);
    try {
      const response = await axios.put(
        `/api/donations/${subscriptionSettingsDonation.id}`,
        { status: "CANCELLED" }
      );
      const updated = response.data as DonationForProfile;
      setUser((prev) => {
        if (!prev || !prev.donations) return prev;
        return {
          ...prev,
          donations: prev.donations.map((d) =>
            d.id === subscriptionSettingsDonation.id ? { ...d, ...updated } : d
          ),
        };
      });
      setSubscriptionSettingsDonation(null);
      setIsCancelDialogOpen(false);
      toast.success(t("toast.subscriptionCancelled"));
    } catch {
      toast.error(t("toast.subscriptionUpdateError"));
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownload = async (donationId: string) => {
    try {
      setIsDownloading(donationId);
      const localeParam = typeof locale === "string" ? locale : "en";
      const response = await axios.get(
        `/api/donations/${donationId}/receipt?locale=${encodeURIComponent(localeParam)}`,
        { responseType: "blob", timeout: 30000, validateStatus: (s) => s === 200 }
      );
      if (!(response.data instanceof Blob)) throw new Error("invalid response");
      const blob = new Blob([response.data], { type: "application/pdf" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `receipt-${donationId.slice(-8)}.pdf`);
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
      }, 100);
      toast.success(t("toast.receiptDownloadSuccess"));
    } catch {
      toast.error(t("toast.receiptDownloadFailed"));
    } finally {
      setIsDownloading(null);
    }
  };

  const handleDownloadAll = async (donations: DonationForProfile[]) => {
    try {
      setIsDownloading("all");
      for (const donation of donations) {
        await handleDownload(donation.id);
      }
      toast.success(t("toast.allReceiptsDownloadSuccess"));
    } catch {
      toast.error(t("toast.allReceiptsDownloadFailed"));
    } finally {
      setIsDownloading(null);
    }
  };

  // ────────────────────────────── render helpers ───────────────────────────

  const renderAccount = (u: UserProfile) => (
    <div className="space-y-6">
      {/* Profile header */}
      <Card className="p-6 sm:p-8 bg-gradient-to-br from-[#A5243D]/5 via-white to-[#A5243D]/5 border-[#A5243D]/15">
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
          {id && (
            <AvatarUploader
              userId={id}
              image={u.image}
              name={u.name}
              email={u.email}
              onUpdated={(nextImage) =>
                setUser((prev) => (prev ? { ...prev, image: nextImage } : prev))
              }
              size="xl"
            />
          )}
          <div className="text-center sm:text-start flex-1 min-w-0">
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
              <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 truncate">
                {u.name || t("account.namePlaceholder")}
              </h2>
              <Badge
                variant="secondary"
                className="bg-[#A5243D]/10 text-[#A5243D] border-[#A5243D]/20 gap-1"
              >
                <CheckCircle2 className="w-3 h-3" />
                {t("account.verified")}
              </Badge>
            </div>
            <p className="text-gray-600 mt-1.5 truncate">{u.email}</p>
            {(u.countryName || u.city) && (
              <p className="mt-2 text-sm text-gray-500 inline-flex items-center gap-2 flex-wrap justify-center sm:justify-start">
                {u.countryCode && /^[A-Za-z]{2}$/.test(u.countryCode) && (
                  <ReactCountryFlag
                    countryCode={u.countryCode.toUpperCase()}
                    svg
                    style={{ width: "1.1em", height: "1.1em" }}
                  />
                )}
                {[u.city, u.region, u.countryName ?? u.country].filter(Boolean).join(" • ")}
              </p>
            )}
          </div>
        </div>
      </Card>

      {/* Impact summary */}
      <ImpactCard
        totalDonationsCount={u.totalDonationsCount}
        totalDonatedAmountUSD={u.totalDonatedAmountUSD}
        currentMonthlyMrrUSD={u.currentMonthlyMrrUSD}
        activeSubscriptionsCount={u.activeSubscriptionsCount}
        supportedCampaignsCount={u.supportedCampaignsCount}
        streakMonths={u.streakMonths}
        badgesCount={u.badgeIds?.length ?? 0}
        lastDonationAt={u.lastDonationAt ?? null}
        locale={locale}
      />

      {/* Personal info */}
      <section>
        <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <User className="w-5 h-5 text-[#A5243D]" />
          {t("account.personalInfo")}
        </h3>
        <Card className="divide-y divide-gray-100 overflow-hidden">
          <EditDialog
            title={t("account.name")}
            value={u.name ?? ""}
            onSave={(value) => handleUpdateField("name", value)}
            icon={User}
          />
          <EditDialog
            title={t("account.email")}
            value={u.email ?? ""}
            onSave={(value) => handleUpdateField("email", value)}
            type="email"
            icon={Mail}
          />
          <EditDialog
            title={t("account.phone")}
            value={u.phone ?? ""}
            onSave={(value) => handleUpdateField("phone", value)}
            type="tel"
            icon={Phone}
          />
          <EditDialog
            title={t("account.birthdate")}
            value={u.birthdate ?? ""}
            onSave={(value) => handleUpdateField("birthdate", value)}
            type="date"
            icon={Calendar}
          />
          <EditDialog
            title={t("account.gender")}
            value={u.gender ?? ""}
            onSave={(value) => handleUpdateField("gender", value)}
            icon={User}
          />
        </Card>
      </section>

      {/* Address */}
      <section>
        <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <MapPin className="w-5 h-5 text-[#A5243D]" />
          {t("account.addressTitle")}
        </h3>
        <Card className="divide-y divide-gray-100 overflow-hidden">
          <CountryRow
            countryCode={u.countryCode}
            countryName={u.countryName ?? u.country}
            onClick={() => setCountryPickerOpen(true)}
          />
          <EditDialog
            title={t("account.region")}
            value={u.region ?? ""}
            onSave={(value) => handleUpdateField("region", value)}
            icon={MapPin}
          />
          <EditDialog
            title={t("account.city")}
            value={u.city ?? ""}
            onSave={(value) => handleUpdateField("city", value)}
            icon={MapPin}
          />
        </Card>
      </section>
    </div>
  );

  const renderSettings = (u: UserProfile) => {
    const hasPassword = Boolean(u.password) || Boolean(u.hasPassword);
    return (
      <div className="space-y-6">
        {/* Security */}
        <section>
          <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <Shield className="w-5 h-5 text-[#A5243D]" />
            {t("settings.securityTitle")}
          </h3>
          <Card className="p-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h4 className="font-medium text-gray-900">{t("password.label")}</h4>
                <p className="text-sm text-gray-500 mt-1">
                  {hasPassword ? t("password.descSet") : t("password.descUnset")}
                </p>
              </div>
              {id && <ChangePasswordDialog userId={id} hasPassword={hasPassword} />}
            </div>
          </Card>
        </section>

        {/* Notifications */}
        <section>
          <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <Bell className="w-5 h-5 text-[#A5243D]" />
            {t("settings.notifications")}
          </h3>
          <Card className="divide-y divide-gray-100">
            <div className="flex items-center justify-between gap-4 p-5">
              <div className="flex-1">
                <h4 className="font-medium text-gray-900 flex items-center gap-2">
                  <Mail className="w-4 h-4 text-gray-400" />
                  {t("settings.emailNotifications")}
                </h4>
                <p className="text-sm text-gray-500 mt-1">{t("settings.emailNotificationsDesc")}</p>
              </div>
              <div className="flex items-center gap-2">
                {savingNotifications === "email" && (
                  <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                )}
                <Switch
                  checked={u.emailNotifications ?? true}
                  onCheckedChange={(value) => handleNotificationToggle("email", value)}
                  disabled={savingNotifications === "email"}
                />
              </div>
            </div>
            <div className="flex items-center justify-between gap-4 p-5">
              <div className="flex-1">
                <h4 className="font-medium text-gray-900 flex items-center gap-2">
                  <Phone className="w-4 h-4 text-gray-400" />
                  {t("settings.smsNotifications")}
                </h4>
                <p className="text-sm text-gray-500 mt-1">{t("settings.smsNotificationsDesc")}</p>
              </div>
              <div className="flex items-center gap-2">
                {savingNotifications === "sms" && (
                  <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                )}
                <Switch
                  checked={u.smsNotifications ?? true}
                  onCheckedChange={(value) => handleNotificationToggle("sms", value)}
                  disabled={savingNotifications === "sms"}
                />
              </div>
            </div>
          </Card>
        </section>
      </div>
    );
  };

  const renderDonations = (u: UserProfile) => {
    const matchesPeriod = (donation: DonationForProfile) => {
      const date = new Date(donation.createdAt);
      const now = new Date();
      switch (selectedPeriod) {
        case "month":
          return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
        case "year":
          return date.getFullYear() === now.getFullYear();
        default:
          return true;
      }
    };

    const donationsInPeriod = u.donations?.filter(matchesPeriod) ?? [];
    const isSuccessfulCharge = (d: DonationForProfile) => donationReceiptAllowed(d);
    const successfulInPeriod = donationsInPeriod.filter(isSuccessfulCharge);
    const forReceiptDownload = successfulInPeriod;

    const filteredHistory = donationsInPeriod.filter((d) => {
      if (paymentFilter === "all") return true;
      return donationPaymentChargeStatus(d) === paymentFilter;
    });

    const subscriptionRows: DonationForProfile[] = (() => {
      const monthly = (u.donations ?? []).filter(
        (d) => d.type === "MONTHLY" && d.subscriptionId
      );
      const bySub = new Map<string, DonationForProfile[]>();
      for (const d of monthly) {
        const sid = String(d.subscriptionId);
        const arr = bySub.get(sid) ?? [];
        arr.push(d);
        bySub.set(sid, arr);
      }
      return Array.from(bySub.values())
        .map((list) => {
          const desc = [...list].sort(
            (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );
          const asc = [...list].sort(
            (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          );
          const rep = desc[0];
          return { ...rep, subscriptionStartedAt: asc[0]?.createdAt ?? rep.createdAt };
        })
        .sort(
          (a, b) =>
            new Date(b.subscriptionStartedAt ?? b.createdAt).getTime() -
            new Date(a.subscriptionStartedAt ?? a.createdAt).getTime()
        );
    })();

    const totalHistoryUSD =
      successfulInPeriod.reduce(
        (sum: number, d) => sum + (d.amountUSD ?? d.totalAmount),
        0
      ) || 0;
    const totalAmountConverted = convertToCurrency(totalHistoryUSD);
    const totalDisplayValue =
      totalAmountConverted?.convertedValue != null && totalAmountConverted?.currency
        ? totalAmountConverted.convertedValue
        : totalHistoryUSD;
    const totalDisplayCurrency = totalAmountConverted?.currency ?? "USD";
    const totalDisplaySymbol =
      CURRENCY_SYMBOLS[totalDisplayCurrency] || totalDisplayCurrency + " ";
    const totalDisplayFormatted =
      typeof totalDisplayValue === "number"
        ? totalDisplayValue.toLocaleString(undefined, {
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
          })
        : "0";

    const monthlyCount =
      u.donations?.filter((d) => d.type === "MONTHLY" && d.status === "ACTIVE").length || 0;
    const campaignCount = new Set(
      (u.donations ?? [])
        .filter(isSuccessfulCharge)
        .flatMap((d) => d.items?.map((i) => i.campaignId) ?? [])
    ).size;

    const statusLabel = (d: DonationForProfile) => {
      if (d.status === "ACTIVE") return t("subscriptions.active");
      if (d.status === "PAUSED") return t("subscriptions.paused");
      return t("subscriptions.cancelled");
    };

    const formatCampaignCell = (d: DonationForProfile) => {
      const items = d.items ?? [];
      if (items.length === 0) return t("donations.noCampaignTitle");
      return items
        .map((item) => {
          const title = item.campaign?.title?.trim() || t("donations.noCampaignTitle");
          const shares =
            item.shareCount != null && item.shareCount > 0
              ? ` (${t("donations.sharesCount", { count: item.shareCount })})`
              : "";
          return `${title}${shares}`;
        })
        .join(" · ");
    };

    const subscriptionCampaignsLine = (d: DonationForProfile) =>
      d.items?.map((item) => item.campaign?.title).filter(Boolean).join(" · ") || "—";

    const formatBillingDate = (iso?: string | null) =>
      iso
        ? new Date(iso).toLocaleDateString(locale === "ar" ? "ar-EG" : undefined)
        : t("subscriptions.noDate");

    const emptyTable = (message: string) => (
      <div className="flex flex-col items-center justify-center py-12 text-gray-500">
        <Receipt className="w-12 h-12 mb-3 text-[#A5243D] opacity-60" />
        <p className="text-sm font-medium text-center px-4">{message}</p>
      </div>
    );

    return (
      <div className="space-y-6">
        {/* mini stat row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="p-5 bg-gradient-to-br from-[#A5243D]/8 to-white border-[#A5243D]/20">
            <p className="text-xs font-semibold text-[#A5243D] uppercase tracking-wider">
              {t("donations.totalInPeriodTitle")}
            </p>
            <p className="text-2xl font-bold text-gray-900 mt-2">
              {totalDisplaySymbol}
              {totalDisplayFormatted}
            </p>
            <p className="text-xs text-gray-600 mt-1">
              {t("donations.successfulPaymentsInPeriod", { count: successfulInPeriod.length })}
            </p>
          </Card>
          <Card className="p-5 bg-gradient-to-br from-[#A5243D]/8 to-white border-[#D8AA55]/20">
            <p className="text-xs font-semibold text-[#D8AA55] uppercase tracking-wider">
              {t("donations.monthlyDonations")}
            </p>
            <p className="text-2xl font-bold text-gray-900 mt-2">{monthlyCount}</p>
            <p className="text-xs text-gray-600 mt-1">{t("donations.activeSubscription")}</p>
          </Card>
          <Card className="p-5 bg-gradient-to-br from-emerald-50 to-white border-emerald-200">
            <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wider">
              {t("donations.supportedCampaigns")}
            </p>
            <p className="text-2xl font-bold text-gray-900 mt-2">{campaignCount}</p>
            <p className="text-xs text-gray-600 mt-1">{t("donations.campaign")}</p>
          </Card>
        </div>

        {/* filters */}
        <Card className="p-4">
          <div className="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-4">
            <div className="flex flex-col sm:flex-row flex-wrap gap-3">
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                  {t("donations.timePeriod")}
                </p>
                <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
                  <SelectTrigger className="w-full sm:w-[200px]">
                    <SelectValue placeholder={t("donations.timePeriod")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("donations.allPeriods")}</SelectItem>
                    <SelectItem value="month">{t("donations.thisMonth")}</SelectItem>
                    <SelectItem value="year">{t("donations.thisYear")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                  {t("donations.filterByPayment")}
                </p>
                <Select
                  value={paymentFilter}
                  onValueChange={(v) => setPaymentFilter(v as "all" | "PAID" | "FAILED")}
                >
                  <SelectTrigger className="w-full sm:w-[200px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("donations.filterPaymentAll")}</SelectItem>
                    <SelectItem value="PAID">{t("donations.filterPaymentPaid")}</SelectItem>
                    <SelectItem value="FAILED">{t("donations.filterPaymentFailed")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex flex-col items-stretch sm:items-end gap-1.5 shrink-0">
              <Button
                variant="outline"
                onClick={() => handleDownloadAll(forReceiptDownload)}
                disabled={isDownloading !== null || forReceiptDownload.length === 0}
                className="gap-2 border-[#A5243D] text-[#A5243D] hover:bg-[#A5243D]/5"
              >
                {isDownloading === "all" ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Receipt className="w-4 h-4" />
                )}
                {t("receipts.downloadAllPdf", { count: forReceiptDownload.length })}
              </Button>
              <p className="text-xs text-gray-500 max-w-xs sm:text-right leading-snug">
                {t("receipts.downloadAllHint")}
              </p>
            </div>
          </div>
        </Card>

        {/* history */}
        <section>
          <div className="mb-3">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <HandHeart className="w-5 h-5 text-[#A5243D]" />
              {t("donations.historyTableTitle")}
            </h3>
            <p className="text-sm text-gray-600 mt-1 max-w-3xl">
              {t("donations.historyTableSubtitle")}
            </p>
          </div>
          <Card className="overflow-hidden border-gray-200 shadow-sm">
            {filteredHistory.length === 0 ? (
              emptyTable(
                donationsInPeriod.length === 0
                  ? t("donations.emptyHistoryList")
                  : t("donations.emptyHistoryFiltered")
              )
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm" dir={isRtl ? "rtl" : "ltr"}>
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th
                        className={cn(
                          "font-semibold text-gray-800 py-3 px-3",
                          isRtl ? "text-right" : "text-left"
                        )}
                      >
                        {t("donations.date")}
                      </th>
                      <th
                        className={cn(
                          "font-semibold text-gray-800 py-3 px-3",
                          isRtl ? "text-right" : "text-left"
                        )}
                      >
                        {t("donations.campaignsColumn")}
                      </th>
                      <th
                        className={cn(
                          "font-semibold text-gray-800 py-3 px-3 w-28",
                          isRtl ? "text-right" : "text-left"
                        )}
                      >
                        {t("donations.baseAmount")}
                      </th>
                      <th
                        className={cn(
                          "font-semibold text-gray-800 py-3 px-3 w-28",
                          isRtl ? "text-right" : "text-left"
                        )}
                      >
                        {t("donations.teamSupport")}
                      </th>
                      <th
                        className={cn(
                          "font-semibold text-gray-800 py-3 px-3 w-24",
                          isRtl ? "text-right" : "text-left"
                        )}
                      >
                        {t("donations.transactionFees")}
                      </th>
                      <th
                        className={cn(
                          "font-semibold text-gray-800 py-3 px-3 w-20",
                          isRtl ? "text-left" : "text-right"
                        )}
                      >
                        {t("donations.receipt")}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 bg-white">
                    {filteredHistory
                      .filter((d) => donationPaymentChargeStatus(d) === "PAID")
                      .map((donation) => {
                        const team = donation.teamSupport ?? 0;
                        const fees = donation.fees ?? 0;
                        const base = donation.amount ?? 0;
                        return (
                          <tr key={donation.id} className="hover:bg-slate-50 transition-colors">
                            <td className="py-3 px-3 text-gray-600 whitespace-nowrap">
                              {new Date(donation.createdAt).toLocaleDateString(
                                locale === "ar" ? "ar-EG" : undefined,
                                { day: "numeric", month: "short", year: "numeric" }
                              )}
                            </td>
                            <td className="py-3 px-3 text-gray-800">
                              <p className="truncate font-medium" title={formatCampaignCell(donation)}>
                                {formatCampaignCell(donation)}
                              </p>
                            </td>
                            <td className="py-3 px-3 text-gray-700">
                              {formatDonationAmount(base, donation.currency)}
                            </td>
                            <td className="py-3 px-3 text-gray-700">
                              {team > 0 ? formatDonationAmount(team, donation.currency) : "—"}
                            </td>
                            <td className="py-3 px-3 text-gray-700">
                              {fees > 0 ? formatDonationAmount(fees, donation.currency) : "—"}
                            </td>
                            <td
                              className={cn("py-3 px-3", isRtl ? "text-left" : "text-right")}
                            >
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 text-[#A5243D] hover:bg-[#A5243D]/10"
                                onClick={() => handleDownload(donation.id)}
                                disabled={isDownloading === donation.id}
                              >
                                {isDownloading === donation.id ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <Receipt className="w-4 h-4" />
                                )}
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </section>

        {/* subscriptions */}
        <section>
          <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <Repeat className="w-5 h-5 text-[#A5243D]" />
            {t("subscriptions.settingsTableTitle")}
          </h3>
          <Card className="overflow-hidden">
            {subscriptionRows.length === 0 ? (
              emptyTable(t("subscriptions.emptySubscriptionsList"))
            ) : (
              <div className="divide-y divide-gray-100">
                {subscriptionRows.map((donation) => (
                  <div
                    key={donation.subscriptionId ?? donation.id}
                    className="p-4 sm:p-5 hover:bg-gray-50/60 transition-colors"
                  >
                    <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-xl font-bold text-gray-900">
                            {formatDonationAmount(donation.totalAmount, donation.currency)}
                          </p>
                          <span className="text-sm text-gray-500">{t("subscriptions.perMonth")}</span>
                          <Badge
                            variant="outline"
                            className={
                              donation.status === "ACTIVE"
                                ? "border-green-300 bg-green-50 text-green-700"
                                : donation.status === "PAUSED"
                                ? "border-amber-300 bg-amber-50 text-amber-700"
                                : "border-gray-300 text-gray-600"
                            }
                          >
                            {statusLabel(donation)}
                          </Badge>
                        </div>
                        <div className="mt-1.5 text-sm text-gray-600 flex flex-wrap items-center gap-x-4 gap-y-1">
                          <span>
                            {t("subscriptions.sinceDate")}:{" "}
                            <span className="text-gray-800">
                              {new Date(
                                donation.subscriptionStartedAt ?? donation.createdAt
                              ).toLocaleDateString(locale === "ar" ? "ar-EG" : undefined)}
                            </span>
                          </span>
                          <span>
                            {t("donations.nextBillingDate")}:{" "}
                            <span className="text-gray-800">
                              {formatBillingDate(donation.nextBillingDate)}
                            </span>
                          </span>
                        </div>
                        {subscriptionCampaignsLine(donation) !== "—" && (
                          <p className="mt-2 text-sm text-gray-600 line-clamp-2">
                            {subscriptionCampaignsLine(donation)}
                          </p>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2 lg:justify-end shrink-0">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDownload(donation.id)}
                          disabled={
                            isDownloading === donation.id || !donationReceiptAllowed(donation)
                          }
                          className="gap-1 border-[#A5243D]/40 text-[#A5243D] hover:bg-[#A5243D]/10"
                        >
                          {isDownloading === donation.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Receipt className="w-4 h-4" />
                          )}
                          {t("receipts.downloadPdfShort")}
                        </Button>
                        {donation.status !== "CANCELLED" && (
                          <Button
                            variant="default"
                            size="sm"
                            className="bg-[#A5243D] hover:bg-[#7D1830]"
                            onClick={() => setSubscriptionSettingsDonation(donation)}
                          >
                            <Settings className="w-4 h-4 mr-1.5" />
                            {t("subscriptions.manage")}
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </section>
      </div>
    );
  };

  // Subscription settings dialog (kept as inline render)
  const renderSubscriptionDialog = () => {
    const sub = subscriptionSettingsDonation;
    if (!sub) return null;
    const isActive = sub.status === "ACTIVE";
    return (
      <Dialog
        open={!!sub}
        onOpenChange={(open) => !open && setSubscriptionSettingsDonation(null)}
      >
        <DialogContent className="max-w-md" dir={isRtl ? "rtl" : "ltr"}>
          <DialogHeader>
            <DialogTitle>{t("subscriptions.subscriptionSettings")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-6 pt-2">
            <div className="p-4 bg-[#A5243D]/5 border border-[#A5243D]/10 rounded-xl">
              <p className="text-lg font-semibold text-gray-900">
                {formatDonationAmount(sub.totalAmount, sub.currency)}{" "}
                {t("subscriptions.perMonth")}
              </p>
              {sub.items?.map((item) => (
                <p key={item.id} className="text-sm text-gray-600 mt-1">
                  • {item.campaign?.title}
                </p>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {sub.status !== "CANCELLED" && (
                <Button
                  variant={isActive ? "outline" : "default"}
                  className="flex-1"
                  onClick={() => handleToggleSubscription(sub)}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : isActive ? (
                    <>
                      <PauseCircle className="w-4 h-4 mr-2" />
                      {t("subscriptions.pause")}
                    </>
                  ) : (
                    <>
                      <PlayCircle className="w-4 h-4 mr-2" />
                      {t("subscriptions.resume")}
                    </>
                  )}
                </Button>
              )}
              <Button
                variant="outline"
                className="gap-2 border-[#A5243D]/40 text-[#A5243D] hover:bg-[#A5243D]/10"
                onClick={() => handleDownload(sub.id)}
                disabled={isDownloading === sub.id || !donationReceiptAllowed(sub)}
              >
                {isDownloading === sub.id ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Receipt className="w-4 h-4" />
                )}
                {t("receipts.downloadPdfShort")}
              </Button>
            </div>
            {sub.status !== "CANCELLED" && (
              <>
                <Separator />
                <Button
                  variant="ghost"
                  className="w-full text-red-600 hover:text-red-700 hover:bg-red-50"
                  onClick={() => setIsCancelDialogOpen(true)}
                >
                  {t("subscriptions.cancelSubscription")}
                </Button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    );
  };

  const renderContent = (currentUser: UserProfile) => {
    switch (activeTab) {
      case "account":
        return renderAccount(currentUser);
      case "donations":
        return renderDonations(currentUser);
      case "settings":
        return renderSettings(currentUser);
      case "support":
        return id ? <SupportForm userId={id} /> : null;
      default:
        return null;
    }
  };

  // ───────────────────────────── early states ──────────────────────────────

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <Loader2 className="w-12 h-12 animate-spin text-[#A5243D]" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <Card className="p-8 text-center max-w-md">
          <p className="text-red-600 text-lg font-semibold">{error}</p>
          <Button className="mt-4" onClick={() => window.location.reload()}>
            {t("misc.tryAgain")}
          </Button>
        </Card>
      </div>
    );
  }

  if (!user) return null;

  // ─────────────────────────────── sidebar ─────────────────────────────────
  const Sidebar = () => (
    <div className="flex flex-col h-full rounded-2xl border border-gray-200 shadow-sm bg-white">
      <div className="p-6 border-b border-gray-100">
        <div className="flex flex-col items-center text-center">
          {id && (
            <AvatarUploader
              userId={id}
              image={user.image}
              name={user.name}
              email={user.email}
              onUpdated={(nextImage) =>
                setUser((prev) => (prev ? { ...prev, image: nextImage } : prev))
              }
              size="md"
            />
          )}
          <h2 className="mt-4 text-lg font-semibold text-gray-900 truncate w-full">
            {user.name || t("account.namePlaceholder")}
          </h2>
          <p className="text-sm text-gray-500 truncate w-full mt-1">{user.email}</p>
        </div>
        <ImpactCompact
          totalDonationsCount={user.totalDonationsCount}
          totalDonatedAmountUSD={user.totalDonatedAmountUSD}
          streakMonths={user.streakMonths}
        />
      </div>

      <nav className="flex-1 p-4 space-y-1" dir={isRtl ? "rtl" : "ltr"}>
        {navigationItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all",
                isActive
                  ? "bg-[#A5243D] text-white shadow-md shadow-[#A5243D]/20"
                  : "text-gray-700 hover:bg-gray-100"
              )}
            >
              <Icon className="w-5 h-5 shrink-0" />
              <div className="flex-1 text-start">
                <p className={cn(isActive ? "text-white" : "text-gray-900")}>{item.label}</p>
                {!isActive && (
                  <p className="text-xs text-gray-500 mt-0.5">{item.description}</p>
                )}
              </div>
              {isActive ? (
                <Check className="w-4 h-4" />
              ) : (
                <ChevronRight className={cn("w-4 h-4 text-gray-300", isRtl && "rotate-180")} />
              )}
            </button>
          );
        })}
      </nav>

      <div className="p-4 border-t border-gray-100">
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
        >
          <LogOut className="w-5 h-5" />
          <span>{t("nav.logout")}</span>
        </button>
      </div>
    </div>
  );

  return (
    <>
      <Toaster position="top-center" />
      <div className="min-h-screen bg-gray-50">
        {/* Mobile tabs — label-first; icon only shows alongside on sm+ where there's room. */}
        <div className="lg:hidden sticky top-0 z-50 bg-gray-50 pt-4 pb-4 px-4 sm:px-6 shadow-sm">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="w-full grid grid-cols-4 h-12 p-1 bg-[#A5243D]/10 rounded-xl">
              {navigationItems.map((item) => {
                const Icon = item.icon;
                return (
                  <TabsTrigger
                    key={item.id}
                    value={item.id}
                    className="gap-1.5 text-xs sm:text-sm font-medium px-1 sm:px-3 data-[state=active]:bg-[#A5243D] data-[state=active]:text-white data-[state=active]:shadow-sm rounded-lg"
                  >
                    <Icon className="w-4 h-4 shrink-0 hidden sm:inline-block" />
                    <span className="truncate">{item.label}</span>
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </Tabs>
        </div>

        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
          <div className="flex gap-8">
            <aside className="hidden lg:block w-80 shrink-0 sticky top-8 self-start">
              <Sidebar />
            </aside>

            <main className="flex-1 min-w-0">
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 sm:p-8">
                <div className="hidden lg:block mb-8 pb-6 border-b border-gray-100">
                  <div className="border-l-4 border-[#D8AA55] pl-4">
                    <h1 className="text-3xl font-bold text-gray-900">
                      {navigationItems.find((item) => item.id === activeTab)?.label}
                    </h1>
                    <p className="text-gray-600 mt-2">
                      {navigationItems.find((item) => item.id === activeTab)?.description}
                    </p>
                  </div>
                </div>

                <div className={isRtl ? "text-right" : ""}>{renderContent(user)}</div>
              </div>
            </main>
          </div>
        </div>
      </div>

      {/* Country picker */}
      <CountryPicker
        open={countryPickerOpen}
        onOpenChange={setCountryPickerOpen}
        currentCountryCode={user.countryCode}
        onSelect={handleCountrySelect}
      />

      {/* Pause / resume dialog */}
      <AlertDialog open={isPauseDialogOpen} onOpenChange={setIsPauseDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {selectedDonation?.status === "ACTIVE"
                ? t("subscriptions.pauseSubscription")
                : t("subscriptions.resume")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {selectedDonation?.status === "ACTIVE"
                ? t("pauseDialog.descriptionPause")
                : t("pauseDialog.descriptionResume")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("deleteDialog.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmToggle} disabled={isLoading}>
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : selectedDonation?.status === "ACTIVE" ? (
                t("subscriptions.pause")
              ) : (
                t("subscriptions.resume")
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cancel dialog */}
      <AlertDialog open={isCancelDialogOpen} onOpenChange={setIsCancelDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("subscriptions.cancelSubscription")}</AlertDialogTitle>
            <AlertDialogDescription>{t("cancelDialog.description")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("deleteDialog.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancelSubscription}
              disabled={isLoading}
              className="bg-red-600 hover:bg-red-700"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                t("subscriptions.cancel")
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {renderSubscriptionDialog()}
    </>
  );
};

export default ProfilePage;
