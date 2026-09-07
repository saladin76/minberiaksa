"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type BankOption = { id: string | null; code: string | null; nameAr: string; isActive?: boolean };
const PROJECT_OPTIONS = ["تبرع عام", "زكاة", "فلسطين / غزة", "إفريقيا", "الأضاحي / القربان", "كفالة الأيتام", "إطعام / وجبات", "المشاريع الطبية"];

function ensureToolsNode() {
  const h1 = document.querySelector("main h1");
  if (!h1 || !h1.textContent?.includes("التحويلات البنكية")) return null;
  const tables = Array.from(document.querySelectorAll("table")) as HTMLTableElement[];
  const donorTable = tables.find((table) => (table.textContent || "").includes("لغة المتبرع") && (table.textContent || "").includes("المشروع"));
  const card = donorTable?.closest("div.rounded-xl, div.border")?.parentElement?.closest("div.rounded-xl, div.border, div.bg-white") as HTMLElement | null;
  const host = card ?? donorTable?.parentElement;
  if (!host || !host.parentElement) return null;
  let node = document.getElementById("bank-transfers-table-tools");
  if (!node) {
    node = document.createElement("div");
    node.id = "bank-transfers-table-tools";
    node.dir = "rtl";
  }
  if (node.parentElement !== host.parentElement || node.nextElementSibling !== host) host.insertAdjacentElement("beforebegin", node);
  return node;
}

