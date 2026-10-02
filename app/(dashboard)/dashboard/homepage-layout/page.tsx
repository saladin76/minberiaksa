"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import axios from "axios";
import { ExternalLink, Info, LayoutTemplate, Loader2, PencilLine, RefreshCw, RotateCcw, Save, Undo2 } from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { errorMessage } from "@/lib/dashboard/client-error-message";
import {
  DEFAULT_HOME_LAYOUT,
  HOME_SECTIONS,
  defaultListConfig,
  type HomeLayoutConfig,
  type HomeListConfig,
  type HomeListId,
  type HomeListOptions,
  type HomeSectionId,
} from "@/lib/minbar/home-layout";
import { SectionList } from "./_components/SectionList";
import { ListEditor } from "./_components/ListEditor";
import { move } from "./_components/reorder";

/**
 * ترتيب الصفحة الرئيسية — the homepage's arrangement, not its content.
 *
 * Left, the sequence: every section after the hero and the quick-donation bar,
 * dragged or nudged into order and switched on or off. Right, the selected
 * section: for the ones that list things, how the list picks its items
 * (automatically by a ranking and a count, by hand in priority order, or
 * pinned picks topped up automatically) with a live preview of the result.
 *
 * One document, one Save. The preview ranks the same candidates with the same
 * function the homepage uses (`applyHomeList`), so it shows what will render.
 */

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const listIsDefault = (layout: HomeLayoutConfig, id: HomeListId) => same(layout.lists[id], DEFAULT_HOME_LAYOUT.lists[id]);

function useListOptions() {
  const [options, setOptions] = useState<HomeListOptions | null>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get("/api/home-layout/options");
      setOptions(res.data.options as HomeListOptions);
    } catch {
      setOptions(null);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  return { options, loading, reload: load };
}

