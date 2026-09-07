"use client";

import Image from "next/image";
import { Elements } from "@stripe/react-stripe-js";
import { getStripePromise } from "@/lib/stripe-client";
import { StripePaymentStep, type StripePaymentHandle } from "@/components/StripePaymentStep";
import { PayForCardForm, type PayForCardState } from "@/components/PayForCardForm";
import { SignInPanel } from "@/components/SignInDialog";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  CreditCard as CardIcon,
  Check,
  Loader2,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  ShoppingCart,
} from "lucide-react";
import axios from "axios";
import { toast } from "react-hot-toast";
import { useConfettiStore } from "@/hooks/use-confetti-store";
import { getCurrency } from "@/hooks/useCampaignValue";
import { useCart } from "@/hooks/useCart";
import { resolveShareUnit, type ShareLabelsConfig } from "@/lib/campaign/share-labels";
import {
  resolveFinalTeamSupportAmounts,
  type SuggestedTeamSupportConfig,
} from "@/lib/campaign/suggested-team-support";
import {
  fetchGlobalSettings,
  getCachedGlobalSettings,
  type GlobalSettings,
} from "@/lib/global-settings-client";
import { useTracking } from "@/components/TrackingPixels";
import useConvetToUSD from "@/hooks/useConvetToUSD";
import { useReferralCode } from "@/hooks/useReferralCode";
import { useRouter } from "@/i18n/routing";
import { appendCurrencyQuery, getCurrencyCodeForLinks } from "@/lib/currency-link";
import { shouldSkipPopup } from "@/lib/in-app-browser";
import { resolveGateway } from "@/lib/payment-gateway";
import { useTranslations, useLocale } from "next-intl";
import { useSession } from "next-auth/react";
import { PhoneInput } from "react-international-phone";
import "react-international-phone/style.css";
import { useIpCountry } from "@/hooks/useIpCountry";

const CART_CHECKOUT_RESUME_KEY = "alafiya:cart-checkout-resume:v1";
const CHECKOUT_RESUME_TTL_MS = 30 * 60 * 1000;

interface CartItem {
  id: string;
  amount: number;
  amountUSD?: number;
  shareCount?: number | null;
  campaign: {
    id: string;
    title: string;
    images: string[];
    /** Per-campaign custom unit names ("sheep" / "meal" / etc.) keyed by locale. */
    shareLabels?: ShareLabelsConfig | null;
    translations?: { locale: string; title: string }[];
  };
}

interface CartPaymentDialogProps {
  isOpen: boolean;
  onClose: () => void;
  cartItems: CartItem[];
  onSuccess?: () => void;
  guestMode?: boolean;
  authCallbackUrl?: string;
  onAuthCheckpoint?: () => void;
}

