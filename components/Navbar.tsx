"use client";
import React, { useState, useEffect, useRef } from "react";
import {
  Menu,
  X,
  ShoppingCart,
  Search,
  LogOut,
  LayoutDashboard,
  ChevronDown,
  Heart,
  Facebook,
  Instagram,
  Twitter,
  MessageCircle,
  Phone,
  UserCircle,
} from "lucide-react";
import Image from "next/image";
import { Link, usePathname, useRouter } from "@/i18n/routing";
import { useTranslations, useLocale } from "next-intl";
import { useSearchParams } from "next/navigation";
import axios from "axios";
import { useSession, signOut } from "next-auth/react";
import CartSheet from "../components/CartSheet";
import { useCart } from "@/hooks/useCart";
import { CART_OPEN_EVENT, CART_CHANGED_EVENT } from "@/components/CartReminder";
import CurrencySelector from "./CurrencySelector";
import LanguageSwitcher from "./LanguageSelector";
import SignInDialog from "@/components/SignInDialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import dynamic from "next/dynamic";
const CartPaymentDialog = dynamic(() => import("./CartPaymentDialog"), { ssr: false });
// framer-motion removed — replaced with CSS-only fade animations to keep ~70 KiB
// of motion JS off the homepage critical path.
import { appendCurrencyQuery, getCurrencyCodeForLinks } from "@/lib/currency-link";
import { CURRENCY_COOKIE_UPDATED_EVENT } from "@/components/CurrencyFromUrlSync";
import { getSocialLinks } from "@/lib/social-links";

interface CartItem {
  id: string;
  campaignId: string;
  amount: number;
  amountUSD: number;
  currency: string;
  userId: string;
  createdAt: string;
  campaign: {
    id: string;
    title: string;
    images: string[];
  };
}

const LOGO_URL = "/logometaminber.avif";
const LOGO_MOBILE_URL = "/logometaminber.avif";

