"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import { Award, Download, Eye, FileText, Loader2, Mail, MessageCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { LOCALE_LABELS, SUPPORTED_LOCALES } from "@/lib/locales";
import { dashIntl, dt } from "@/lib/dashboard/i18n";
import { errorMessage } from "@/lib/dashboard/client-error-message";
import type { ManualCertificateInput } from "@/lib/certificates/manual-input";
import type { ManualPreview } from "@/lib/certificates/manual-render";

type IssuedRow = { id: string; serial: string; donorName: string; recipientName: string; kind: string; locale: string; createdAt: string; issuedAt: string; deliveryState?: Record<string, { status?: string }> | null };
const currencies = ["USD", "TRY", "EUR", "GBP", "SAR", "AED", "QAR", "KWD", "JOD", "CAD", "AUD", "CHF", "SEK", "NOK", "DKK", "JPY", "IDR", "MYR", "INR"];

export function ManualCertificatePanel({ canSendEmail, canSendWhatsapp }: { canSendEmail: boolean; canSendWhatsapp: boolean }) {
  const { toast } = useToast();
  const [form, setForm] = useState<ManualCertificateInput>({ kind: "THANKS", locale: "ar", donorName: "", recipientName: "", email: "", phone: "", projectTitle: "", amount: 0, currency: "USD", count: 1, dedicatedTo: "", note: "", issueDate: new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()), paymentMethod: "CASH", received: false });
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID());
  const [prepared, setPrepared] = useState<{ id: string; serial: string; url: string } | null>(null);
  const [preview, setPreview] = useState("");
  const [previewBundle, setPreviewBundle] = useState<ManualPreview | null>(null);
  const previewHost = useRef<HTMLDivElement>(null);
  const [previewWidth, setPreviewWidth] = useState(0);
  useEffect(() => {
    const host = previewHost.current;
    if (!host) return;
    const observer = new ResizeObserver(([entry]) => setPreviewWidth(entry.contentRect.width));
    observer.observe(host); return () => observer.disconnect();
  }, []);
  const sheetWidth = form.kind === "RECEIPT" ? 794 : 1125;
  const sheetHeight = form.kind === "RECEIPT" ? 1123 : 800;
  const previewScale = previewWidth ? Math.min(1, previewWidth / sheetWidth) : 1;
  const [busy, setBusy] = useState<"preview" | "EMAIL" | "WHATSAPP" | null>(null);
  const [rows, setRows] = useState<IssuedRow[]>([]);
  const [historyError, setHistoryError] = useState("");
  const load = useCallback(async () => {
    try { const response = await axios.get("/api/certificates/issued"); setRows(response.data.rows ?? []); setHistoryError(""); }
    catch (error) { setHistoryError(errorMessage(error, dt("تعذر تحميل سجل الشهادات"))); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const change = <K extends keyof ManualCertificateInput>(key: K, value: ManualCertificateInput[K]) => {
    setForm(previous => ({ ...previous, [key]: value })); setPrepared(null); setPreview(""); setPreviewBundle(null); setRequestKey(crypto.randomUUID());
  };
  const kinds: Record<string, string> = { THANKS: dt("شهادة تبرع وشكر"), SHARE: dt("شهادة سهم وقفي"), METER: dt("شهادة متر وقفي"), RECEIPT: dt("إيصال تبرع يدوي") };
  const readyToIssue = Boolean(prepared || (previewBundle && (form.kind !== "RECEIPT" || form.received)));
  const generatePreview = async () => {
    setBusy("preview");
    try { const response = prepared ? await axios.get(`/api/certificates/issued/${prepared.id}/preview`) : await axios.post("/api/certificates/issued/preview", form); setPreview(response.data.html); setPreviewBundle(response.data.preview ?? null); }
    catch (error) { toast({ title: dt("تعذر تجهيز المعاينة"), description: errorMessage(error, dt("راجع بيانات المستند المطلوبة")), variant: "destructive" }); }
    finally { setBusy(null); }
  };
  const send = async (channel: "EMAIL" | "WHATSAPP") => {
    setBusy(channel);
    try {
      const document = prepared ?? (await axios.post("/api/certificates/issued", { ...form, requestKey, preview: previewBundle })).data;
      setPrepared(document);
      const response = await axios.post(`/api/certificates/issued/${document.id}/send`, { channel });
      toast({ title: response.data.alreadySent ? dt("سبق إرسال هذه النسخة عبر القناة المختارة") : dt("قبل المزود إرسال المستند"), description: document.serial });
      await load();
    } catch (error) {
      const reason = axios.isAxiosError(error) ? error.response?.data?.reason : "";
      const text = reason === "DOCUMENT_TEMPLATE_APPROVAL_REQUIRED" ? dt("قالب إرسال المستندات يحتاج اعتماد لغة المستلم في Meta على الرقم الافتراضي") : reason === "DELIVERY_OUTCOME_UNCERTAIN" ? dt("نتيجة الإرسال غير مؤكدة؛ راجع السجل قبل إعادة المحاولة") : errorMessage(error, dt("تعذر إرسال المستند؛ راجع بيانات المستلم وإعدادات الإرسال"));
      toast({ title: dt("لم يتأكد الإرسال"), description: text, variant: "destructive" });
      await load();
    } finally { setBusy(null); }
  };
  const field = (key: "donorName" | "recipientName" | "email" | "phone" | "projectTitle" | "dedicatedTo", label: string, type = "text") => (
    <div className="space-y-1.5"><Label htmlFor={`certificate-${key}`}>{label}</Label><Input id={`certificate-${key}`} value={form[key]} type={type} dir={key === "email" || key === "phone" ? "ltr" : undefined} onChange={event => change(key, event.target.value)} required={key === "donorName"} /></div>
  );
  const selectClass = "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm";
  return <div className="space-y-5">
    <div className="grid gap-5 xl:grid-cols-2">
      <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Award className="h-5 w-5" />{dt("إنشاء شهادة أو إهداء")}</CardTitle><p className="text-sm text-muted-foreground">{dt("اكتب التفاصيل بلغة المستند، ثم عاينه وأرسله إلى المستلم عبر القناة التي تختارها.")}</p></CardHeader><CardContent>
        <fieldset disabled={Boolean(busy)} className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5"><Label htmlFor="certificate-kind">{dt("نوع المستند")}</Label><select id="certificate-kind" className={selectClass} value={form.kind} onChange={event => change("kind", event.target.value as ManualCertificateInput["kind"])}>{Object.entries(kinds).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
          <div className="space-y-1.5"><Label htmlFor="certificate-locale">{dt("لغة المستند والرسالة")}</Label><select id="certificate-locale" className={selectClass} value={form.locale} onChange={event => change("locale", event.target.value as ManualCertificateInput["locale"])}>{SUPPORTED_LOCALES.map(locale => <option key={locale} value={locale}>{LOCALE_LABELS[locale]}</option>)}</select></div>
          {field("donorName", dt("اسم المتبرع"))}{field("recipientName", dt("اسم المستلم إن كان مختلفًا"))}
          {field("email", dt("بريد المستلم"), "email")}{field("phone", dt("رقم واتساب مع مفتاح الدولة"), "tel")}
          {field("projectTitle", dt("المشروع أو غرض التبرع"))}
          <div className="space-y-1.5"><Label htmlFor="certificate-date">{dt("تاريخ الإصدار")}</Label><Input id="certificate-date" type="date" value={form.issueDate} onChange={event => change("issueDate", event.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="certificate-amount">{dt("المبلغ")}</Label><Input id="certificate-amount" type="number" min="0" step="0.001" value={form.amount || ""} onChange={event => change("amount", Number(event.target.value))} /></div>
          <div className="space-y-1.5"><Label htmlFor="certificate-currency">{dt("العملة")}</Label><select id="certificate-currency" className={selectClass} value={form.currency} onChange={event => change("currency", event.target.value)}>{currencies.map(currency => <option key={currency}>{currency}</option>)}</select></div>
          {(form.kind === "SHARE" || form.kind === "METER") && <><div className="space-y-1.5"><Label htmlFor="certificate-count">{dt("عدد الأسهم أو الأمتار")}</Label><Input id="certificate-count" type="number" min="1" step="1" value={form.count} onChange={event => change("count", Number(event.target.value))} /></div>{field("dedicatedTo", dt("الإهداء أو الوقف نيابة عن"))}</>}
          <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="certificate-note">{dt("تفاصيل إضافية بلغة المستند")}</Label><Textarea id="certificate-note" maxLength={400} value={form.note} onChange={event => change("note", event.target.value)} /></div>
          {form.kind === "RECEIPT" && <><div className="space-y-1.5"><Label htmlFor="certificate-method">{dt("طريقة استلام المبلغ")}</Label><select id="certificate-method" className={selectClass} value={form.paymentMethod} onChange={event => change("paymentMethod", event.target.value as ManualCertificateInput["paymentMethod"])}><option value="CASH">{dt("نقدي")}</option><option value="BANK_TRANSFER">{dt("تحويل بنكي")}</option><option value="CARD">{dt("بطاقة")}</option><option value="PAYPAL">PayPal</option></select></div><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.received} onChange={event => change("received", event.target.checked)} />{dt("أؤكد استلام المبلغ المدون في الإيصال")}</label></>}
        </fieldset>
        <p className="mt-4 rounded-lg bg-muted p-3 text-xs leading-6 text-muted-foreground">{dt("إصدار المستند وإرساله لا يضيف تبرعًا إلى الحسابات. لتسجيل المبلغ ماليًا استخدم إضافة تبرع.")}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="outline" disabled={Boolean(busy)} onClick={() => void generatePreview()}>{busy === "preview" ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <Eye className="me-2 h-4 w-4" />}{dt("معاينة المستند")}</Button>
          {canSendWhatsapp && <Button disabled={Boolean(busy) || !form.phone || !readyToIssue} onClick={() => void send("WHATSAPP")} className="bg-emerald-600 text-white hover:bg-emerald-700">{busy === "WHATSAPP" ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <MessageCircle className="me-2 h-4 w-4" />}{dt("إرسال واتساب")}</Button>}
          {canSendEmail && <Button disabled={Boolean(busy) || !form.email || !readyToIssue} onClick={() => void send("EMAIL")}>{busy === "EMAIL" ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <Mail className="me-2 h-4 w-4" />}{dt("إرسال بريد")}</Button>}
          {prepared && <Button asChild variant="outline"><a href={prepared.url} target="_blank" rel="noreferrer"><Download className="me-2 h-4 w-4" />{dt("تحميل النسخة الصادرة")}</a></Button>}
        </div>
      </CardContent></Card>
      <Card><CardHeader><CardTitle className="text-base">{dt("معاينة بنفس تصميم المستند النهائي")}</CardTitle></CardHeader><CardContent><div ref={previewHost}>{preview ? <div className="relative overflow-hidden rounded-xl border bg-white" style={{ height: sheetHeight * previewScale }}><iframe title={dt("معاينة الشهادة")} sandbox="" srcDoc={preview} className="absolute start-0 top-0 border-0 bg-white" style={{ width: sheetWidth, height: sheetHeight, transform: `scale(${previewScale})`, transformOrigin: "top left", left: 0, right: "auto" }} /></div> : <div className="flex min-h-[420px] flex-col items-center justify-center gap-4 rounded-xl border border-dashed bg-muted/30 p-8 text-center text-muted-foreground"><FileText className="h-12 w-12 opacity-40" /><p>{dt("أكمل البيانات واضغط معاينة لعرض الشهادة قبل إرسالها")}</p></div>}</div></CardContent></Card>
    </div>
    <Card><CardHeader className="flex-row items-center justify-between"><CardTitle className="text-base">{dt("آخر الشهادات والإهداءات الصادرة")}</CardTitle><Button size="sm" variant="outline" onClick={() => void load()}><RefreshCw className="me-2 h-4 w-4" />{dt("تحديث")}</Button></CardHeader><CardContent>
      {historyError && <p role="alert" className="text-sm text-destructive">{historyError}</p>}
      <div className="overflow-x-auto"><table className="w-full text-start text-sm"><thead><tr className="border-b text-muted-foreground">{[dt("رقم المستند"), dt("المتبرع / المستلم"), dt("نوع المستند"), dt("اللغة"), dt("الإرسال"), dt("تاريخ الإصدار")].map(label => <th className="p-3 text-start font-medium" key={label}>{label}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={row.id} className="border-b last:border-0"><td className="p-3"><a target="_blank" rel="noreferrer" href={`/api/certificates/issued/${row.id}`} className="font-mono text-xs underline">{row.serial}</a></td><td className="p-3">{row.donorName}{row.recipientName !== row.donorName && <span className="block text-xs text-muted-foreground">{row.recipientName}</span>}</td><td className="p-3">{kinds[row.kind] || row.kind}</td><td className="p-3">{row.locale.toUpperCase()}</td><td className="p-3">{[row.deliveryState?.EMAIL?.status === "SENT" ? dt("بريد") : "", row.deliveryState?.WHATSAPP?.status === "SENT" ? dt("واتساب") : ""].filter(Boolean).join(" · ") || dt("لم يتأكد الإرسال")}</td><td className="p-3 whitespace-nowrap">{new Date(row.issuedAt || row.createdAt).toLocaleDateString(dashIntl("ar-EG"))}</td></tr>)}</tbody></table>{!rows.length && !historyError && <p className="p-6 text-center text-muted-foreground">{dt("لم تصدر شهادات يدوية بعد")}</p>}</div>
    </CardContent></Card>
  </div>;
}
