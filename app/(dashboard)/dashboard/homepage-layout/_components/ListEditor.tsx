"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Eye, EyeOff, GripVertical, Hand, ImageOff, Pin, Plus, Search, Sparkles, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  HOME_LISTS,
  HOME_LIST_MAX_IDS,
  HOME_LIST_MAX_LIMIT,
  HOME_SORT_LABELS,
  applyHomeList,
  type HomeListConfig,
  type HomeListId,
  type HomeListMode,
  type HomeListOption,
  type HomeListSort,
} from "@/lib/minbar/home-layout";
import { move, useDragReorder } from "./reorder";

const MODES: Array<{ id: HomeListMode; title: string; hint: string; icon: typeof Sparkles }> = [
  { id: "auto", title: "تلقائي", hint: "يُرتَّب حسب القاعدة ويُعرض أول عدد تحدده", icon: Sparkles },
  { id: "manual", title: "اختيار يدوي", hint: "تختار العناصر بنفسك وترتّبها حسب الأولوية", icon: Hand },
  { id: "pinned", title: "مثبّت + تلقائي", hint: "عناصرك المختارة أولًا، ثم تكملة تلقائية", icon: Pin },
];

const QUICK_LIMITS = [3, 4, 5, 6, 8, 12];

/** Lists whose candidates may be restricted to some languages, so the Arabic preview can differ. */
const LOCALE_FILTERED: HomeListId[] = ["events", "endorsements", "achievements"];

function Thumb({ src }: { src?: string | null }) {
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" className="h-10 w-14 shrink-0 rounded-md border object-cover bg-muted" loading="lazy" />
  ) : (
    <span className="flex h-10 w-14 shrink-0 items-center justify-center rounded-md border bg-muted text-muted-foreground">
      <ImageOff className="h-4 w-4" />
    </span>
  );
}

