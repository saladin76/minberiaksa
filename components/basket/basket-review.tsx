"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import type { BasketItem } from "@/types/basket";
import { BasketDeleteDialog } from "./basket-delete-dialog";
import { BasketDocuments } from "./basket-documents";
import { BasketEditDialog } from "./basket-edit-dialog";
import { BasketItemCard } from "./basket-item-card";
import { BasketSummary } from "./basket-summary";
import { getIntentionCounts } from "./basket-utils";
import { useBasket } from "./use-basket";

const needsSensitiveDetails = (item: BasketItem) => Boolean(item.metadata?.sensitiveDetailsExpired)
  || (item.intent === "waqf" && !item.ownerName?.trim())
  || (item.donationMode === "gift" && !item.giftRecipient?.trim());

export function BasketReview() {
  const { items, hydrated, updateItem, removeItem, restoreItem } = useBasket();
  const [editItem, setEditItem] = useState<BasketItem | null>(null);
  const [deleteItem, setDeleteItem] = useState<BasketItem | null>(null);
  const [undoItem, setUndoItem] = useState<{ item: BasketItem; index: number } | null>(null);
  const counts = useMemo(() => getIntentionCounts(items), [items]);
  const incomplete = useMemo(() => items.filter(needsSensitiveDetails), [items]);

  useEffect(() => {
    if (!undoItem) return;
    const timer = window.setTimeout(() => setUndoItem(null), 5000);
    return () => window.clearTimeout(timer);
  }, [undoItem]);

  const closeEdit = useCallback(() => setEditItem(null), []);
  const closeDelete = useCallback(() => setDeleteItem(null), []);
  const confirmDelete = () => {
    if (!deleteItem) return;
    const index = items.findIndex((item) => item.id === deleteItem.id);
    removeItem(deleteItem.id);
    setUndoItem({ item: deleteItem, index });
    setDeleteItem(null);
  };

  if (!hydrated) return <div role="status">جارٍ استعادة سلة العطاء…</div>;

  if (!items.length) {
    return (
      <section className="basket-empty-page">
        <h1>سلة عطائك فارغة</h1>
        <p>ابدأ باختيار مشروع أو زكاة أو وقف أو خطة عطاء مستمر.</p>
        <div className="basket-empty-actions">
          <Button href="/projects">استكشف المشاريع</Button>
          <Button href="/zakat" variant="outline">احسب زكاتك</Button>
          <Button href="/waqf" variant="outline">أنشئ وقفًا</Button>
          <Button href="/recurring" variant="outline">أنشئ خطة عطاء</Button>
        </div>
      </section>
    );
  }

  const due = items
    .filter((item) => item.intent !== "recurring" && item.donationMode !== "recurring")
    .reduce((sum, item) => sum + item.amount, 0);

  return (
    <>
      <section className="basket-hero">
        <span>الخطوة 1 من 4</span>
        <h1>راجع سلة عطائك</h1>
        <p>تأكد من المشروع والنية والمبلغ والتفاصيل المرتبطة بكل مساهمة قبل المتابعة.</p>
        <ol className="basket-progress"><li aria-current="step">مراجعة السلة</li><li>بيانات المتبرع</li><li>طريقة الدفع</li><li>التأكيد</li></ol>
      </section>

      <div className="basket-layout">
        <div className="basket-items-column">
          <section>
            <h2>المساهمات والنيات</h2>
            <p>تبقى الزكاة والوقف والعطاء المستمر منفصلة بوضوح داخل السلة.</p>
            {items.map((item) => <BasketItemCard key={item.id} item={item} onEdit={() => setEditItem(item)} onDelete={() => setDeleteItem(item)} />)}
          </section>

          {incomplete.length ? (
            <section className="basket-sensitive-summary" role="status">
              <h2>بعض التفاصيل تحتاج استكمالًا</h2>
              <p>أعد إدخال البيانات المرتبطة بـ{incomplete.length} من عناصر الوقف أو الإهداء قبل الانتقال إلى إتمام التبرع.</p>
            </section>
          ) : null}

          <section className="basket-intentions">
            <h2>ملخص النيات</h2>
            {Object.entries(counts).map(([label, count]) => <p key={label}><strong>{label}</strong>: {count}</p>)}
            <small>تحافظ السلة على كل نية ومسار بصورة مستقلة.</small>
          </section>

          <BasketDocuments items={items} />

          <section className="basket-trust">
            <h2>الخصوصية قبل كل شيء</h2>
            <p>لا تُحفظ بيانات البطاقة أو تفاصيل أصول حاسبة الزكاة داخل السلة. وقد تُطلب بيانات الوقف أو الإهداء مرة أخرى عند انتهاء الجلسة لحمايتها.</p>
          </section>
        </div>

        <div>
          <BasketSummary items={items} />
          <div className="basket-page-actions">
            {incomplete.length ? <Button type="button" disabled fullWidth>استكمل التفاصيل أولًا</Button> : <Button href="/checkout" fullWidth>المتابعة لإتمام التبرع</Button>}
            <Button href="/projects" variant="outline" fullWidth>إضافة مشروع آخر</Button>
          </div>
        </div>
      </div>

      <div className="basket-mobile-bar">
        <div><span>إجمالي التبرعات لمرة واحدة</span><strong>{due.toLocaleString("en-US")} USD</strong></div>
        {incomplete.length ? <Button type="button" disabled>استكمل التفاصيل</Button> : <Button href="/checkout">المتابعة</Button>}
      </div>

      {editItem ? <BasketEditDialog item={editItem} onClose={closeEdit} onSave={(updates) => { updateItem(editItem.id, { ...updates, metadata: undefined }); setEditItem(null); }} /> : null}
      {deleteItem ? <BasketDeleteDialog title={deleteItem.projectTitle} onCancel={closeDelete} onConfirm={confirmDelete} /> : null}
      {undoItem ? <div className="basket-undo-toast" role="status" aria-live="polite"><span>تمت إزالة العنصر</span><button type="button" onClick={() => { restoreItem(undoItem.item, undoItem.index); setUndoItem(null); }}>تراجع</button></div> : null}
    </>
  );
}