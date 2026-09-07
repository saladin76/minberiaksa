"use client";

import {
  useStripe,
  useElements,
  CardNumberElement,
  CardExpiryElement,
  CardCvcElement,
} from "@stripe/react-stripe-js";
import type { Stripe, StripeElements } from "@stripe/stripe-js";
import { useEffect, useState } from "react";
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

interface Props {
  holderName: string;
  onHolderNameChange: (name: string) => void;
  /** Called whenever stripe/elements instances change — parent stores them to confirm payment */
  onReady: (stripe: Stripe | null, elements: StripeElements | null) => void;
  /** Called whenever the combined completion state of all 3 card fields changes */
  onComplete?: (complete: boolean) => void;
  labelClass?: string;
}

export function StripeCardForm({
  holderName,
  onHolderNameChange,
  onReady,
  onComplete,
  labelClass = "block text-xs font-medium text-gray-600 mb-1",
}: Props) {
  const stripe = useStripe();
  const elements = useElements();

  const [numberDone, setNumberDone] = useState(false);
  const [expiryDone, setExpiryDone] = useState(false);
  const [cvcDone, setCvcDone] = useState(false);

  useEffect(() => {
    onReady(stripe, elements);
  }, [stripe, elements, onReady]);

  useEffect(() => {
    onComplete?.(numberDone && expiryDone && cvcDone);
  }, [numberDone, expiryDone, cvcDone, onComplete]);

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
          onChange={(e) => onHolderNameChange(e.target.value.replace(/\d/g, "").toUpperCase())}
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
