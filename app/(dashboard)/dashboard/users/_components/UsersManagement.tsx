"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Dialog, DialogOverlay, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "react-hot-toast";
import { LOCALE_LABELS } from "@/lib/locales";
import {
  Users,
  Search,
  Pencil,
  ChevronDown,
  Loader2,
  Receipt,
  BarChart3,
  MoreHorizontal,
  UserCircle,
  Mail,
  MessageCircle,
} from "lucide-react";
import { SendTemplateDialog, type SendTarget } from "@/components/dashboard/SendTemplateDialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { EmptyState } from "@/components/dashboard/EmptyState";
import {
  AgeFilterSelect,
  GenderFilterSelect,
  ageBracketBody,
  applyAgeBracketParams,
  type AgeBracket,
  type GenderFilterValue,
} from "@/components/dashboard/DemographicFilters";
import {
  GENDER_LABEL_AR,
  ageFromBirthdate,
  normalizeGender,
} from "@/lib/dashboard/user-demographics";
import ReactCountryFlag from "react-country-flag";
import { useCurrency } from "@/context/CurrencyContext";
import { cn } from "@/lib/utils";
import { useSession } from "next-auth/react";
import { userHasDashboardPermission } from "@/lib/dashboard/permissions";
import { DASHBOARD_PERMISSION_ROWS, ACTION_PERMISSION_ROWS } from "@/lib/dashboard/nav-config";
import { useViewUserProfile } from "@/context/ViewUserProfileContext";
import type { UserProfileCardData } from "@/lib/dashboard/user-profile-card";
import { resolveUserCountry } from "@/lib/dashboard/resolve-user-country";

const PAGE_SIZE = 10;

type UserRow = UserProfileCardData;

interface BadgeOption {
  id: string;
  name: string;
  translatedName?: string;
  color: string;
}

type Scope = "donors" | "team";