export default function HomepageLayoutPage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<HomeLayoutConfig>(DEFAULT_HOME_LAYOUT);
  const [config, setConfig] = useState<HomeLayoutConfig>(DEFAULT_HOME_LAYOUT);
  const [customised, setCustomised] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [selected, setSelected] = useState<HomeSectionId>("events");
  const { options, loading: loadingOptions, reload: reloadOptions } = useListOptions();

  const dirty = !same(config, saved);
  const matchesDefault = same(config, DEFAULT_HOME_LAYOUT);

  const hydrate = (data: { config: HomeLayoutConfig; customised: boolean; updatedAt: string | null }) => {
    setSaved(data.config);
    setConfig(data.config);
    setCustomised(data.customised);
    setUpdatedAt(data.updatedAt);
  };

  const load = async () => {
    setLoading(true);
    try {
      const res = await axios.get("/api/home-layout");
      hydrate(res.data);
    } catch (e) {
      toast({ title: "خطأ", description: errorMessage(e, "تعذّر تحميل ترتيب الصفحة الرئيسية"), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Leaving with unsaved changes asks first. */
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const moveSection = (from: number, to: number) => setConfig((prev) => ({ ...prev, sections: move(prev.sections, from, to) }));
  const toggleSection = (id: HomeSectionId, enabled: boolean) =>
    setConfig((prev) => ({ ...prev, sections: prev.sections.map((s) => (s.id === id ? { ...s, enabled } : s)) }));
  const setList = (id: HomeListId, next: HomeListConfig) => setConfig((prev) => ({ ...prev, lists: { ...prev.lists, [id]: next } }));

  const put = async (body: unknown, done: string) => {
    setSaving(true);
    try {
      const res = await axios.put("/api/home-layout", body);
      hydrate(res.data);
      toast({ title: "تم الحفظ", description: done });
      return true;
    } catch (e) {
      toast({ title: "لم يُحفظ", description: errorMessage(e, "تعذّر حفظ الترتيب"), variant: "destructive" });
      return false;
    } finally {
      setSaving(false);
    }
  };

  const save = () => put({ config }, "يُطبَّق الترتيب على الصفحة الرئيسية فورًا");
  const resetAll = () => put({ reset: true }, "عادت الصفحة الرئيسية إلى ترتيب التصميم الأصلي");

  const stats = useMemo(() => {
    const visible = config.sections.filter((s) => s.enabled).length;
    const customLists = (Object.keys(config.lists) as HomeListId[]).filter((id) => !listIsDefault(config, id)).length;
    return { visible, hidden: config.sections.length - visible, customLists };
  }, [config]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  }

  const position = config.sections.findIndex((s) => s.id === selected);
  const current = config.sections[position];
  const meta = HOME_SECTIONS[selected];
  const sectionIsDefault = meta.lists.every((id) => listIsDefault(config, id));

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-24" dir="rtl">
      <PageHeader
        title="ترتيب الصفحة الرئيسية"
        description="رتّب أقسام الصفحة الرئيسية وأظهرها أو أخفها، واختر ما يعرضه كل قسم وبأي أولوية — يدويًا أو تلقائيًا. المحتوى نفسه يُحرَّر من صفحته الخاصة."
        icon={LayoutTemplate}
        actions={
          <>
            <Button variant="outline" asChild>
              <a href="/ar" target="_blank" rel="noreferrer">
                <ExternalLink className="ms-2 h-4 w-4" />
                عرض الصفحة
              </a>
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                void load();
                void reloadOptions();
              }}
              disabled={saving}
            >
              <RefreshCw className="ms-2 h-4 w-4" />
              تحديث
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" disabled={saving || (!customised && matchesDefault)}>
                  <RotateCcw className="ms-2 h-4 w-4" />
                  الترتيب الافتراضي
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent dir="rtl">
                <AlertDialogHeader>
                  <AlertDialogTitle>استعادة الترتيب الافتراضي؟</AlertDialogTitle>
                  <AlertDialogDescription>
                    تعود كل الأقسام إلى ترتيب التصميم الأصلي وتظهر جميعها، ويعود كل شريط إلى اختياره التلقائي المعتاد. تُحذف اختياراتك اليدوية ولا يمكن التراجع.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>إلغاء</AlertDialogCancel>
                  <AlertDialogAction onClick={() => void resetAll()}>استعادة وحفظ</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <Button onClick={() => void save()} disabled={saving || !dirty}>
              {saving ? <Loader2 className="ms-2 h-4 w-4 animate-spin" /> : <Save className="ms-2 h-4 w-4" />}
              حفظ الترتيب
            </Button>
          </>
        }
      />

      {/* ── Status ───────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge variant={customised ? "default" : "secondary"}>{customised ? "ترتيب مخصّص" : "ترتيب التصميم الأصلي"}</Badge>
        <Badge variant="outline" className="font-normal">{stats.visible} قسمًا ظاهرًا</Badge>
        {stats.hidden > 0 && <Badge variant="outline" className="font-normal">{stats.hidden} مخفي</Badge>}
        {stats.customLists > 0 && <Badge variant="outline" className="font-normal">{stats.customLists} شريط بإعدادات مخصّصة</Badge>}
        {updatedAt && customised && (
          <span className="text-xs text-muted-foreground">
            آخر حفظ: {new Date(updatedAt).toLocaleString("ar-EG", { dateStyle: "medium", timeStyle: "short" })}
          </span>
        )}
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(320px,400px)_minmax(0,1fr)]">
        {/* ── Sequence ───────────────────────────────────────────────────── */}
        <Card className="lg:sticky lg:top-4">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">تسلسل الأقسام</CardTitle>
            <CardDescription>اسحب القسم أو استخدم الأسهم لتغيير موضعه، واختر قسمًا لضبط محتواه.</CardDescription>
          </CardHeader>
          <CardContent className="max-h-[calc(100vh-14rem)] overflow-y-auto">
            <SectionList layout={config} selected={selected} onSelect={setSelected} onMove={moveSection} onToggle={toggleSection} />
          </CardContent>
        </Card>

        {/* ── Selected section ───────────────────────────────────────────── */}
        <div className="min-w-0 space-y-4">
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <CardTitle>{meta.label}</CardTitle>
                    <Badge variant="outline" className="font-normal">
                      الموضع {position + 1} من {config.sections.length}
                    </Badge>
                  </div>
                  <CardDescription className="mt-1.5">{meta.description}</CardDescription>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  {meta.editHref && (
                    <Button variant="outline" size="sm" asChild>
                      <Link href={meta.editHref}>
                        <PencilLine className="ms-2 h-4 w-4" />
                        {meta.kind === "banners" ? "إدارة البانرات" : "تحرير المحتوى"}
                      </Link>
                    </Button>
                  )}
                  {meta.kind === "list" && !sectionIsDefault && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setConfig((prev) => ({ ...prev, lists: { ...prev.lists, ...Object.fromEntries(meta.lists.map((id) => [id, defaultListConfig(id)])) } }))}
                    >
                      <Undo2 className="ms-2 h-4 w-4" />
                      افتراضي هذا القسم
                    </Button>
                  )}
                  <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                    إظهار القسم
                    <Switch checked={current?.enabled ?? true} onCheckedChange={(v) => toggleSection(selected, v)} />
                  </label>
                </div>
              </div>
            </CardHeader>
            {meta.kind !== "list" && (
              <CardContent>
                <div className="flex gap-3 rounded-xl border bg-muted/30 p-4 text-sm leading-relaxed text-muted-foreground">
                  <Info className="mt-0.5 h-4 w-4 shrink-0" />
                  {meta.kind === "banners" ? (
                    <p>
                      هذا موضع للبانرات وليس قسمًا ثابتًا: يعرض البانرات المنشورة على الصفحة الرئيسية في هذا الموضع، ويختفي إن لم يوجد بانر.
                      اختر موضعه هنا، وأدر البانرات نفسها من صفحة البانرات.
                    </p>
                  ) : (
                    <p>قسم ثابت التصميم لا يعرض قائمة عناصر. يمكنك تغيير موضعه في التسلسل أو إخفاؤه، ونصوصه من ترجمات الموقع.</p>
                  )}
                </div>
              </CardContent>
            )}
          </Card>

          {meta.kind === "list" &&
            (current?.enabled ?? true) &&
            meta.lists.map((listId) => (
              <ListEditor
                key={listId}
                listId={listId}
                config={config.lists[listId]}
                onChange={(next) => setList(listId, next)}
                options={options?.[listId]}
                loadingOptions={loadingOptions}
                showToggle={meta.lists.length > 1}
              />
            ))}

          {meta.kind === "list" && !(current?.enabled ?? true) && (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                القسم مخفي من الصفحة الرئيسية. أظهره لضبط ما يعرضه.
              </CardContent>
            </Card>
          )}

          {selected === "events" && (current?.enabled ?? true) && (
            <p className="flex items-start gap-2 px-1 text-xs leading-relaxed text-muted-foreground">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              لإضافة فعالية جديدة: من صفحة الفيديوهات أضف فيديو يوتيوب واختر نوعه «فعالياتنا»، ثم اختره هنا. التسجيلات الثلاثة المدمجة تبقى متاحة دائمًا.
            </p>
          )}
        </div>
      </div>

      {/* ── Unsaved changes ──────────────────────────────────────────────── */}
      {dirty && (
        <div className="fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border bg-background/95 px-4 py-3 shadow-lg backdrop-blur">
            <span className="text-sm font-medium">لديك تغييرات غير محفوظة</span>
            <Button variant="ghost" size="sm" onClick={() => setConfig(saved)} disabled={saving}>
              <Undo2 className="ms-2 h-4 w-4" />
              تجاهل
            </Button>
            <Button size="sm" onClick={() => void save()} disabled={saving}>
              {saving ? <Loader2 className="ms-2 h-4 w-4 animate-spin" /> : <Save className="ms-2 h-4 w-4" />}
              حفظ الترتيب
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
