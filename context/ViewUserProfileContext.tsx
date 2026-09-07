"use client";

import * as React from "react";
import axios from "axios";
import { toast } from "react-hot-toast";
import { ViewUserProfileDialog } from "@/components/dashboard/ViewUserProfileDialog";
import type { UserProfileCardData } from "@/lib/dashboard/user-profile-card";
import type { ViewUserBadgeOption } from "@/components/dashboard/ViewUserProfileDialog";

function mapApiUserToProfileCard(data: unknown): UserProfileCardData | null {
  if (!data || typeof data !== "object") return null;
  const u = data as Record<string, unknown>;
  const id = u.id;
  if (typeof id !== "string") return null;
  return {
    id,
    name: (u.name as string | null) ?? null,
    email: (u.email as string | null) ?? null,
    image: (u.image as string | null) ?? null,
    role: typeof u.role === "string" ? u.role : "DONOR",
    dashboardPermissions: Array.isArray(u.dashboardPermissions)
      ? (u.dashboardPermissions as string[])
      : [],
    preferredLang: (u.preferredLang as string | null) ?? null,
    country: (u.country as string | null) ?? null,
    countryCode: (u.countryCode as string | null) ?? null,
    countryName: (u.countryName as string | null) ?? null,
    region: (u.region as string | null) ?? null,
    city: (u.city as string | null) ?? null,
    phone: (u.phone as string | null) ?? null,
    gender: (u.gender as string | null) ?? null,
    birthdate: (u.birthdate as string | null) ?? null,
    createdAt:
      u.createdAt instanceof Date
        ? u.createdAt.toISOString()
        : String(u.createdAt ?? ""),
    updatedAt:
      u.updatedAt instanceof Date
        ? u.updatedAt.toISOString()
        : String(u.updatedAt ?? ""),
    totalDonationsCount: typeof u.totalDonationsCount === "number" ? u.totalDonationsCount : 0,
    totalDonatedAmount: typeof u.totalDonatedAmount === "number" ? u.totalDonatedAmount : 0,
    totalDonatedAmountUSD: typeof u.totalDonatedAmountUSD === "number" ? u.totalDonatedAmountUSD : 0,
    lastDonationAt: u.lastDonationAt
      ? u.lastDonationAt instanceof Date
        ? u.lastDonationAt.toISOString()
        : String(u.lastDonationAt)
      : null,
    badgeIds: Array.isArray(u.badgeIds) ? (u.badgeIds as string[]) : [],
    clarityId: (u.clarityId as string | null) ?? null,
  };
}

type ViewUserProfileContextValue = {
  openUserProfile: (userId: string) => Promise<void>;
  openUserProfileCard: (user: UserProfileCardData) => void;
  closeUserProfile: () => void;
};

const ViewUserProfileContext = React.createContext<ViewUserProfileContextValue | null>(null);

export function useViewUserProfile() {
  const ctx = React.useContext(ViewUserProfileContext);
  if (!ctx) {
    throw new Error("useViewUserProfile must be used within ViewUserProfileProvider");
  }
  return ctx;
}

export function ViewUserProfileProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const [user, setUser] = React.useState<UserProfileCardData | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [badges, setBadges] = React.useState<ViewUserBadgeOption[]>([]);

  React.useEffect(() => {
    axios
      .get("/api/admin/badges?locale=ar")
      .then((res) => setBadges(res.data?.badges ?? []))
      .catch(() => {});
  }, []);

  const closeUserProfile = React.useCallback(() => {
    setOpen(false);
    setUser(null);
    setLoading(false);
  }, []);

  const openUserProfileCard = React.useCallback((u: UserProfileCardData) => {
    setUser(u);
    setLoading(false);
    setOpen(true);
  }, []);

  const openUserProfile = React.useCallback(async (userId: string) => {
    if (!userId) return;
    setOpen(true);
    setLoading(true);
    setUser(null);
    try {
      const res = await axios.get(`/api/users/${userId}`);
      const mapped = mapApiUserToProfileCard(res.data?.user);
      if (!mapped) {
        toast.error("تعذر تحميل بيانات المستخدم");
        setOpen(false);
        setUser(null);
        setLoading(false);
        return;
      }
      setUser(mapped);
    } catch {
      toast.error("فشل تحميل ملف المستخدم");
      setOpen(false);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const value = React.useMemo(
    () => ({ openUserProfile, openUserProfileCard, closeUserProfile }),
    [openUserProfile, openUserProfileCard, closeUserProfile]
  );

  return (
    <ViewUserProfileContext.Provider value={value}>
      {children}
      <ViewUserProfileDialog
        open={open}
        user={user}
        badges={badges}
        loading={loading}
        onOpenChange={(next) => {
          if (!next) closeUserProfile();
          else setOpen(true);
        }}
      />
    </ViewUserProfileContext.Provider>
  );
}