export function BankTransfersTableTools() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [node, setNode] = useState<HTMLElement | null>(null);
  const [q, setQ] = useState(searchParams.get("q") ?? "");
  const [banks, setBanks] = useState<BankOption[]>([]);
  const active = pathname === "/dashboard/bank-transfers" || pathname.startsWith("/dashboard/bank-transfers/");
  const page = Math.max(1, Number(searchParams.get("page") || 1));
  const limit = searchParams.get("limit") || "50";

  useEffect(() => {
    if (!active) { setNode(null); return; }
    const refresh = () => setNode(ensureToolsNode());
    refresh();
    const timer = window.setInterval(refresh, 700);
    return () => window.clearInterval(timer);
  }, [active, pathname]);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    fetch("/api/admin/bank-transfers/banks", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { if (!cancelled && Array.isArray(data?.banks)) setBanks(data.banks); })
      .catch(() => { if (!cancelled) setBanks([]); });
    return () => { cancelled = true; };
  }, [active]);

  function setParam(key: string, value: string, resetPage = true) {
    const params = new URLSearchParams(searchParams.toString());
    if (!value || value === "all") params.delete(key); else params.set(key, value);
    if (resetPage) params.set("page", "1");
    router.replace(`${pathname}?${params.toString()}`);
  }
  function go(delta: number) { setParam("page", String(Math.max(1, page + delta)), false); }
  function applySearch() { setParam("q", q.trim()); }
  function clearFilters() { setQ(""); router.replace(pathname); }

  if (!active || !node) return null;

  return createPortal(
    <Card className="mb-4">
      <CardHeader className="pb-3"><CardTitle className="text-base">فلترة و بحث العمليات البنكية</CardTitle><CardDescription>فلترة احترافية من قاعدة البيانات حسب البنك والمشروع والحالة والعملة واللغة والتاريخ والقيمة.</CardDescription></CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 md:grid-cols-4">
          <div className="space-y-1.5 md:col-span-2"><Label>بحث عام</Label><div className="flex gap-2"><Input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") applySearch(); }} placeholder="اسم، وصف، مشروع، مرجع..." /><Button onClick={applySearch}>بحث</Button></div></div>
          <div className="space-y-1.5"><Label>البنك</Label><Select value={searchParams.get("bankId") ?? "all"} onValueChange={(v) => setParam("bankId", v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">كل البنوك</SelectItem>{banks.filter((b) => b.isActive !== false).map((bank) => { const value = bank.id ?? bank.code ?? bank.nameAr; return <SelectItem key={value} value={value}>{bank.nameAr}</SelectItem>; })}</SelectContent></Select></div>
          <div className="space-y-1.5"><Label>المشروع</Label><Select value={searchParams.get("project") ?? "all"} onValueChange={(v) => setParam("project", v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">كل المشاريع</SelectItem>{PROJECT_OPTIONS.map((project) => <SelectItem key={project} value={project}>{project}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1.5"><Label>الحالة</Label><Select value={searchParams.get("status") ?? "all"} onValueChange={(v) => setParam("status", v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">الكل</SelectItem><SelectItem value="PENDING_REVIEW">قيد المراجعة</SelectItem><SelectItem value="APPROVED">معتمد</SelectItem><SelectItem value="IGNORED">مستبعد</SelectItem></SelectContent></Select></div>
          <div className="space-y-1.5"><Label>العملة</Label><Select value={searchParams.get("currency") ?? "all"} onValueChange={(v) => setParam("currency", v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">كل العملات</SelectItem><SelectItem value="USD">USD</SelectItem><SelectItem value="TRY">TRY</SelectItem><SelectItem value="EUR">EUR</SelectItem></SelectContent></Select></div>
          <div className="space-y-1.5"><Label>لغة المتبرع</Label><Select value={searchParams.get("donorLocale") ?? "all"} onValueChange={(v) => setParam("donorLocale", v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">كل اللغات</SelectItem><SelectItem value="ar">عربي</SelectItem><SelectItem value="tr">تركي</SelectItem><SelectItem value="en">إنجليزي</SelectItem><SelectItem value="fr">فرنسي</SelectItem><SelectItem value="de">ألماني</SelectItem><SelectItem value="es">إسباني</SelectItem><SelectItem value="pt">برتغالي</SelectItem><SelectItem value="id">إندونيسي</SelectItem></SelectContent></Select></div>
          <div className="space-y-1.5"><Label>من تاريخ</Label><Input type="date" value={searchParams.get("dateFrom") ?? ""} onChange={(e) => setParam("dateFrom", e.target.value)} /></div>
          <div className="space-y-1.5"><Label>إلى تاريخ</Label><Input type="date" value={searchParams.get("dateTo") ?? ""} onChange={(e) => setParam("dateTo", e.target.value)} /></div>
          <div className="space-y-1.5"><Label>قيمة من</Label><Input type="number" value={searchParams.get("amountMin") ?? ""} onChange={(e) => setParam("amountMin", e.target.value)} /></div>
          <div className="space-y-1.5"><Label>قيمة إلى</Label><Input type="number" value={searchParams.get("amountMax") ?? ""} onChange={(e) => setParam("amountMax", e.target.value)} /></div>
          <div className="space-y-1.5"><Label>ترتيب حسب</Label><Select value={searchParams.get("sortBy") ?? "createdAt"} onValueChange={(v) => setParam("sortBy", v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="createdAt">تاريخ الإدخال</SelectItem><SelectItem value="transactionDate">تاريخ العملية</SelectItem><SelectItem value="amount">القيمة</SelectItem><SelectItem value="donorName">الاسم</SelectItem><SelectItem value="bankId">البنك</SelectItem><SelectItem value="status">الحالة</SelectItem><SelectItem value="donorLocale">اللغة</SelectItem><SelectItem value="finalProject">المشروع</SelectItem></SelectContent></Select></div>
          <div className="space-y-1.5"><Label>الاتجاه</Label><Select value={searchParams.get("sortDir") ?? "desc"} onValueChange={(v) => setParam("sortDir", v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="desc">تنازلي</SelectItem><SelectItem value="asc">تصاعدي</SelectItem></SelectContent></Select></div>
          <div className="space-y-1.5"><Label>عدد الصفوف</Label><Select value={limit} onValueChange={(v) => setParam("limit", v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="25">25</SelectItem><SelectItem value="50">50</SelectItem><SelectItem value="100">100</SelectItem><SelectItem value="200">200</SelectItem></SelectContent></Select></div>
          <div className="flex items-end gap-2"><Button variant="outline" onClick={() => go(-1)} disabled={page <= 1}>السابق</Button><Button variant="outline" onClick={() => go(1)}>التالي</Button><Button variant="outline" onClick={clearFilters}>مسح</Button></div>
        </div>
      </CardContent>
    </Card>, node
  );
}
