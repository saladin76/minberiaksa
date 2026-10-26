"use client";

/**
 * PayForCardForm  raw card inputs for the bank 3D Secure flows.
 * Shared by PayFor (Ziraat Katılım) and Albaraka Türk; the difference is where the
 * card goes from here. PayFor doesn't hash the card fields, so the browser appends
 * them to the form it POSTs straight to the bank. Albaraka signs them into its
 * request MAC, so they're posted to our /api/albaraka/3d/initiate route to be signed
 *  unless ALBARAKA_USE_OOS=1, in which case this form isn't rendered at all and the
 * bank's own hosted page collects the card.
 * This component has NO connection to Stripe whatsoever.
 */

import Cards from "react-credit-cards-2";
import "react-credit-cards-2/dist/es/styles-compiled.css";
import { Input } from "@/components/ui/input";
import { useTranslations } from "next-intl";
import { useId } from "react";
import { digitsOnly } from "@/lib/minbar/numeric-input";

export interface PayForCardState {
  cardNumber: string;
  expiryDate: string; // MM/YY format
  cvv: string;
  cardholderName: string;
}

interface Props {
  cardDetails: PayForCardState;
  setCardDetails: (details: PayForCardState) => void;
  cardFocus: string;
  setCardFocus: (focus: string) => void;
  invalidField?: keyof PayForCardState;
  errorId?: string;
}

export function PayForCardForm({
  cardDetails,
  setCardDetails,
  cardFocus,
  setCardFocus,
  invalidField,
  errorId,
}: Props) {
  const t = useTranslations("DonationDialog");
  const id = useId();

  return (
    <div className="space-y-4" dir="ltr" data-clarity-mask="True" data-hj-suppress="" data-private="">
      <div className="flex justify-center">
        <Cards
          number={cardDetails.cardNumber}
          expiry={cardDetails.expiryDate.replace("/", "")}
          cvc={"•".repeat(cardDetails.cvv.length)}
          name={cardDetails.cardholderName}
          focused={cardFocus as "name" | "number" | "expiry" | "cvc"}
        />
      </div>

      <div className="space-y-3">
        <div>
          <label htmlFor={`${id}-number`} className="block text-xs font-medium text-gray-600 mb-1">
            {t("cardNumber")}
          </label>
          <Input
            id={`${id}-number`}
            data-donation-field="cardNumber"
            aria-invalid={invalidField === "cardNumber" || undefined}
            aria-describedby={invalidField === "cardNumber" ? errorId : undefined}
            value={cardDetails.cardNumber}
            onChange={(e) => {
              const digits = digitsOnly(e.target.value, 19);
              const formatted = digits.replace(/(.{4})/g, "$1 ").trimEnd();
              setCardDetails({ ...cardDetails, cardNumber: formatted });
            }}
            onFocus={() => setCardFocus("number")}
            placeholder="0000 0000 0000 0000"
            maxLength={23}
            inputMode="numeric"
            autoComplete="cc-number"
            className="font-mono tracking-widest"
          />
        </div>

        <div>
          <label htmlFor={`${id}-name`} className="block text-xs font-medium text-gray-600 mb-1">
            {t("cardholderName")}
          </label>
          <Input
            id={`${id}-name`}
            data-donation-field="cardholderName"
            aria-invalid={invalidField === "cardholderName" || undefined}
            aria-describedby={invalidField === "cardholderName" ? errorId : undefined}
            value={cardDetails.cardholderName}
            onChange={(e) =>
              setCardDetails({
                ...cardDetails,
                // Strip digits  prevents Stripe's "name contains card number" error on fallback
                cardholderName: e.target.value.replace(/\d/g, "").toUpperCase(),
              })
            }
            onFocus={() => setCardFocus("name")}
            placeholder={t("cardholderNamePlaceholder")}
            autoComplete="cc-name"
            className="uppercase"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor={`${id}-expiry`} className="block text-xs font-medium text-gray-600 mb-1">
              {t("expiryDate")}
            </label>
            <Input
              id={`${id}-expiry`}
            data-donation-field="expiryDate"
            aria-invalid={invalidField === "expiryDate" || undefined}
            aria-describedby={invalidField === "expiryDate" ? errorId : undefined}
              value={cardDetails.expiryDate}
              onChange={(e) => {
                let v = digitsOnly(e.target.value, 4);
                if (v.length >= 3) v = v.slice(0, 2) + "/" + v.slice(2);
                setCardDetails({ ...cardDetails, expiryDate: v });
              }}
              onFocus={() => setCardFocus("expiry")}
              placeholder={t("expiryDatePlaceholder")}
              maxLength={5}
              inputMode="numeric"
              autoComplete="cc-exp"
              className="font-mono"
            />
          </div>
          <div>
            <label htmlFor={`${id}-cvc`} className="block text-xs font-medium text-gray-600 mb-1">
              {t("securityCode")}
            </label>
            <Input
              id={`${id}-cvc`}
            data-donation-field="cvv"
            aria-invalid={invalidField === "cvv" || undefined}
            aria-describedby={invalidField === "cvv" ? errorId : undefined}
              type="password"
              value={cardDetails.cvv}
              onChange={(e) =>
                setCardDetails({
                  ...cardDetails,
                  cvv: digitsOnly(e.target.value, 4),
                })
              }
              onFocus={() => setCardFocus("cvc")}
              placeholder={t("securityCodePlaceholder")}
              maxLength={4}
              inputMode="numeric"
              autoComplete="cc-csc"
              className="font-mono"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