export function ListEditor({
  listId,
  config,
  onChange,
  options,
  loadingOptions,
  showToggle,
}: {
  listId: HomeListId;
  config: HomeListConfig;
  onChange: (next: HomeListConfig) => void;
  /** Every candidate in its dashboard order; undefined while loading. */
  options: HomeListOption[] | undefined;
  loadingOptions: boolean;
  /** Offer the list's own show/hide switch (a section with more than one list). */
  showToggle: boolean;
}) {
  const meta = HOME_LISTS[listId];
  const [query, setQuery] = useState("");
  const set = <K extends keyof HomeListConfig>(key: K, value: HomeListConfig[K]) => onChange({ ...config, [key]: value });

  const byId = useMemo(() => new Map((options ?? []).map((o) => [o.id, o])), [options]);
  const preview = useMemo(() => (options ? applyHomeList(options, { ...config, show: true }, (o) => o) : []), [options, config]);
  const pinnedIds = useMemo(() => new Set(config.mode === "auto" ? [] : config.ids), [config.mode, config.ids]);

  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    const chosen = new Set(config.ids);
    return (options ?? []).filter((o) => !chosen.has(o.id) && (!q || o.title.toLowerCase().includes(q) || (o.subtitle ?? "").toLowerCase().includes(q)));
  }, [options, config.ids, query]);

  const moveId = (from: number, to: number) => set("ids", move(config.ids, from, to));
  const { rowProps, dragging } = useDragReorder(moveId);

  const usesRules = config.mode !== "manual";
  const usesPicks = config.mode !== "auto";
  const full = config.ids.length >= HOME_LIST_MAX_IDS;
  const total = options?.length ?? 0;

  return (
    <Card className={config.show ? "" : "opacity-70"}>
      <CardHeader className="pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2 text-base">
              {meta.label}
              {options && config.show && (
                <Badge variant="secondary" className="font-normal">
                  يظهر {preview.length} من {total}
                </Badge>
              )}
              {!config.show && <Badge variant="outline" className="font-normal">مخفي</Badge>}
            </CardTitle>
            <CardDescription className="mt-1">اختر طريقة اختيار العناصر وترتيبها في هذا الشريط.</CardDescription>
          </div>
          {showToggle && (
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              {config.show ? <Eye className="h-4 w-4 text-muted-foreground" /> : <EyeOff className="h-4 w-4 text-muted-foreground" />}
              إظهار هذا الشريط
              <Switch checked={config.show} onCheckedChange={(v) => set("show", v)} />
            </label>
          )}
        </div>
      </CardHeader>

      {config.show && (
        <CardContent className="space-y-6">
          {/* ── Mode ─────────────────────────────────────────────────── */}
          <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="طريقة العرض">
            {MODES.map((m) => {
              const active = config.mode === m.id;
              const Icon = m.icon;
              return (
                <button
                  key={m.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => set("mode", m.id)}
                  className={`rounded-xl border p-3 text-start transition-colors ${active ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-muted/60"}`}
                >
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    <Icon className={`h-4 w-4 ${active ? "text-primary" : "text-muted-foreground"}`} />
                    {m.title}
                  </span>
                  <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{m.hint}</span>
                </button>
              );
            })}
          </div>

          {/* ── Rules ────────────────────────────────────────────────── */}
          {usesRules && (
            <div className="grid gap-4 rounded-xl border bg-muted/30 p-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>{config.mode === "pinned" ? "ترتيب التكملة التلقائية" : "الترتيب"}</Label>
                <Select value={config.sort} onValueChange={(v) => set("sort", v as HomeListSort)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {meta.sorts.map((s) => (
                      <SelectItem key={s} value={s}>
                        {HOME_SORT_LABELS[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor={`limit-${listId}`}>{config.mode === "pinned" ? "العدد الإجمالي (مع المثبّت)" : "عدد العناصر"}</Label>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Input
                    id={`limit-${listId}`}
                    type="number"
                    min={0}
                    max={HOME_LIST_MAX_LIMIT}
                    className="h-9 w-20"
                    value={config.limit === 0 ? "" : config.limit}
                    placeholder="الكل"
                    onChange={(e) => {
                      const n = e.target.value === "" ? 0 : Math.trunc(Number(e.target.value));
                      if (Number.isFinite(n)) set("limit", Math.min(Math.max(n, 0), HOME_LIST_MAX_LIMIT));
                    }}
                  />
                  {QUICK_LIMITS.map((n) => (
                    <Button key={n} type="button" size="sm" variant={config.limit === n ? "default" : "outline"} className="h-9 px-3" onClick={() => set("limit", n)}>
                      {n}
                    </Button>
                  ))}
                  <Button type="button" size="sm" variant={config.limit === 0 ? "default" : "outline"} className="h-9 px-3" onClick={() => set("limit", 0)}>
                    الكل
                  </Button>
                </div>
                {meta.defaultLimit > 0 && config.limit !== meta.defaultLimit && (
                  <p className="text-xs text-muted-foreground">العدد الافتراضي في التصميم: {meta.defaultLimit}</p>
                )}
              </div>
            </div>
          )}

          {/* ── Picks ────────────────────────────────────────────────── */}
          {usesPicks && (
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>{config.mode === "pinned" ? "العناصر المثبّتة (بالأولوية)" : "العناصر المختارة (بالأولوية)"}</Label>
                  <span className="text-xs text-muted-foreground">
                    {config.ids.length}/{HOME_LIST_MAX_IDS}
                  </span>
                </div>
                {config.ids.length === 0 ? (
                  <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                    لم تختر شيئًا بعد. أضف عناصر من القائمة المجاورة.
                    {config.mode === "manual" && <span className="mt-1 block text-destructive">الاختيار اليدوي يحتاج عنصرًا واحدًا على الأقل.</span>}
                  </div>
                ) : (
                  <ol className="max-h-[420px] space-y-1.5 overflow-y-auto pe-1">
                    {config.ids.map((id, index) => {
                      const item = byId.get(id);
                      return (
                        <li
                          key={id}
                          {...rowProps(index)}
                          className={`flex items-center gap-2 rounded-lg border bg-background p-2 ${dragging === index ? "border-primary shadow-sm" : ""}`}
                        >
                          <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-muted-foreground" aria-hidden />
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">{index + 1}</span>
                          <Thumb src={item?.image} />
                          <span className="min-w-0 flex-1">
                            <span className={`block truncate text-sm font-medium ${item ? "" : "text-destructive"}`}>
                              {item?.title ?? (loadingOptions ? "…" : "عنصر غير متاح (محذوف أو غير مفعّل)")}
                            </span>
                            {item?.subtitle && <span className="block truncate text-xs text-muted-foreground">{item.subtitle}</span>}
                          </span>
                          <div className="flex shrink-0 items-center">
                            <Button type="button" size="icon" variant="ghost" className="h-7 w-7" disabled={index === 0} onClick={() => moveId(index, index - 1)} aria-label="أعلى">
                              <ArrowUp className="h-3.5 w-3.5" />
                            </Button>
                            <Button type="button" size="icon" variant="ghost" className="h-7 w-7" disabled={index === config.ids.length - 1} onClick={() => moveId(index, index + 1)} aria-label="أسفل">
                              <ArrowDown className="h-3.5 w-3.5" />
                            </Button>
                            <Button type="button" size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => set("ids", config.ids.filter((x) => x !== id))} aria-label="إزالة">
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </div>

              <div className="space-y-2">
                <Label>إضافة عناصر</Label>
                <div className="relative">
                  <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ابحث بالعنوان…" className="ps-9" />
                </div>
                <div className="max-h-[372px] space-y-1 overflow-y-auto rounded-xl border p-1.5">
                  {loadingOptions && !options ? (
                    <p className="p-4 text-center text-sm text-muted-foreground">جارٍ التحميل…</p>
                  ) : candidates.length === 0 ? (
                    <p className="p-4 text-center text-sm text-muted-foreground">{total === 0 ? "لا توجد عناصر منشورة في هذا القسم." : "لا نتائج."}</p>
                  ) : (
                    candidates.map((o) => (
                      <button
                        key={o.id}
                        type="button"
                        disabled={full}
                        onClick={() => set("ids", [...config.ids, o.id])}
                        className="flex w-full items-center gap-2 rounded-lg p-2 text-start hover:bg-muted disabled:opacity-50"
                      >
                        <Thumb src={o.image} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm">{o.title}</span>
                          {o.subtitle && <span className="block truncate text-xs text-muted-foreground">{o.subtitle}</span>}
                        </span>
                        <Plus className="h-4 w-4 shrink-0 text-primary" />
                      </button>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── Preview ──────────────────────────────────────────────── */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label className="flex items-center gap-1.5">
                <Eye className="h-4 w-4 text-muted-foreground" />
                ما سيظهر في الصفحة الرئيسية، بهذا الترتيب
              </Label>
              {LOCALE_FILTERED.includes(listId) && (
                <span className="text-xs text-muted-foreground">الفيديو المقيّد بلغة يظهر لزوار تلك اللغة فقط.</span>
              )}
            </div>
            {!options ? (
              <p className="rounded-xl border p-4 text-sm text-muted-foreground">جارٍ تحميل المعاينة…</p>
            ) : preview.length === 0 ? (
              <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">لن يظهر شيء — وسيُخفى القسم تلقائيًا ما دام فارغًا.</p>
            ) : (
              <ol className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {preview.map((o, index) => (
                  <li key={o.id} className="flex items-center gap-2 rounded-lg border bg-muted/20 p-2">
                    <span className="w-5 shrink-0 text-center text-xs font-bold text-muted-foreground">{index + 1}</span>
                    <Thumb src={o.image} />
                    <span className="min-w-0 flex-1 truncate text-sm">{o.title}</span>
                    {pinnedIds.has(o.id) && <Pin className="h-3.5 w-3.5 shrink-0 text-primary" aria-label="مثبّت" />}
                  </li>
                ))}
              </ol>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  );
}
