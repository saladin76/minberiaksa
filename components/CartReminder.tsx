"use client";

import { useEffect, useState } from "react";
import { ShoppingCart } from "lucide-react";
import { useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import axios from "axios";
import { useCart } from "@/hooks/useCart";

export const CART_OPEN_EVENT = "cart-reminder:open";
export const CART_CHANGED_EVENT = "cart-reminder:changed";

const HIDDEN_PATH_PATTERNS = [
  /\/success(\/|$)/,
  /\/donation-failed(\/|$)/,
  /\/dashboard(\/|$)/,
];

export default function CartReminder() {
  const t = useTranslations("Navbar");
  const { data: session, status } = useSession();
  const { items: zustandItems } = useCart();
  const pathname = usePathname() ?? "";
  const [serverCount, setServerCount] = useState<number | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (status !== "authenticated" || !session?.user) {
      setServerCount(null);
      return;
    }
    let cancelled = false;
    const refetch = async () => {
      try {
        const res = await axios.get("/api/cart");
        if (!cancelled) setServerCount(Array.isArray(res.data) ? res.data.length : 0);
      } catch {
        if (!cancelled) setServerCount(0);
      }
    };
    refetch();
    const onChange = () => refetch();
    window.addEventListener(CART_CHANGED_EVENT, onChange);
    return () => {
      cancelled = true;
      window.removeEventListener(CART_CHANGED_EVENT, onChange);
    };
  }, [session?.user, status]);

  if (!mounted) return null;
  if (HIDDEN_PATH_PATTERNS.some((re) => re.test(pathname))) return null;

  const count = session?.user ? serverCount ?? 0 : zustandItems.length;
  if (count <= 0) return null;

  const label = `${t("cart")} (${count})`;

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={() => window.dispatchEvent(new CustomEvent(CART_OPEN_EVENT))}
      style={{ marginBottom: "env(safe-area-inset-bottom, 0px)" }}
      className="cart-reminder-in group fixed bottom-5 end-5 z-40 inline-flex items-center justify-center w-14 h-14 rounded-full bg-[#A5243D] text-white shadow-lg shadow-[#D8AA55]/40 ring-1 ring-white/20 hover:bg-[#7D1830] hover:shadow-xl hover:shadow-[#D8AA55]/50 hover:scale-[1.06] active:scale-95 transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#D8AA55]"
    >
      <ShoppingCart className="w-6 h-6 transition-transform duration-200 group-hover:scale-110" aria-hidden="true" />
      <span
        dir="ltr"
        aria-hidden="true"
        className="absolute -top-1 -end-1 min-w-[1.25rem] h-5 px-1 inline-flex items-center justify-center rounded-full bg-white text-[#D8AA55] text-[11px] font-bold leading-none ring-2 ring-[#D8AA55] shadow-sm"
      >
        {count > 99 ? "99+" : count}
      </span>
    </button>
  );
}
