import { Elements } from "@stripe/react-stripe-js";
import { getStripePromise } from "@/lib/stripe-client";
import {
  StripePaymentStep,
  type StripePaymentHandle,
} from "@/components/StripePaymentStep";
import {
  PayForCardForm,
  type PayForCardState,
} from "@/components/PayForCardForm";
import { SignInPanel } from "@/components/SignInDialog";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
// useCallback is used for stable onReadyChange callback passed to StripePaymentStep
import {
  Calendar,
  Heart,
  CreditCard as CardIcon,
  ShoppingCart,
  Check,
  Loader2,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Award,
} from "lucide-react";
import axios from "axios";
import { toast } from "react-hot-toast";
import { useConfettiStore } from "@/hooks/use-confetti-store";
import { getCurrency } from "@/hooks/useCampaignValue";
import {
  DEFAULT_SUGGESTED_DONATION_AMOUNTS,
  parseSuggestedDonations,
  resolveSuggestedAmountsForCurrency,
  type SuggestedDonationsConfig,
} from "@/lib/campaign/suggested-donations";
import {
  resolveFinalTeamSupportAmounts,
  type SuggestedTeamSupportConfig,
} from "@/lib/campaign/suggested-team-support";
import {
  fetchGlobalSettings,
  getCachedGlobalSettings,
  type GlobalSettings,
} from "@/lib/global-settings-client";
import {
  FUNDRAISING_SHARES,
  GOAL_TYPE_OPEN,
  parseSuggestedShareCounts,
  resolveSharePriceOverride,
} from "@/lib/campaign/campaign-modes";
import useConvetToUSD from "@/hooks/useConvetToUSD";
import { useReferralCode } from "@/hooks/useReferralCode";
import { useCurrency } from "@/context/CurrencyContext";
import { formatNumber } from "@/hooks/formatNumber";
import { useCart } from "@/hooks/useCart";
import {
  resolveShareUnit,
  resolveSharePlural,
  type ShareLabelsConfig,
} from "@/lib/campaign/share-labels";
import { useTracking } from "@/components/TrackingPixels";
import { useRouter } from "@/i18n/routing";
import {
  appendCurrencyQuery,
  getCurrencyCodeForLinks,
} from "@/lib/currency-link";
import { getDonationAttributionPayload } from "@/lib/attribution/client-payload";
import { shouldSkipPopup } from "@/lib/in-app-browser";
import { gatewayAnalyticsName, resolveGateway } from "@/lib/payment-gateway";
import { useTranslations, useLocale } from "next-intl";
import { useSession } from "next-auth/react";
import { PhoneInput } from "react-international-phone";
import "react-international-phone/style.css";
import { useIpCountry } from "@/hooks/useIpCountry";

type DonationType = "ONE_TIME" | "MONTHLY";
type PaymentMethod = "CARD" | "PAYPAL" | null;
const DONATION_CHECKOUT_RESUME_KEY = "alafiya:donation-checkout-resume:v1";
const CHECKOUT_RESUME_TTL_MS = 30 * 60 * 1000;

interface DonationStep {
  title: string;
  subtitle: string;
}

interface DonationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  campaignId?: string;
  campaignTitle?: string;
  campaignImage?: string;
  targetAmount?: number;
  amountRaised?: number;
  /** When true, skip one-time/monthly choice and use monthly only */
  monthlyOnly?: boolean;
  /** When true, skip one-time/monthly choice and use one-time only (e.g. Add to Cart flow) */
  oneTimeOnly?: boolean;
  /** Category donation: donate to a category instead of a campaign */
  categoryId?: string;
  categoryName?: string;
  categoryImage?: string;
  /** Pre-fill amount (e.g. from QuickDonate) */
  initialDonationAmount?: number;
  /** Campaign quick-pick amounts; per-currency overrides resolved with current cookie currency */
  suggestedDonations?: SuggestedDonationsConfig | null;
  /** Campaign-level override for team-support quick-pick amounts. Falls back to global defaults if null/empty. */
  suggestedTeamSupport?: SuggestedTeamSupportConfig | null;
  goalType?: string;
  fundraisingMode?: string;
  sharePriceUSD?: number | null;
  suggestedShareCounts?: {
    counts: number[];
    priceByCurrency?: Record<string, number>;
  } | null;
  /** Per-campaign custom unit names ("sheep"/"meal"/"hijab" etc.) keyed by locale. */
  shareLabels?: ShareLabelsConfig | null;
  /** When true, user skipped sign-in — collect contact info inline */
  guestMode?: boolean;
  /** URL used by OAuth/email verification to reopen this checkout. */
  authCallbackUrl?: string;
  /** Lets the parent persist any props it owns before an auth redirect. */
  onAuthCheckpoint?: () => void;
}