export default function UsersManagement({ scope }: { scope: Scope }) {
  const { data: session } = useSession();
  const isFullAdmin = session?.user?.role === "ADMIN";
  const canOpenRevenue = userHasDashboardPermission(session?.user, "revenue");
  const { convertToCurrency } = useCurrency();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserRow | null>(null);
  const { openUserProfileCard } = useViewUserProfile();

  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [preferredLangFilter, setPreferredLangFilter] = useState<string>("all");
  const [badgeFilter, setBadgeFilter] = useState<string>("all");
  const [genderFilter, setGenderFilter] = useState<GenderFilterValue>("all");
  const [ageFilter, setAgeFilter] = useState<AgeBracket>("all");
  const [sortBy, setSortBy] = useState<
    "createdAt" | "name" | "email" | "donationsCount" | "totalDonated" | "role"
  >("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [badges, setBadges] = useState<BadgeOption[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [editPermissions, setEditPermissions] = useState<string[]>([]);
  const [sendDialog, setSendDialog] = useState<{
    open: boolean;
    channel: "email" | "whatsapp";
  }>({ open: false, channel: "email" });
  const router = useRouter();

  const fetchUsers = useCallback(
    async (pageNum: number, append: boolean) => {
      if (pageNum === 1) setLoading(true);
      else setLoadingMore(true);
      try {
        const params = new URLSearchParams();
        params.set("scope", scope);
        params.set("page", String(pageNum));
        params.set("limit", String(PAGE_SIZE));
        params.set("sortBy", sortBy);
        params.set("sortOrder", sortOrder);
        if (search) params.set("search", search);
        if (preferredLangFilter && preferredLangFilter !== "all")
          params.set("preferredLang", preferredLangFilter);
        if (scope === "donors" && badgeFilter && badgeFilter !== "all")
          params.set("badgeId", badgeFilter);
        if (genderFilter !== "all") params.set("gender", genderFilter);
        applyAgeBracketParams(params, ageFilter);
        const res = await axios.get(`/api/users?${params}`);
        const list = res.data?.users ?? [];
        setUsers((prev) => (append ? [...prev, ...list] : list));
        setTotal(res.data?.pagination?.total ?? 0);
      } catch (err) {
        console.error("Error fetching users:", err);
        toast.error("فشل في تحميل المستخدمين");
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [scope, search, preferredLangFilter, badgeFilter, genderFilter, ageFilter, sortBy, sortOrder]
  );

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
    fetchUsers(1, false);
  }, [search, preferredLangFilter, badgeFilter, genderFilter, ageFilter, sortBy, sortOrder, fetchUsers]);

  useEffect(() => {
    if (scope !== "donors") return;
    axios
      .get("/api/admin/badges?locale=ar")
      .then((res) => {
        setBadges(res.data?.badges ?? []);
      })
      .catch(() => {});
  }, [scope]);

  const loadMore = () => {
    const next = page + 1;
    setPage(next);
    fetchUsers(next, true);
  };

  const handleEditClick = (user: UserRow) => {
    setSelectedUser({ ...user });
    setEditPermissions(user.dashboardPermissions ?? []);
    setIsDialogOpen(true);
  };

  const handleDialogClose = () => {
    setIsDialogOpen(false);
    setSelectedUser(null);
    setEditPermissions([]);
  };

  const toggleEditPermission = (key: string) => {
    setEditPermissions((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const handleUserAuthoritySave = async () => {
    if (!selectedUser) return;
    const hasDashboardPagePermission = editPermissions.some((key) =>
      DASHBOARD_PERMISSION_ROWS.some((row) => row.key === key)
    );
    if (selectedUser.role === "STAFF" && !hasDashboardPagePermission) {
      toast.error("اختر صفحة واحدة على الأقل من لوحة التحكم لعضو الطاقم");
      return;
    }
    try {
      const payload: { role: string; dashboardPermissions?: string[] } = {
        role: selectedUser.role,
      };
      if (selectedUser.role === "STAFF") {
        payload.dashboardPermissions = editPermissions;
      }
      await axios.put(`/api/users/${selectedUser.id}`, payload);
      toast.success("تم حفظ الصلاحيات بنجاح");
      if (scope === "team") {
        setUsers((prev) =>
          prev.map((u) =>
            u.id === selectedUser.id
              ? {
                  ...u,
                  role: selectedUser.role,
                  dashboardPermissions:
                    selectedUser.role === "STAFF" ? [...editPermissions] : [],
                }
              : u
          )
        );
      } else {
        fetchUsers(1, false);
        setPage(1);
      }
      handleDialogClose();
    } catch (err) {
      console.error("Error updating user:", err);
      toast.error("فشل في تحديث المستخدم");
    }
  };

  const pageTitle =
    scope === "donors" ? "المتبرعين" : "فريق العمل";
  const pageSubtitle =
    scope === "donors"
      ? "عرض المتبرعين، الشارات، والتبرعات (تعديل الأدوار للمدير فقط)"
      : "المدراء وأعضاء الطاقم — المدراء يظهرون أولًا؛ لا يظهر حسابك الحالي في القائمة";

  const toggleSelectUser = (id: string) => {
    setSelectedUserIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllDisplayed = (checked: boolean) => {
    if (checked) setSelectedUserIds(new Set(users.map((u) => u.id)));
    else setSelectedUserIds(new Set());
  };

  const isAllDisplayedSelected = users.length > 0 && users.every((u) => selectedUserIds.has(u.id));

  const formatMoney = (n: number) => {
    const r = convertToCurrency(n);
    if (r?.convertedValue != null && r?.currency) {
      const sym = r.currency === "USD" ? "$" : r.currency === "EUR" ? "€" : r.currency === "GBP" ? "£" : r.currency;
      return sym + " " + (typeof r.convertedValue === "number" ? r.convertedValue.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 }) : "0");
    }
    return "$" + (typeof n === "number" ? n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 }) : "0");
  };

  const hasMore = users.length < total && !loadingMore;

  const hasActiveFilters =
    search !== "" ||
    preferredLangFilter !== "all" ||
    badgeFilter !== "all" ||
    genderFilter !== "all" ||
    ageFilter !== "all";

  const resetFilters = () => {
    setSearchInput("");
    setPreferredLangFilter("all");
    setBadgeFilter("all");
    setGenderFilter("all");
    setAgeFilter("all");
  };

  if (loading && users.length === 0) {
    return (
      <div className="min-h-0" dir="rtl">
        <div className="space-y-6 p-4 md:p-6 max-w-[1600px] mx-auto">
          <div className="h-10 w-64 bg-slate-200 rounded animate-pulse" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-24 rounded-lg bg-slate-200 animate-pulse" />
            ))}
          </div>
          <div className="h-64 rounded-lg bg-slate-200 animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-0" dir="rtl">
      <div className="space-y-6 sm:space-y-8 p-0 sm:p-4 md:p-6 lg:p-8 max-w-[1600px] mx-auto">
        <header className="text-right">
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
            {pageTitle}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {pageSubtitle}
          </p>
        </header>

        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border border-border shadow-sm" dir="rtl">
            <div className="p-5 flex items-start gap-4">
              <div className="p-2.5 rounded-lg shrink-0 bg-brand-orange/8 text-brand-orange border border-brand-orange/20">
                <Users className="w-5 h-5" />
              </div>
              <div className="min-w-0 text-right">
                <p className="text-xs font-medium text-slate-500">إجمالي المستخدمين</p>
                <p className="text-xl font-bold text-slate-900 tabular-nums">{total}</p>
              </div>
            </div>
          </Card>
          <Card className="border border-border shadow-sm" dir="rtl">
            <div className="p-5 flex items-start gap-4">
              <div className="p-2.5 rounded-lg shrink-0 bg-brand text-white border border-gray-200">
                <Receipt className="w-5 h-5" />
              </div>
              <div className="min-w-0 text-right">
                <p className="text-xs font-medium text-slate-500">المستخدمين المعروضين</p>
                <p className="text-xl font-bold text-slate-900 tabular-nums">{users.length}</p>
              </div>
            </div>
          </Card>
        </section>

        <Card className="border-border shadow-sm">
          <CardHeader className="py-4">
            <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2 justify-end">
              <Search className="w-4 h-4 shrink-0" />
              تصفية وبحث
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-4" dir="rtl">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-2 text-right">
                <label className="text-[11px] font-medium text-slate-500">بحث (اسم أو بريد)</label>
        <Input
                  placeholder="بحث..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  className="w-full h-9 text-xs rounded-lg border-slate-200 bg-slate-50"
        />
      </div>
              {scope === "donors" && (
              <div className="space-y-2 text-right">
                <label className="text-[11px] font-medium text-slate-500">الشارة</label>
                <Select value={badgeFilter} onValueChange={setBadgeFilter}>
                  <SelectTrigger className="w-full h-9 px-3 text-xs rounded-lg border-slate-200 bg-slate-50">
                    <SelectValue placeholder="الكل" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all" className="text-xs">الكل</SelectItem>
                    {badges.map((b) => (
                      <SelectItem key={b.id} value={b.id} className="text-xs">
                        <span className="inline-block w-2 h-2 rounded-full mr-2" style={{ backgroundColor: b.color }} />
                        {b.translatedName || b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              )}
              <div className="space-y-2 text-right">
                <label className="text-[11px] font-medium text-slate-500">اللغة المفضلة</label>
                <Select value={preferredLangFilter} onValueChange={setPreferredLangFilter}>
                  <SelectTrigger className="w-full h-9 px-3 text-xs rounded-lg border-slate-200 bg-slate-50">
                    <SelectValue placeholder="الكل" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all" className="text-xs">الكل</SelectItem>
                    {Object.entries(LOCALE_LABELS).map(([code, label]) => (
                      <SelectItem key={code} value={code} className="text-xs">{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {scope === "donors" && (
              <div className="space-y-2 text-right">
                <label className="text-[11px] font-medium text-slate-500">الجنس</label>
                <GenderFilterSelect
                  value={genderFilter}
                  onChange={setGenderFilter}
                  className="w-full h-9 px-3 text-xs rounded-lg border-slate-200 bg-slate-50"
                />
              </div>
              )}
              {scope === "donors" && (
              <div className="space-y-2 text-right">
                <label className="text-[11px] font-medium text-slate-500">العمر</label>
                <AgeFilterSelect
                  value={ageFilter}
                  onChange={setAgeFilter}
                  className="w-full h-9 px-3 text-xs rounded-lg border-slate-200 bg-slate-50"
                />
              </div>
              )}
              <div className="space-y-2 text-right">
                <label className="text-[11px] font-medium text-slate-500">ترتيب حسب</label>
                <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
                  <SelectTrigger className="w-full h-9 px-3 text-xs rounded-lg border-slate-200 bg-slate-50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="createdAt" className="text-xs">تاريخ التسجيل</SelectItem>
                    <SelectItem value="name" className="text-xs">الاسم</SelectItem>
                    <SelectItem value="email" className="text-xs">البريد</SelectItem>
                    {scope === "team" && (
                      <SelectItem value="role" className="text-xs">الدور (مدير ثم طاقم)</SelectItem>
                    )}
                    <SelectItem value="donationsCount" className="text-xs">عدد التبرعات</SelectItem>
                    <SelectItem value="totalDonated" className="text-xs">إجمالي التبرعات</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 text-right">
                <label className="text-[11px] font-medium text-slate-500">الاتجاه</label>
                <Select value={sortOrder} onValueChange={(v) => setSortOrder(v as "asc" | "desc")}>
                  <SelectTrigger className="w-full h-9 px-3 text-xs rounded-lg border-slate-200 bg-slate-50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="desc" className="text-xs">تنازلي</SelectItem>
                    <SelectItem value="asc" className="text-xs">تصاعدي</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        <section>
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider text-right mb-4">
            {scope === "donors" ? "قائمة المتبرعين" : "قائمة فريق العمل"}
          </h2>
          <Card className="border-border shadow-sm">
            {scope === "donors" && (
              <div
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-slate-200 bg-slate-50/80"
                dir="rtl"
              >
                <span className="text-sm text-slate-700">
                  {selectedUserIds.size > 0
                    ? `تم اختيار ${selectedUserIds.size} مستخدم`
                    : `إرسال للنتائج المُصفّاة الحالية (${total})`}
                </span>
                <div className="flex items-center gap-2 flex-wrap">
                  {selectedUserIds.size > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedUserIds(new Set())}
                    >
                      إلغاء التحديد
                    </Button>
                  )}
                  <Button
                    size="sm"
                    onClick={() => setSendDialog({ open: true, channel: "email" })}
                    disabled={total === 0}
                    className="gap-2 bg-brand hover:bg-brand/90"
                  >
                    <Mail className="w-4 h-4" /> إرسال بريد
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => setSendDialog({ open: true, channel: "whatsapp" })}
                    disabled={total === 0}
                    className="gap-2 bg-[#25D366] hover:bg-[#25D366]/90 text-white"
                  >
                    <MessageCircle className="w-4 h-4" /> إرسال واتساب
                  </Button>
                </div>
              </div>
            )}
            {scope !== "donors" && selectedUserIds.size > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-slate-200 bg-slate-50/80" dir="rtl">
                <span className="text-sm text-slate-700">
                  تم اختيار {selectedUserIds.size} مستخدم
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedUserIds(new Set())}
                >
                  إلغاء التحديد
                </Button>
              </div>
            )}
            <CardContent className="p-0">
              {/* Loading and empty are rendered outside the table so they read as
                  states of the list rather than as a stray full-width row. */}
              {loading && users.length === 0 ? (
                <div className="space-y-2 p-4">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="h-12 animate-pulse rounded-lg border border-slate-200 bg-slate-100" />
                  ))}
                </div>
              ) : users.length === 0 ? (
                <EmptyState
                  icon={Users}
                  title="لا يوجد مستخدمين مطابقين"
                  description="جرّب توسيع التصفية أو مسحها."
                  action={
                    hasActiveFilters ? (
                      <Button variant="outline" size="sm" onClick={resetFilters}>مسح التصفية</Button>
                    ) : undefined
                  }
                />
              ) : (
              <div className="overflow-x-auto rounded-lg border border-slate-200" dir="rtl">
                <table className="w-full min-w-[900px] text-right text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/80 text-slate-700">
                      <th className="w-10 px-3 py-2.5">
                        <Checkbox
                          checked={isAllDisplayedSelected}
                          onCheckedChange={(checked: boolean | "indeterminate") => selectAllDisplayed(checked === true)}
                          aria-label="تحديد الكل"
                        />
                      </th>
                      <th className="min-w-[210px] px-3 py-2.5 text-right text-xs font-semibold">
                        {scope === "donors" ? "المتبرع" : "العضو"}
                      </th>
                      <th className="px-3 py-2.5 text-right text-xs font-semibold">الدور</th>
                      <th className="px-3 py-2.5 text-right text-xs font-semibold">اللغة</th>
                      {scope === "donors" && (
                      <th className="min-w-[110px] px-3 py-2.5 text-right text-xs font-semibold">الجنس / العمر</th>
                      )}
                      {scope === "donors" && (
                      <th className="min-w-[130px] px-3 py-2.5 text-right text-xs font-semibold">الموقع</th>
                      )}
                      {scope === "donors" && (
                      <th className="min-w-[130px] px-3 py-2.5 text-right text-xs font-semibold">الشارات</th>
                      )}
                      {scope === "team" && (
                      <th className="min-w-[180px] px-3 py-2.5 text-right text-xs font-semibold">حملات لوحة التحكم</th>
                      )}
                      {scope === "donors" && (
                      <th className="px-3 py-2.5 text-right text-xs font-semibold">عدد التبرعات</th>
                      )}
                      {scope === "donors" && (
                      <th className="px-3 py-2.5 text-right text-xs font-semibold">إجمالي التبرعات</th>
                      )}
                      <th className="px-3 py-2.5 text-right text-xs font-semibold whitespace-nowrap">التسجيل</th>
                      <th className="px-3 py-2.5 text-left text-xs font-semibold">الإجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => {
                      const selected = selectedUserIds.has(u.id);
                      const genderKey = normalizeGender(u.gender);
                      const age = ageFromBirthdate(u.birthdate);
                      return (
                        <tr
                          key={u.id}
                          className={cn(
                            "border-b border-slate-100 transition-colors last:border-0",
                            selected ? "bg-brand-50" : "hover:bg-slate-50/70"
                          )}
                        >
                          <td className="px-3 py-2.5">
                            <Checkbox
                              checked={selected}
                              onCheckedChange={() => toggleSelectUser(u.id)}
                              aria-label={`تحديد ${u.name || u.email}`}
                            />
                          </td>

                          {/* Name and contact share one cell: two columns of text with an
                              empty avatar column between them read as three loose lists. */}
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-2">
                              <Avatar className="h-8 w-8 shrink-0 rounded-full ring-1 ring-slate-200">
                                <AvatarImage src={u.image ?? undefined} alt="" />
                                <AvatarFallback className="rounded-full bg-gradient-to-br from-slate-400 to-slate-600 text-[10px] font-bold text-white">
                                  {(u.name ?? u.email ?? "؟").charAt(0).toUpperCase()}
                                </AvatarFallback>
                              </Avatar>
                              <div className="min-w-0">
                                <p className="truncate text-[13px] font-medium text-slate-900">{u.name ?? "بلا اسم"}</p>
                                <p className="truncate text-[11px] text-slate-500" title={u.email ?? undefined}>
                                  {u.email ?? u.phone ?? "—"}
                                </p>
                              </div>
                            </div>
                          </td>

                          <td className="px-3 py-2.5">
                            <span
                              className={cn(
                                "inline-block rounded-full px-2 py-0.5 text-[10px] font-medium whitespace-nowrap",
                                u.role === "ADMIN"
                                  ? "bg-brand-orange/8 text-brand-orange"
                                  : u.role === "STAFF"
                                    ? "bg-brand text-white"
                                    : "bg-slate-100 text-slate-600"
                              )}
                            >
                              {u.role === "ADMIN"
                                ? "مدير"
                                : u.role === "STAFF"
                                  ? "طاقم"
                                  : "متبرع"}
                            </span>
                          </td>

                          <td className="px-3 py-2.5">
                            <span className="inline-flex rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] text-slate-600">
                              {LOCALE_LABELS[u.preferredLang as keyof typeof LOCALE_LABELS] ?? "—"}
                            </span>
                          </td>

                          {scope === "donors" && (
                          <td className="px-3 py-2.5">
                            {genderKey || age !== null ? (
                              <span className="flex items-center gap-1.5 text-[12px] text-slate-700 whitespace-nowrap">
                                {genderKey ? GENDER_LABEL_AR[genderKey] : "—"}
                                {age !== null && (
                                  <span className="text-slate-400">· {age} سنة</span>
                                )}
                              </span>
                            ) : (
                              <span className="text-[11px] text-slate-400">—</span>
                            )}
                          </td>
                          )}

                          {scope === "donors" && (() => {
                            const country = resolveUserCountry(u);
                            return (
                              <td className="px-3 py-2.5 max-w-[160px]">
                                <span className="flex items-center gap-1.5 text-[12px] text-slate-700">
                                  {country.code ? (
                                    <ReactCountryFlag
                                      countryCode={country.code}
                                      svg
                                      style={{ width: "1.1em", height: "1.1em" }}
                                      title={country.code}
                                    />
                                  ) : null}
                                  <span className="truncate" title={[u.city, u.region].filter(Boolean).join(" · ") || undefined}>
                                    {country.name}
                                  </span>
                                </span>
                              </td>
                            );
                          })()}

                          {scope === "donors" && (
                          <td className="px-3 py-2.5">
                            <div className="flex flex-wrap gap-1">
                              {(u.badgeIds ?? []).length === 0 && <span className="text-[11px] text-slate-400">—</span>}
                              {(u.badgeIds ?? []).map((bid) => {
                                const badge = badges.find((b) => b.id === bid);
                                if (!badge) return null;
                                const label = badge.translatedName || badge.name;
                                return (
                                  <span
                                    key={bid}
                                    className="inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px]"
                                    style={{
                                      borderColor: `${badge.color}55`,
                                      backgroundColor: `${badge.color}14`,
                                      color: badge.color,
                                    }}
                                    title={label}
                                  >
                                    <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: badge.color }} />
                                    {label}
                                  </span>
                                );
                              })}
                            </div>
                          </td>
                          )}

                          {scope === "team" && (
                          <td className="px-3 py-2.5">
                            {u.role === "ADMIN" ? (
                              <span className="inline-flex rounded-full border border-brand-orange/20 bg-brand-orange/8 px-1.5 py-0.5 text-[10px] text-brand-orange">
                                كل الحملات
                              </span>
                            ) : (
                              <div className="flex max-w-[220px] flex-wrap gap-1">
                                {(u.dashboardPermissions ?? []).map((key) => {
                                  const row =
                                    DASHBOARD_PERMISSION_ROWS.find((r) => r.key === key) ??
                                    ACTION_PERMISSION_ROWS.find((r) => r.key === key);
                                  if (!row) return null;
                                  const isActionPermission = ACTION_PERMISSION_ROWS.some((r) => r.key === key);
                                  return (
                                    <span
                                      key={key}
                                      className={cn(
                                        "inline-block rounded px-1.5 py-0.5 text-[10px] text-white",
                                        isActionPermission ? "bg-slate-600" : "bg-brand"
                                      )}
                                    >
                                      {row.title}
                                    </span>
                                  );
                                })}
                                {(u.dashboardPermissions ?? []).length === 0 && (
                                  <span className="text-[11px] text-slate-400">—</span>
                                )}
                              </div>
                            )}
                          </td>
                          )}

                          {scope === "donors" && (
                          <td className="px-3 py-2.5 text-[13px] font-medium text-slate-800 tabular-nums">{u.totalDonationsCount}</td>
                          )}
                          {scope === "donors" && (
                          <td className="px-3 py-2.5 text-[13px] font-medium text-slate-800 tabular-nums" dir="ltr">
                            {formatMoney(u.totalDonatedAmountUSD)}
                          </td>
                          )}

                          <td className="px-3 py-2.5 text-[12px] text-slate-500 whitespace-nowrap">
                            {new Date(u.createdAt).toLocaleDateString("ar-EG", { dateStyle: "medium" })}
                          </td>

                          <td className="px-3 py-2.5 text-left">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button size="sm" variant="outline" className="gap-1 rounded-full">
                                  <MoreHorizontal className="w-4 h-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="start" className="min-w-[160px]">
                              <DropdownMenuItem onClick={() => openUserProfileCard(u)}>
                                  <UserCircle className="w-4 h-4 me-2" />
                                  عرض الملف
                                </DropdownMenuItem>
                                {canOpenRevenue && (
                                  <DropdownMenuItem onClick={() => router.push(`/dashboard?userId=${u.id}`)}>
                                    <BarChart3 className="w-4 h-4 me-2" />
                                    تحليل تبرعات
                                  </DropdownMenuItem>
                                )}
                                {scope === "team" &&
                                  isFullAdmin &&
                                  (u.role === "STAFF" || u.role === "ADMIN") && (
                                  <DropdownMenuItem onClick={() => handleEditClick(u)}>
                                    <Pencil className="w-4 h-4 me-2" />
                                    تعديل الصلاحيات
                                  </DropdownMenuItem>
                                )}
                                {scope === "donors" &&
                                  u.role === "DONOR" &&
                                  isFullAdmin && (
                                  <DropdownMenuItem onClick={() => handleEditClick(u)}>
                                    <Pencil className="w-4 h-4 me-2" />
                                    تعديل الصلاحيات
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              )}
              {hasMore && (
                <div className="p-4 border-t border-slate-100 text-center">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={loadMore}
                    disabled={loadingMore}
                    className="gap-2"
                  >
                    {loadingMore ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronDown className="w-4 h-4 rotate-180" />}
                    عرض المزيد
                  </Button>
                </div>
              )}
              {total > 0 && (
                <p className="text-xs text-slate-500 px-4 py-2 border-t border-slate-100 text-right">
                  عرض {users.length} من {total} مستخدم
                </p>
              )}
            </CardContent>
          </Card>
        </section>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={(open) => !open && handleDialogClose()}>
        <DialogOverlay className="fixed inset-0 bg-black/50" />
        <DialogContent className="fixed top-1/2 left-1/2 w-[calc(100%-2rem)] max-w-lg max-h-[min(90vh,640px)] overflow-y-auto p-4 sm:p-6 transform -translate-x-1/2 -translate-y-1/2 bg-card text-card-foreground border border-border rounded-lg shadow-lg" dir="rtl">
          <DialogTitle className="text-lg font-bold text-foreground">تعديل الدور والصلاحيات</DialogTitle>
          {selectedUser && (
            <div className="space-y-4 mt-4">
              <p className="text-sm text-muted-foreground">
                {selectedUser.name ?? "—"} — {selectedUser.email ?? "—"}
              </p>
              <div className="space-y-2">
                <label className="text-sm font-medium">الدور</label>
                <Select
                  value={selectedUser.role}
                  onValueChange={(v) => {
                    setSelectedUser({ ...selectedUser, role: v });
                    if (v !== "STAFF") setEditPermissions([]);
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DONOR">متبرع</SelectItem>
                    <SelectItem value="STAFF">طاقم (لوحة تحكم محدودة)</SelectItem>
                    <SelectItem value="ADMIN">مدير (كل الحملات)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {selectedUser.role === "STAFF" && (
                <>
                  <div className="space-y-2 rounded-lg border border-border p-3 bg-muted/40">
                    <p className="text-sm font-medium">حملات لوحة التحكم</p>
                    <p className="text-xs text-muted-foreground">
                      فعّل كل حملة يحق لهذا المستخدم الدخول إليه. بدون تفعيل لا يظهر في القائمة الجانبية.
                    </p>
                    <div className="grid gap-2 max-h-56 overflow-y-auto pe-1">
                      {DASHBOARD_PERMISSION_ROWS.map((row) => (
                        <label
                          key={row.key}
                          className="flex items-start gap-2 text-sm cursor-pointer rounded-md p-2 hover:bg-muted/80"
                        >
                          <Checkbox
                            checked={editPermissions.includes(row.key)}
                            onCheckedChange={() => toggleEditPermission(row.key)}
                            className="mt-0.5"
                          />
                          <span>
                            <span className="font-medium">{row.title}</span>
                            <span className="text-muted-foreground text-xs block">{row.group}</span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2 rounded-lg border border-border bg-muted/40 p-3">
                    <p className="text-sm font-medium">صلاحيات إضافية</p>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      فعّل الإجراءات الإضافية التي يحق لهذا المستخدم تنفيذها داخل الصفحات المسموحة له.
                    </p>
                    <div className="grid gap-2 pe-1 pt-1">
                      {ACTION_PERMISSION_ROWS.map((row) => (
                        <label
                          key={row.key}
                          className="flex items-start gap-2 text-sm cursor-pointer rounded-md border border-border bg-background/70 p-2.5 hover:bg-muted/80"
                        >
                          <Checkbox
                            checked={editPermissions.includes(row.key)}
                            onCheckedChange={() => toggleEditPermission(row.key)}
                            className="mt-0.5"
                          />
                          <span>
                            <span className="font-medium">{row.title}</span>
                            <span className="text-muted-foreground text-xs block leading-relaxed mt-0.5">
                              {row.description}
                            </span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                </>
              )}
              {selectedUser.role === "ADMIN" && (
                <p className="text-xs text-muted-foreground">
                  المدير يملك صلاحية جميع حملات لوحة التحكم تلقائيًا.
                </p>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={handleDialogClose}>
                  إلغاء
                </Button>
                <Button onClick={handleUserAuthoritySave}>حفظ</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {scope === "donors" && (
        <SendTemplateDialog
          open={sendDialog.open}
          onOpenChange={(open) => setSendDialog((prev) => ({ ...prev, open }))}
          channel={sendDialog.channel}
          target={
            {
              kind: "filtered",
              filters: {
                search: search || undefined,
                preferredLang:
                  preferredLangFilter !== "all" ? preferredLangFilter : undefined,
                badgeId: badgeFilter !== "all" ? badgeFilter : undefined,
                gender: genderFilter !== "all" ? genderFilter : undefined,
                ...ageBracketBody(ageFilter),
              },
            } satisfies SendTarget
          }
        />
      )}
    </div>
  );
}