const Navbar = () => {
  const t = useTranslations("Navbar");
  const locale = useLocale();
  const isRTL = locale === "ar";
  const social = getSocialLinks(locale);
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [isScrolled, setIsScrolled] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isSignInOpen, setIsSignInOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isCartPaymentDialogOpen, setIsCartPaymentDialogOpen] = useState(false);
  const [signInCallbackUrl, setSignInCallbackUrl] = useState<string | undefined>(undefined);
  const [cartGuestMode, setCartGuestMode] = useState(false);
  const { items: zustandItems, removeItem: zustandRemoveItem, clearItems: clearZustandItems } = useCart();
  const userMenuRef = useRef<HTMLDivElement>(null);
  // Force a re-render when the currency cookie changes so SSR'd `?currency=USD`
  // links refresh once middleware / CurrencyFromUrlSync settles the real choice.
  const [, setCurrencyTick] = useState(0);
  useEffect(() => {
    setCurrencyTick((n) => n + 1); // hydration: re-read after middleware-set cookie
    const onUpdate = () => setCurrencyTick((n) => n + 1);
    window.addEventListener(CURRENCY_COOKIE_UPDATED_EVENT, onUpdate);
    return () => window.removeEventListener(CURRENCY_COOKIE_UPDATED_EVENT, onUpdate);
  }, []);

  useEffect(() => {
    if (searchParams.get("openCartPayment") === "1") {
      setCartGuestMode(!session?.user && zustandItems.length > 0);
      setIsCartPaymentDialogOpen(true);
      router.replace(appendCurrencyQuery(pathname, getCurrencyCodeForLinks()));
    }
  }, [searchParams, pathname, router, session?.user, zustandItems.length]);

  useEffect(() => {
    const fetchCartItems = async () => {
      if (session?.user && status === "authenticated") {
        try {
          const response = await axios.get("/api/cart");
          setCartItems(response.data);
        } catch {
          setCartItems([]);
        }
      } else {
        setCartItems([]);
      }
    };
    fetchCartItems();
  }, [session, status]);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 10);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setIsUserMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleRemoveItem = async (id: string) => {
    if (!session?.user) {
      zustandRemoveItem(id);
      window.dispatchEvent(new CustomEvent(CART_CHANGED_EVENT));
      return;
    }
    try {
      await axios.delete(`/api/cart/${id}`);
      setCartItems((prev) => prev.filter((item) => item.id !== id));
      window.dispatchEvent(new CustomEvent(CART_CHANGED_EVENT));
    } catch {}
  };

  const onOpenDonationDialog = () => {
    setIsCartOpen(false);
    setIsCartPaymentDialogOpen(true);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(
        appendCurrencyQuery(
          `/campaigns?search=${encodeURIComponent(searchQuery.trim())}`,
          getCurrencyCodeForLinks()
        )
      );
      setSearchQuery("");
      setIsMobileMenuOpen(false);
    }
  };

  const openCart = () => {
    if (session?.user) {
      setCartGuestMode(false);
      setIsCartOpen(true);
    } else if (zustandItems.length > 0) {
      setCartGuestMode(true);
      setIsCartOpen(true);
    } else {
      setSignInCallbackUrl(
        typeof window !== "undefined"
          ? appendCurrencyQuery(pathname, getCurrencyCodeForLinks())
          : undefined
      );
      setIsSignInOpen(true);
    }
  };

  // Floating CartReminder asks Navbar to open the cart sheet via this event.
  useEffect(() => {
    const onOpen = () => openCart();
    window.addEventListener(CART_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(CART_OPEN_EVENT, onOpen);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user, zustandItems.length, pathname]);

  const navLinks = [
    { href: "/about-us", label: t("about") },
    { href: "/campaigns", label: t("projects") },
    { href: "/blog", label: t("news") },
    { href: "/bank-transfer", label: t("bankAccounts") },
    { href: "/contact-us", label: t("contact") },
  ];

  const checkoutCartItems =
    isCartPaymentDialogOpen && cartGuestMode
      ? zustandItems
      : session?.user
      ? cartItems
      : zustandItems;

  const cartPaymentCallbackUrl =
    typeof window !== "undefined"
      ? appendCurrencyQuery(`${pathname}?openCartPayment=1`, getCurrencyCodeForLinks())
      : undefined;

  return (
    <>
      <header className="fixed top-0 left-0 right-0 z-50">
        {/* ── Top Utility Bar (desktop only) — slim ── */}
        <div className="bg-deep text-offwhite text-xs hidden lg:block border-b border-gray-100">
          <div className="max-w-7xl mx-auto px-4 flex items-center justify-between h-8">
            {/* Left: social icons + phone */}
            <div className="flex items-center gap-0.5">
              {[
                { Icon: Instagram, href: social.instagram, label: "Instagram" },
                { Icon: Facebook, href: social.facebook, label: "Facebook" },
                { Icon: Twitter, href: social.twitter, label: "Twitter" },
              ].map(({ Icon, href, label }) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={label}
                  className="p-1.5 rounded-md hover:text-burgundy transition-colors"
                >
                  <Icon className="w-3.5 h-3.5" />
                </a>
              ))}
              <a
                href="https://wa.me/905306516549"
                className="ms-2 ps-3 border-s border-gray-200 flex items-center gap-1.5 hover:text-burgundy transition-colors"
              >
                <Phone className="w-3.5 h-3.5" />
                <span dir="ltr">+90 530 651 65 49</span>
              </a>
            </div>
            {/* Right: language + currency */}
            <div className="flex items-center gap-3">
              <LanguageSwitcher onDark={true} />
              <div className="border-s border-gray-200 ps-3">
                <CurrencySelector onDark={true} />
              </div>
            </div>
          </div>
        </div>

        {/* ── Main Navbar — compact light ── */}
        <nav
          className={`bg-white/90 backdrop-blur-md border-b transition-shadow duration-300 ${
            isScrolled ? "border-gray-200 shadow-sm" : "border-gray-200"
          }`}
        >
          <div className="max-w-7xl mx-auto px-4 flex items-center h-12 lg:h-14 gap-2">

            {/* Logo — always visible */}
            <Link href="/" className="flex-shrink-0 flex items-center gap-2">
              {/* Mobile: narrow square logo */}
              <Image src={LOGO_MOBILE_URL} alt="Logo" width={48} height={48} className="lg:hidden h-7 w-auto object-contain" />
              {/* Desktop: wide logo — width must match aspect ratio to prevent blur */}
              <Image src={LOGO_URL} alt="Logo" width={240} height={48} className="hidden lg:block h-8 w-auto object-contain" />
            </Link>

            {/* Desktop Nav Links */}
            <div className="hidden lg:flex items-center gap-0.5 flex-1 justify-center">
              {navLinks.map((link) => {
                const active = pathname === link.href;
                return (
                  <Link
                    key={link.href + link.label}
                    href={link.href}
                    className={`group relative px-3 py-1 text-[13px] font-semibold uppercase tracking-wide transition-colors ${
                      active ? "text-burgundy" : "text-gray-600 hover:text-burgundy"
                    }`}
                  >
                    {link.label}
                    <span
                      className={`pointer-events-none absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-gradient-to-r from-burgundy to-gold transition-all duration-300 origin-center ${
                        active
                          ? "opacity-100 scale-x-100"
                          : "opacity-0 scale-x-0 group-hover:opacity-70 group-hover:scale-x-100"
                      }`}
                    />
                  </Link>
                );
              })}
            </div>

            {/* Desktop: Donate button */}
            <Link
              href="/campaigns"
              className="hidden lg:flex items-center gap-1.5 shape-button bg-burgundy hover:bg-burgundyDark text-white font-bold text-[13px] px-4 py-1.5 transition-colors flex-shrink-0"
            >
            
              <Heart className="w-4 h-4 fill-white/30" />
              {t("donate") || "BAĞIŞ YAP"}
            </Link>

            {/* Spacer — pushes right-side items to the edge on mobile */}
            <div className="flex-1 lg:hidden" />

            {/* Mobile: Language + Currency */}
            <div className="flex lg:hidden items-center gap-0.5">
              <LanguageSwitcher onDark={false} />
              <CurrencySelector onDark={false} />
            </div>

            {/* Cart button — always visible */}
            <button
              type="button"
              onClick={openCart}
              className="relative p-2 text-gray-600 hover:text-burgundy transition-colors flex-shrink-0"
              aria-label="Cart"
            >
              <ShoppingCart className="w-5 h-5" />
              {(session?.user ? cartItems.length : zustandItems.length) > 0 && (
                <span className="absolute -top-0.5 -right-0.5 bg-burgundy text-white text-[10px] font-extrabold rounded-full w-4 h-4 flex items-center justify-center ring-2 ring-white">
                  {session?.user ? cartItems.length : zustandItems.length}
                </span>
              )}
            </button>

            {/* User avatar / Sign in */}
            {status === "authenticated" && session?.user ? (
              <div className={`relative flex-shrink-0 ${isRTL ? "mr-1.5" : "ml-1.5"}`} ref={userMenuRef}>
                <button
                  type="button"
                  onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                  className="flex items-center gap-1 rounded-full p-0.5 ring-1 ring-gray-200 hover:ring-burgundy/40 transition-all"
                >
                  <Avatar className="w-7 h-7">
                    <AvatarImage src={session.user.image ?? ""} />
                    <AvatarFallback className="bg-burgundy text-white text-xs">
                      {session.user.name?.[0]?.toUpperCase() ?? "U"}
                    </AvatarFallback>
                  </Avatar>
                  <ChevronDown className="w-3.5 h-3.5 text-gray-400 hidden lg:block me-1" />
                </button>
                {isUserMenuOpen && (
                  <div
                    className={`absolute mt-2 w-52 bg-white rounded-2xl shadow-xl border border-gray-100 py-1 z-50 animate-fade-in overflow-hidden ${isRTL ? "left-0" : "right-0"}`}
                  >
                      <div className="px-4 py-3 border-b border-gray-100 bg-offwhite/50">
                        <p className="text-sm font-semibold text-deep truncate">{session.user.name}</p>
                        <p className="text-xs text-gray-500 truncate">{session.user.email}</p>
                      </div>
                           {(session.user.role === "ADMIN" || session.user.role === "STAFF") && (
                        <a
                          href="/dashboard"
                          onClick={() => setIsUserMenuOpen(false)}
                          className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                        >
                          <LayoutDashboard className="w-4 h-4 text-burgundy" />
                          {isRTL ? "لوحة التحكم" : "Dashboard"}
                        </a>
                      )}
                      <Link
                        href="/profile"
                        onClick={() => setIsUserMenuOpen(false)}
                        className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                      >
                        <UserCircle className="w-4 h-4 text-burgundy" />
                        {t("profile") || "Profilim"}
                      </Link>
                      <button
                        type="button"
                        onClick={() => { setIsUserMenuOpen(false); signOut({ callbackUrl: "/" }); }}
                        className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors border-t border-gray-100"
                      >
                        <LogOut className="w-4 h-4" />
                        {t("signOut") || "Çıkış"}
                      </button>
                  </div>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setSignInCallbackUrl(
        typeof window !== "undefined"
          ? appendCurrencyQuery(pathname, getCurrencyCodeForLinks())
          : undefined
      );
                  setIsSignInOpen(true);
                }}
                className="hidden lg:flex items-center gap-1.5 text-[13px] font-semibold text-gray-700 hover:text-burgundy border border-gray-200 hover:border-burgundy/40 rounded-full px-4 py-1.5 transition-colors flex-shrink-0 ms-1"
              >
                {t("signIn") || "Giriş Yap"}
              </button>
            )}

            {/* Mobile: Hamburger */}
            <button
              type="button"
              className="lg:hidden p-2 text-gray-700 flex-shrink-0"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              aria-label="Menu"
            >
              {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>

          {/* ── Mobile Menu ── */}
          {isMobileMenuOpen && (
            <div className="lg:hidden overflow-hidden border-t border-gray-200 bg-white animate-fade-in">
                {/* Nav links */}
                {navLinks.map((link) => {
                  const active = pathname === link.href;
                  return (
                    <Link
                      key={link.href + link.label}
                      href={link.href}
                      onClick={() => setIsMobileMenuOpen(false)}
                      className={`flex items-center gap-3 px-5 py-3 text-sm font-semibold uppercase tracking-wide border-b border-gray-100 transition-colors ${
                        active
                          ? "text-burgundy bg-offwhite"
                          : "text-gray-700 hover:bg-gray-50"
                      }`}
                    >
                      <span className={`h-4 w-0.5 rounded-full transition-colors ${active ? "bg-gradient-to-b from-burgundy to-gold" : "bg-transparent"}`} />
                      {link.label}
                    </Link>
                  );
                })}

                {/* User info (mobile) */}
                {status === "authenticated" && session?.user && (
                  <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-3">
                    <Avatar className="w-9 h-9">
                      <AvatarImage src={session.user.image ?? ""} />
                      <AvatarFallback className="bg-burgundy text-white text-xs">
                        {session.user.name?.[0]?.toUpperCase() ?? "U"}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-deep truncate">{session.user.name}</p>
                      <p className="text-xs text-gray-500 truncate">{session.user.email}</p>
                    </div>
                    <div className="flex gap-2">
                      <Link
                        href="/profile"
                        onClick={() => setIsMobileMenuOpen(false)}
                        className="p-2 shape-chip bg-offwhite text-burgundy hover:bg-gold/20 transition-colors"
                      >
                        <LayoutDashboard className="w-4 h-4" />
                      </Link>
                      <button
                        type="button"
                        onClick={() => { setIsMobileMenuOpen(false); signOut({ callbackUrl: "/" }); }}
                        className="p-2 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
                      >
                        <LogOut className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}

                {/* Donate + Sign in */}
                <div className="px-5 py-3 flex gap-3 border-b border-gray-100">
                  <Link
                    href="/campaigns"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="flex-1 flex items-center justify-center gap-1.5 shape-button bg-burgundy hover:bg-burgundyDark text-white font-bold text-sm px-4 py-2.5 transition-colors"
                  >
                    <Heart className="w-4 h-4 fill-white/30" />
                    {t("donate") || "BAĞIŞ YAP"}
                  </Link>
                  {!session?.user && (
                    <button
                      type="button"
                      onClick={() => { setIsMobileMenuOpen(false); setIsSignInOpen(true); }}
                      className="flex-1 flex items-center justify-center text-sm font-semibold text-burgundy border border-burgundy/40 shape-button px-4 py-2.5 hover:bg-offwhite transition-colors"
                    >
                      {t("signIn") || "Giriş Yap"}
                    </button>
                  )}
                </div>

                {/* Social links */}
                <div className="px-5 py-3 flex items-center justify-center gap-3">
                  {[
                    { Icon: Instagram, href: social.instagram, label: "Instagram" },
                    { Icon: Facebook, href: social.facebook, label: "Facebook" },
                    { Icon: Twitter, href: social.twitter, label: "Twitter" },
                    { Icon: MessageCircle, href: "https://wa.me/905306516549", label: "WhatsApp" },
                  ].map(({ Icon, href, label }) => (
                    <a
                      key={label}
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={label}
                      className="w-9 h-9 rounded-full bg-gray-100 text-gray-600 hover:bg-burgundy hover:text-white flex items-center justify-center transition-colors"
                    >
                      <Icon className="w-4 h-4" />
                    </a>
                  ))}
                </div>
            </div>
          )}
        </nav>
      </header>

      {/* Cart Sheet */}
      <CartSheet
        open={isCartOpen}
        onOpenChange={setIsCartOpen}
        cartItems={session?.user ? cartItems : zustandItems}
        handleRemoveItem={handleRemoveItem}
        onOpenDonationDialog={onOpenDonationDialog}
      />

      {/* Cart Payment Dialog */}
      <CartPaymentDialog
        isOpen={isCartPaymentDialogOpen}
        onClose={() => setIsCartPaymentDialogOpen(false)}
        cartItems={checkoutCartItems}
        guestMode={false}
        authCallbackUrl={cartPaymentCallbackUrl}
        onSuccess={() => {
          setIsCartPaymentDialogOpen(false);
          setCartItems([]);
          if (cartGuestMode) clearZustandItems();
        }}
      />

      {/* Sign In Dialog */}
      <SignInDialog
        isOpen={isSignInOpen}
        onClose={() => setIsSignInOpen(false)}
        callbackUrl={signInCallbackUrl}
      />
    </>
  );
};

export default Navbar;
