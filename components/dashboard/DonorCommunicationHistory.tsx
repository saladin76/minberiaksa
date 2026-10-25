"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { dashDir, dashIntl, dt } from "@/lib/dashboard/i18n";

type Item = { id: string; source: "delivery" | "legacy"; channel: string; status: string; templateName: string | null; renderedSubject: string | null; createdAt: string; errorMessage: string | null; deliveredAt: string | null; readAt: string | null; openedAt: string | null; clickedAt: string | null };
type Detail = { renderedBody: string | null; renderedSubject: string | null; channel: string };
const EMAIL_CSP = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:;">`;

export function DonorCommunicationHistory({ userId }: { userId: string }) {
  const [channel, setChannel] = useState("");
  const [donor, setDonor] = useState<{ name: string | null; email: string | null } | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [details, setDetails] = useState<Record<string, Detail>>({});
  const [detailErrors, setDetailErrors] = useState<Record<string, boolean>>({});
  const sequence = useRef(0);
  const endpoint = `/api/dashboard/donors/${userId}/communication`;

  async function load(cursor: string | null = null) {
    const token = ++sequence.current;
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams({ channel, ...(cursor ? { cursor } : {}) });
      const response = await fetch(`${endpoint}?${params}`, { cache: "no-store" });
      if (!response.ok) throw new Error();
      const data = await response.json();
      if (token !== sequence.current) return;
      setDonor(data.donor); setNext(data.next); setItems((old) => cursor ? [...old, ...data.items] : data.items);
    } catch { if (token === sequence.current) setError(dt("تعذّر تحميل سجل الرسائل. أعد المحاولة.")); }
    finally { if (token === sequence.current) setLoading(false); }
  }
  useEffect(() => { setItems([]); setDetails({}); setNext(null); void load(); return () => { sequence.current++; }; }, [userId, channel]); // eslint-disable-line react-hooks/exhaustive-deps

  async function detail(item: Item) {
    const key = `${item.source}:${item.id}`;
    try {
      const response = await fetch(`${endpoint}?${new URLSearchParams({ messageId: item.id, source: item.source })}`, { cache: "no-store" });
      if (!response.ok) throw new Error();
      const data = await response.json(); setDetails((old) => ({ ...old, [key]: data.item })); setDetailErrors((old) => ({ ...old, [key]: false }));
    } catch { setDetailErrors((old) => ({ ...old, [key]: true })); }
  }
  const date = (value: string) => new Date(value).toLocaleString(dashIntl("ar-EG"));
  return <main className="space-y-5 p-4 md:p-6" dir={dashDir()}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-xl font-bold">{dt("سجل تواصل المتبرع")}</h1><p className="text-sm text-muted-foreground">{donor?.name || donor?.email || "—"}</p></div>
      <Button asChild variant="outline"><Link href="/dashboard/users/donors">{dt("المتبرعون")}</Link></Button>
    </div>
    <div className="flex flex-wrap gap-3">
      <select aria-label={dt("القناة")} className="rounded-md border bg-background p-2" value={channel} onChange={(event) => setChannel(event.target.value)}>
        <option value="">{dt("جميع القنوات")}</option><option value="WHATSAPP">{dt("واتساب")}</option><option value="EMAIL">{dt("البريد الإلكتروني")}</option><option value="SMS">SMS</option>
      </select>
      <Button variant="outline" disabled={loading} onClick={() => void load()}>{dt("تحديث")}</Button>
    </div>
    <p className="text-sm text-muted-foreground">{dt("الرسائل المرسلة لهذا المتبرع عبر واتساب والبريد وSMS، مع أحدث حالة تسليم متاحة. السجلات القديمة التي لا تحمل هوية المتبرع لا تُنسب إليه بالتخمين.")}</p>
    {error && <p role="alert" className="rounded border border-red-200 p-3 text-red-700">{error}</p>}
    {!loading && !error && !items.length && <p>{dt("لا توجد رسائل مسجلة لهذا المتبرع.")}</p>}
    <div className="space-y-3">{items.map((item) => {
      const key = `${item.source}:${item.id}`; const content = details[key];
      return <article key={key} className="space-y-2 rounded-xl border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2"><strong>{item.channel} · {item.renderedSubject || item.templateName || dt("رسالة")}</strong><time className="text-xs text-muted-foreground">{date(item.createdAt)}</time></div>
        <p className="text-sm">{dt("الحالة")}: <span dir="ltr">{item.status}</span>{item.source === "legacy" ? ` · ${dt("سجل سابق")}` : ""}</p>
        <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">{([["تم التسليم", item.deliveredAt], ["تمت القراءة", item.readAt], ["تم الفتح", item.openedAt], ["تم النقر", item.clickedAt]] as const).map(([label, value]) => value ? <span key={label}>{dt(label)}: {date(value)}</span> : null)}</div>
        {item.errorMessage && <p className="text-sm text-red-700">{item.errorMessage}</p>}
        <details onToggle={(event) => { if (event.currentTarget.open && !content) void detail(item); }}><summary className="cursor-pointer text-sm font-medium">{dt("عرض محتوى الرسالة")}</summary>
          {detailErrors[key] ? <Button variant="outline" onClick={() => void detail(item)}>{dt("إعادة المحاولة")}</Button> : content ? content.channel === "EMAIL" ? <iframe title={dt("محتوى البريد")} sandbox="" referrerPolicy="no-referrer" srcDoc={EMAIL_CSP + (content.renderedBody ?? "")} className="mt-3 h-96 w-full rounded border bg-white" /> : <p className="mt-3 whitespace-pre-wrap text-sm" dir="auto">{content.renderedBody || dt("المحتوى غير محفوظ")}</p> : <p>{dt("جارٍ التحميل…")}</p>}
        </details>
      </article>;
    })}</div>
    {loading && <p role="status">{dt("جارٍ التحميل…")}</p>}
    {next && <Button disabled={loading} onClick={() => void load(next)}>{dt("عرض المزيد")}</Button>}
  </main>;
}
