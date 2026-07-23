"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { BasketItem } from "@/types/basket";
import { BasketEditDialog } from "./basket-edit-dialog";
import { BasketEmptyState } from "./basket-empty-state";
import { BasketLineItem } from "./basket-line-item";
import { BasketSummary } from "./basket-summary";
import { useBasket } from "./use-basket";

const needsSensitiveDetails = (item: BasketItem) => Boolean(item.metadata?.sensitiveDetailsExpired)
  || (item.intent === "waqf" && !item.ownerName?.trim())
  || (item.donationMode === "gift" && !item.giftRecipient?.trim());

export function BasketReview() {
  const { items, hydrated, updateItem, removeItem, restoreItem } = useBasket();
  const [editItem, setEditItem] = useState<BasketItem | null>(null);
  const [undoItem, setUndoItem] = useState<{ item: BasketItem; index: number } | null>(null);
  const [invalidItems, setInvalidItems] = useState<Set<string>>(new Set());
  const incomplete = useMemo(() => items.filter(needsSensitiveDetails), [items]);

  useEffect(() => {
    if (!undoItem) return;
    const timer = window.setTimeout(() => setUndoItem(null), 5000);
    return () => window.clearTimeout(timer);
  }, [undoItem]);

  useEffect(() => {
    setInvalidItems((current) => new Set([...current].filter((id) => items.some((item) => item.id === id))));
  }, [items]);

  const handleValidityChange = useCallback((id: string, valid: boolean) => {
    setInvalidItems((current) => {
      const next = new Set(current);
      if (valid) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const remove = (item: BasketItem) => {
    const index = items.findIndex((entry) => entry.id === item.id);
    removeItem(item.id);
    setUndoItem({ item, index });
  };

  if (!hydrated) {
    return <div className="basket-loading-state" role="status" aria-label="جارٍ تحميل سلة التبرعات"><span /><span /><span /></div>;
  }

  if (!items.length) return <BasketEmptyState page />;

  return (
    <>
      <section className="basket-review-header">
        <span>راجع تبرعاتك</span>
        <h1>سلة التبرعات</h1>
        <p>راجع المشاريع والمبالغ قبل المتابعة.</p>
      </section>

      <div className="basket-layout">
        <section className="basket-items-column" aria-labelledby="basket-items-title">
          <div className="basket-items-heading">
            <div><h2 id="basket-items-title">التبرعات المضافة</h2><p>يمكنك تعديل المبلغ أو إزالة أي تبرع.</p></div>
            <span>{items.length === 1 ? "تبرع واحد" : `${items.length.toLocaleString("ar")} تبرعات`}</span>
          </div>
          {items.map((item) => (
            <BasketLineItem
              key={item.id}
              item={item}
              onUpdateAmount={(amount) => updateItem(item.id, { amount })}
              onRemove={() => remove(item)}
              onEditDetails={() => setEditItem(item)}
              onValidityChange={handleValidityChange}
            />
          ))}
        </section>

        <aside className="basket-summary-column">
          <BasketSummary
            items={items}
            actionHref="/checkout"
            invalidCount={invalidItems.size}
            incompleteCount={incomplete.length}
          />
          <a className="basket-add-another" href="/projects">أضف مشروعًا آخر</a>
        </aside>
      </div>

      {editItem ? (
        <BasketEditDialog
          item={editItem}
          onClose={() => setEditItem(null)}
          onSave={(updates) => {
            updateItem(editItem.id, { ...updates, metadata: undefined });
            setEditItem(null);
          }}
        />
      ) : null}

      {undoItem ? (
        <div className="basket-undo-toast" role="status" aria-live="polite">
          <span>تمت إزالة التبرع من السلة.</span>
          <button type="button" onClick={() => {
            restoreItem(undoItem.item, undoItem.index);
            setUndoItem(null);
          }}>تراجع</button>
        </div>
      ) : null}
    </>
  );
}
