import type { BasketItem } from "@/types/basket";
import { getBasketDocuments } from "./basket-utils";

export function BasketDocuments({ items }: { items: BasketItem[] }) {
  const documents = getBasketDocuments(items);
  if (!documents.length) return null;
  return <section className="basket-documents" aria-labelledby="basket-documents-title"><div className="checkout-section-heading"><span>Preview only</span><h2 id="basket-documents-title">الوثائق المتوقعة</h2><p>تظهر فقط الوثائق المرتبطة بعناصر سلتك الحالية.</p></div><div>{documents.map((document) => <article key={document.id}><span aria-hidden="true">▤</span><div><h3>{document.title}</h3><p>{document.description}</p><small>Preview only · سيُنشأ بعد الدفع الحقيقي</small></div></article>)}</div></section>;
}
