"use client";

/**
 * StripePaymentStep — inner component that MUST live inside <Elements>.
 * Uses useStripe() / useElements() directly so the stripe instance is always
 * in sync with the mounted Elements context.
 *
 * Parent calls:  stripeFormRef.current.confirmPayment(clientSecret)
 * Parent reads:  onReadyChange(boolean) to enable/disable the submit button.
 */

import { forwardRef, useImperativeHandle, useEffect, useState } from "react";
import {
  useStripe,
  useElements,
  CardNumberElement,
  CardExpiryElement,
  CardCvcElement,
} from "@stripe/react-stripe-js";
import type { PaymentIntentResult } from "@stripe/stripe-js";
import { Input } from "@/components/ui/input";

const ELEMENT_STYLE = {
  base: {
    fontSize: "14px",
    color: "#111827",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    letterSpacing: "0.05em",
    "::placeholder": { color: "#9ca3af" },
  },
  invalid: { color: "#ef4444" },
};

const ElementWrapper = ({ children }: { children: React.ReactNode }) => (
  <div className="border border-input rounded-md px-3 py-[9px] bg-background focus-within:ring-2 focus-within:ring-ring focus-within:border-transparent transition-all">
    {children}
  </div>
);

export interface StripePaymentHandle {
  confirmPayment(clientSecret: string): Promise<PaymentIntentResult>;
}

interface Props {
  /** Called when all card fields + holder name are complete or incomplete */
  onReadyChange(ready: boolean): void;
  labelClass?: string;
}

export const StripePaymentStep = forwardRef<StripePaymentHandle, Props>(
  function StripePaymentStep(
    { onReadyChange, labelClass = "block text-xs font-medium text-gray-600 mb-1" },
    ref
  ) {
    const stripe = useStripe();
    const elements = useElements();

    const [holderName, setHolderName] = useState("");
    const [numberDone, setNumberDone] = useState(false);
    const [expiryDone, setExpiryDone] = useState(false);
    const [cvcDone, setCvcDone] = useState(false);

    // Notify parent whenever ready state changes — onReadyChange must be stable (useCallback in parent)
    useEffect(() => {
      const ready =
        !!stripe &&
        !!elements &&
        numberDone &&
        expiryDone &&
        cvcDone &&
        holderName.trim().length > 0;
      onReadyChange(ready);
    }, [stripe, elements, numberDone, expiryDone, cvcDone, holderName, onReadyChange]);

    // Expose confirmPayment to parent — stripe/elements are always fresh from context
    useImperativeHandle(
      ref,
      () => ({
        confirmPayment: async (clientSecret: string): Promise<PaymentIntentResult> => {
          if (!stripe || !elements) {
            return {
              error: {
                message: "Payment system not ready. Please try again.",
                type: "api_error",
                code: "stripe_not_ready",
              },
            } as PaymentIntentResult;
          }
          const cardElement = elements.getElement(CardNumberElement);
          if (!cardElement) {
            return {
              error: {
                message: "Card form not mounted. Please try again.",
                type: "api_error",
                code: "card_element_missing",
              },
            } as PaymentIntentResult;
          }
          // Card data goes directly from browser to Stripe — never touches our server
          return stripe.confirmCardPayment(clientSecret, {
            payment_method: {
              card: cardElement,
              billing_details: {
                name: holderName.trim() || undefined,
              },
            },
          });
        },
      }),
      [stripe, elements, holderName]
    );

    return (
      <div className="space-y-3" dir="ltr">
        <div>
          <label className={labelClass}>Card Number</label>
          <ElementWrapper>
            <CardNumberElement
              options={{ style: ELEMENT_STYLE, showIcon: true }}
              onChange={(e) => setNumberDone(e.complete)}
            />
          </ElementWrapper>
        </div>

        <div>
          <label className={labelClass}>Cardholder Name</label>
          <Input
            value={holderName}
            onChange={(e) =>
              setHolderName(e.target.value.replace(/\d/g, "").toUpperCase())
            }
            placeholder="JOHN DOE"
            autoComplete="cc-name"
            className="uppercase font-mono tracking-wider"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Expiry Date</label>
            <ElementWrapper>
              <CardExpiryElement
                options={{ style: ELEMENT_STYLE }}
                onChange={(e) => setExpiryDone(e.complete)}
              />
            </ElementWrapper>
          </div>
          <div>
            <label className={labelClass}>CVV</label>
            <ElementWrapper>
              <CardCvcElement
                options={{ style: ELEMENT_STYLE }}
                onChange={(e) => setCvcDone(e.complete)}
              />
            </ElementWrapper>
          </div>
        </div>
      </div>
    );
  }
);
