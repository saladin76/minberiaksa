'use client'
import React, { useState, useMemo } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useRouter } from "@/i18n/routing";
import { appendCurrencyQuery, getCurrencyCodeForLinks } from "@/lib/currency-link";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ShoppingCart, Heart, Trash2 } from "lucide-react";
import Image from "next/image";
import Spinner from "../components/ui/spinner";
import { useTranslations, useLocale } from "next-intl";
import { cn } from "@/lib/utils";
import { resolveShareUnit, type ShareLabelsConfig } from "@/lib/campaign/share-labels";

interface CartItem {
  id: string;
  amount: number;
  amountUSD: number;
  currency: string;
  shareCount?: number | null;
  campaign: {
    id: string;
    title: string;
    images: string[];
    /** Per-campaign custom unit names ("sheep" / "meal" / etc.) keyed by locale.
     *  When present, the cart shows e.g. "3 sheep" instead of "3 shares". */
    shareLabels?: ShareLabelsConfig | null;
    translations?: { locale: string; title: string }[];
  };
}

interface CartSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cartItems: CartItem[];
  handleRemoveItem: (id: string) => Promise<void>;
  onOpenDonationDialog: () => void;
}

const CartSheet: React.FC<CartSheetProps> = ({
  open,
  onOpenChange,
  cartItems,
  handleRemoveItem,
  onOpenDonationDialog,
}) => {
  const t = useTranslations('CartSheet');
  const locale = useLocale() as 'ar' | 'en' | 'fr';
  const isRTL = locale === 'ar';
  const router = useRouter();
  const [loadingItemId, setLoadingItemId] = useState<string | null>(null);
  const [removingItemId, setRemovingItemId] = useState<string | null>(null);

  const items = useMemo(() => Array.isArray(cartItems) ? cartItems : [], [cartItems]);

  const totals = useMemo(() => {
    const currencies = [...new Set(items.map((i) => i.currency).filter(Boolean))];
    const allSameCurrency = currencies.length === 1;
    const displayCurrency = allSameCurrency ? currencies[0] : "USD";
    const total = allSameCurrency
      ? items.reduce((sum, i) => sum + i.amount, 0)
      : items.reduce((sum, i) => sum + (i.amountUSD || i.amount), 0);
    return { total, displayCurrency, itemCount: items.length };
  }, [items]);

  const handleDelete = async (id: string) => {
    setRemovingItemId(id);
    setLoadingItemId(id);
    try {
      await handleRemoveItem(id);
    } finally {
      setLoadingItemId(null);
      setTimeout(() => setRemovingItemId(null), 300);
    }
  };

  const handleCheckout = () => {
    onOpenChange(false);
    onOpenDonationDialog();
  };

  const formatAmount = (amount: number, currency: string) =>
    new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(amount);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={isRTL ? 'left' : 'right'}
        className="w-full sm:max-w-md p-0 flex flex-col"
      >
        {/* ── Header ── */}
        <SheetHeader className="px-6 py-5 border-b bg-[#A5243D]">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/15 rounded-xl">
              <ShoppingCart className="h-5 w-5 text-white" />
            </div>
            <div>
              <SheetTitle className="text-lg font-bold text-white">
                {t('myDonationCart')}
              </SheetTitle>
              <p className="text-xs text-white/70 mt-0.5">
                {totals.itemCount} {totals.itemCount === 1 ? t('item') : t('items')}
              </p>
            </div>
          </div>
        </SheetHeader>

        {/* ── Items ── */}
        <ScrollArea className="flex-1 bg-gray-50">
          <div className="px-4 py-4">
            {items.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="w-20 h-20 rounded-full bg-blue-50 flex items-center justify-center mb-5">
                  <ShoppingCart className="h-9 w-9 text-[#A5243D]" />
                </div>
                <h3 className="text-base font-bold text-gray-800 mb-1">
                  {t('emptyCart')}
                </h3>
                <p className="text-sm text-gray-500 mb-6 max-w-[220px]">
                  {t('emptyCartMessage')}
                </p>
                <button
                  onClick={() => {
                    onOpenChange(false);
                    router.push(appendCurrencyQuery("/campaigns", getCurrencyCodeForLinks()));
                  }}
                  className="flex items-center gap-2 px-5 py-2.5 bg-[#A5243D] hover:bg-[#0150a0] text-white text-sm font-semibold rounded-lg transition-colors"
                >
                  <Heart className="h-4 w-4" />
                  {t('browseCampaigns')}
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {items.map((item) => {
                  const campaignTitle =
                    item.campaign.translations?.find((tr) => tr.locale === locale)?.title ??
                    item.campaign.title;

                  return (
                    <div
                      key={item.id}
                      dir={isRTL ? 'rtl' : 'ltr'}
                      className={cn(
                        "bg-white border border-gray-200 rounded-xl p-3.5 transition-all duration-300",
                        removingItemId === item.id ? "opacity-40 scale-95" : "hover:shadow-sm hover:border-blue-100"
                      )}
                    >
                      <div className="flex gap-3 items-start">
                        {/* Image */}
                        <div className="relative w-20 h-20 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0">
                          <Image
                            src={item.campaign.images[0]}
                            alt={campaignTitle}
                            fill
                            className="object-cover"
                          />
                        </div>

                        {/* Details */}
                        <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                          <h3 className={cn(
                            "text-sm font-semibold text-gray-800 line-clamp-2 leading-snug",
                            isRTL ? "text-right" : "text-left"
                          )}>
                            {campaignTitle}
                          </h3>
                          {item.shareCount != null && item.shareCount > 0 && (() => {
                            const unit = resolveShareUnit(
                              item.campaign?.shareLabels ?? null,
                              locale,
                              item.shareCount
                            );
                            return (
                              <p className={cn(
                                "text-xs text-[#A5243D] font-medium",
                                isRTL ? "text-right" : "text-left"
                              )}>
                                {unit
                                  ? `${item.shareCount} ${unit}`
                                  : t('sharesLine', { count: item.shareCount })}
                              </p>
                            );
                          })()}
                          <span className="inline-flex items-center self-start gap-1 bg-[#A5243D]/10 text-[#A5243D] text-xs font-bold px-2.5 py-1 rounded-full">
                            {formatAmount(item.amount, item.currency)}
                          </span>
                        </div>

                        {/* Delete — always visible */}
                        <div className="flex-shrink-0">
                          {loadingItemId === item.id ? (
                            <div className="p-1.5">
                              <Spinner className="h-4 w-4 text-gray-400" />
                            </div>
                          ) : (
                            <button
                              onClick={() => handleDelete(item.id)}
                              disabled={!!loadingItemId}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                              aria-label="Remove"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </ScrollArea>

        {/* ── Footer ── */}
        {items.length > 0 && (
          <div className="border-t bg-white px-5 py-4 space-y-4">
            {/* Totals */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm text-gray-500">
                <span>{t('subtotal')}</span>
                <span className="font-medium text-gray-700">{formatAmount(totals.total, totals.displayCurrency)}</span>
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-gray-800">{t('total')}</span>
                <span className="text-xl font-bold text-[#A5243D]">{formatAmount(totals.total, totals.displayCurrency)}</span>
              </div>
            </div>

            {/* Checkout */}
            <button
              onClick={handleCheckout}
              className="w-full flex items-center justify-center gap-2 py-3 bg-[#A5243D] hover:bg-[#7D1830] active:scale-[0.98] text-white text-sm font-bold rounded-xl transition-all"
            >
              <Heart className="h-4 w-4" />
              {t('proceedToDonate')}
            </button>
            <p className="text-xs text-center text-gray-400">{t('secureCheckout')}</p>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
};

export default CartSheet;
