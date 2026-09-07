/** Shape used by the dashboard «عرض الملف» profile card (users list + global dialog). */
export interface UserProfileCardData {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  role: string;
  dashboardPermissions?: string[];
  preferredLang: string | null;
  country: string | null;
  countryCode: string | null;
  countryName: string | null;
  region: string | null;
  city: string | null;
  phone: string | null;
  /** Free-form on the model; normalise with `normalizeGender` before display. */
  gender: string | null;
  /** ISO "YYYY-MM-DD" string, not a DateTime — see lib/dashboard/user-demographics.ts. */
  birthdate: string | null;
  createdAt: string;
  updatedAt: string;
  totalDonationsCount: number;
  totalDonatedAmount: number;
  totalDonatedAmountUSD: number;
  lastDonationAt: string | null;
  badgeIds: string[];
  /** Microsoft Clarity user-id assigned by an admin for session replay lookup. */
  clarityId: string | null;
}