const DonationDialog = ({
  isOpen,
  onClose,
  campaignTitle = "",
  campaignId = "",
  campaignImage = "https://i.ibb.co/N2zVsqfg/calisma-alanlarimiz-egitim-sektoru.jpg",
  targetAmount = 0,
  amountRaised = 0,
  monthlyOnly = false,
  oneTimeOnly = false,
  categoryId = "",
  categoryName = "",
  categoryImage,
  initialDonationAmount,
  suggestedDonations,
  suggestedTeamSupport,
  goalType = "FIXED",
  fundraisingMode = "AMOUNT",
  sharePriceUSD,
  suggestedShareCounts,
  shareLabels,
  guestMode = false,
  authCallbackUrl,
  onAuthCheckpoint,
}: DonationDialogProps) => {
  const isCategoryMode = Boolean(categoryId);
  const openGoal = goalType === GOAL_TYPE_OPEN;
  const shareMode =
    !isCategoryMode &&
    Boolean(campaignId) &&
    fundraisingMode === FUNDRAISING_SHARES &&
    sharePriceUSD != null &&
    sharePriceUSD > 0;
  const parsedShareCounts = useMemo(
    () => parseSuggestedShareCounts(suggestedShareCounts),
    [suggestedShareCounts],
  );
  const sharePickCounts = parsedShareCounts.counts;
  /** Cookie currency for pricing; DEFAULT → USD (matches server conversion). */
  const payCurrencyCode = useCallback((): string => {
    const c = getCurrency();
    return !c || c === "DEFAULT" ? "USD" : c;
  }, []);
  const t = useTranslations("DonationDialog");
  const tAuth = useTranslations("SignInDialog");
  const locale = useLocale();
  const isRTL = locale === "ar";
  const dir = isRTL ? "rtl" : "ltr";
  const btnRow = "inline-flex items-center justify-center gap-2";
  // RTL: Back → on right, Next ← on left. LTR: Back ← on left, Next → on right.
  const backLabel = isRTL ? (
    <span className={btnRow}>
      <ChevronRight className="h-4 w-4 shrink-0" aria-hidden />
      {t("back")}
    </span>
  ) : (
    <span className={btnRow}>
      <ChevronLeft className="h-4 w-4 shrink-0" aria-hidden />
      {t("back")}
    </span>
  );
  const nextLabel = isRTL ? (
    <span className={btnRow}>
      {t("next")}
      <ChevronLeft className="h-4 w-4 shrink-0" aria-hidden />
    </span>
  ) : (
    <span className={btnRow}>
      {t("next")}
      <ChevronRight className="h-4 w-4 shrink-0" aria-hidden />
    </span>
  );
  const confirmDonationLabel = isRTL ? (
    <span className={btnRow}>
      {t("confirmDonation")}
      <ChevronLeft className="h-4 w-4 shrink-0" aria-hidden />
    </span>
  ) : (
    <span className={btnRow}>
      {t("confirmDonation")}
      <ChevronRight className="h-4 w-4 shrink-0" aria-hidden />
    </span>
  );
  const getReferralCode = useReferralCode();

  // Helper function to get locale-specific property
  const getLocalizedProperty = (obj: any, key: string) => {
    const localeKey = `${key}${locale.charAt(0).toUpperCase() + locale.slice(1)}`;
    return obj[localeKey] || obj[key] || "";
  };

  const [globalSettings, setGlobalSettings] = useState<GlobalSettings | null>(
    () => getCachedGlobalSettings(),
  );
  const globalTeamSupport: SuggestedTeamSupportConfig | null =
    globalSettings?.suggestedTeamSupport ?? null;
  const payforEnabled = globalSettings ? globalSettings.payforEnabled : true;
  const mainGateway = globalSettings ? globalSettings.mainGateway : "STRIPE";
  // With the bank's hosted card page on, Albaraka collects the card itself and we
  // must not render our own form (the card fields are signed into its request MAC).
  const albarakaUseOOS = globalSettings ? globalSettings.albarakaUseOOS : false;

  const teamSupportOptions = useMemo(() => {
    const amounts = resolveFinalTeamSupportAmounts(
      getCurrency(),
      suggestedTeamSupport ?? null,
      globalTeamSupport,
    );
    return [
      { label: t("noThanks"), value: 0 },
      ...amounts.map((v) => ({ label: String(v), value: v })),
    ];
    // getCurrency() is read from a cookie at render time — refresh when the
    // dialog reopens (matches the suggestedDonations pattern below).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestedTeamSupport, globalTeamSupport, isOpen, t]);

  // Trimmed flow for higher conversion: cover-fees folded into teamSupport,
  // sign-in step removed entirely (guests skip auth, authed users keep going).
  const DONATION_STEPS: Record<DonationType, DonationStep[]> = {
    ONE_TIME: [
      { title: t("donationAmount"), subtitle: t("donationAmountDesc") },
      { title: t("teamSupport"), subtitle: t("teamSupportDesc") },
      { title: t("confirmation"), subtitle: t("confirmationDesc") },
      { title: t("paymentInfo"), subtitle: t("paymentInfoDesc") },
    ],
    MONTHLY: [
      {
        title: t("monthlyDonationAmount"),
        subtitle: t("monthlyDonationAmountDesc"),
      },
      { title: t("teamSupport"), subtitle: t("teamSupportDesc") },
      { title: t("confirmation"), subtitle: t("confirmationDesc") },
      { title: t("paymentInfo"), subtitle: t("paymentInfoDesc") },
    ],
  };

  const [currentStep, setCurrentStep] = useState(0);
  const [donationType, setDonationType] = useState<DonationType | null>(null);
  const [donationAmount, setDonationAmount] = useState<number>(0);
  const [teamSupport, setTeamSupport] = useState<number | null>(null);
  const [coverFees, setCoverFees] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CARD");
  // Manual card inputs for the bank 3D rails (PayFor / Albaraka)
  const [cardDetails, setCardDetails] = useState<PayForCardState>({
    cardNumber: "",
    expiryDate: "",
    cvv: "",
    cardholderName: "",
  });
  const [cardFocus, setCardFocus] = useState("");
  // Stripe Elements — ready state tracked here, confirmation done via ref
  const [stripeReady, setStripeReady] = useState(false);
  const stripeFormRef = useRef<StripePaymentHandle | null>(null);
  // Stable callback — prevents useEffect loop inside StripePaymentStep
  const onStripeReadyChange = useCallback(
    (ready: boolean) => setStripeReady(ready),
    [],
  );
  // Auto-select PayFor when ONE_TIME + TL, Stripe otherwise. Fallback secret forces Stripe.
  const [fallbackClientSecret, setFallbackClientSecret] = useState<
    string | null
  >(null);
  // Which rail this donation runs on. PayFor keeps its original case (one-time TRY,
  // admin switch on); everything else goes to whichever main gateway the admin picked,
  // except monthly which is Stripe-only. A fallback secret means a 3D attempt already
  // failed and the donor was handed a Stripe intent, so Stripe wins from then on.
  const gateway = resolveGateway({
    mainGateway,
    payforEnabled,
    currency: getCurrency(),
    donationType,
    forceStripe: Boolean(fallbackClientSecret),
  });
  const use3D = gateway === "PAYFOR";
  const useAlbaraka = gateway === "ALBARAKA";
  /** Both 3D rails post an HTML form to the bank instead of confirming via stripe.js. */
  const useBank3D = use3D || useAlbaraka;
  /** Card inputs we render ourselves — Albaraka's hosted page replaces them. */
  const useOwnCardForm = use3D || (useAlbaraka && !albarakaUseOOS);
  /** Stripe Elements are mounted only when Stripe is actually charging. */
  const useStripeElements = gateway === "STRIPE";
  const [fallbackDonationId, setFallbackDonationId] = useState<string | null>(
    null,
  );
  // Guard against duplicate fallback execution
  const hasFallenBackRef = useRef(false);
  // Guards to prevent funnel events firing more than once per dialog session
  const checkoutTrackedRef = useRef(false);
  const paymentInfoTrackedRef = useRef(false);
  const [loading, setLoading] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const payforPopupRef = useRef<Window | null>(null);
  const payforPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [mounted, setMounted] = useState(false);
  const [phoneValue, setPhoneValue] = useState("");
  const [guestFirstName, setGuestFirstName] = useState("");
  const [guestLastName, setGuestLastName] = useState("");
  const [birthdateValue, setBirthdateValue] = useState("");
  const [genderValue, setGenderValue] = useState("");
  // Saved cards
  const [savedCards, setSavedCards] = useState<
    {
      id: string;
      last4: string;
      cardType: string;
      expiryDate: string;
      cardholderName?: string | null;
      isDefault: boolean;
      nickname?: string | null;
    }[]
  >([]);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [guestEmail, setGuestEmail] = useState("");
  const ipCountry = useIpCountry();
  const [currentUser, setCurrentUser] = useState<{
    phone: string | null;
    country: string | null;
    countryCode?: string | null;
    countryName?: string | null;
    city?: string | null;
    region?: string | null;
    name?: string | null;
    gender?: string | null;
    birthdate?: string | null;
  } | null>(null);
  const { data: session, status: sessionStatus } = useSession();
  const [hasSkippedAuth, setHasSkippedAuth] = useState(false);
  const useGuestCheckout = (guestMode || hasSkippedAuth) && !session?.user?.id;
  // While /api/users/[id] is still in flight we don't yet know which profile fields
  // the user is missing — treat them all as present so the donate button isn't
  // pre-disabled (previous behavior locked Google-sign-in users out of payment
  // until the slow profile fetch resolved and birthdate/gender were re-entered).
  const profileLoaded = !!currentUser;
  const needsPhone =
    !!session?.user?.id && profileLoaded && !currentUser?.phone;
  const needsBirthdate =
    !!session?.user?.id && profileLoaded && !currentUser?.birthdate;
  const needsGender =
    !!session?.user?.id && profileLoaded && !currentUser?.gender;
  const needsProfileCompletion = needsPhone || needsBirthdate || needsGender;
  const { convertToCurrency, exchangeRates } = useCurrency();
  const [shareCount, setShareCount] = useState(1);
  const { addItem, setItems } = useCart();
  const tracking = useTracking();
  const router = useRouter();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen || !session?.user?.id) return;
    axios
      .get(`/api/users/${session.user.id}`)
      .then((res) => {
        const user = res.data?.user;
        if (user) {
          setCurrentUser({
            phone: user.phone ?? null,
            country: user.country ?? null,
            countryCode: user.countryCode ?? null,
            countryName: user.countryName ?? null,
            city: user.city ?? null,
            region: user.region ?? null,
            name: user.name ?? null,
            gender: user.gender ?? null,
            birthdate: user.birthdate ?? null,
          });
          if (user.phone) setPhoneValue(user.phone);
          if (user.birthdate) setBirthdateValue(String(user.birthdate));
          if (user.gender) setGenderValue(user.gender);
        }
      })
      .catch(() => setCurrentUser(null));
  }, [isOpen, session?.user?.id]);

  // Push user PII into tracking ref as soon as profile loads — so it's present for AddPaymentInfo
  useEffect(() => {
    if (!currentUser || !session?.user?.id) return;
    const nameParts = (currentUser.name ?? "").trim().split(/\s+/);
    tracking?.setUserData({
      external_id: session.user.id,
      email: (session.user as { email?: string })?.email ?? undefined,
      phone: currentUser.phone ?? undefined,
      first_name: nameParts[0] || undefined,
      last_name: nameParts.slice(1).join(" ") || undefined,
      country_code: currentUser.countryCode ?? undefined,
      city: currentUser.city ?? undefined,
      state: currentUser.region ?? undefined,
      gender: currentUser.gender ?? undefined,
      date_of_birth: currentUser.birthdate ?? undefined,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser, session?.user?.id]);

  // Reset guest fields and saved card selection on close
  useEffect(() => {
    if (!isOpen) {
      setGuestFirstName("");
      setGuestLastName("");
      setGuestEmail("");
      setBirthdateValue("");
      setGenderValue("");
      setSelectedCardId(null);
      setSavedCards([]);
    }
  }, [isOpen]);

  // Load saved cards when dialog opens (authenticated users only)
  useEffect(() => {
    if (!isOpen || !session?.user?.id) return;
    axios
      .get("/api/credit-cards")
      .then((res) => {
        const cards = res.data?.cards ?? [];
        setSavedCards(cards);
        const def = cards.find((c: (typeof cards)[0]) => c.isDefault);
        if (def) {
          setSelectedCardId(def.id);
          setCardDetails({
            cardNumber: `**** **** **** ${def.last4}`,
            expiryDate: def.expiryDate,
            cvv: "",
            cardholderName: def.cardholderName ?? "",
          });
        }
      })
      .catch(() => {});
  }, [isOpen, session?.user?.id]);

  // Reset state when dialog opens + fire view_donation_page
  useEffect(() => {
    if (isOpen) {
      setFallbackClientSecret(null);
      setFallbackDonationId(null);
      hasFallenBackRef.current = false;
      checkoutTrackedRef.current = false;
      paymentInfoTrackedRef.current = false;
      // Auto-skip the (now-removed) sign-in step: guests proceed straight to
      // the payment step's inline form. Authenticated users are unaffected.
      setHasSkippedAuth(true);
      // Track opening the donation flow
      tracking?.trackViewContent({
        contentIds: campaignId
          ? [campaignId]
          : categoryId
            ? [categoryId]
            : undefined,
        contentName: campaignTitle || categoryName || undefined,
        value: initialDonationAmount || undefined,
        currency: getCurrency(),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // When monthlyOnly (e.g. QuickDonate category), pre-select monthly and skip type step
  useEffect(() => {
    if (isOpen && monthlyOnly && !donationType) {
      setDonationType("MONTHLY");
      setCurrentStep(0);
    }
  }, [isOpen, monthlyOnly, donationType]);

  // Fetch global team-support defaults when the dialog opens. The cache is
  // shared module-wide, so subsequent opens are instant.
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    fetchGlobalSettings().then((cfg) => {
      if (!cancelled && cfg) setGlobalSettings(cfg);
    });
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  // When oneTimeOnly (e.g. Add to Cart flow), pre-select one-time and skip type step
  useEffect(() => {
    if (isOpen && oneTimeOnly && !donationType) {
      setDonationType("ONE_TIME");
      setCurrentStep(0);
    }
  }, [isOpen, oneTimeOnly, donationType]);

  useEffect(() => {
    if (isOpen && shareMode) {
      setDonationType("ONE_TIME");
      setCurrentStep(0);
      setShareCount(1);
    }
  }, [isOpen, shareMode]);

  /** Per-share display price in the donor's currently selected currency. */
  const getSharePriceInCurrency = (): number => {
    if (sharePriceUSD == null) return 0;
    const override = resolveSharePriceOverride(
      parsedShareCounts,
      payCurrencyCode(),
    );
    if (override != null) return override;
    const r = convertToCurrency(sharePriceUSD);
    return r?.convertedValue != null && Number.isFinite(r.convertedValue)
      ? (r.convertedValue as number)
      : sharePriceUSD;
  };

  /** USD equivalent of one share, used for `amountUSD` sent to the server. */
  const getSharePriceUSDEffective = (): number => {
    if (sharePriceUSD == null) return 0;
    const cur = payCurrencyCode();
    const override = resolveSharePriceOverride(parsedShareCounts, cur);
    if (override == null) return sharePriceUSD;
    // Override is the absolute price in the donor's currency — convert back to USD via cached rate.
    if (cur === "USD") return override;
    const rate = exchangeRates?.[cur];
    if (!rate || !Number.isFinite(rate) || rate <= 0) return sharePriceUSD;
    return override / rate;
  };

  useEffect(() => {
    if (!isOpen || !shareMode || sharePriceUSD == null || sharePriceUSD <= 0)
      return;
    const unit = getSharePriceInCurrency();
    setDonationAmount(Math.round(shareCount * unit * 100) / 100);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isOpen,
    shareMode,
    shareCount,
    sharePriceUSD,
    exchangeRates,
    convertToCurrency,
    parsedShareCounts,
  ]);

  // Pre-fill amount and skip amount step when opening with initialDonationAmount (e.g. from QuickDonate)
  useEffect(() => {
    if (isOpen && initialDonationAmount != null && initialDonationAmount > 0) {
      setDonationAmount(initialDonationAmount);
      setCurrentStep(1); // skip first step (donation amount)
    }
  }, [isOpen, initialDonationAmount]);

  useEffect(() => {
    if (!isOpen || typeof window === "undefined") return;

    try {
      const stored = sessionStorage.getItem(DONATION_CHECKOUT_RESUME_KEY);
      if (!stored) return;

      const resume = JSON.parse(stored) as {
        createdAt?: number;
        campaignId?: string;
        categoryId?: string;
        donationType?: DonationType | null;
        donationAmount?: number;
        teamSupport?: number;
        coverFees?: boolean;
        paymentMethod?: PaymentMethod;
        shareCount?: number;
      };

      if (
        !resume.createdAt ||
        Date.now() - resume.createdAt > CHECKOUT_RESUME_TTL_MS
      ) {
        sessionStorage.removeItem(DONATION_CHECKOUT_RESUME_KEY);
        return;
      }

      if ((resume.campaignId || "") !== (campaignId || "")) return;
      if ((resume.categoryId || "") !== (categoryId || "")) return;

      const restoredType =
        resume.donationType === "ONE_TIME" || resume.donationType === "MONTHLY"
          ? resume.donationType
          : donationType;
      if (restoredType) setDonationType(restoredType);
      if (typeof resume.donationAmount === "number")
        setDonationAmount(resume.donationAmount);
      if (typeof resume.teamSupport === "number")
        setTeamSupport(resume.teamSupport);
      if (typeof resume.coverFees === "boolean") setCoverFees(resume.coverFees);
      if (resume.paymentMethod) setPaymentMethod(resume.paymentMethod);
      if (typeof resume.shareCount === "number" && resume.shareCount > 0)
        setShareCount(resume.shareCount);

      const steps = restoredType ? DONATION_STEPS[restoredType] : [];
      const paymentStep = steps.findIndex(
        (step) => step.title === t("paymentInfo"),
      );
      const signInStep = steps.findIndex(
        (step) => step.title === tAuth("checkoutTitle"),
      );
      const confirmationStep = steps.findIndex(
        (step) => step.title === t("confirmation"),
      );

      if (sessionStatus === "authenticated" && session?.user?.id) {
        if (paymentStep >= 0) setCurrentStep(paymentStep);
        sessionStorage.removeItem(DONATION_CHECKOUT_RESUME_KEY);
      } else if (signInStep >= 0) {
        setCurrentStep(signInStep);
      } else if (confirmationStep >= 0) {
        setCurrentStep(confirmationStep);
      }
    } catch {
      sessionStorage.removeItem(DONATION_CHECKOUT_RESUME_KEY);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, campaignId, categoryId, sessionStatus, session?.user?.id]);

  useEffect(() => {
    if (!isOpen || !session?.user?.id) return;
    const steps = getSteps();
    if (steps[currentStep]?.title === tAuth("checkoutTitle")) {
      resumePaymentInfoStep();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, currentStep, session?.user?.id]);

  const confetti = useConfettiStore();

  const presetDonationAmounts = useMemo(() => {
    if (!campaignId || isCategoryMode) {
      return DEFAULT_SUGGESTED_DONATION_AMOUNTS;
    }
    const cfg = parseSuggestedDonations(suggestedDonations);
    return resolveSuggestedAmountsForCurrency(cfg, getCurrency());
  }, [campaignId, isCategoryMode, suggestedDonations, isOpen]);

  // Minimum Stripe charge = 1 USD converted to the selected currency, rounded up.
  const stripeMinAmount = (() => {
    const cur = payCurrencyCode();
    if (cur === "USD") return 1;
    try {
      const cached =
        typeof window !== "undefined"
          ? localStorage.getItem("cachedExchangeRates")
          : null;
      if (!cached) return 1;
      const { rates } = JSON.parse(cached) as { rates: Record<string, number> };
      const rate = rates?.[cur];
      return rate ? Math.ceil(rate + 1) : 1;
    } catch {
      return 1;
    }
  })();

  const progress =
    openGoal ||
    !targetAmount ||
    convertToCurrency(targetAmount).convertedValue == null ||
    convertToCurrency(targetAmount).convertedValue === 0
      ? 0
      : Math.min(
          100,
          ((amountRaised + donationAmount) /
            (convertToCurrency(targetAmount).convertedValue as number)) *
            100,
        );
  const fees = (donationAmount + (teamSupport ?? 0)) * 0.03;
  const totalAmount =
    donationAmount + (teamSupport ?? 0) + (coverFees ? fees : 0);

  const handleTypeSelect = (type: DonationType) => {
    setDonationType(type);
    setPaymentMethod("CARD");
    setCardDetails({
      cardNumber: "",
      expiryDate: "",
      cvv: "",
      cardholderName: "",
    });
    setCurrentStep(0);
    tracking?.trackCustomizeProduct({
      donationType: type,
      causeId: campaignId || categoryId || undefined,
      causeName: campaignTitle || categoryName || undefined,
    });
  };

  const isPhoneValid = () => {
    // Authenticated user who already has a phone on file — nothing to validate
    if (session?.user?.id && !needsPhone) return true;
    const p = phoneValue.trim().replace(/\s/g, "");
    return p.length >= 10;
  };

  // Alias: useConvetToUSD is a plain utility (not a React hook) — alias to avoid rules-of-hooks lint errors
  const convertToUSD = useConvetToUSD;

  const getPaymentInfoStepIndex = (steps = getSteps()) =>
    steps.findIndex((step) => step.title === t("paymentInfo"));

  const getSignInStepIndex = (steps = getSteps()) =>
    steps.findIndex((step) => step.title === tAuth("checkoutTitle"));

  const trackPaymentInfoStep = () => {
    if (paymentInfoTrackedRef.current) return;
    paymentInfoTrackedRef.current = true;
    tracking?.trackAddPaymentInfo({
      value: donationAmount,
      currency: getCurrency(),
      causeId: campaignId || categoryId || undefined,
      causeName: campaignTitle || categoryName || undefined,
      paymentMethod: paymentMethod ?? "CARD",
    });
  };

  const persistCheckoutResume = (targetStep?: number) => {
    if (typeof window === "undefined") return;
    try {
      sessionStorage.setItem(
        DONATION_CHECKOUT_RESUME_KEY,
        JSON.stringify({
          createdAt: Date.now(),
          campaignId,
          categoryId,
          categoryName,
          categoryImage,
          donationType,
          donationAmount,
          teamSupport,
          coverFees,
          paymentMethod,
          shareCount,
          currentStep: targetStep ?? getPaymentInfoStepIndex(),
        }),
      );
    } catch {
      /* Resume state is a convenience; checkout can still continue in-session. */
    }
  };

  const resumePaymentInfoStep = () => {
    const paymentStep = getPaymentInfoStepIndex();
    if (paymentStep >= 0) {
      setCurrentStep(paymentStep);
      trackPaymentInfoStep();
    }
    if (typeof window !== "undefined") {
      sessionStorage.removeItem(DONATION_CHECKOUT_RESUME_KEY);
    }
  };

  const requestCheckoutSignIn = (targetStep: number) => {
    persistCheckoutResume(targetStep);
    onAuthCheckpoint?.();
    const signInStep = getSignInStepIndex();
    if (signInStep >= 0) setCurrentStep(signInStep);
  };

  const handleNext = () => {
    const steps = getSteps();
    const nextStep = currentStep + 1;

    if (currentStep < steps.length - 1) {
      const nextTitle = steps[nextStep]?.title;

      if (nextTitle === tAuth("checkoutTitle")) {
        if (sessionStatus === "authenticated" || hasSkippedAuth) {
          resumePaymentInfoStep();
          return;
        }
        requestCheckoutSignIn(getPaymentInfoStepIndex(steps));
        return;
      }

      if (
        nextTitle === t("paymentInfo") &&
        sessionStatus !== "authenticated" &&
        !hasSkippedAuth
      ) {
        requestCheckoutSignIn(nextStep);
        return;
      }

      setCurrentStep(nextStep);

      // ── Funnel events on step transitions ──────────────────────────────────
      const currency = getCurrency();

      // Reached confirmation step → InitiateCheckout (once per session)
      if (nextTitle === t("confirmation") && !checkoutTrackedRef.current) {
        checkoutTrackedRef.current = true;
        tracking?.trackInitiateCheckout({
          value: donationAmount,
          currency,
          numItems: 1,
          contentIds: campaignId
            ? [campaignId]
            : categoryId
              ? [categoryId]
              : undefined,
          donationType: donationType ?? undefined,
        });
      }

      // Reached payment step → AddPaymentInfo (once per session)
      if (nextTitle === t("paymentInfo")) {
        trackPaymentInfoStep();
      }

      // Amount step → CustomizeProduct with amount
      if (
        steps[currentStep]?.title === t("donationAmount") ||
        steps[currentStep]?.title === t("monthlyDonationAmount")
      ) {
        tracking?.trackCustomizeProduct({
          donationType: donationType ?? undefined,
          amount: donationAmount,
          currency,
          causeId: campaignId || categoryId || undefined,
          causeName: campaignTitle || categoryName || undefined,
        });
      }
    } else {
      handleSubmit();
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  /** Donation Value step: return to type choice, previous step, or close dialog. */
  const handleBackFromDonationValueStep = () => {
    if (!monthlyOnly && !oneTimeOnly && !shareMode && donationType) {
      setDonationType(null);
      setCurrentStep(0);
      return;
    }
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
      return;
    }
    onClose();
  };

  const getSteps = () => {
    return donationType ? DONATION_STEPS[donationType] : [];
  };

  const renderStepIndicator = () => {
    const steps = getSteps();
    return (
      <div className="flex items-center gap-1.5 mb-3 px-5 pt-4 sm:mb-4 sm:px-6">
        {steps.map((step, index) => (
          <div
            key={index}
            className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
              index < currentStep
                ? "bg-burgundy"
                : index === currentStep
                  ? "bg-gold"
                  : "bg-gray-200"
            }`}
          />
        ))}
      </div>
    );
  };

  const getStepContent = () => {
    if (!mounted) return null;

    if (!donationType && !monthlyOnly && !oneTimeOnly && !shareMode) {
      return (
        <div className="space-y-6">
          <div className="text-center mb-8 flex flex-col items-center">
            <h2 className="text-xl sm:text-2xl font-extrabold text-deep mb-2">
              {t("chooseDonationType")}
            </h2>
            <p className="text-gray-500">{t("chooseDonationTypeDesc")}</p>
            <div className="gold-mark-sm mt-4" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              {
                type: "ONE_TIME" as const,
                Icon: Heart,
                title: t("oneTimeDonation"),
                desc: t("oneTimeDonationDesc"),
              },
              {
                type: "MONTHLY" as const,
                Icon: Calendar,
                title: t("monthlyDonation"),
                desc: t("monthlyDonationDesc"),
              },
            ].map(({ type, Icon, title, desc }) => (
              <button
                key={type}
                type="button"
                onClick={() => handleTypeSelect(type)}
                className="group shape-card h-auto border border-gray-200 bg-white p-5 sm:p-6 text-center transition-all duration-300 hover:-translate-y-0.5 hover:border-burgundy hover:shadow-lift"
              >
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-burgundy to-burgundyDark text-white shadow-soft transition-transform duration-300 group-hover:scale-105 sm:h-14 sm:w-14">
                  <Icon className="h-5 w-5 sm:h-6 sm:w-6" />
                </div>
                <h3 className="font-bold text-deep">{title}</h3>
                <p className="mt-1 text-sm text-gray-500 whitespace-normal break-words">
                  {desc}
                </p>
                <div className="gold-mark-sm mx-auto mt-3 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
              </button>
            ))}
          </div>
        </div>
      );
    }

    const steps = getSteps();

    // Safety check: ensure steps array is populated and currentStep is valid
    if (!steps.length || !steps[currentStep]) {
      return null;
    }

    switch (steps[currentStep].title) {
      case t("donationAmount"):
      case t("monthlyDonationAmount"):
        return (
          <div className="space-y-6">
            <div className="flex justify-between items-center space-y-2">
              <h3 className="text-lg sm:text-xl font-semibold text-gray-900">
                {t("donationValue")}
              </h3>
                  {donationAmount && donationAmount > 0 && (
              <h3 dir="ltr" className="text-base sm:text-lg font-bold text-burgundyDark">
                      {donationAmount + " " + getCurrency()}
                    </h3>
            )}
            </div>
            {donationType === "ONE_TIME" && campaignId && !openGoal && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">
                    {t("collected")}{" "}
                    <span dir="ltr">
                      {formatNumber(
                        (convertToCurrency(Math.round(amountRaised))
                          .convertedValue ?? 0) + donationAmount,
                      )}{" "}
                      {getCurrency()}
                    </span>
                  </span>
                  <span className="text-gray-600">
                    {t("goal")}{" "}
                    <span dir="ltr">
                      {formatNumber(
                        convertToCurrency(Math.round(targetAmount))
                          .convertedValue ?? 0,
                      )}{" "}
                      {getCurrency()}
                    </span>
                  </span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2">
                  <div
                    className="bg-burgundy h-2 rounded-full max-w-full transition-all duration-500 ease-in-out"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            )}

            <div className="space-y-4">
              {shareMode && sharePriceUSD != null ? (
                (() => {
                  const sharePriceInCurrency = getSharePriceInCurrency();
                  const customPlural = resolveSharePlural(
                    shareLabels ?? null,
                    locale,
                  );
                  const unitForCount = resolveShareUnit(
                    shareLabels ?? null,
                    locale,
                    shareCount,
                  );
                  return (
                    <>
                      <p className="text-sm text-center text-gray-600">
                        {t("sharePriceLabel")}{" "}
                        <span dir="ltr">
                          {formatNumber(sharePriceInCurrency)} {getCurrency()}
                        </span>
                      </p>
                      <p className="text-xs text-center text-gray-500">
                        {customPlural
                          ? t("sharesPickHintCustom", { unit: customPlural })
                          : t("sharesPickHint")}
                      </p>
                      <div className="flex items-center justify-center gap-3">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setShareCount((c) => Math.max(1, c - 1))
                          }
                        >
                          −
                        </Button>
                        <div className="min-w-[5rem] text-center">
                          <span className="text-xl sm:text-2xl font-bold text-gray-900">
                            {shareCount}
                          </span>
                          <p className="text-xs text-gray-500">
                            {unitForCount ?? t("sharesLabel")}
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setShareCount((c) => c + 1)}
                        >
                          +
                        </Button>
                      </div>
                      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                        {sharePickCounts.map((c) => (
                          <Button
                            key={c}
                            type="button"
                            variant="outline"
                            onClick={() => setShareCount(c)}
                            className={
                              shareCount === c
                                ? "border-burgundy bg-burgundy/[0.06] text-burgundy font-semibold"
                                : ""
                            }
                          >
                            {c * sharePriceInCurrency > 0 ? (
                              <span dir="ltr">
                                {formatNumber(c * sharePriceInCurrency)}{" "}
                                {getCurrency()}
                              </span>
                            ) : (
                              t("free")
                            )}
                          </Button>
                        ))}
                      </div>
                      <p className="text-center text-base font-semibold text-burgundy">
                        {t("donationTotal")}:{" "}
                        <span dir="ltr">
                          {formatNumber(donationAmount)} {getCurrency()}
                        </span>
                      </p>
                    </>
                  );
                })()
              ) : (
                <>
                  <AnimatePresence>
                    {useStripeElements &&
                      stripeMinAmount > 1 &&
                      donationAmount > 0 &&
                      donationAmount < stripeMinAmount && (
                        <motion.p
                          key="stripe-min"
                          className="text-[13px] text-amber-600 font-medium"
                          initial={{ opacity: 0, y: -6, height: 0 }}
                          animate={{ opacity: 1, y: 0, height: "auto" }}
                          exit={{ opacity: 0, y: -6, height: 0 }}
                          transition={{ duration: 0.2, ease: "easeOut" }}
                        >
                          {t("stripeMinDonation", {
                            amount: stripeMinAmount,
                            currency: getCurrency(),
                          })}
                        </motion.p>
                      )}
                  </AnimatePresence>
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    step={1}
                    value={donationAmount || ""}
                    onChange={(e) => {
                      const val = e.target.value.replace(/[^0-9]/g, "");
                      setDonationAmount(val ? parseInt(val, 10) : 0);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "." || e.key === ",") e.preventDefault();
                    }}
                    placeholder={t("enterDonationAmount")}
                  />

                  <div className="grid grid-cols-3 gap-2">
                    {presetDonationAmounts.map((amount) => (
                      <Button
                        key={amount}
                        variant="outline"
                        onClick={() => setDonationAmount(amount)}
                        className={`${
                          donationAmount === amount
                            ? "border-burgundy bg-burgundy/[0.06] text-burgundy font-semibold"
                            : ""
                        }`}
                      >
                        <span dir="ltr">
                          {amount} {getCurrency()}
                        </span>
                      </Button>
                    ))}
                  </div>
                </>
              )}
            </div>

            <div className="flex justify-between gap-4 mt-6 flex-wrap">
              <Button
                type="button"
                variant="outline"
                onClick={handleBackFromDonationValueStep}
                className="flex-1 min-w-[6rem] inline-flex items-center justify-center gap-2"
              >
                {backLabel}
              </Button>
              {!isCategoryMode && campaignId && donationType !== "MONTHLY" && (
                <Button
                  variant={oneTimeOnly ? "default" : "outline"}
                  disabled={
                    oneTimeOnly &&
                    (shareMode ? shareCount < 1 : !donationAmount)
                  }
                  onClick={async () => {
                    try {
                      const amountUSD =
                        shareMode && sharePriceUSD != null
                          ? shareCount * getSharePriceUSDEffective()
                          : convertToUSD(donationAmount, payCurrencyCode());
                      if (!session?.user?.id) {
                        // Guest: add to Zustand only (no DB call — not authenticated).
                        // Embed the campaign's shareLabels so the cart can resolve
                        // the unit name client-side for any language.
                        addItem({
                          id: crypto.randomUUID(),
                          campaignId,
                          amount: donationAmount,
                          amountUSD,
                          currency: getCurrency(),
                          ...(shareMode ? { shareCount } : {}),
                          campaign: {
                            id: campaignId,
                            title: campaignTitle,
                            images: [campaignImage],
                            ...(shareLabels ? { shareLabels } : {}),
                          },
                        });
                      } else {
                        const response = await axios.post("/api/cart", {
                          campaignId: campaignId,
                          amount: donationAmount,
                          amountUSD,
                          currency: getCurrency(),
                          ...(shareMode ? { shareCount } : {}),
                        });
                        addItem(response.data || []);
                      }
                      tracking?.trackAddToCart({
                        value: donationAmount,
                        currency: getCurrency(),
                        contentIds: [campaignId],
                        contentName: campaignTitle,
                        quantity: 1,
                      });
                      if (session?.user?.id) window.location.reload();
                    } catch (error) {
                      console.error("Error adding to cart:", error);
                      toast.error(t("failedToAddToCart"));
                    } finally {
                      onClose();
                    }
                  }}
                  className={
                    oneTimeOnly
                      ? "flex-1 min-w-[6rem] shape-button bg-burgundy hover:bg-burgundyDark text-white shadow-soft inline-flex items-center justify-center gap-2"
                      : "flex-1 min-w-[6rem] flex justify-center items-center gap-2 bg-burgundy/10 text-burgundy hover:bg-burgundy/20 !border-none !shadow-none"
                  }
                >
                  <ShoppingCart className="w-4 h-4" />
                  {t("addToCart")}
                </Button>
              )}
              {!oneTimeOnly && (
                <Button
                  onClick={handleNext}
                  disabled={
                    !donationAmount ||
                    (useStripeElements && donationAmount < stripeMinAmount)
                  }
                  className="flex-1 min-w-[6rem] shape-button bg-burgundy hover:bg-burgundyDark text-white shadow-soft inline-flex items-center justify-center gap-2"
                >
                  {nextLabel}
                </Button>
              )}
            </div>
          </div>
        );

      case t("teamSupport"):
        return (
          <div className="space-y-5">
            <div className="text-center space-y-1.5">
              <h3 className="text-lg font-semibold text-gray-900">
                {t("wantToSupportTeam")}
              </h3>
              <p className="text-gray-600 text-sm">{t("teamSupportHelp")}</p>
            </div>
            <div className="flex flex-col items-center gap-2">
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                value={teamSupport ?? ""}
                onChange={(e) => {
                  const val = e.target.value.replace(/[^0-9]/g, "");
                  setTeamSupport(val ? parseInt(val, 10) : null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "." || e.key === ",") e.preventDefault();
                }}
                placeholder={t("otherAmount")}
              />
              <div className="grid grid-cols-3 gap-3 w-full">
                {teamSupportOptions.map((option) => (
                  <Button
                    key={option.value}
                    variant="outline"
                    onClick={() => setTeamSupport(option.value)}
                    className={`${
                      teamSupport === option.value
                        ? "border-burgundy bg-burgundy/[0.06] text-burgundy font-semibold"
                        : ""
                    }`}
                  >
                    <span
                      className="font-medium"
                      dir={option.label === t("noThanks") ? undefined : "ltr"}
                    >
                      {option.label === t("noThanks")
                        ? option.label
                        : `${option.value} ${getCurrency()}`}
                    </span>
                  </Button>
                ))}
              </div>
            </div>

            {/* Cover-fees toggle, folded in here so it isn't its own step */}
            {/* <button
              type="button"
              dir={dir}
              onClick={() => setCoverFees(!coverFees)}
              className={`w-full flex items-start gap-3 p-3 rounded-xl border transition-all ${
                coverFees
                  ? "border-burgundy bg-burgundy/5"
                  : "border-gray-200 hover:border-gray-300 bg-white"
              }`}
            >
              <div className={`w-5 h-5 flex-shrink-0 flex items-center justify-center rounded-md border-2 mt-0.5 transition-all ${
                coverFees ? "bg-burgundy border-burgundy" : "border-gray-300"
              }`}>
                {coverFees && <Check className="w-3 h-3 text-white" />}
              </div>
              <div className="flex-1 text-start">
                <p className="text-sm font-semibold text-gray-900">{t("coverPaymentFees")}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {t("feesWillBeAdded", { amount: `${fees.toFixed(2)} ${getCurrency()}` })}
                </p>
              </div>
            </button> */}

            {/* Live total preview so the user always sees what they'll pay */}
            <div
              dir={dir}
              className="flex items-center justify-between rounded-xl bg-gray-50 px-3 py-2.5 text-sm"
            >
              <span className="text-gray-600">{t("total")}</span>
              <span className="font-bold text-burgundy" dir="ltr">
                {totalAmount.toFixed(2)} {getCurrency()}
              </span>
            </div>

            <div className="flex justify-between gap-4">
              <Button
                variant="outline"
                onClick={handleBack}
                className="flex-1 inline-flex items-center justify-center gap-2"
              >
                {backLabel}
              </Button>
              <Button
                onClick={handleNext}
                disabled={teamSupport === null}
                className="flex-1 shape-button bg-burgundy hover:bg-burgundyDark text-white shadow-soft inline-flex items-center justify-center gap-2"
              >
                {nextLabel}
              </Button>
            </div>
          </div>
        );

      case t("paymentFees"):
        return (
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <h3 className="text-lg font-semibold text-gray-900">
                {t("coverPaymentFees")}
              </h3>
              <p className="text-gray-600 text-sm">{t("paymentFeesInfo")}</p>
            </div>

            <div
              dir={locale === "ar" ? "rtl" : "ltr"}
              className="bg-gray-50 p-4 rounded-lg space-y-3"
            >
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">{t("amount")}</span>
                <span className="font-medium" dir="ltr">
                  {formatNumber(donationAmount)} {getCurrency()}
                </span>
              </div>
              {teamSupport != null && teamSupport > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">{t("teamSupport")}</span>
                  <span className="font-medium" dir="ltr">
                    {formatNumber(teamSupport)} {getCurrency()}
                  </span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">{t("paymentFeesPercent")}</span>
                <span className="font-medium" dir="ltr">
                  {fees.toFixed(2)} {getCurrency()}
                </span>
              </div>
            </div>

            <button
              type="button"
              dir={locale === "ar" ? "rtl" : "ltr"}
              onClick={() => setCoverFees(!coverFees)}
              className={`w-full flex items-start gap-3 p-4 rounded-lg border transition-all duration-200 ${
                coverFees
                  ? "border-burgundy bg-burgundy/5"
                  : "border-gray-200 hover:border-gray-400"
              }`}
            >
              <div
                className={`w-5 h-5 flex-shrink-0 flex items-center justify-center rounded-full border-2 mt-0.5 transition-all duration-200 ${
                  coverFees ? "bg-burgundy border-burgundy" : "border-gray-300"
                }`}
              >
                {coverFees && <Check className="w-3 h-3 text-white" />}
              </div>
              <div className="flex-1 text-start">
                <p className="font-medium text-gray-900">{t("yesCoverFees")}</p>
                <p className="text-sm text-gray-500 mt-0.5">
                  {t("feesWillBeAdded", {
                    amount: `${fees.toFixed(2)} ${getCurrency()}`,
                  })}
                </p>
              </div>
            </button>

            <div className="flex justify-between gap-4">
              <Button
                variant="outline"
                onClick={handleBack}
                className="flex-1 inline-flex items-center justify-center gap-2"
              >
                {backLabel}
              </Button>
              <Button
                onClick={handleNext}
                className="flex-1 shape-button bg-burgundy hover:bg-burgundyDark text-white shadow-soft inline-flex items-center justify-center gap-2"
              >
                {nextLabel}
              </Button>
            </div>
          </div>
        );

      case t("confirmation"):
        return (
          <div className="space-y-8">
            {/* Campaign or Category Image Section */}
            {(campaignImage || categoryImage || isCategoryMode) && (
              <div className="relative h-48 rounded-lg overflow-hidden">
                <img
                  src={
                    isCategoryMode
                      ? categoryImage ||
                        "https://i.ibb.co/N2zVsqfg/calisma-alanlarimiz-egitim-sektoru.jpg"
                      : campaignImage
                  }
                  alt={isCategoryMode ? categoryName : campaignTitle}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-black bg-opacity-30 flex items-center justify-center">
                  <h2 className="text-white text-2xl font-bold">
                    {isCategoryMode ? categoryName : campaignTitle}
                  </h2>
                </div>
              </div>
            )}

            {/* Donation Details Section */}
            <div className="bg-gray-50 p-6 rounded-lg space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-gray-600">{t("donationType")}</span>
                <span className="font-medium text-gray-900">
                  {donationType === "ONE_TIME" ? t("oneTime") : t("monthly")}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-600">{t("amount")}</span>
                <span className="font-medium text-gray-900" dir="ltr">
                  {formatNumber(donationAmount)} {getCurrency()}
                </span>
              </div>
              {teamSupport != null && teamSupport > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">{t("teamSupport")}</span>
                  <span className="font-medium text-gray-900" dir="ltr">
                    {formatNumber(teamSupport)} {getCurrency()}
                  </span>
                </div>
              )}
              {coverFees && (
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">{t("paymentFeesLabel")}</span>
                  <span className="font-medium text-gray-900" dir="ltr">
                    {fees.toFixed(2)} {getCurrency()}
                  </span>
                </div>
              )}
              <div className="pt-4 border-t">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-gray-900">
                    {t("total")}
                  </span>
                  <span className="font-bold text-burgundy text-xl" dir="ltr">
                    {totalAmount.toFixed(2)} {getCurrency()}
                  </span>
                </div>
              </div>
            </div>

            {/* Buttons Section */}
            <div className="flex justify-between gap-4">
              <Button
                variant="outline"
                onClick={handleBack}
                className="flex-1 py-3 text-gray-700 border-gray-300 hover:bg-gray-50 inline-flex items-center justify-center gap-2"
              >
                {backLabel}
              </Button>
              <Button
                onClick={handleNext}
                className="flex-1 py-3 shape-button bg-burgundy hover:bg-burgundyDark text-white shadow-soft inline-flex items-center justify-center gap-2"
              >
                {nextLabel}
              </Button>
            </div>

            {/* Footer Note */}
            <p className="text-xs text-center text-gray-500 mt-4">
              {t("byContinuing")}{" "}
              <a href="#" className="text-burgundy hover:underline">
                {t("termsOfUseLink")}
              </a>{" "}
              {t("and")}{" "}
              <a href="#" className="text-burgundy hover:underline">
                {t("privacyPolicyLink")}
              </a>
            </p>
          </div>
        );

      case tAuth("checkoutTitle"):
        return (
          <div className="space-y-5">
            <div className="text-center space-y-2">
              <h3 className="text-lg sm:text-xl font-semibold text-gray-900">
                {tAuth("checkoutTitle")}
              </h3>
              <p className="text-gray-600 text-sm">
                {tAuth("checkoutSubtitle")}
              </p>
            </div>
            <SignInPanel
              isOpen={
                isOpen && steps[currentStep]?.title === tAuth("checkoutTitle")
              }
              onClose={() => {}}
              onAuthenticated={resumePaymentInfoStep}
              onSkip={() => {
                setHasSkippedAuth(true);
                resumePaymentInfoStep();
              }}
              callbackUrl={authCallbackUrl}
              variant="checkout"
              showHeader={false}
              className="w-full"
            />
            <div dir={dir} className="flex justify-between gap-4">
              <Button
                variant="outline"
                onClick={handleBack}
                className="flex-1 inline-flex items-center justify-center gap-2"
              >
                {backLabel}
              </Button>
            </div>
          </div>
        );

      case t("paymentInfo"):
        return (
          <div className="space-y-6 overflow-visible">
            {/* ── Saved cards picker — shown when user has any saved card ──
                Hidden when Albaraka's hosted page owns the card step: the donor
                enters the card at the bank, so a stored PAN has nowhere to go. */}
            {savedCards.length > 0 && !(useAlbaraka && albarakaUseOOS) && (
              <div className="space-y-3">
                <p className="text-sm font-semibold text-gray-700">
                  {t("savedCards")}
                </p>
                <div className="space-y-2">
                  {savedCards.map((card) => {
                    const selected = selectedCardId === card.id;
                    const brandBadge: Record<string, string> = {
                      visa: "VISA",
                      mastercard: "MC",
                      amex: "AMEX",
                      troy: "TROY",
                    };
                    return (
                      <button
                        key={card.id}
                        type="button"
                        onClick={() => {
                          if (selected) {
                            setSelectedCardId(null);
                            setCardDetails({
                              cardNumber: "",
                              expiryDate: "",
                              cvv: "",
                              cardholderName: "",
                            });
                          } else {
                            setSelectedCardId(card.id);
                            setCardDetails({
                              cardNumber: `**** **** **** ${card.last4}`,
                              expiryDate: card.expiryDate,
                              cvv: "",
                              cardholderName: card.cardholderName ?? "",
                            });
                          }
                        }}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-sm transition-all duration-200 ${selected ? "border-burgundy bg-burgundy/5 shadow-sm" : "border-gray-200 hover:border-gray-300 bg-white hover:shadow-sm"}`}
                      >
                        <span
                          className={`w-10 h-7 rounded-md flex items-center justify-center text-[10px] font-bold text-white shrink-0 ${card.cardType === "visa" ? "bg-blue-600" : card.cardType === "mastercard" ? "bg-orange-500" : card.cardType === "amex" ? "bg-green-600" : card.cardType === "troy" ? "bg-red-600" : "bg-gray-500"}`}
                        >
                          {brandBadge[card.cardType] ?? "💳"}
                        </span>
                        <div className="flex-1 text-start min-w-0">
                          <p className="font-semibold text-gray-800 text-sm truncate">
                            {card.nickname ||
                              `${card.cardType.charAt(0).toUpperCase() + card.cardType.slice(1)} •••• ${card.last4}`}
                          </p>
                          <p className="text-xs text-gray-400">
                            {t("expires")} {card.expiryDate}
                          </p>
                        </div>
                        {selected ? (
                          <span className="w-5 h-5 rounded-full bg-burgundy flex items-center justify-center shrink-0">
                            <svg
                              className="w-3 h-3 text-white"
                              fill="none"
                              viewBox="0 0 12 12"
                            >
                              <path
                                d="M2 6l3 3 5-5"
                                stroke="white"
                                strokeWidth="1.8"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          </span>
                        ) : (
                          <span className="w-5 h-5 rounded-full border-2 border-gray-300 shrink-0" />
                        )}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedCardId(null);
                      setCardDetails({
                        cardNumber: "",
                        expiryDate: "",
                        cvv: "",
                        cardholderName: "",
                      });
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-sm transition-all duration-200 ${!selectedCardId ? "border-burgundy bg-burgundy/5 shadow-sm" : "border-dashed border-gray-300 hover:border-gray-400 bg-white hover:shadow-sm"}`}
                  >
                    <span className="w-10 h-7 rounded-md border-2 border-dashed border-gray-300 flex items-center justify-center shrink-0">
                      <svg
                        className="w-4 h-4 text-gray-400"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 4v16m8-8H4"
                        />
                      </svg>
                    </span>
                    <span className="font-medium text-gray-700">
                      {t("useNewCard")}
                    </span>
                    {!selectedCardId && (
                      <span className="w-5 h-5 rounded-full bg-burgundy flex items-center justify-center shrink-0">
                        <svg
                          className="w-3 h-3 text-white"
                          fill="none"
                          viewBox="0 0 12 12"
                        >
                          <path
                            d="M2 6l3 3 5-5"
                            stroke="white"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </span>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* CVC-only when a saved card is selected */}
            {selectedCardId && (
              <div className="space-y-2" dir="ltr">
                <label className="block text-sm font-medium text-gray-700 text-start">
                  {t("cvc")}
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  value={cardDetails.cvv}
                  onChange={(e) =>
                    setCardDetails((d) => ({
                      ...d,
                      cvv: e.target.value.replace(/\D/g, ""),
                    }))
                  }
                  placeholder="•••"
                  className="w-28 rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-burgundy focus:ring-2 focus:ring-burgundy/10 tracking-widest"
                />
              </div>
            )}

            {/* Full form when no saved card selected */}
            {!selectedCardId && paymentMethod === "CARD" && (
              <div className="text-center space-y-3">
                <p className="text-gray-900 font-semibold">{t("bankCard")}</p>
                <p className="text-sm text-gray-600">
                  {t("secure3DCardPrompt")}
                </p>
              </div>
            )}

            {/* Stripe Elements — only when no saved card + Stripe is charging */}
            {paymentMethod === "CARD" && useStripeElements && !selectedCardId && (
              <Elements stripe={getStripePromise()}>
                <StripePaymentStep
                  ref={stripeFormRef}
                  onReadyChange={onStripeReadyChange}
                />
              </Elements>
            )}

            {/* Manual card form — shared by the PayFor and Albaraka 3D rails */}
            {paymentMethod === "CARD" && useOwnCardForm && !selectedCardId && (
              <PayForCardForm
                cardDetails={cardDetails}
                setCardDetails={setCardDetails}
                cardFocus={cardFocus}
                setCardFocus={setCardFocus}
              />
            )}

            {useGuestCheckout && (
              <div className="space-y-3 pt-2 border-t border-border" dir={dir}>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="block text-sm font-medium text-gray-700">
                      {t("firstName")}
                    </label>
                    <input
                      type="text"
                      value={guestFirstName}
                      onChange={(e) => setGuestFirstName(e.target.value)}
                      placeholder={t("firstName")}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-sm font-medium text-gray-700">
                      {t("lastName")}
                    </label>
                    <input
                      type="text"
                      value={guestLastName}
                      onChange={(e) => setGuestLastName(e.target.value)}
                      placeholder={t("lastName")}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="block text-sm font-medium text-gray-700">
                    {t("email")}
                  </label>
                  <input
                    type="email"
                    value={guestEmail}
                    onChange={(e) => setGuestEmail(e.target.value)}
                    placeholder={t("email")}
                    dir="ltr"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
                  />
                  <div
                    className={`mt-1.5 flex items-start gap-2 rounded-lg border border-amber-200/70 bg-gradient-to-br from-amber-50 to-orange-50 px-2.5 py-2 ${
                      dir === "rtl" ? "text-right" : "text-left"
                    }`}
                  >
                    <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-sm">
                      <Award className="h-3 w-3" aria-hidden />
                    </span>
                    <p className="text-[11px] leading-snug text-amber-900">
                      <span className="font-semibold text-amber-950">
                        {t("certificateNoteTitle")}
                      </span>{" "}
                      <span className="text-amber-800">
                        {t("certificateNoteBody")}
                      </span>
                    </p>
                  </div>
                </div>
              </div>
            )}

            {(!session?.user?.id || needsPhone) && (
              <div
                className="space-y-2 overflow-visible pt-2 border-t border-border"
                dir={locale === "ar" ? "rtl" : "ltr"}
              >
                <label
                  className={`block text-sm font-medium text-gray-700 ${locale === "ar" ? "text-right" : "text-left"}`}
                >
                  {t("contactPhone")}
                </label>
                <div className="overflow-visible phone-input-wrapper">
                  <PhoneInput
                    defaultCountry={ipCountry}
                    value={phoneValue}
                    onChange={(phone) => setPhoneValue(phone)}
                    className="w-full overflow-visible"
                    inputClassName="w-full min-w-0 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
                    required
                  />
                </div>
              </div>
            )}

            {/* Inline profile completion — shown only for signed-in users who
                are missing birthdate / gender so we don't bounce them to a
                separate page. Only the missing fields render. */}
            {(needsBirthdate || needsGender) && (
              <div className="space-y-3 pt-2 border-t border-border" dir={dir}>
                {needsBirthdate && (
                  <div className="space-y-1">
                    <label className="block text-sm font-medium text-gray-700">
                      {tAuth("dateOfBirthLabel")}
                    </label>
                    <input
                      type="date"
                      value={birthdateValue}
                      onChange={(e) => setBirthdateValue(e.target.value)}
                      placeholder={tAuth("dateOfBirthPlaceholder")}
                      max={new Date().toISOString().slice(0, 10)}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
                    />
                  </div>
                )}
                {needsGender && (
                  <div className="space-y-1">
                    <label className="block text-sm font-medium text-gray-700">
                      {tAuth("genderLabel")}
                    </label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {(["male", "female", "preferNotToSay"] as const).map(
                        (g) => {
                          const active = genderValue === g;
                          return (
                            <button
                              key={g}
                              type="button"
                              onClick={() => setGenderValue(g)}
                              className={`py-2 text-xs font-medium rounded-md border transition-all ${
                                active
                                  ? "bg-burgundy text-white border-burgundy"
                                  : "bg-white text-gray-600 border-gray-200 hover:border-burgundy/40"
                              }`}
                            >
                              {tAuth(
                                `gender${g.charAt(0).toUpperCase() + g.slice(1)}` as
                                  | "genderMale"
                                  | "genderFemale"
                                  | "genderPreferNotToSay",
                              )}
                            </button>
                          );
                        },
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div dir={dir} className="flex justify-between gap-4">
              <Button
                variant="outline"
                onClick={handleBack}
                className="flex-1 inline-flex items-center justify-center gap-2"
              >
                {backLabel}
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={
                  loading ||
                  !isPhoneValid() ||
                  (useGuestCheckout &&
                    (!guestFirstName.trim() ||
                      !guestLastName.trim() ||
                      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail.trim()))) ||
                  (paymentMethod === "CARD" &&
                    useStripeElements &&
                    !selectedCardId &&
                    !stripeReady) ||
                  (paymentMethod === "CARD" &&
                    selectedCardId &&
                    cardDetails.cvv.length < 3) ||
                  (paymentMethod === "CARD" &&
                    useOwnCardForm &&
                    !selectedCardId &&
                    (cardDetails.cardNumber.length < 13 ||
                      cardDetails.expiryDate.length < 5 ||
                      cardDetails.cvv.length < 3 ||
                      !cardDetails.cardholderName.trim()))
                }
                className="flex-1 shape-button bg-burgundy hover:bg-burgundyDark text-white shadow-soft inline-flex items-center justify-center gap-2"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  confirmDonationLabel
                )}
              </Button>
            </div>
            <div className="flex items-center justify-center gap-2 pt-2 text-gray-400 text-[11px]">
              <svg
                className="w-3.5 h-3.5 text-green-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                />
              </svg>
              <span>{t("sslSecurePayment")}</span>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  const handleSubmit = async () => {
    let isRedirecting = false;
    try {
      if (!session?.user?.id && !useGuestCheckout) {
        requestCheckoutSignIn(getPaymentInfoStepIndex());
        return;
      }
      setLoading(true);
      // Persist any inline-collected profile fields onto the user record
      // (Google sign-in sends users straight to payment, so we backfill
      // phone / birthdate / gender here instead of /auth/complete-profile).
      if (session?.user?.id) {
        const profileUpdate: Record<string, unknown> = {};
        if (needsPhone && phoneValue.trim())
          profileUpdate.phone = phoneValue.trim();
        if (needsBirthdate && birthdateValue)
          profileUpdate.birthdate = birthdateValue;
        if (needsGender && genderValue) profileUpdate.gender = genderValue;
        if (Object.keys(profileUpdate).length > 0) {
          profileUpdate.profileCompletionSeen = true;
          try {
            await axios.put(`/api/users/${session.user.id}`, profileUpdate);
          } catch {
            // Non-blocking — donation can still proceed; profile prompt
            // will reappear on next visit.
          }
        }
      }
      const amountUSD =
        shareMode && sharePriceUSD != null
          ? shareCount * getSharePriceUSDEffective()
          : convertToUSD(donationAmount, payCurrencyCode());

      // Resolve guest geo (used for both tracking and API request)
      let geoCountryCode: string | undefined;
      let geoCity: string | undefined;
      let geoRegion: string | undefined;
      if (useGuestCheckout) {
        try {
          const cached =
            typeof window !== "undefined"
              ? localStorage.getItem("ipapi_cache")
              : null;
          const cacheData = cached
            ? (JSON.parse(cached) as {
                data?: {
                  country_code?: string;
                  city?: string;
                  region?: string;
                };
                ts?: number;
              })
            : null;
          const isValid =
            cacheData && cacheData.ts && Date.now() - cacheData.ts < 86400000;
          if (isValid && cacheData.data) {
            geoCountryCode = cacheData.data.country_code?.toLowerCase();
            geoCity = cacheData.data.city;
            geoRegion = cacheData.data.region;
          } else {
            // Server-backed geo (Vercel/CF headers → ipapi fallback). Avoids
            // the antivirus/CORS/ad-blocker failures the browser direct call
            // was producing in production.
            const geoRes = await fetch("/api/geo/client", {
              credentials: "omit",
            });
            const geoJson = geoRes.ok
              ? ((await geoRes.json().catch(() => null)) as {
                  ok?: boolean;
                  country_code?: string;
                  city?: string;
                  region?: string;
                } | null)
              : null;
            const geo =
              geoJson && geoJson.ok
                ? {
                    country_code: geoJson.country_code,
                    city: geoJson.city,
                    region: geoJson.region,
                  }
                : {};
            geoCountryCode = geo.country_code?.toLowerCase();
            geoCity = geo.city;
            geoRegion = geo.region;
            if (typeof window !== "undefined" && geo.country_code) {
              localStorage.setItem(
                "ipapi_cache",
                JSON.stringify({ data: geo, ts: Date.now() }),
              );
            }
          }
        } catch {
          /* geo is optional */
        }
      }

      // Push user data for enhanced matching
      if (useGuestCheckout) {
        tracking?.setUserData({
          email: guestEmail.trim() || undefined,
          phone: phoneValue.trim() || undefined,
          first_name: guestFirstName.trim() || undefined,
          last_name: guestLastName.trim() || undefined,
          country_code: geoCountryCode,
          city: geoCity,
          state: geoRegion,
        });
      } else {
        const nameParts = (currentUser?.name ?? "").trim().split(/\s+/);
        tracking?.setUserData({
          external_id: session?.user?.id ?? undefined,
          email: (session?.user as { email?: string })?.email ?? undefined,
          phone: phoneValue.trim() || undefined,
          first_name: nameParts[0] ?? undefined,
          last_name: nameParts.slice(1).join(" ") || undefined,
          country_code: currentUser?.countryCode ?? undefined,
          city: currentUser?.city ?? undefined,
          state: currentUser?.region ?? undefined,
          gender: currentUser?.gender ?? undefined,
          date_of_birth: currentUser?.birthdate ?? undefined,
        });
      }

      // payment_submit event
      tracking?.trackPaymentSubmit({
        value: totalAmount,
        currency: getCurrency(),
        causeId: campaignId || categoryId || undefined,
        causeName: campaignTitle || categoryName || undefined,
        donationType: donationType ?? undefined,
        gateway: gatewayAnalyticsName(gateway),
        is3ds: useBank3D,
      });
      const donationData: Record<string, unknown> = {
        currency: getCurrency(),
        teamSupport: teamSupport ?? 0,
        coverFees,
        type: donationType,
        paymentMethod,
        cardDetails: null,
        locale,
        attribution: getDonationAttributionPayload(),
        ...(useGuestCheckout && {
          guest: {
            firstName: guestFirstName.trim() || undefined,
            lastName: guestLastName.trim() || undefined,
            email: guestEmail.trim() || undefined,
            phone: phoneValue.trim() || undefined,
            countryCode: geoCountryCode,
            city: geoCity,
            region: geoRegion,
          },
        }),
      };
      const refCode = getReferralCode();
      if (refCode) donationData.referralCode = refCode;
      if (isCategoryMode && categoryId) {
        donationData.categoryItems = [
          { categoryId, amount: donationAmount, amountUSD },
        ];
      } else if (campaignId) {
        donationData.items = [
          {
            campaignId,
            amount: donationAmount,
            amountUSD,
            ...(shareMode ? { shareCount } : {}),
          },
        ];
      }

      // ── Stripe Elements direct-charge path (non-3D card / monthly) ───────
      // stripeFormRef.current.confirmPayment() calls stripe.confirmCardPayment()
      // with the CardNumberElement — card data goes browser → Stripe, never our server.
      if (paymentMethod === "CARD" && useStripeElements) {
        if (selectedCardId) {
          toast.error(t("useNewCard"));
          setLoading(false);
          return;
        }
        if (!stripeFormRef.current) throw new Error("Stripe form not ready");

        let targetDonationId: string;
        let clientSecret: string;

        // Re-use fallback intent if PayFor previously failed
        if (fallbackClientSecret && fallbackDonationId) {
          targetDonationId = fallbackDonationId;
          clientSecret = fallbackClientSecret;
        } else {
          const response = await axios.post("/api/donations", donationData);
          if (!response.data.success) {
            onClose();
            return;
          }
          targetDonationId = response.data.donation.id as string;

          const endpoint =
            donationType === "MONTHLY"
              ? "/api/stripe/subscribe"
              : "/api/stripe/charge";
          const intentRes = await axios.post(endpoint, {
            donationId: targetDonationId,
            locale,
          });
          if (intentRes.data.error) {
            toast.error(intentRes.data.error ?? t("donationFailed"));
            setLoading(false);
            return;
          }
          clientSecret = intentRes.data.clientSecret as string;
        }

        isRedirecting = true;
        setRedirecting(true);

        const { error: confirmError } =
          await stripeFormRef.current.confirmPayment(clientSecret);
        if (confirmError) {
          // Mark the preemptively-created donation as FAILED so we keep an audit trail and
          // prevent the row from incorrectly counting as PAID. Fire-and-forget — the
          // donation-failed page works even if this PATCH fails.
          axios
            .patch(`/api/donations/${targetDonationId}/fail`, {
              reason: confirmError.message ?? "stripe_confirm_failed",
            })
            .catch(() => {});
          tracking?.trackPaymentFailed({
            value: donationAmount,
            currency: getCurrency(),
            causeId: campaignId || categoryId || undefined,
            reason: confirmError.message ?? "stripe_confirm_failed",
            gateway: "stripe",
            donationId: targetDonationId,
          });
          // Redirect to /donation-failed so the user lands on the explanatory page
          // with the bank-transfer fallback — toast alone disappears too quickly.
          router.push(
            appendCurrencyQuery(
              `/donation-failed?donationId=${encodeURIComponent(targetDonationId)}`,
              getCurrencyCodeForLinks(),
            ),
          );
          return;
        }

        router.push(
          appendCurrencyQuery(
            `/success/${targetDonationId}`,
            getCurrencyCodeForLinks(),
          ),
        );
        return;
      }

      // ── Bank 3D Secure path (PayFor or Albaraka) ──────────────────────────
      // Both rails work the same way: ask the server for a signed hidden-input set,
      // POST it to the bank as an HTML form, then poll the donation until the bank's
      // callback settles it. Only the endpoint and how the card reaches the bank differ.
      const response = await axios.post("/api/donations", donationData);

      if (response.data.success) {
        const donationId = response.data.donation.id as string;

        if (paymentMethod === "CARD" && useBank3D) {
          const newPan = cardDetails.cardNumber.replace(/\s/g, "");

          // Save new card (fire-and-forget, non-blocking)
          if (
            useOwnCardForm &&
            !selectedCardId &&
            session?.user?.id &&
            newPan.length >= 13
          ) {
            axios
              .post("/api/credit-cards", {
                cardNumber: newPan,
                expiryDate: cardDetails.expiryDate,
                cvc: cardDetails.cvv,
                cardholderName: cardDetails.cardholderName || undefined,
              })
              .catch(() => {});
          }

          // Albaraka signs the card fields into the request MAC, so the card has to
          // go to our server to be signed. PayFor leaves them out of its hash, so the
          // browser appends them below and the PAN never reaches us.
          const init = await axios.post(
            useAlbaraka
              ? "/api/albaraka/3d/initiate"
              : "/api/payfor/3dpay/initiate",
            {
              donationId,
              locale,
              savedCardId: selectedCardId ?? undefined,
              ...(useAlbaraka && useOwnCardForm
                ? {
                    card: {
                      number: selectedCardId ? undefined : newPan,
                      expiry: selectedCardId ? undefined : cardDetails.expiryDate,
                      cvv: cardDetails.cvv,
                      holder: selectedCardId
                        ? undefined
                        : cardDetails.cardholderName,
                    },
                  }
                : {}),
            },
          );
          const { actionUrl, fields } = init.data as {
            actionUrl: string;
            fields: Record<string, string>;
          };

          const form = document.createElement("form");
          form.method = "POST";
          form.action = actionUrl;
          Object.entries(fields).forEach(([name, value]) => {
            const input = document.createElement("input");
            input.type = "hidden";
            input.name = name;
            input.value = String(value ?? "");
            form.appendChild(input);
          });

          // Card fields the browser still has to add — PayFor only. Albaraka's
          // fields are already signed into `fields` server-side (or collected on
          // the bank's own page), so appending anything here would break its MAC.
          const browserCardFields: Record<string, string> = {};
          if (use3D) {
            if (selectedCardId) {
              // Pan/Expiry/CardHolderName already in `fields`; add CVC only.
              browserCardFields.Cvv2 = cardDetails.cvv;
            } else {
              const [mm, yy] = cardDetails.expiryDate.split("/");
              browserCardFields.Pan = newPan;
              browserCardFields.Expiry = `${mm ?? ""}${yy ?? ""}`;
              browserCardFields.Cvv2 = cardDetails.cvv;
              browserCardFields.CardHolderName = cardDetails.cardholderName;
            }
          }
          Object.entries(browserCardFields).forEach(([name, value]) => {
            const input = document.createElement("input");
            input.type = "hidden";
            input.name = name;
            input.value = value;
            form.appendChild(input);
          });

          // Skip the popup attempt entirely on mobile / in-app browsers (FB, IG, TikTok,
          // etc.). In those WebViews window.open often returns a truthy-but-invisible
          // Window object — the form would silently submit to a hidden frame and the
          // user would see nothing happen. Going straight to a full-page redirect
          // (target=_self) lets the bank's 3DS page own the screen and redirect back
          // to the gateway's callback → /success on completion. Desktop keeps the popup
          // so the dialog can poll and show the success state in-place.
          const skipPopup = shouldSkipPopup();
          const popupName = useAlbaraka ? "albaraka3d" : "payfor3d";
          const pw = 600,
            ph = 700;
          const pl = Math.round((screen.width - pw) / 2);
          const pt = Math.round((screen.height - ph) / 2);
          const popup = skipPopup
            ? null
            : window.open(
                "about:blank",
                popupName,
                `width=${pw},height=${ph},left=${pl},top=${pt},scrollbars=yes,resizable=yes`,
              );

          form.target = popup ? popupName : "_self";
          document.body.appendChild(form);
          form.submit();
          document.body.removeChild(form);

          if (!popup) return;

          payforPopupRef.current = popup;
          isRedirecting = true;
          setRedirecting(true);

          let polls = 0;
          // 60 polls × 2s = 120s. Mobile users routinely need >50s for the SMS-OTP step
          // of 3D Secure; the previous 25-poll ceiling was firing the failure redirect
          // while the bank popup was still authenticating.
          const FALLBACK_AFTER_POLLS = 60;

          payforPollRef.current = setInterval(async () => {
            polls++;
            try {
              const res = await fetch(`/api/donations/${donationId}`);
              if (!res.ok) return;
              const data = await res.json();

              if (data.status === "PAID" && data.paidAt) {
                clearInterval(payforPollRef.current!);
                payforPollRef.current = null;
                if (payforPopupRef.current && !payforPopupRef.current.closed) {
                  payforPopupRef.current.close();
                }
                router.push(
                  appendCurrencyQuery(
                    `/success/${donationId}`,
                    getCurrencyCodeForLinks(),
                  ),
                );
                return;
              }
              if (
                data.status === "FAILED" ||
                payforPopupRef.current?.closed ||
                polls >= FALLBACK_AFTER_POLLS
              ) {
                clearInterval(payforPollRef.current!);
                payforPollRef.current = null;
                if (payforPopupRef.current && !payforPopupRef.current.closed) {
                  payforPopupRef.current.close();
                }
                // Browser-side DonateFailed pixel — server CAPI fires the
                // matching hit from /api/payfor/3dpay/fail; same event_id
                // (`${donationId}_failed`) lets Meta dedup the pair.
                tracking?.trackPaymentFailed({
                  value: donationAmount,
                  currency: getCurrency(),
                  causeId: campaignId || categoryId || undefined,
                  reason:
                    data.providerErrorMessage ??
                    data.status ??
                    `${gatewayAnalyticsName(gateway)}_failed`,
                  gateway: gatewayAnalyticsName(gateway),
                  donationId,
                });
                router.push(
                  appendCurrencyQuery(
                    `/donation-failed?donationId=${encodeURIComponent(donationId)}`,
                    getCurrencyCodeForLinks(),
                  ),
                );
              }
            } catch {
              // Ignore transient errors
            }
          }, 2000);

          return;
        }

        isRedirecting = true;
        setRedirecting(true);
        router.push(
          appendCurrencyQuery(
            `/success/${donationId}`,
            getCurrencyCodeForLinks(),
          ),
        );
        return;
      }
      onClose();
    } catch (error) {
      console.error("Payment failed:", error);
      tracking?.trackPaymentFailed({
        value: donationAmount,
        currency: getCurrency(),
        causeId: campaignId || categoryId || undefined,
        reason: error instanceof Error ? error.message : "unknown",
        gateway: gatewayAnalyticsName(gateway),
      });
      // Land on the explanatory failure page (with bank-transfer fallback) instead of
      // a toast that disappears in 3s. We may not have a donationId yet (e.g. /api/donations
      // itself threw) — the page handles a missing query param gracefully.
      isRedirecting = true;
      setRedirecting(true);
      router.push(
        appendCurrencyQuery("/donation-failed", getCurrencyCodeForLinks()),
      );
    } finally {
      if (!isRedirecting) setLoading(false);
    }
  };

  return (
    <>
      <Dialog
        open={isOpen}
        onOpenChange={() => {
          // Clean up PayFor polling if dialog is closed mid-flow
          if (payforPollRef.current) {
            clearInterval(payforPollRef.current);
            payforPollRef.current = null;
          }
          if (payforPopupRef.current && !payforPopupRef.current.closed) {
            payforPopupRef.current.close();
          }
          onClose();
        }}
      >
        <DialogContent
          dir={isRTL ? "rtl" : "ltr"}
          className="w-full h-full sm:h-auto sm:max-w-lg sm:max-h-[90vh] max-h-screen overflow-y-auto overflow-x-hidden p-0 rounded-none sm:rounded-[28px_8px_28px_8px] rtl:sm:rounded-[8px_28px_8px_28px] sm:shadow-lift sm:ring-1 sm:ring-deep/5 top-0 sm:top-[50%] translate-y-0 sm:translate-y-[-50%]"
          closeClassName="text-white hover:text-white/80"
          aria-describedby={undefined}
        >
          <DialogTitle className="sr-only">{t("donationAmount")}</DialogTitle>
          {mounted && (
            <>
              {/* Branded header */}
              <div className="relative h-24 sm:h-32 overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={
                    isCategoryMode
                      ? categoryImage ||
                        "https://i.ibb.co/N2zVsqfg/calisma-alanlarimiz-egitim-sektoru.jpg"
                      : campaignImage ||
                        "https://i.ibb.co/N2zVsqfg/calisma-alanlarimiz-egitim-sektoru.jpg"
                  }
                  alt=""
                  className="w-full h-full object-cover object-center"
                />
                {/* Deep brand wash + subtle dotted texture (matches the site hero). */}
                <div className="absolute inset-0 bg-gradient-to-t from-deep via-deep/85 to-deep/55" />
                <div className="absolute inset-0 opacity-[0.08] bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:16px_16px]" />
                <div className="absolute inset-0 flex flex-col items-center justify-center px-5 text-center sm:px-6">
                  <span className="shape-chip mb-2 inline-flex items-center gap-1.5 bg-burgundy px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white shadow-soft">
                    <Heart className="h-3 w-3" fill="currentColor" />
                    {donationType === "MONTHLY"
                      ? t("monthlyDonation")
                      : t("oneTimeDonation")}
                  </span>
                  <h2 className="text-white font-extrabold text-sm sm:text-base line-clamp-2 leading-snug drop-shadow-sm">
                    {isCategoryMode ? categoryName : campaignTitle}
                  </h2>
                  <div className="gold-mark-sm mt-2" />
                </div>
              </div>
              {/* Step progress bar */}
              {donationType && renderStepIndicator()}
              <div className="relative z-10 px-4 pb-5 sm:px-6 sm:pb-6 bg-white overflow-visible">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={redirecting ? "redirecting" : currentStep}
                    className="overflow-visible"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.2 }}
                  >
                    {redirecting ? (
                      <div className="flex flex-col items-center justify-center py-8 gap-4 sm:py-10 sm:gap-5 text-center">
                        <div className="relative">
                          <div
                            className={`w-16 h-16 sm:w-20 sm:h-20 rounded-full flex items-center justify-center transition-colors ${false ? "bg-[#635bff]/10" : "bg-burgundy/8"}`}
                          >
                            <CardIcon
                              className={`h-7 w-7 sm:h-9 sm:w-9 transition-colors ${false ? "text-[#635bff]" : "text-burgundy"}`}
                            />
                          </div>
                          <span className="absolute -bottom-1 -right-1 w-6 h-6 bg-white border-2 border-burgundy/20 rounded-full flex items-center justify-center">
                            <ExternalLink className="h-3 w-3 text-burgundy" />
                          </span>
                        </div>
                        <div>
                          <p className="text-[15px] sm:text-base font-semibold text-gray-900">
                            {false
                              ? t("paymentSwitching")
                              : t("successRedirecting")}
                          </p>
                          <p className="text-sm text-gray-400 mt-1 max-w-xs mx-auto">
                            {false
                              ? t("paymentSwitchingDesc")
                              : t("successRedirectingDesc")}
                          </p>
                        </div>
                        <div
                          className={`flex items-center gap-2 text-xs px-4 py-2 rounded-full transition-colors ${false ? "text-[#635bff] bg-[#635bff]/8" : "text-burgundy bg-burgundy/6"}`}
                        >
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          <span>
                            {false
                              ? t("paymentSwitching")
                              : t("successRedirectingDesc")}
                          </span>
                        </div>
                      </div>
                    ) : (
                      getStepContent()
                    )}
                  </motion.div>
                </AnimatePresence>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default DonationDialog;
