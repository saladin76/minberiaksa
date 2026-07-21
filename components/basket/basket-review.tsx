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

const needsSensitiveDetails = (item: BasketItem) => Boolean(item.metadata?.sensitiveDetailsExpired) || (item.intent === "waqf" && !item.ownerName?.trim()) || (item.donationMode === "gift" && !item.giftRecipient?.trim());
export function BasketReview() {
  const { items, hydrated, updateItem, removeItem, restoreItem } = useBasket();
  const [editItem, setEditItem] = useState<BasketItem | null>(null);
  const [deleteItem, setDeleteItem] = useState<BasketItem | null>(null);
  const [undoItem, setUndoItem] = useState<{ item: BasketItem; index: number } | null>(null);
  const counts = useMemo(() => getIntentionCounts(items), [items]);
  const incomplete = useMemo(() => items.filter(needsSensitiveDetails), [items]);
  useEffect(() => { if (!undoItem) return; const timer = setTimeout(() => setUndoItem(null), 5000); return () => clearTimeout(timer); }, [undoItem]);
  const closeEdit = useCallback(() => setEditItem(null), []);
  const closeDelete = useCallback(() => setDeleteItem(null), []);
  const confirmDelete = () => { if (!deleteItem) return; const index = items.findIndex((item) => item.id === deleteItem.id); removeItem(deleteItem.id); setUndoItem({ item: deleteItem, index }); setDeleteItem(null); };
  if (!hydrated) return <div role="status">جارٍ استعادة سلة العطاء التجريبية…</div>;
  if (!items.length) return <section className="basket-empty-page"><h1>سلة عطائك فارغة</h1><p>ابدأ باختيار مشروع أو زكاة أو وقف أو خطة عطاء مستمر.</p><div className="basket-empty-actions"><Button href="/projects">استكشف المشاريع</Button><Button href="/zakat" variant="outline">احسب زكاتك</Button><Button href="/waqf" variant="outline">أنشئ وقفًا</Button><Button href="/recurring" variant="outline">فعّل عطاءً مستمرًا</Button></div></section>;
  const due = items.filter((item) => item.intent !== "recurring" && item.donationMode !== "recurring").reduce((sum, item) => sum + item.amount, 0);
  return <><section className="basket-hero"><span>الخطوة 1 من 4</span><h1>راجع سلة عطائك</h1><p>تأكد من المشروع والنية والمبلغ والتفاصيل المرتبطة بكل مساهمة قبل المتابعة.</p><ol className="basket-progress"><li aria-current="step">مراجعة السلة</li><li>بيانات المتبرع</li><li>طريقة الدفع</li><li>التأكيد</li></ol></section><div className="basket-layout"><div className="basket-items-column"><section><h2>نيات ومساهمات السلة</h2><p>لا يتم دمج النيات أو أصحاب الأوقاف أو الخطط المختلفة.</p>{items.map((item) => <BasketItemCard key={item.id} item={item} onEdit={() => setEditItem(item)} onDelete={() => setDeleteItem(item)}/>)}</section>{incomplete.length ? <section className="basket-sensitive-summary" role="status"><h2>التفاصيل تحتاج استكمالًا</h2><p>أعد إدخال التفاصيل الشخصية في {incomplete.length} عناصر قبل الانتقال إلى Checkout. هذا السلوك مقصود لحماية الخصوصية.</p></section> : null}<section className="basket-intentions"><h2>نياتك في هذه السلة</h2>{Object.entries(counts).map(([label, count]) => <p key={label}><strong>{label}</strong>: {count}</p>)}<small>كل نية ستبقى منفصلة داخل السجل والإيصال والتوثيق.</small></section><BasketDocuments items={items}/><section className="basket-trust"><h2>الخصوصية والثقة</h2><p>يُحفظ محتوى السلة غير الشخصي داخل sessionStorage لهذه الجلسة فقط. لا تُحفظ بيانات المتبرع أو البطاقة أو مدخلات حاسبة الزكاة.</p></section></div><div><BasketSummary items={items}/><div className="basket-page-actions">{incomplete.length ? <Button type="button" disabled fullWidth>استكمل التفاصيل أولًا</Button> : <Button href="/checkout" fullWidth>المتابعة إلى Checkout</Button>}<Button href="/projects" variant="outline" fullWidth>إضافة مشروع آخر</Button></div></div></div><div className="basket-mobile-bar"><div><span>الدفع لمرة واحدة</span><strong>{due.toLocaleString("en-US")} USD</strong></div>{incomplete.length ? <Button type="button" disabled>استكمل التفاصيل</Button> : <Button href="/checkout">المتابعة</Button>}</div>{editItem ? <BasketEditDialog item={editItem} onClose={closeEdit} onSave={(updates) => { updateItem(editItem.id, { ...updates, metadata: undefined }); setEditItem(null); }}/> : null}{deleteItem ? <BasketDeleteDialog title={deleteItem.projectTitle} onCancel={closeDelete} onConfirm={confirmDelete}/> : null}{undoItem ? <div className="basket-undo-toast" role="status" aria-live="polite"><span>تمت إزالة العنصر</span><button type="button" onClick={() => { restoreItem(undoItem.item, undoItem.index); setUndoItem(null); }}>تراجع</button></div> : null}</>;
}
