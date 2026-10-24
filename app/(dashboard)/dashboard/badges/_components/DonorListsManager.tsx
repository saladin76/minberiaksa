"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { FileUp, ListPlus, Loader2, Plus, Search, Trash2, Users, Upload, UserRoundPlus } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "react-hot-toast";
import { dt, dtx } from "@/lib/dashboard/i18n";
import { parseDonorListCsv } from "@/lib/donor-lists/core";

type DonorList = { id: string; name: string; description: string | null; contactCount: number; updatedAt: string };
type Contact = { id: string; name: string; email: string | null; phone: string | null; createdAt: string };

export function DonorListsManager() {
  const [lists, setLists] = useState<DonorList[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [savingList, setSavingList] = useState(false);
  const [adding, setAdding] = useState(false);
  const [listName, setListName] = useState("");
  const [manual, setManual] = useState({ name: "", email: "", phone: "" });
  const [csvText, setCsvText] = useState("");
  const [csvName, setCsvName] = useState("");
  const [query, setQuery] = useState("");

  const loadLists = useCallback(async (preferredId?: string) => {
    setLoading(true);
    try {
      const response = await axios.get("/api/admin/donor-lists");
      const nextLists = (response.data?.lists ?? []) as DonorList[];
      setLists(nextLists);
      setSelectedId((current) => {
        const wanted = preferredId || current;
        return nextLists.some((list) => list.id === wanted) ? wanted : nextLists[0]?.id ?? "";
      });
    } catch {
      toast.error(dt("تعذّر تحميل قوائم المتبرعين"));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadContacts = useCallback(async (listId: string, nextPage = 1) => {
    if (!listId) { setContacts([]); setTotal(0); return; }
    setContactsLoading(true);
    try {
      const response = await axios.get("/api/admin/donor-lists/" + listId + "/contacts", { params: { page: nextPage } });
      setContacts(response.data?.contacts ?? []);
      setTotal(Number(response.data?.total) || 0);
      setPage(nextPage);
    } catch {
      toast.error(dt("تعذّر تحميل جهات الاتصال"));
    } finally {
      setContactsLoading(false);
    }
  }, []);

  useEffect(() => { void loadLists(); }, [loadLists]);
  useEffect(() => { void loadContacts(selectedId, 1); }, [selectedId, loadContacts]);

  const selectedList = lists.find((list) => list.id === selectedId) ?? null;
  const visibleContacts = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return contacts;
    return contacts.filter((contact) => [contact.name, contact.email, contact.phone].some((value) => value?.toLowerCase().includes(term)));
  }, [contacts, query]);

  const createList = async () => {
    const name = listName.trim();
    if (!name || name.length > 100) return toast.error(dt("أدخل اسمًا للقائمة من 1 إلى 100 حرف"));
    setSavingList(true);
    try {
      const response = await axios.post("/api/admin/donor-lists", { name });
      setListName("");
      await loadLists(response.data.list.id);
      toast.success(dt("تم إنشاء القائمة"));
    } catch {
      toast.error(dt("تعذّر إنشاء القائمة"));
    } finally {
      setSavingList(false);
    }
  };

  const addContacts = async (rows: Array<{ name: string; email?: string; phone?: string }>) => {
    if (!selectedId) return toast.error(dt("أنشئ قائمة أو اختر قائمة أولًا"));
    setAdding(true);
    try {
      const response = await axios.post("/api/admin/donor-lists/" + selectedId + "/contacts", { contacts: rows });
      toast.success(dt("أُضيف {0} وتُجاوز {1} مكررًا", [response.data.inserted, response.data.skipped]));
      setManual({ name: "", email: "", phone: "" });
      setCsvText("");
      setCsvName("");
      await Promise.all([loadLists(selectedId), loadContacts(selectedId, 1)]);
    } catch (error: unknown) {
      const status = (error as { response?: { status?: number } })?.response?.status;
      toast.error(status === 400 ? dt("تحقق من الاسم والبريد ورقم الهاتف ثم أعد المحاولة.") : dt("تعذّر إضافة جهات الاتصال"));
    } finally {
      setAdding(false);
    }
  };

  const addManual = () => {
    const name = manual.name.trim();
    const email = manual.email.trim();
    const phone = manual.phone.trim();
    if (!name || (!email && !phone)) return toast.error(dt("أدخل الاسم والبريد أو رقم الهاتف على الأقل"));
    void addContacts([{ name, email, phone }]);
  };

  const importCsv = () => {
    const parsed = parseDonorListCsv(csvText);
    if (parsed.errors.length) {
      const reason = parsed.errors[0];
      if (reason.includes("2 MB")) toast.error(dt("الحد الأقصى لحجم الملف 2 ميغابايت"));
      else if (reason.includes("250")) toast.error(dt("يمكن استيراد 250 جهة اتصال كحد أقصى في كل مرة"));
      else if (reason.includes("header")) toast.error(dt("يجب أن تتضمن رؤوس CSV الاسم والبريد أو الهاتف، بأسماء الأعمدة الموضحة."));
      else toast.error(dt("تحقق من صفوف CSV؛ الاسم مطلوب ويجب إدخال بريد أو هاتف صحيح."));
      return;
    }
    void addContacts(parsed.contacts);
  };

  const removeContact = async (contact: Contact) => {
    if (!window.confirm(dt("إزالة {0} من هذه القائمة؟", [contact.name]))) return;
    try {
      await axios.delete("/api/admin/donor-lists/" + selectedId + "/contacts/" + contact.id);
      toast.success(dt("تمت إزالة جهة الاتصال"));
      await Promise.all([loadLists(selectedId), loadContacts(selectedId, page)]);
    } catch {
      toast.error(dt("تعذّرت إزالة جهة الاتصال"));
    }
  };

  return (
    <div className="space-y-5">
      <Card className="border-sky-200 bg-sky-50/50">
        <CardContent className="flex items-start gap-3 p-4 text-sm leading-6 text-sky-950">
          <Users className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <p>{dt("القوائم اليدوية تحفظ بيانات الاتصال التي تدخلها فقط. لا تنشئ حسابات، ولا تغيّر الموافقات، ولا ترسل رسائل تلقائيًا.")}</p>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[minmax(16rem,0.8fr)_minmax(0,1.5fr)]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><ListPlus className="h-4 w-4 text-brand" />{dt("قوائم المتبرعين")}</CardTitle>
            <CardDescription>{dtx("عدد القوائم: {0}", [lists.length])}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Input value={listName} maxLength={100} onChange={(event) => setListName(event.target.value)} placeholder={dt("اسم القائمة")} aria-label={dt("اسم القائمة")} />
              <Button type="button" onClick={createList} disabled={savingList || !listName.trim()} aria-label={dt("إنشاء قائمة")} title={dt("إنشاء قائمة")}>
                {savingList ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              </Button>
            </div>
            {loading ? <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div> : lists.length === 0 ? (
              <div className="rounded-lg border border-dashed p-5 text-center text-sm text-slate-500">{dt("لا توجد قوائم بعد. أنشئ قائمة لتبدأ.")}</div>
            ) : (
              <div className="max-h-[28rem] space-y-2 overflow-y-auto">
                {lists.map((list) => (
                  <button key={list.id} type="button" onClick={() => setSelectedId(list.id)} className={"w-full rounded-xl border p-3 text-start transition-colors " + (selectedId === list.id ? "border-brand bg-brand-50" : "border-slate-200 hover:bg-slate-50")}>
                    <span className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate font-semibold">{list.name}</span>
                      <Badge variant="secondary">{list.contactCount}</Badge>
                    </span>
                    <span className="mt-1 block text-xs text-slate-500">{dt("جهة اتصال")}</span>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base"><UserRoundPlus className="h-4 w-4 text-brand" />{dt("إضافة يدوية")}</CardTitle>
                <CardDescription>{dt("أدخل الاسم وبريدًا إلكترونيًا أو رقم هاتف على الأقل.")}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div><Label htmlFor="donor-contact-name">{dt("الاسم")}</Label><Input id="donor-contact-name" value={manual.name} maxLength={120} onChange={(event) => setManual({ ...manual, name: event.target.value })} /></div>
                <div><Label htmlFor="donor-contact-email">{dt("البريد الإلكتروني")}</Label><Input id="donor-contact-email" type="email" dir="ltr" value={manual.email} maxLength={254} onChange={(event) => setManual({ ...manual, email: event.target.value })} /></div>
                <div><Label htmlFor="donor-contact-phone">{dt("رقم الهاتف")}</Label><Input id="donor-contact-phone" type="tel" dir="ltr" value={manual.phone} maxLength={40} onChange={(event) => setManual({ ...manual, phone: event.target.value })} /></div>
                <Button type="button" onClick={addManual} disabled={adding || !selectedId} className="w-full gap-2"><Plus className="h-4 w-4" />{dt("إضافة إلى القائمة")}</Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base"><FileUp className="h-4 w-4 text-brand" />{dt("رفع ملف CSV")}</CardTitle>
                <CardDescription>{dt("الأعمدة المطلوبة: name,email,phone. يكفي البريد أو الهاتف مع الاسم.")}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Label htmlFor="donor-list-csv" className="sr-only">{dt("اختيار ملف CSV")}</Label>
                <Input key={csvName || "donor-csv"} id="donor-list-csv" type="file" accept=".csv,text/csv" disabled={!selectedId || adding} onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  if (file.size > 2_000_000) { toast.error(dt("الحد الأقصى لحجم الملف 2 ميغابايت")); event.target.value = ""; return; }
                  setCsvName(file.name);
                  setCsvText(await file.text());
                }} />
                <Textarea value={csvText} onChange={(event) => setCsvText(event.target.value)} rows={5} dir="auto" placeholder={"name,email,phone\nSamira,samira@example.org,+905551112233"} aria-label={dt("محتوى ملف CSV")} />
                {csvName && <p className="text-xs text-slate-500">{dt("الملف المختار")}: {csvName}</p>}
                <Button type="button" variant="outline" onClick={importCsv} disabled={adding || !selectedId || !csvText.trim()} className="w-full gap-2">
                  {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}{dt("استيراد إلى القائمة")}
                </Button>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="text-base">{selectedList?.name ?? dt("جهات الاتصال")}</CardTitle>
                <CardDescription>{dtx("إجمالي الجهات: {0} · يعرض حتى 250 في الصفحة", [total])}</CardDescription>
              </div>
              <div className="relative w-full sm:w-64">
                <Search className="absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={dt("بحث في الجهات المعروضة حاليًا")} className="pe-9" aria-label={dt("بحث في الجهات المعروضة حاليًا")} />
              </div>
            </CardHeader>
            <CardContent>
              {!selectedId ? <p className="rounded-lg border border-dashed p-6 text-center text-sm text-slate-500">{dt("اختر قائمة أو أنشئ واحدة لعرض جهات الاتصال.")}</p> : contactsLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
              ) : visibleContacts.length === 0 ? (
                <p className="rounded-lg border border-dashed p-6 text-center text-sm text-slate-500">{query ? dt("لا توجد نتائج مطابقة") : dt("القائمة فارغة. أضف جهة يدويًا أو ارفع ملف CSV.")}</p>
              ) : (
                <div className="space-y-2">
                  {visibleContacts.map((contact) => (
                    <div key={contact.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{contact.name}</p>
                        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500" dir="auto">
                          {contact.email && <span>{contact.email}</span>}
                          {contact.phone && <span>{contact.phone}</span>}
                        </div>
                      </div>
                      <Button type="button" variant="ghost" size="icon" onClick={() => void removeContact(contact)} aria-label={dt("إزالة {0}", [contact.name])} title={dt("إزالة من القائمة")}>
                        <Trash2 className="h-4 w-4 text-rose-600" />
                      </Button>
                    </div>
                  ))}
                  <div className="flex items-center justify-between pt-2 text-xs text-slate-500">
                    <span>{dt("صفحة")} {page} {dt("من")} {Math.max(1, Math.ceil(total / 250))}</span>
                    <div className="flex gap-2">
                      <Button type="button" variant="outline" size="sm" disabled={page <= 1 || contactsLoading} onClick={() => void loadContacts(selectedId, page - 1)}>{dt("السابق")}</Button>
                      <Button type="button" variant="outline" size="sm" disabled={page * 250 >= total || contactsLoading} onClick={() => void loadContacts(selectedId, page + 1)}>{dt("التالي")}</Button>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
