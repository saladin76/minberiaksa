"use client";

import { AlertTriangle, ArrowUpLeft, Trash2 } from "lucide-react";
import type { BasketItem } from "@/types/basket";
import { getFrequencyLabel } from "./basket-utils";
import { BasketAmountControl } from "./basket-amount-control";

const modeLabels = {
  "one-time": "مرة واحدة",
  recurring: "عطاء مستمر",
  gift: "إهداء عطاء",
} as const;

export function BasketLineItem({
  item,
  onUpdateAmount,
  onRemove,
  onEditDetails,
  onValidityChange,
}: {
  item: BasketItem;
  onUpdateAmount: (amount: number) => void;
  onRemove: () => void;
  onEditDetails?: () => void;
  onValidityChange?: (id: string, valid: boolean) => void;
}) {
  const available = item.available !== false;
  const recurring = item.intent === "recurring" || item.donationMode === "recurring";
  const needsDetails = Boolean(item.metadata?.sensitiveDetailsExpired)
    || (item.intent === "waqf" && !item.ownerName?.trim())
    || (item.donationMode === "gift" && !item.giftRecipient?.trim());
  const projectHref = item.slug ? `/projects/${item.slug}` : "/projects";

  return (
    <article
      className={`giving-basket-item giving-basket-item--${item.intent}${available ? "" : " is-unavailable"}`}
      data-basket-item={item.id}
      data-basket-currency={item.currency}
      data-basket-available={available ? "true" : "false"}
    >
      <div className="giving-basket-item__topline">
        <div className="giving-basket-item__identity">
          <span className={`giving-basket-intent giving-basket-intent--${item.intent}`}>{item.intentLabel}</span>
          <span>{modeLabels[item.donationMode]}</span>
        </div>
        <button className="giving-basket-remove" type="button" aria-label={`إزالة ${item.projectTitle} من السلة`} onClick={onRemove}>
          <Trash2 size={15} aria-hidden="true" />
          <span>إزالة</span>
        </button>
      </div>

      <div className="giving-basket-item__title-row">
        <div>
          <h3>{item.projectTitle}</h3>
          <div className="giving-basket-item__meta">
            {item.region ? <span>{item.region}</span> : null}
            {recurring && item.frequency ? <span>{getFrequencyLabel(item.frequency)}</span> : null}
          </div>
        </div>
        <a className="giving-basket-project-link" href={projectHref}>
          <span>عرض المشروع</span>
          <ArrowUpLeft size={15} aria-hidden="true" />
        </a>
      </div>

      {!available ? (
        <div className="giving-basket-unavailable" role="status">
          <AlertTriangle size={18} aria-hidden="true" />
          <div><strong>هذا المشروع غير متاح حاليًا للعطاء.</strong><span>يمكنك عرض المشروع أو إزالته من السلة.</span></div>
        </div>
      ) : null}

      {needsDetails ? (
        <div className="giving-basket-details-note" role="status">
          <span>بعض تفاصيل هذه النية تحتاج إلى استكمال.</span>
          {onEditDetails ? <button type="button" onClick={onEditDetails}>تعديل التفاصيل</button> : null}
        </div>
      ) : null}

      <BasketAmountControl
        item={item}
        disabled={!available}
        onChange={onUpdateAmount}
        onValidityChange={onValidityChange}
      />
    </article>
  );
}