const CartPaymentDialog = ({
  isOpen,
  onClose,
  cartItems,
  guestMode = false,
  authCallbackUrl,
  onAuthCheckpoint,
}: CartPaymentDialogProps) => {
  const amount = cartItems.reduce((sum, item) => sum + (item.amount ?? item.amountUSD), 0);
  const t = useTranslations("DonationDialog");
  const tAuth = useTranslations("SignInDialog");
  const locale = useLocale();
  const isRTL = locale === "ar";
  const dir = isRTL ? "rtl" : "ltr";
  const btnRow = "inline-flex items-center justify-center gap-2";
  // RTL: Back → on right, Next ← on left. LTR: Back ← on left, Next → on right.
  const backLabel = isRTL ? (
    <span className={btnRow}><ChevronRight className="h-4 w-4 shrink-0" aria-hidden />{t("back")}</span>
  ) : (
    <span className={btnRow}><ChevronLeft className="h-4 w-4 shrink-0" aria-hidden />{t("back")}</span>
  );
  const nextLabel = isRTL ? (
    <span className={btnRow}>{t("next")}<ChevronLeft className="h-4 w-4 shrink-0" aria-hidden /></span>
  ) : (
    <span className={btnRow}>{t("next")}<ChevronRight className="h-4 w-4 shrink-0" aria-hidden /></span>
  );
  const confirmDonationLabel = isRTL ? (
    <span className={btnRow}>{t("confirmDonation")}<ChevronLeft className="h-4 w-4 shrink-0" aria-hidden /></span>
  ) : (
    <span className={btnRow}>{t("confirmDonation")}<ChevronRight className="h-4 w-4 shrink-0" aria-hidden /></span>
  );

  // Trimmed flow for higher conversion: cover-fees folded into teamSupport,
  // sign-in step removed (guests skip auth, authed users keep going).
  const STEPS = [
    { title: t("teamSupport"),    subtitle: t("teamSupportDesc") },
    { title: t("confirmation"),   subtitle: t("confirmationDesc") },
    { title: t("paymentInfo"),    subtitle: t("paymentInfoDesc") },
  ];

  const [globalSettings, setGlobalSettings] = useState<GlobalSettings | null>(
    () => getCachedGlobalSettings()
  );
  const globalTeamSupport: SuggestedTeamSupportConfig | null =
    globalSettings?.suggestedTeamSupport ?? null;
  const payforEnabled = globalSettings ? globalSettings.payforEnabled : true;
  const mainGateway = globalSettings ? globalSettings.mainGateway : "STRIPE";
  // With the bank's hosted card page on, Albaraka collects the card itself and we
  // must not render our own form (the card fields are signed into its request MAC).
  const albarakaUseOOS = globalSettings ? globalSettings.albarakaUseOOS : false;

  const teamSupportOptions = useMemo(() => {
    const amounts = resolveFinalTeamSupportAmounts(getCurrency(), null, globalTeamSupport);
    return [
      { label: t("noThanks"), value: 0 },
      ...amounts.map((v) => ({ label: String(v), value: v })),
    ];
    // getCurrency() reads from a cookie at render time — refresh when the
    // dialog reopens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [globalTeamSupport, isOpen, t]);

  // ── state ──────────────────────────────────────────────────────────────
  const [currentStep, setCurrentStep]     = useState(0);
  const [teamSupport, setTeamSupport]     = useState<number | null>(null);
  const [coverFees,   setCoverFees]       = useState(false);
  const paymentMethod = "CARD";
  // Manual card inputs for the bank 3D rails (PayFor / Albaraka)
  const [cardDetails, setCardDetails]     = useState<PayForCardState>({ cardNumber: "", expiryDate: "", cvv: "", cardholderName: "" });
  const [cardFocus, setCardFocus]         = useState("");
  // Stripe Elements — ready state tracked here, confirmation done via ref
  const [stripeReady, setStripeReady]     = useState(false);
  const stripeFormRef = useRef<StripePaymentHandle | null>(null);
  const onStripeReadyChange = useCallback((ready: boolean) => setStripeReady(ready), []);
  // Set when PayFor fails and we get a fallback clientSecret from the server
  const [fallbackClientSecret, setFallbackClientSecret] = useState<string | null>(null);
  // Which rail this cart checkout runs on. The cart is always ONE_TIME, so PayFor takes
  // TRY while the admin leaves it on, and everything else goes to the selected main
  // gateway. A fallback secret means a 3D attempt already failed and the donor holds a
  // Stripe intent, so Stripe wins from then on.
  const gateway = resolveGateway({
    mainGateway,
    payforEnabled,
    currency: getCurrency(),
    donationType: "ONE_TIME",
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
  const [fallbackDonationId, setFallbackDonationId] = useState<string | null>(null);
  // Guard against duplicate fallback execution
  const hasFallenBackRef = useRef(false);
  const [loading, setLoading]             = useState(false);
  const [redirecting, setRedirecting]     = useState(false);
  const [payforSwitching, setPayforSwitching] = useState(false);
  const [mounted, setMounted]             = useState(false);
  const [phoneValue, setPhoneValue]       = useState("");
  const ipCountry = useIpCountry();
  const [currentUser, setCurrentUser]     = useState<{ phone: string | null } | null>(null);
  const [guestFirstName, setGuestFirstName] = useState("");
  const [guestLastName, setGuestLastName]   = useState("");
  const [guestEmail, setGuestEmail]         = useState("");
  const [savedCards, setSavedCards] = useState<{ id: string; last4: string; cardType: string; expiryDate: string; cardholderName?: string | null; isDefault: boolean; nickname?: string | null }[]>([]);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);

  const payforPopupRef = useRef<Window | null>(null);
  const payforPollRef  = useRef<ReturnType<typeof setInterval> | null>(null);

  const { data: session, status: sessionStatus } = useSession();
  const [hasSkippedAuth, setHasSkippedAuth] = useState(false);
  const useGuestCheckout = (guestMode || hasSkippedAuth) && !session?.user?.id;
  const { clearItems } = useCart();
  const router = useRouter();
  const getReferralCode = useReferralCode();
  const tracking = useTracking();
  const checkoutTrackedRef = useRef(false);
  const confetti = useConfettiStore();

  const convertToUSD = useConvetToUSD;
  const payCurrencyCode = useCallback((): string => {
    const c = getCurrency();
    return !c || c === "DEFAULT" ? "USD" : c;
  }, []);

  // ── derived ────────────────────────────────────────────────────────────
  const fees        = (amount + (teamSupport ?? 0)) * 0.03;
  const totalAmount = amount + (teamSupport ?? 0) + (coverFees ? fees : 0);

  // Minimum Stripe charge = 1 USD converted to the selected currency, rounded up.
  const stripeMinAmount = (() => {
    const cur = payCurrencyCode();
    if (cur === "USD") return 1;
    try {
      const cached = typeof window !== "undefined" ? localStorage.getItem("cachedExchangeRates") : null;
      if (!cached) return 1;
      const { rates } = JSON.parse(cached) as { rates: Record<string, number> };
      const rate = rates?.[cur];
      return rate ? Math.ceil(rate+1) : 1;
    } catch {
      return 1;
    }
  })();
  const isPhoneValid = () => session?.user?.id ? true : phoneValue.trim().replace(/\s/g, "").length >= 10;
  const isCardValid  = () =>
    selectedCardId
      ? cardDetails.cvv.length >= 3
      : cardDetails.cardNumber.length >= 13 &&
        cardDetails.expiryDate.length === 5 &&
        cardDetails.cvv.length >= 3 &&
        cardDetails.cardholderName.trim().length > 0;

  // ── effects ────────────────────────────────────────────────────────────
  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!isOpen || !tracking || cartItems.length === 0 || checkoutTrackedRef.current) return;
    checkoutTrackedRef.current = true;
    const ids = cartItems.map((i) => i.campaign?.id).filter(Boolean) as string[];
    tracking.trackInitiateCheckout({ value: totalAmount, currency: getCurrency(), numItems: cartItems.length, contentIds: ids.length ? ids : undefined });
  }, [isOpen, tracking, cartItems, totalAmount]);

  useEffect(() => {
    if (!isOpen) {
      checkoutTrackedRef.current = false;
    } else {
      // Reset fallback guard and state when dialog re-opens
      hasFallenBackRef.current = false;
      setFallbackClientSecret(null);
      setFallbackDonationId(null);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !session?.user?.id) return;
    axios.get(`/api/users/${session.user.id}`)
      .then((res) => {
        const u = res.data?.user;
        if (u) { setCurrentUser({ phone: u.phone ?? null }); if (u.phone) setPhoneValue(u.phone); }
      })
      .catch(() => setCurrentUser(null));
  }, [isOpen, session?.user?.id]);

  // Clean up PayFor poll/popup on unmount
  useEffect(() => () => {
    if (payforPollRef.current) clearInterval(payforPollRef.current);
    if (payforPopupRef.current && !payforPopupRef.current.closed) payforPopupRef.current.close();
  }, []);

  // Reset guest fields and saved card state on close
  useEffect(() => {
    if (!isOpen) {
      setGuestFirstName(""); setGuestLastName(""); setGuestEmail("");
      setSelectedCardId(null); setSavedCards([]);
      setHasSkippedAuth(false);
    } else {
      // Auto-skip the (now-removed) sign-in step: guests proceed straight to
      // the payment step's inline form. Authenticated users are unaffected.
      setHasSkippedAuth(true);
    }
  }, [isOpen]);

  // Fetch global team-support defaults when the dialog opens. Cache is
  // shared module-wide, so subsequent opens reuse the value.
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

  // Load saved cards when dialog opens (authenticated users only)
  useEffect(() => {
    if (!isOpen || !session?.user?.id) return;
    axios.get("/api/credit-cards").then((res) => {
      const cards = res.data?.cards ?? [];
      setSavedCards(cards);
      const def = cards.find((c: { isDefault: boolean }) => c.isDefault);
      if (def) {
        setSelectedCardId((def as { id: string }).id);
        setCardDetails({ cardNumber: `**** **** **** ${(def as { last4: string }).last4}`, expiryDate: (def as { expiryDate: string }).expiryDate, cvv: "", cardholderName: (def as { cardholderName?: string | null }).cardholderName ?? "" });
      }
    }).catch(() => {});
  }, [isOpen, session?.user?.id]);

  useEffect(() => {
    if (!isOpen || typeof window === "undefined") return;

    try {
      const stored = sessionStorage.getItem(CART_CHECKOUT_RESUME_KEY);
      if (!stored) return;

      const resume = JSON.parse(stored) as {
        createdAt?: number;
        teamSupport?: number;
        coverFees?: boolean;
      };

      if (!resume.createdAt || Date.now() - resume.createdAt > CHECKOUT_RESUME_TTL_MS) {
        sessionStorage.removeItem(CART_CHECKOUT_RESUME_KEY);
        return;
      }

      if (typeof resume.teamSupport === "number") setTeamSupport(resume.teamSupport);
      if (typeof resume.coverFees === "boolean") setCoverFees(resume.coverFees);

      const paymentStep = STEPS.findIndex((step) => step.title === t("paymentInfo"));
      const signInStep = STEPS.findIndex((step) => step.title === tAuth("checkoutTitle"));
      const confirmationStep = STEPS.findIndex((step) => step.title === t("confirmation"));

      if (sessionStatus === "authenticated" && session?.user?.id) {
        if (paymentStep >= 0) setCurrentStep(paymentStep);
        sessionStorage.removeItem(CART_CHECKOUT_RESUME_KEY);
      } else if (signInStep >= 0) {
        setCurrentStep(signInStep);
      } else if (confirmationStep >= 0) {
        setCurrentStep(confirmationStep);
      }
    } catch {
      sessionStorage.removeItem(CART_CHECKOUT_RESUME_KEY);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, sessionStatus, session?.user?.id]);

  useEffect(() => {
    if (!isOpen || !session?.user?.id) return;
    if (STEPS[currentStep]?.title === tAuth("checkoutTitle")) {
      resumePaymentInfoStep();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, currentStep, session?.user?.id]);

  const getPaymentInfoStepIndex = () =>
    STEPS.findIndex((step) => step.title === t("paymentInfo"));

  const getSignInStepIndex = () =>
    STEPS.findIndex((step) => step.title === tAuth("checkoutTitle"));

  const persistCheckoutResume = (targetStep?: number) => {
    if (typeof window === "undefined") return;
    try {
      sessionStorage.setItem(
        CART_CHECKOUT_RESUME_KEY,
        JSON.stringify({
          createdAt: Date.now(),
          teamSupport,
          coverFees,
          currentStep: targetStep ?? getPaymentInfoStepIndex(),
        })
      );
    } catch {
      /* Resume state is a convenience; checkout can still continue in-session. */
    }
  };

  const resumePaymentInfoStep = () => {
    const paymentStep = getPaymentInfoStepIndex();
    if (paymentStep >= 0) setCurrentStep(paymentStep);
    if (typeof window !== "undefined") {
      sessionStorage.removeItem(CART_CHECKOUT_RESUME_KEY);
    }
  };

  const requestCheckoutSignIn = (targetStep: number) => {
    persistCheckoutResume(targetStep);
    onAuthCheckpoint?.();
    const signInStep = getSignInStepIndex();
    if (signInStep >= 0) setCurrentStep(signInStep);
  };

  // ── navigation ─────────────────────────────────────────────────────────
  const handleNext = () => {
    if (currentStep < STEPS.length - 1) {
      const nextStep = currentStep + 1;
      const nextTitle = STEPS[nextStep]?.title;

      if (nextTitle === tAuth("checkoutTitle")) {
        if (sessionStatus === "authenticated" || hasSkippedAuth) {
          resumePaymentInfoStep();
          return;
        }
        requestCheckoutSignIn(getPaymentInfoStepIndex());
        return;
      }

      if (nextTitle === t("paymentInfo") && sessionStatus !== "authenticated" && !hasSkippedAuth) {
        requestCheckoutSignIn(nextStep);
        return;
      }

      setCurrentStep(nextStep);
    } else {
      handleSubmit();
    }
  };
  const handleBack = () => { if (currentStep > 0) setCurrentStep(currentStep - 1); };

  // ── step indicator ─────────────────────────────────────────────────────
  const renderStepIndicator = () => (
    <div className="flex items-center gap-1.5 mb-3 px-5 pt-4 sm:mb-4 sm:px-6">
      {STEPS.map((_, i) => (
        <div key={i} className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${i < currentStep ? "bg-burgundy" : i === currentStep ? "bg-gold" : "bg-gray-200"}`} />
      ))}
    </div>
  );

  // ── submit ─────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    let isRedirecting = false;
    try {
      if (!session?.user?.id && !useGuestCheckout) {
        requestCheckoutSignIn(getPaymentInfoStepIndex());
        return;
      }
      setLoading(true);

      // Save phone if new
      if (session?.user?.id && !currentUser?.phone && phoneValue.trim()) {
        await axios.put(`/api/users/${session.user.id}`, { phone: phoneValue.trim() });
      }

      // Resolve guest geo
      let geoCountryCode: string | undefined;
      let geoCity: string | undefined;
      let geoRegion: string | undefined;
      if (useGuestCheckout) {
        try {
          const cached = typeof window !== "undefined" ? localStorage.getItem("ipapi_cache") : null;
          const cacheData = cached ? JSON.parse(cached) as { data?: { country_code?: string; city?: string; region?: string }; ts?: number } : null;
          const isValid = cacheData && cacheData.ts && Date.now() - cacheData.ts < 86400000;
          if (isValid && cacheData.data) {
            geoCountryCode = cacheData.data.country_code?.toLowerCase();
            geoCity = cacheData.data.city;
            geoRegion = cacheData.data.region;
          } else {
            // Server-backed geo (Vercel/CF headers → ipapi fallback). The
            // direct ipapi.co browser call was getting blocked by antivirus
            // and CORS in production.
            const geoRes = await fetch("/api/geo/client", { credentials: "omit" });
            const geoJson = geoRes.ok
              ? (await geoRes.json().catch(() => null)) as { ok?: boolean; country_code?: string; city?: string; region?: string } | null
              : null;
            const geo = geoJson && geoJson.ok
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
              localStorage.setItem("ipapi_cache", JSON.stringify({ data: geo, ts: Date.now() }));
            }
          }
        } catch { /* geo is optional */ }
      }

      // Build items with USD amounts
      const items = await Promise.all(
        cartItems.map(async (item) => ({
          campaignId: item.campaign.id,
          amount: item.amount,
          amountUSD: item.amountUSD != null && item.amountUSD > 0
            ? item.amountUSD
            : convertToUSD(item.amount, payCurrencyCode()),
          ...(item.shareCount != null && item.shareCount > 0 ? { shareCount: item.shareCount } : {}),
        }))
      );

      const basePayload: Record<string, unknown> = {
        items,
        currency: getCurrency(),
        teamSupport: teamSupport ?? 0,
        coverFees,
        type: "ONE_TIME",
        paymentMethod,
        locale,
        ...(useGuestCheckout && {
          guest: {
            firstName:   guestFirstName.trim() || undefined,
            lastName:    guestLastName.trim()  || undefined,
            email:       guestEmail.trim()     || undefined,
            phone:       phoneValue.trim()     || undefined,
            countryCode: geoCountryCode,
            city:        geoCity,
            region:      geoRegion,
          },
        }),
      };
      const refCode = getReferralCode();
      if (refCode) basePayload.referralCode = refCode;

      // ── Stripe Elements direct charge (no 3D) ─────────────────────────
      // stripeFormRef.current.confirmPayment() calls stripe.confirmCardPayment()
      // with CardNumberElement inside the Elements context — card data goes
      // browser → Stripe directly, never touches our server.
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
          const res = await axios.post("/api/cart/payment", basePayload);
          if (!res.data?.success) { onClose(); return; }
          targetDonationId = res.data.donation.id as string;

          const intentRes = await axios.post("/api/stripe/charge", { donationId: targetDonationId, locale });
          if (intentRes.data.error) {
            toast.error(intentRes.data.error ?? t("donationFailed"));
            setLoading(false);
            return;
          }
          clientSecret = intentRes.data.clientSecret as string;
        }

        isRedirecting = true;
        setRedirecting(true);

        const { error: confirmError } = await stripeFormRef.current.confirmPayment(clientSecret);
        if (confirmError) {
          // Mark donation FAILED for audit trail, then send the user to the explanatory
          // failure page (which carries the bank-transfer fallback so we don't lose the donation).
          axios
            .patch(`/api/donations/${targetDonationId}/fail`, {
              reason: confirmError.message ?? "stripe_confirm_failed",
            })
            .catch(() => {});
          router.push(
            appendCurrencyQuery(
              `/donation-failed?donationId=${encodeURIComponent(targetDonationId)}`,
              getCurrencyCodeForLinks()
            )
          );
          return;
        }

        clearItems(); confetti.onOpen();
        router.push(
          appendCurrencyQuery(`/success/${targetDonationId}`, getCurrencyCodeForLinks())
        );
        return;
      }

      // ── Bank 3D Secure (PayFor or Albaraka) ────────────────────────────
      // Both rails work the same way: ask the server for a signed hidden-input set,
      // POST it to the bank as an HTML form, then poll the donation until the bank's
      // callback settles it. Only the endpoint and how the card reaches the bank differ.
      if (paymentMethod === "CARD" && useBank3D) {
        const res = await axios.post("/api/cart/payment", basePayload);
        if (!res.data?.success) { onClose(); return; }
        const donationId = res.data.donation.id as string;
        const newPan = cardDetails.cardNumber.replace(/\s/g, "");

        // Save new card fire-and-forget
        if (useOwnCardForm && !selectedCardId && session?.user?.id && newPan.length >= 13) {
          axios.post("/api/credit-cards", {
            cardNumber:     newPan,
            expiryDate:     cardDetails.expiryDate,
            cvc:            cardDetails.cvv,
            cardholderName: cardDetails.cardholderName || undefined,
          }).catch(() => {});
        }

        // Albaraka signs the card fields into the request MAC, so the card has to go
        // to our server to be signed. PayFor leaves them out of its hash, so the
        // browser appends them below and the PAN never reaches us.
        const init = await axios.post(
          useAlbaraka ? "/api/albaraka/3d/initiate" : "/api/payfor/3dpay/initiate",
          {
            donationId,
            locale,
            savedCardId: selectedCardId ?? undefined,
            ...(useAlbaraka && useOwnCardForm
              ? {
                  card: {
                    number: selectedCardId ? undefined : newPan,
                    expiry: selectedCardId ? undefined : cardDetails.expiryDate,
                    cvv:    cardDetails.cvv,
                    holder: selectedCardId ? undefined : cardDetails.cardholderName,
                  },
                }
              : {}),
          }
        );
        const { actionUrl, fields } = init.data as { actionUrl: string; fields: Record<string, string> };

        const form = document.createElement("form");
        form.method = "POST";
        form.action = actionUrl;
        Object.entries(fields).forEach(([name, value]) => {
          const input = document.createElement("input");
          input.type = "hidden"; input.name = name; input.value = String(value ?? "");
          form.appendChild(input);
        });

        // Card fields the browser still has to add — PayFor only. Albaraka's fields
        // are already signed into `fields` server-side (or collected on the bank's
        // own page), so appending anything here would break its MAC.
        const browserCardFields: Record<string, string> = {};
        if (use3D) {
          if (selectedCardId) {
            // Pan/Expiry/CardHolderName already in `fields`; add CVC only.
            browserCardFields.Cvv2 = cardDetails.cvv;
          } else {
            const [mm, yy] = cardDetails.expiryDate.split("/");
            browserCardFields.Pan = newPan;
            browserCardFields.Expiry = `${mm ?? ""}${yy ?? ""}`; // MMYY
            browserCardFields.Cvv2 = cardDetails.cvv;
            browserCardFields.CardHolderName = cardDetails.cardholderName;
          }
        }
        Object.entries(browserCardFields).forEach(([name, value]) => {
          const input = document.createElement("input");
          input.type = "hidden"; input.name = name; input.value = value;
          form.appendChild(input);
        });

        // Skip the popup attempt entirely on mobile / in-app browsers (FB, IG, TikTok,
        // etc.). In those WebViews window.open often returns a truthy-but-invisible
        // Window object — the form would silently submit to a hidden frame and the
        // user would see nothing happen. Going straight to a full-page redirect
        // (target=_self) lets the bank's 3DS page own the screen and redirect back
        // to the gateway's callback → /success on completion.
        const skipPopup = shouldSkipPopup();
        const popupName = useAlbaraka ? "albaraka3d" : "payfor3d";
        const pw = 600, ph = 700;
        const popup = skipPopup
          ? null
          : window.open(
              "about:blank", popupName,
              `width=${pw},height=${ph},left=${Math.round((screen.width  - pw) / 2)},top=${Math.round((screen.height - ph) / 2)},scrollbars=yes,resizable=yes`
            );
        form.target = popup ? popupName : "_self";
        document.body.appendChild(form);
        form.submit();
        document.body.removeChild(form);

        if (!popup) return;

        payforPopupRef.current = popup;
        isRedirecting = true;
        setRedirecting(true);

        const handlePayforFailure = () => {
          // Guard: only run once even if poll fires multiple times
          if (hasFallenBackRef.current) return;
          hasFallenBackRef.current = true;

          if (payforPollRef.current) { clearInterval(payforPollRef.current); payforPollRef.current = null; }
          if (payforPopupRef.current && !payforPopupRef.current.closed) payforPopupRef.current.close();
          router.push(
            appendCurrencyQuery(
              `/donation-failed?donationId=${encodeURIComponent(donationId)}`,
              getCurrencyCodeForLinks()
            )
          );
        };

        let polls = 0;
        // 60 polls × 2s = 120s. Mobile users routinely need >50s for the SMS-OTP step
        // of 3D Secure; the previous 25-poll ceiling was firing the failure redirect
        // while the bank popup was still authenticating.
        const FAILURE_AFTER = 60;
        payforPollRef.current = setInterval(async () => {
          polls++;
          try {
            const check = await fetch(`/api/donations/${donationId}`);
            if (!check.ok) return;
            const data = await check.json();

            if (data.status === "PAID" && data.paidAt) {
              clearInterval(payforPollRef.current!); payforPollRef.current = null;
              if (payforPopupRef.current && !payforPopupRef.current.closed) payforPopupRef.current.close();
              clearItems(); confetti.onOpen();
              router.push(
                appendCurrencyQuery(`/success/${donationId}`, getCurrencyCodeForLinks())
              );
              return;
            }
            if (data.status === "FAILED" || payforPopupRef.current?.closed || polls >= FAILURE_AFTER) {
              handlePayforFailure();
            }
          } catch { /* ignore transient errors */ }
        }, 2000);

        return;
      }

      // ── PayPal or other ────────────────────────────────────────────────
      const res = await axios.post("/api/cart/payment", basePayload);
      if (res.data?.success) {
        isRedirecting = true; setRedirecting(true);
        clearItems(); confetti.onOpen();
        router.push(
          appendCurrencyQuery(`/success/${res.data.donation.id}`, getCurrencyCodeForLinks())
        );
      } else {
        onClose();
      }
    } catch (error) {
      console.error("Cart payment failed:", error);
      // Send to the explanatory failure page rather than relying on a transient toast.
      isRedirecting = true;
      setRedirecting(true);
      router.push(appendCurrencyQuery("/donation-failed", getCurrencyCodeForLinks()));
    } finally {
      if (!isRedirecting) setLoading(false);
    }
  };

  // ── step content ───────────────────────────────────────────────────────
  const getStepContent = () => {
    if (!mounted) return null;
    const step = STEPS[currentStep];

    // Team Support
    if (step.title === t("teamSupport")) return (
      <div className="space-y-5">
        <div className="text-center space-y-1.5">
          <h3 className="text-lg sm:text-xl font-semibold text-gray-900">{t("wantToSupportTeam")}</h3>
          <p className="text-gray-600 text-sm">{t("teamSupportHelp")}</p>
        </div>
        <div className="flex flex-col items-center gap-3">
          <Input type="number" inputMode="numeric" min={0} step={1} value={teamSupport ?? ""} onChange={(e) => { const val = e.target.value.replace(/[^0-9]/g, ""); setTeamSupport(val ? parseInt(val, 10) : null); }} onKeyDown={(e) => { if (e.key === "." || e.key === ",") e.preventDefault(); }} placeholder={t("otherAmount")} className="text-center text-lg font-medium" />
          <div className="grid grid-cols-3 gap-3 w-full">
            {teamSupportOptions.map((o) => (
              <Button key={o.value} variant="outline" onClick={() => setTeamSupport(o.value)}
                className={`transition-all duration-200 ${teamSupport === o.value ? "border-burgundy bg-burgundy/5 text-burgundy shadow-sm" : "hover:border-gray-400"}`}>
                <span className="font-medium" dir={o.label === t("noThanks") ? undefined : "ltr"}>{o.label === t("noThanks") ? o.label : `${o.value} ${getCurrency()}`}</span>
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
            <p className="text-xs text-gray-500 mt-0.5">{t("feesWillBeAdded", { amount: `${fees.toFixed(2)} ${getCurrency()}` })}</p>
          </div>
        </button> */}

        {/* Live total preview so the user always sees what they'll pay */}
        <div dir={dir} className="flex items-center justify-between rounded-xl bg-gray-50 px-3 py-2.5 text-sm">
          <span className="text-gray-600">{t("total")}</span>
          <span className="font-bold text-burgundy" dir="ltr">
            {totalAmount.toFixed(2)} {getCurrency()}
          </span>
        </div>

        <div dir={dir} className="flex justify-between gap-4">
          <Button variant="outline" onClick={handleBack} className="flex-1 inline-flex items-center justify-center gap-2">{backLabel}</Button>
          <Button onClick={handleNext} disabled={teamSupport === null} className="flex-1 shape-button bg-burgundy hover:bg-burgundyDark text-white shadow-soft inline-flex items-center justify-center gap-2">{nextLabel}</Button>
        </div>
      </div>
    );

    // Payment Fees
    if (step.title === t("paymentFees")) return (
      <div className="space-y-6">
        <div className="text-center space-y-2">
          <h3 className="text-lg sm:text-xl font-semibold text-gray-900">{t("coverPaymentFees")}</h3>
          <p className="text-gray-600 text-sm">{t("paymentFeesInfo")}</p>
        </div>
        <div className="bg-gradient-to-br from-gray-50 to-gray-100 p-5 rounded-xl space-y-3 border border-gray-200">
          <div className={`flex justify-between text-sm ${locale === "ar" ? "flex-row-reverse" : ""}`}>
            <span className="text-gray-600">{t("amount")}</span>
            <span className="font-semibold" dir="ltr">{amount} {getCurrency()}</span>
          </div>
          {teamSupport != null && teamSupport > 0 && (
            <div className={`flex justify-between text-sm ${locale === "ar" ? "flex-row-reverse" : ""}`}>
              <span className="text-gray-600">{t("teamSupport")}</span>
              <span className="font-semibold" dir="ltr">{teamSupport} {getCurrency()}</span>
            </div>
          )}
          <div className={`flex justify-between text-sm ${locale === "ar" ? "flex-row-reverse" : ""}`}>
            <span className="text-gray-600">{t("paymentFeesPercent")}</span>
            <span className="font-semibold text-burgundy" dir="ltr">{fees.toFixed(2)} {getCurrency()}</span>
          </div>
        </div>
        <button type="button" onClick={() => setCoverFees(!coverFees)}
          className={`w-full flex items-start gap-3 p-4 rounded-lg border transition-all duration-200 ${coverFees ? "border-burgundy bg-burgundy/5 shadow-sm" : "border-gray-200 hover:border-gray-400"}`}>
          <div className={`w-6 h-6 flex-shrink-0 flex items-center justify-center rounded-full border-2 mt-0.5 transition-all duration-200 ${coverFees ? "bg-burgundy border-burgundy scale-110" : "border-gray-300"}`}>
            {coverFees && <Check className="w-4 h-4 text-white" />}
          </div>
          <div className="flex-1 text-start">
            <p className="font-semibold text-gray-900">{t("yesCoverFees")}</p>
            <p className="text-sm text-gray-500 mt-0.5">{t("feesWillBeAdded", { amount: `${fees.toFixed(2)} ${getCurrency()}` })}</p>
          </div>
        </button>
        <div dir={dir} className="flex justify-between gap-4">
          <Button variant="outline" onClick={handleBack} className="flex-1 inline-flex items-center justify-center gap-2">{backLabel}</Button>
          <Button onClick={handleNext} className="flex-1 shape-button bg-burgundy hover:bg-burgundyDark text-white shadow-soft inline-flex items-center justify-center gap-2">{nextLabel}</Button>
        </div>
      </div>
    );

    // Confirmation
    if (step.title === t("confirmation")) return (
      <div className="space-y-6 w-full overflow-hidden">
        <div className="text-center space-y-2 mb-6">
          <h3 className="text-lg sm:text-xl font-semibold text-gray-900">{t("confirmation")}</h3>
          <p className="text-gray-600 text-sm">{t("confirmationDesc")}</p>
        </div>
        <div className="bg-gradient-to-br from-gray-50 to-gray-100 p-4 rounded-xl space-y-4 border border-gray-200 w-full overflow-hidden">
          {cartItems.map((item) => {
            const title = item.campaign.translations?.find((tr) => tr.locale === locale)?.title ?? item.campaign.title;
            return (
              <div key={item.id} className={`flex items-center gap-2 w-full min-w-0 ${locale === "ar" ? "flex-row-reverse" : ""}`}>
                <div className={`flex items-center gap-2 flex-1 min-w-0 overflow-hidden ${locale === "ar" ? "flex-row-reverse" : ""}`}>
                  <Image src={item.campaign.images[0]} alt={title} width={80} height={80} className="w-14 h-14 sm:w-20 sm:h-20 rounded-lg object-cover flex-shrink-0 shadow-sm" />
                  <div className={`min-w-0 max-w-48 ${locale === "ar" ? "text-right" : "text-left"}`}>
                    <span className="text-gray-900 font-medium text-sm block line-clamp-3" title={title}>{title}</span>
                    {item.shareCount != null && item.shareCount > 0 && (() => {
                      const unit = resolveShareUnit(
                        item.campaign?.shareLabels ?? null,
                        locale,
                        item.shareCount
                      );
                      return (
                        <span className="text-xs text-violet-700 block mt-0.5">
                          {unit
                            ? `${item.shareCount} ${unit}`
                            : t("sharesLine", { count: item.shareCount })}
                        </span>
                      );
                    })()}
                  </div>
                </div>
                <span className="font-semibold text-gray-900 text-sm flex-shrink-0 whitespace-nowrap" dir="ltr">{item.amount} {getCurrency()}</span>
              </div>
            );
          })}
          {teamSupport != null && teamSupport > 0 && (
            <div className={`flex items-center gap-2 pt-2 w-full min-w-0 ${locale === "ar" ? "flex-row-reverse" : ""}`}>
              <span className="text-gray-600 text-sm flex-1 min-w-0 truncate">{t("teamSupport")}</span>
              <span className="font-semibold text-gray-900 text-sm flex-shrink-0 whitespace-nowrap" dir="ltr">{teamSupport} {getCurrency()}</span>
            </div>
          )}
          {coverFees && (
            <div className={`flex items-center gap-2 w-full min-w-0 ${locale === "ar" ? "flex-row-reverse" : ""}`}>
              <span className="text-gray-600 text-sm flex-1 min-w-0 truncate">{t("paymentFeesLabel")}</span>
              <span className="font-semibold text-gray-900 text-sm flex-shrink-0 whitespace-nowrap" dir="ltr">{fees.toFixed(2)} {getCurrency()}</span>
            </div>
          )}
          <div className="pt-3 border-t border-gray-300">
            <div className={`flex items-center gap-2 w-full min-w-0 ${locale === "ar" ? "flex-row-reverse" : ""}`}>
              <span className="font-semibold text-gray-900 text-base flex-1 min-w-0">{t("total")}</span>
              <span className="font-bold text-burgundy text-lg flex-shrink-0 whitespace-nowrap" dir="ltr">{totalAmount.toFixed(2)} {getCurrency()}</span>
            </div>
          </div>
        </div>
        <div dir={dir} className="flex gap-4 w-full">
          <Button variant="outline" onClick={handleBack} className="flex-1 inline-flex items-center justify-center gap-2">{backLabel}</Button>
          <Button onClick={handleNext} className="flex-1 shape-button bg-burgundy hover:bg-burgundyDark text-white shadow-soft inline-flex items-center justify-center gap-2">{nextLabel}</Button>
        </div>
        <p className="text-xs text-center text-gray-500 leading-relaxed px-2 break-words">
          {t("byContinuing")}{" "}
          <a href="#" className="text-burgundy hover:underline font-medium">{t("termsOfUseLink")}</a>{" "}
          {t("and")}{" "}
          <a href="#" className="text-burgundy hover:underline font-medium">{t("privacyPolicyLink")}</a>
        </p>
      </div>
    );

    if (step.title === tAuth("checkoutTitle")) return (
      <div className="space-y-5">
        <div className="text-center space-y-2">
          <h3 className="text-lg sm:text-xl font-semibold text-gray-900">{tAuth("checkoutTitle")}</h3>
          <p className="text-gray-600 text-sm">{tAuth("checkoutSubtitle")}</p>
        </div>
        <SignInPanel
          isOpen={isOpen && step.title === tAuth("checkoutTitle")}
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
          <Button variant="outline" onClick={handleBack} className="flex-1 inline-flex items-center justify-center gap-2">{backLabel}</Button>
        </div>
      </div>
    );

    // Payment Info
    if (step.title === t("paymentInfo")) return (
      <div className="space-y-6 overflow-visible">
        {/* {paymentMethod === "CARD" ? (
          <div className="text-center space-y-1">
            <p className="text-gray-900 font-semibold">{t("bankCard")}</p>
            <p className="text-sm text-gray-500">{t("secure3DCardPrompt")}</p>
          </div>
        ) : (
          <div className="text-center">
            <p className="text-gray-600">{t("paypalRedirect")}</p>
          </div>
        )} */}

        {/* ── Saved cards picker — shown when user has any saved card ──
            Hidden when Albaraka's hosted page owns the card step: the donor
            enters the card at the bank, so a stored PAN has nowhere to go. */}
        {savedCards.length > 0 && !(useAlbaraka && albarakaUseOOS) && (
          <div className="space-y-3">
            <p className="text-sm font-semibold text-gray-700">{t("savedCards")}</p>
            <div className="space-y-2">
              {savedCards.map((card) => {
                const selected = selectedCardId === card.id;
                const brandBadge: Record<string, string> = { visa: "VISA", mastercard: "MC", amex: "AMEX", troy: "TROY" };
                return (
                  <button key={card.id} type="button"
                    onClick={() => {
                      if (selected) { setSelectedCardId(null); setCardDetails({ cardNumber: "", expiryDate: "", cvv: "", cardholderName: "" }); }
                      else { setSelectedCardId(card.id); setCardDetails({ cardNumber: `**** **** **** ${card.last4}`, expiryDate: card.expiryDate, cvv: "", cardholderName: card.cardholderName ?? "" }); }
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-sm transition-all duration-200 ${selected ? "border-burgundy bg-burgundy/5 shadow-sm" : "border-gray-200 hover:border-gray-300 bg-white hover:shadow-sm"}`}
                  >
                    <span className={`w-10 h-7 rounded-md flex items-center justify-center text-[10px] font-bold text-white shrink-0 ${card.cardType === "visa" ? "bg-blue-600" : card.cardType === "mastercard" ? "bg-orange-500" : card.cardType === "amex" ? "bg-green-600" : card.cardType === "troy" ? "bg-red-600" : "bg-gray-500"}`}>{brandBadge[card.cardType] ?? "💳"}</span>
                    <div className="flex-1 text-start min-w-0">
                      <p className="font-semibold text-gray-800 text-sm truncate">{card.nickname || `${card.cardType.charAt(0).toUpperCase() + card.cardType.slice(1)} •••• ${card.last4}`}</p>
                      <p className="text-xs text-gray-400">{t("expires")} {card.expiryDate}</p>
                    </div>
                    {selected
                      ? <span className="w-5 h-5 rounded-full bg-burgundy flex items-center justify-center shrink-0"><svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 12 12"><path d="M2 6l3 3 5-5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg></span>
                      : <span className="w-5 h-5 rounded-full border-2 border-gray-300 shrink-0" />
                    }
                  </button>
                );
              })}
              <button type="button"
                onClick={() => { setSelectedCardId(null); setCardDetails({ cardNumber: "", expiryDate: "", cvv: "", cardholderName: "" }); }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-sm transition-all duration-200 ${!selectedCardId ? "border-burgundy bg-burgundy/5 shadow-sm" : "border-dashed border-gray-300 hover:border-gray-400 bg-white hover:shadow-sm"}`}
              >
                <span className="w-10 h-7 rounded-md border-2 border-dashed border-gray-300 flex items-center justify-center shrink-0">
                  <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/></svg>
                </span>
                <span className="font-medium text-gray-700">{t("useNewCard")}</span>
                {!selectedCardId && <span className="w-5 h-5 rounded-full bg-burgundy flex items-center justify-center shrink-0"><svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 12 12"><path d="M2 6l3 3 5-5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg></span>}
              </button>
            </div>
          </div>
        )}

        {/* CVC-only when a saved card is selected */}
        {selectedCardId && (
          <div className="space-y-2" dir="ltr">
            <label className="block text-sm font-medium text-gray-700 text-start">{t("cvc")}</label>
            <input
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={cardDetails.cvv}
              onChange={(e) => setCardDetails((d) => ({ ...d, cvv: e.target.value.replace(/\D/g, "") }))}
              placeholder="•••"
              className="w-28 rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-burgundy focus:ring-2 focus:ring-burgundy/10 tracking-widest"
            />
          </div>
        )}

        {/* Full card header when no saved card selected */}
        {!selectedCardId && paymentMethod === "CARD" && (
          <div className="text-center space-y-1">
            <p className="text-gray-900 font-semibold">{t("bankCard")}</p>
            <p className="text-sm text-gray-500">{t("secure3DCardPrompt")}</p>
          </div>
        )}

        {/* Stripe Elements — only when no saved card + Stripe is charging */}
        {paymentMethod === "CARD" && useStripeElements && !selectedCardId && (
          <Elements stripe={getStripePromise()}>
            <StripePaymentStep ref={stripeFormRef} onReadyChange={onStripeReadyChange} />
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

        {/* Minimum Stripe amount warning */}
        <AnimatePresence>
          {useStripeElements && totalAmount < stripeMinAmount && (
            <motion.p
              key="stripe-min"
              className="text-[13px] text-amber-600 font-medium"
              initial={{ opacity: 0, y: -6, height: 0 }}
              animate={{ opacity: 1, y: 0, height: "auto" }}
              exit={{ opacity: 0, y: -6, height: 0 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
            >
              {t("stripeMinDonation", { amount: stripeMinAmount, currency: getCurrency() })}
            </motion.p>
          )}
        </AnimatePresence>

        {/* Guest fields */}
        {useGuestCheckout && (
          <div className="space-y-3 pt-2 border-t border-border" dir={dir}>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="block text-sm font-medium text-gray-700">{t("firstName")}</label>
                <input type="text" value={guestFirstName} onChange={(e) => setGuestFirstName(e.target.value)}
                  placeholder={t("firstName")}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent" />
              </div>
              <div className="space-y-1">
                <label className="block text-sm font-medium text-gray-700">{t("lastName")}</label>
                <input type="text" value={guestLastName} onChange={(e) => setGuestLastName(e.target.value)}
                  placeholder={t("lastName")}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent" />
              </div>
            </div>
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">{t("email")}</label>
              <input type="email" value={guestEmail} onChange={(e) => setGuestEmail(e.target.value)}
                placeholder={t("email")} dir="ltr"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent" />
            </div>
          </div>
        )}

        {/* Phone — guests only */}
        {!session?.user?.id && (
          <div className="space-y-2 overflow-visible pt-2 border-t border-border" dir={locale === "ar" ? "rtl" : "ltr"}>
            <label className={`block text-sm font-medium text-gray-700 ${locale === "ar" ? "text-right" : "text-left"}`}>{t("contactPhone")}</label>
            <div className="overflow-visible phone-input-wrapper">
              <PhoneInput defaultCountry={ipCountry} value={phoneValue}
                onChange={(phone) => setPhoneValue(phone)}
                className="w-full overflow-visible"
                inputClassName="w-full min-w-0 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent" required />
            </div>
          </div>
        )}

        <div className="flex justify-between gap-4">
          <Button variant="outline" onClick={handleBack} className="flex-1 inline-flex items-center justify-center gap-2">{backLabel}</Button>
          <Button onClick={handleSubmit}
            disabled={
              loading ||
              !isPhoneValid() ||
              (useGuestCheckout && (
                !guestFirstName.trim() ||
                !guestLastName.trim() ||
                !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail.trim())
              )) ||
              (paymentMethod === "CARD" && selectedCardId && cardDetails.cvv.length < 3) ||
              (paymentMethod === "CARD" && !selectedCardId && useStripeElements && !stripeReady) ||
              (paymentMethod === "CARD" && !selectedCardId && useStripeElements && totalAmount < stripeMinAmount) ||
              (paymentMethod === "CARD" && !selectedCardId && useOwnCardForm && !isCardValid())
            }
            className="flex-1 shape-button bg-burgundy hover:bg-burgundyDark text-white shadow-soft inline-flex items-center justify-center gap-2">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : confirmDonationLabel}
          </Button>
        </div>

        <div className="flex items-center justify-center gap-2 pt-2 text-gray-400 text-[11px]">
          <svg className="w-3.5 h-3.5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          <span>{t("sslSecurePayment")}</span>
        </div>
      </div>
    );

    return null;
  };

  // ── render ─────────────────────────────────────────────────────────────
  return (
    <>
    <Dialog open={isOpen} onOpenChange={() => {
      if (payforPollRef.current) clearInterval(payforPollRef.current);
      if (payforPopupRef.current && !payforPopupRef.current.closed) payforPopupRef.current.close();
      onClose();
    }}>
      <DialogContent dir={isRTL ? "rtl" : "ltr"} className="w-full h-full sm:h-auto sm:max-w-lg sm:max-h-[90vh] max-h-screen overflow-y-auto overflow-x-hidden p-0 rounded-none sm:rounded-[28px_8px_28px_8px] rtl:sm:rounded-[8px_28px_8px_28px] sm:shadow-lift sm:ring-1 sm:ring-deep/5 top-0 sm:top-[50%] translate-y-0 sm:translate-y-[-50%]" closeClassName="text-white hover:text-white/80" aria-describedby={undefined}>
        <DialogTitle className="sr-only">{t("confirmation")}</DialogTitle>
        {mounted && (
          <>
            {/* Header — deep brand gradient (matches the site hero) */}
            <div className="relative h-24 sm:h-28 overflow-hidden hero-pattern">
              <div className="absolute inset-0 opacity-[0.08] bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:16px_16px]" />
              <div className="absolute inset-0 flex flex-col items-center justify-center px-5 text-center sm:px-6">
                <span className="shape-chip mb-2 inline-flex items-center gap-1.5 bg-burgundy px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white shadow-soft">
                  <ShoppingCart className="h-3 w-3" />
                  {t("oneTimeDonation")}
                </span>
                <h2 className="text-white font-extrabold text-sm sm:text-base drop-shadow-sm">{t("paymentMethod")}</h2>
                <div className="gold-mark-sm mt-2" />
              </div>
            </div>

            {renderStepIndicator()}

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
                        <div className={`w-16 h-16 sm:w-20 sm:h-20 rounded-full flex items-center justify-center transition-colors ${payforSwitching ? "bg-[#635bff]/10" : "bg-burgundy/8"}`}>
                          <CardIcon className={`h-7 w-7 sm:h-9 sm:w-9 transition-colors ${payforSwitching ? "text-[#635bff]" : "text-burgundy"}`} />
                        </div>
                        <span className="absolute -bottom-1 -right-1 w-6 h-6 bg-white border-2 border-burgundy/20 rounded-full flex items-center justify-center">
                          <ExternalLink className="h-3 w-3 text-burgundy" />
                        </span>
                      </div>
                      <div>
                        <p className="text-[15px] sm:text-base font-semibold text-gray-900">
                          {payforSwitching ? t("paymentSwitching") : t("successRedirecting")}
                        </p>
                        <p className="text-sm text-gray-400 mt-1 max-w-xs mx-auto">
                          {payforSwitching ? t("paymentSwitchingDesc") : t("successRedirectingDesc")}
                        </p>
                      </div>
                      <div className={`flex items-center gap-2 text-xs px-4 py-2 rounded-full transition-colors ${payforSwitching ? "text-[#635bff] bg-[#635bff]/8" : "text-burgundy bg-burgundy/6"}`}>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        <span>{payforSwitching ? t("paymentSwitching") : t("successRedirectingDesc")}</span>
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

export default CartPaymentDialog;
