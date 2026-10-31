"use client";
import { runSuggestionBatch, readSuggestionJson, requestSuggestion } from "@/lib/content-editor/suggestion-batch";
import type { Ga4Period } from "@/lib/marketing/ga4-period";
import { Ga4SeoEvidenceControl } from "./Ga4SeoEvidenceControl";
import { ContentLanguagePicker } from "./ContentLanguagePicker";
import type { SupportedLocale } from "@/lib/locales";
import { toast } from "react-hot-toast";
import { dashDir, dt, dtMaybe } from "@/lib/dashboard/i18n";
import { SuggestedDonationsSection, type SuggestedDonationsSectionRef } from "@/app/(dashboard)/dashboard/campaigns/_components/SuggestedDonationsSection";
import { SuggestedShareCountsSection, type SuggestedShareCountsSectionRef } from "@/app/(dashboard)/dashboard/campaigns/_components/SuggestedShareCountsSection";
import { ShareLabelsSection, type ShareLabelsSectionRef } from "@/app/(dashboard)/dashboard/campaigns/_components/ShareLabelsSection";
import { parseSuggestedDonations } from "@/lib/campaign/suggested-donations";
import { parseSuggestedShareCounts } from "@/lib/campaign/campaign-modes";
import { parseShareLabels } from "@/lib/campaign/share-labels";
import { readFaqDraft } from "@/lib/content-editor/faq";
import { useDashboardUnsavedChanges } from "@/hooks/useDashboardUnsavedChanges";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { slugify } from "@/lib/slug";
import { slugFor } from "@/lib/minbar/routes";
import dynamic from "next/dynamic";
import { EditorModal } from "./EditorModal";
import { DocumentUploadField } from "./DocumentUploadField";
import { ImageUploadField } from "@/app/(dashboard)/dashboard/_components/ImageUploadField";
import { ProjectVideoLibrary } from "./ProjectVideoLibrary";
import { CampaignUpdatesEditor } from "./CampaignUpdatesEditor";
import { CategoryStructureEditor } from "./CategoryStructureEditor";
import { MediaCollectionEditor } from "./MediaCollectionEditor";
import { ProgrammeWorkspace } from "./ProgrammeWorkspace";
import { WorkspacePreview } from "./WorkspacePreview";
import { previewDraftValues } from "@/lib/content-editor/public-preview";
const PublicPagePreview = dynamic(() => import("./PublicPagePreview").then(module => module.PublicPagePreview), { ssr: false });
import { WorkspaceSettings, useEditorCatalog } from "./WorkspaceSettings";
import { SeoWorkspace } from "./SeoWorkspace";
import { EDITOR_SECTIONS, settingsFor } from "@/lib/content-editor/workspace";
import type { ContentRecord } from "@/lib/content-editor/contracts";
import {
  FileText,
  Wallet,
  Image as ImageIcon,
  Search,
  History,
  Grid2X2,
  Link2,
  CheckCircle2,
  Heart,
  Settings,
  Eye,
  Save,
  ArrowRight,
  Globe2,
  Undo2,
} from "lucide-react";
import { LOCALES, SUPPORTED_LOCALES } from "@/lib/locales";
import {
  CONFIG,
  hasText,
  localeStatus,
  contentFieldLimit,
  changedTextValues,
  validateChanges,
  ContentFieldError,
  type ContentField,
  type ContentKind,
  type TextValues,
} from "@/lib/content-editor/contracts";
import type { documentFor } from "@/lib/content-editor/service";
const CategoryOrderDialog = dynamic(
  () =>
    import(
      "@/app/(dashboard)/dashboard/categories/_components/CategoryCampaignPriorityDialog"
    ).then((m) => m.CategoryCampaignPriorityDialog),
  { ssr: false },
);
const RichEditor = dynamic(
  () => import("@/app/[locale]/blog/_components/wysiwyg/wysiwyg-editor"),
  { ssr: false, loading: () => <p>{dt("تحميل المحرر…")}</p> },
);
type Document = ReturnType<typeof documentFor>;
type Proposal = {
  id: string;
  kind: ContentKind;
  revision: string;
  action: string;
  proposals: Record<string, { values: TextValues; warnings: string[]; research?: { summary: string; sources: { title: string; url: string }[]; accessedAt: string; locale: string } }>;
  errors: Record<string, string>;
  base?: Record<string, TextValues>;
  failureReasons?: Record<string, string>;
  skipped?: readonly string[];
};
async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...options,
    cache: "no-store",
    signal: options?.signal ?? AbortSignal.timeout(30_000),
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  return readSuggestionJson<T>(res, dt("تعذر إكمال الطلب"));
}
function previewText(value: string): string {
  try {
    const parsed = JSON.parse(value);
    if (parsed.type === "doc") {
      const read = (node: { text?: string; content?: unknown[] }): string =>
        typeof node.text === "string"
          ? node.text
          : (node.content || [])
              .map((child) =>
                read(child as { text?: string; content?: unknown[] }),
              )
              .join(" ");
      return read(parsed);
    }
  } catch {
    /* normal text */
  }
  return value.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ");
}
function parseRich(value: string) {
  try {
    const doc = JSON.parse(value);
    if (doc.type === "doc") return doc;
  } catch {
    /* plain or HTML */
  }
  return value || { type: "doc", content: [{ type: "paragraph" }] };
}
const button =
  "rounded-lg border px-4 py-2 text-sm disabled:opacity-50 hover:bg-slate-50";
export function ContentEditor({ kind, id, initialSection = "content", initialLocale = "ar", initialCampaignId }: { initialCampaignId?: string; kind: ContentKind; id: string; initialSection?: string; initialLocale?: string }) {
  const router = useRouter();
  const creationKey = useRef(crypto.randomUUID());
  const donationPresets = useRef<SuggestedDonationsSectionRef>(null);
  const sharePresets = useRef<SuggestedShareCountsSectionRef>(null);
  const unitLabels = useRef<ShareLabelsSectionRef>(null);
  const [presetsDirty, setPresetsDirty] = useState(false);
  const [presetEpoch, setPresetEpoch] = useState(0);
  const markPresetsDirty = useCallback(() => setPresetsDirty(true), []);
  const url = `/api/admin/content-editor/${kind}/${id}`;
  const [document, setDocument] = useState<Document | null>(null);
  const [values, setValues] = useState<Record<string, TextValues>>({});
  const [locale, setLocale] = useState(SUPPORTED_LOCALES.includes(initialLocale as typeof SUPPORTED_LOCALES[number]) ? initialLocale : "ar");
  const [message, setMessageText] = useState("");
  const [messageTone, setMessageTone] = useState<"info" | "success" | "error">("info");
  const [invalidField, setInvalidField] = useState<{ locale: string; key: string } | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const setMessage = useCallback((text: string, tone: "info" | "success" | "error" = "info") => { setMessageText(text); setMessageTone(tone); }, []);
  useEffect(() => { if (messageTone !== "success" || !message) return; const timer = setTimeout(() => setMessage(""), 6500); return () => clearTimeout(timer); }, [message, messageTone, setMessage]);
  const [analyticsPeriod, setAnalyticsPeriod] = useState<Ga4Period | null>(null);
  const [busy, setBusy] = useState("");
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [generationProgress, setGenerationProgress] = useState<{ done: number; total: number } | null>(null);
  const generationAbort = useRef<AbortController | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [reviewed, setReviewed] = useState(false);
  const [slug, setSlug] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [slugOpen, setSlugOpen] = useState(false);
  const [bulkSlugOpen, setBulkSlugOpen] = useState(false);
  const [bulkSlugs, setBulkSlugs] = useState<Record<string, string>>({});
  const [bulkSlugLocales, setBulkSlugLocales] = useState<string[]>([]);
  const [bulkSlugConfirmed, setBulkSlugConfirmed] = useState(false);
  const [section, setSection] = useState(EDITOR_SECTIONS[kind].some(item => item.id === initialSection) ? initialSection : "content");
  const [settingsDraft, setSettingsDraft] = useState<ContentRecord>({});
  const [assistAction, setAssistAction] = useState<"translate" | "seo" | "proofread" | "faq">("translate");
  const [assistScope, setAssistScope] = useState("current");
  const assistTargetScope = assistScope === "auto" ? (assistAction === "translate" && locale === "ar" ? "missing" : "current") : assistScope;
  const [languageReview, setLanguageReview] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [uploads, setUploads] = useState(0);
  const onUploadingChange = useCallback(
    (uploading: boolean) =>
      setUploads((count) => Math.max(0, count + (uploading ? 1 : -1))),
    [],
  );
  const [categoryOrderOpen, setCategoryOrderOpen] = useState(false);
  const { catalog, error: catalogError } = useEditorCatalog(kind);
  const valuesRef = useRef(values);
  valuesRef.current = values;
  const requestRef = useRef(0);
  const initialLoad = useCallback(async () => {
    const number = ++requestRef.current;
    try {
      const data = await api<Document>(url);
      if (number !== requestRef.current) return;
      setDocument(data);
      setValues(data.values);
      setSettingsDraft({ ...settingsFor(kind, data.settings), ...(id === "new" && kind === "videos" && initialCampaignId ? { campaignIds: [initialCampaignId] } : {}) });
      setPresetsDirty(false); setPresetEpoch((epoch) => epoch + 1);
      setSelected(data.fields.filter((f) => !f.locked).map((f) => f.key));
      setMessage("");
    } catch (error) {
      if (number === requestRef.current)
        setMessage(error instanceof Error ? dtMaybe(error.message) : dt("تعذر التحميل"));
    }
  }, [url, kind, id, initialCampaignId, setMessage]);
  const invalidateRequests = useCallback(() => {
    generationAbort.current?.abort();
    requestRef.current++;
  }, []);
  useEffect(() => {
    void initialLoad();
    return invalidateRequests;
  }, [initialLoad, invalidateRequests]);
  const dirty = document
    ? JSON.stringify(values) !== JSON.stringify(document.values) ||
      JSON.stringify(settingsDraft) !==
        JSON.stringify(settingsFor(kind, document.settings)) ||
      uploads > 0 || presetsDirty || reviewed
    : false;
  useDashboardUnsavedChanges(dirty);
  useEffect(() => {
    if (!dirty) return;
    const navigation = (e: MouseEvent) => {
      const link = (e.target as Element).closest?.("a[href]");
      if (link && !window.confirm(dt("توجد تعديلات غير محفوظة. مغادرة المحرر؟"))) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.document.addEventListener("click", navigation, true);
    return () => {
      window.document.removeEventListener("click", navigation, true);
    };
  }, [dirty]);
  useEffect(() => {
    if (!invalidField || invalidField.locale !== locale) return;
    const frame = requestAnimationFrame(() => {
      const field = window.document.getElementById(`content-${locale}-${invalidField.key}`);
      field?.scrollIntoView({ block: "center", behavior: "smooth" });
      field?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [invalidField, locale, section]);
  const edit = (key: string, value: string) => {
    if (busy === "save" || busy === "slug") return;
    if (key === "fileUrl" && locale === "ar" && ["reports", "booklets"].includes(kind)) setSettingsDraft((previous) => ({ ...previous, fileUrl: value }));
    setInvalidField(null);
    setValues((prev) => ({
      ...prev,
      [locale]: { ...prev[locale], [key]: value },
    }));
    generationAbort.current?.abort();
    setProposal(null);
    setReviewed(false);
  };
  const save = async () => {
    if (!document || (!dirty && id !== "new")) return;
    if (uploads) {
      setMessage(dt("انتظر اكتمال رفع الصور قبل الحفظ"));
      return;
    }
    const target = locale;
    const localeChanges = Object.fromEntries(Object.entries(values).map(([code, draft]) => [code,
      id === "new" ? draft : changedTextValues(draft, document.values[code] || {}),
    ]).filter(([, draft]) => Object.keys(draft).length));
    for (const [code, changes] of Object.entries(localeChanges)) {
      try { validateChanges(document.fields, changes); }
      catch (error) {
        if (error instanceof ContentFieldError) {
          setLocale(code);
          setSection(document.fields.find(field => field.key === error.field)?.group === "seo" ? "seo" : "content");
          setInvalidField({ locale: code, key: error.field });
        }
        setMessage(`${LOCALES[code as SupportedLocale]?.nativeLabel || code}: ${error instanceof Error ? error.message : dt("حقول غير صالحة")}`, "error");
        return;
      }
    }
    const captured = localeChanges[target] || {};
    setBusy("save");
    setMessage("");
    try {
      const saved = await api<Document>(url, {
        method: "PUT",
        body: JSON.stringify({
          revision: document.revision,
          creationKey: creationKey.current,
          locale: target,
          changes: captured,
          reviewed,
          localeChanges,
          settings: { ...Object.fromEntries(
            Object.entries(settingsDraft).filter(
              ([key, v]) =>
                JSON.stringify(v) !==
                JSON.stringify(settingsFor(kind, document.settings)[key]),
            ),
          ), ...(kind === "campaigns" && presetsDirty ? { suggestedDonations: donationPresets.current?.getPayload(), suggestedShareCounts: sharePresets.current?.getPayload(), shareLabels: unitLabels.current?.getPayload() } : {}) },
        }),
      });
      const read = await api<Document>(id === "new" ? `/api/admin/content-editor/${kind}/${saved.id}` : url);
      if (read.revision !== saved.revision)
        throw new Error(
          dt("تغيرت النسخة بعد الحفظ. احتفظ بتعديلاتك ثم أعد تحميلها للمراجعة."),
        );
      setDocument(read);
      setValues(read.values);
      setSettingsDraft(settingsFor(kind, read.settings));
      setPresetsDirty(false); setPresetEpoch((epoch) => epoch + 1);
      setProposal(null);
      setReviewed(false);
      setMessage(dt("تم الحفظ والتحقق من النسخة المحفوظة"), "success");
      setSavedAt(new Date().toISOString());
      toast.success(dt("تم الحفظ والتحقق من النسخة المحفوظة"));
      if (id === "new") router.replace(`/dashboard/content/${kind}/${saved.id}`);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : dt("تعذر تأكيد الحفظ. احتفظ بتعديلاتك وأعد المحاولة."),
        "error",
      );
    } finally {
      setBusy("");
    }
  };
  const suggest = async (action: "seo" | "translate" | "faq" | "proofread", all = false, targetLocales?: string[]) => {
    if (!document || id === "new" || uploads > 0) {
      setMessage(dt("احفظ المحتوى الجديد وانتظر اكتمال الرفع قبل طلب الاقتراح.")); return;
    }
    const targets = targetLocales ?? (action === "translate"
      ? all ? SUPPORTED_LOCALES.filter(code => code !== "ar" && !document.statuses[code].complete) : [locale]
      : all ? [...SUPPORTED_LOCALES] : [locale]);
    if (!targets.length || action === "translate" && targets.includes("ar")) { setMessage(dt("اختر لغة أخرى أو لغة تحتاج ترجمة")); return; }
    const drafts = structuredClone(valuesRef.current), snapshot = JSON.stringify(drafts), revision = document.revision;
    const controller = new AbortController(); generationAbort.current?.abort(); generationAbort.current = controller;
    setBusy(action); setMessage(""); setProposal(null); setGenerationProgress({ done: 0, total: targets.length });
    const combined: Proposal = { id, kind, revision, action, proposals: {}, errors: {}, base: drafts, failureReasons: {}, skipped: [] };
    try {
      const result = await runSuggestionBatch({ targets, signal: controller.signal,
        request: async target => {
          const response = await requestSuggestion<Proposal>(url + "/suggest", { action, locale: target, locales: [target], keys: selected, revision,
              ...(action === "translate" ? { sourceDraft: drafts.ar || {} } : { draft: drafts[target] || {} }),
              ...(action === "seo" && analyticsPeriod ? { analyticsPeriod } : {}) }, controller.signal);
          if (response.id !== id || response.kind !== kind || response.revision !== revision) throw new Error(dt("الاقتراح لا يطابق المحتوى الجاري تحريره"));
          return response;
        },
        onSuccess: (_target, result) => { Object.assign(combined.proposals, result.proposals); Object.assign(combined.errors, result.errors); },
        onError: (target, error) => { combined.errors[target] = error instanceof Error ? dtMaybe(error.message) : dt("تعذر إعداد الاقتراح"); if (error && typeof error === "object" && "reason" in error && typeof error.reason === "string") combined.failureReasons![target] = error.reason; },
        onProgress: (done, total) => setGenerationProgress({ done, total }),
      });
      if (generationAbort.current !== controller) return;
      if (snapshot !== JSON.stringify(valuesRef.current)) throw new Error(dt("تغير النص أثناء الطلب. اطلب اقتراحًا جديدًا."));
      combined.skipped = result.skipped;
      if (Object.keys(combined.proposals).length) setProposal(combined);
      if (!Object.keys(combined.proposals).length && Object.keys(combined.errors).length) setMessage(Object.values(combined.errors)[0], "error");
      if (result.sharedFailure && result.skipped.length) setMessage((Object.values(combined.errors)[0] || "") + " " + (result.connectionFailure ? dt("أُوقفت بقية {0} لغات لأن الاتصال بالخادم لم يُؤكَّد. الاقتراحات المكتملة محفوظة للمراجعة.", [result.skipped.length]) : dt("أُوقفت بقية {0} لغات بسبب مشكلة مشتركة في خدمة الذكاء الاصطناعي. راجع السبب قبل إعادة الطلب.", [result.skipped.length])), "error");
      else if (controller.signal.aborted) setMessage(dt("أُوقف الطلب. الاقتراحات المكتملة متاحة للمراجعة."));
    } catch (error) { if (generationAbort.current === controller) setMessage(error instanceof Error ? dtMaybe(error.message) : dt("تعذر إعداد الاقتراح"), "error"); }
    finally { if (generationAbort.current === controller) { generationAbort.current = null; setGenerationProgress(null); setBusy(""); } }
  };
  const reviseProposal = (target: string, key: string, value: string) => {
    setProposal((previous) => previous ? {
      ...previous, proposals: { ...previous.proposals, [target]: {
        ...previous.proposals[target], values: { ...previous.proposals[target].values, [key]: value },
      } },
    } : null);
  };
  const apply = (target: string, key: string, value: string) => {
    if (
      busy === "save" ||
      busy === "slug" ||
      !document ||
      proposal?.revision !== document.revision
    )
      return;
    if (proposal.base && (valuesRef.current[target]?.[key] || "") !== (proposal.base[target]?.[key] || "")) { setMessage(dt("تغير هذا الحقل بعد إعداد الاقتراح. راجع المسودة واطلب اقتراحًا جديدًا."), "error"); return; }
    setValues((prev) => ({ ...prev, [target]: { ...prev[target], [key]: value } }));
    setReviewed(false);
    setProposal((previous) => {
      if (!previous?.proposals[target]) return previous;
      const pending = { ...previous.proposals[target].values };
      delete pending[key];
      const proposals = { ...previous.proposals };
      if (Object.keys(pending).length) proposals[target] = { ...proposals[target], values: pending };
      else delete proposals[target];
      return Object.keys(proposals).length ? { ...previous, proposals } : null;
    });
    const warning = proposal && Object.keys(proposal.errors).length ? " · " + Object.keys(proposal.errors).join(", ") : "";
    setMessage(dt("أضيف الاقتراح إلى المسودة. احفظ جميع التغييرات بعد المراجعة.") + warning);
  };
  const changeSlug = async () => {
    if (!document || dirty) {
      setMessage(dt("احفظ تعديلات المحتوى قبل تغيير الرابط"));
      return;
    }
    setBusy("slug");
    try {
      const saved = await api<Document>(url, {
        method: "PUT",
        body: JSON.stringify({
          action: "slug",
          locale,
          revision: document.revision,
          slug,
          confirmation,
        }),
      });
      setDocument(saved);
      setValues(saved.values);
      setSlugOpen(false);
      setConfirmation("");
      setProposal(null);
      setMessage(dt("تم تغيير الرابط وحفظ الرابط السابق في السجل"));
    } catch (error) {
      setMessage(error instanceof Error ? dtMaybe(error.message) : dt("تعذر تغيير الرابط"));
    } finally {
      setBusy("");
    }
  };
  const openBulkSlugs = () => {
    if (!document || dirty) return;
    setBulkSlugs({ ...document.slugs });
    setBulkSlugLocales(SUPPORTED_LOCALES.filter(code => hasText(values[code]?.[kind === "categories" ? "name" : "title"])));
    setBulkSlugConfirmed(false); setBulkSlugOpen(true);
  };
  const saveBulkSlugs = async () => {
    if (!document || dirty || !bulkSlugConfirmed || !bulkSlugLocales.length) return;
    setBusy("slug"); setMessage("");
    try {
      const saved = await api<Document>(url, { method: "PUT", body: JSON.stringify({ action: "slugs", revision: document.revision, slugs: Object.fromEntries(bulkSlugLocales.map(code => [code, bulkSlugs[code]])), confirmation: "UPDATE_SLUGS" }) });
      setDocument(saved); setValues(saved.values); setSettingsDraft(settingsFor(kind, saved.settings));
      setProposal(null); setBulkSlugOpen(false);
      setMessage(dt("تم تحديث الروابط المحددة وحفظ التحويلات القديمة. اللغات المستثناة احتفظت بروابطها."));
    } catch (error) { setMessage(error instanceof Error ? dtMaybe(error.message) : dt("تعذر تحديث الروابط. لم يُحفظ أي تغيير.")); }
    finally { setBusy(""); }
  };
  if (!document)
    return (
      <div dir={dashDir()} className="rounded-xl border p-6" role="status">
        {message || dt("تحميل المحتوى…")}
        <button type="button" className={button} onClick={initialLoad}>
          {dt("إعادة المحاولة")}
        </button>
      </div>
    );
  const current = values[locale] || {},
    source = values.ar || {},
    status = localeStatus(document.fields, source, current, locale);
  const done = SUPPORTED_LOCALES.filter(
    (l) => l !== "ar" && document.statuses[l].complete,
  ).length;
  const isBanner = kind === "urgent-banners";
  const liveSettings: ContentRecord = {
    ...document.settings,
    ...settingsDraft,
    blocks: Array.isArray(settingsDraft.blocks)
      ? settingsDraft.blocks.map((item: ContentRecord) => {
          const key = `blocks.${item.id}.`;
          return {
            ...item,
            title:
              current[key + "title"] || source[key + "title"] || item.title,
            body: current[key + "body"] || source[key + "body"],
          };
        })
      : document.settings.blocks,
  };
  const sectionIcons = {
    file: FileText,
    wallet: Wallet,
    image: ImageIcon,
    search: Search,
    history: History,
    grid: Grid2X2,
    link: Link2,
    check: CheckCircle2,
    heart: Heart,
    settings: Settings,
  };
  const setSetting = (key: string, value: unknown) => {
    setSettingsDraft((prev) => ({ ...prev, [key]: value }));
    setProposal(null);
  };
  const resetDraft = () => {
    if (!dirty || window.confirm(dt("التراجع عن كل التعديلات غير المحفوظة؟"))) {
      setValues(document.values);
      setSettingsDraft(settingsFor(kind, document.settings));
                setPresetsDirty(false); setPresetEpoch((epoch) => epoch + 1);
      setProposal(null);
      setReviewed(false);
    }
  };
  const languageButtons = (
    <section aria-label={dt("لغة المحتوى")} className="space-y-3 rounded-xl border bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold"><Globe2 size={18} aria-hidden="true" />{dt("لغة المحتوى")}<span className="font-normal text-slate-500">· {LOCALES[locale as keyof typeof LOCALES].nativeLabel}</span></h2>
        <span className="text-xs text-slate-500">{status.complete ? dt("المحتوى مكتمل") : dt("حقول ناقصة: {0}", [status.missing.length])} · {status.seoComplete ? dt("إعدادات البحث مكتملة") : dt("إعدادات البحث تحتاج استكمالًا")}</span>
      </div>
      <ContentLanguagePicker value={locale as SupportedLocale} disabled={Boolean(busy)} onChange={code => { setLocale(code); setReviewed(false); }} completion={Object.fromEntries(SUPPORTED_LOCALES.map(code => [code, localeStatus(document.fields, source, values[code] || {}, code).complete]))} />
    </section>
  );
  const renderField = (field: ContentField) => (
    <section
      key={field.key}
      className={`min-w-0 space-y-2 rounded-xl border bg-white p-4 ${field.rich ? "sm:col-span-2" : ""}`}
    >
      <div className="flex items-center justify-between gap-3">
        <label
          htmlFor={`content-${locale}-${field.key}`}
          className="font-semibold text-sm"
        >
          {dt(field.label)}
        </label>
        {!field.locked ? (
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              aria-label={dt("تضمين في الترجمة: {0}", [dt(field.label)])}
              checked={selected.includes(field.key)}
              onChange={(e) =>
                setSelected((prev) =>
                  e.target.checked
                    ? [...prev, field.key]
                    : prev.filter((k) => k !== field.key),
                )
              }
            />
            {dt("تضمين في الترجمة")}
          </label>
        ) : (
          <span className="text-xs text-slate-500">{dt("مراجعة يدوية")}</span>
        )}
      </div>
      {field.key === "image" && locale !== "ar" ? (
        <ImageUploadField label={dt("غلاف هذه اللغة")} value={current.image || ""} onChange={url => edit("image", url)} onUploadingChange={onUploadingChange} />
      ) : field.key === "fileUrl" && ["reports", "booklets"].includes(kind) ? (
        <DocumentUploadField value={current[field.key] || ""} onChange={(url) => edit(field.key, url)} onUploadingChange={onUploadingChange} disabled={Boolean(busy)} />
      ) : field.rich ? (
        <div
          id={`content-${locale}-${field.key}`}
          aria-label={dt(field.label)}
          dir={LOCALES[locale as keyof typeof LOCALES]?.direction || "ltr"}
        >
          <RichEditor
            key={`${locale}-${field.key}`}
            ariaLabel={dt(field.label)}
            onUploadingChange={onUploadingChange}
            isEditable={busy !== "save" && busy !== "slug"}
            defaultValue={parseRich(current[field.key] || "")}
            className="min-h-48 rounded-lg border bg-white p-3"
            onUpdate={(editor) => {
              if (editor) edit(field.key, JSON.stringify(editor.getJSON()));
            }}
          />
        </div>
      ) : (
        <textarea
          id={`content-${locale}-${field.key}`}
          className="min-h-20 w-full rounded-lg border p-3 text-sm"
          dir={LOCALES[locale as keyof typeof LOCALES]?.direction || "ltr"}
          disabled={busy === "save" || busy === "slug"}
          value={current[field.key] || ""}
          onChange={(e) => edit(field.key, e.target.value)}
          aria-invalid={invalidField?.locale === locale && invalidField.key === field.key || (current[field.key] || "").length > contentFieldLimit(field.key)}
          maxLength={contentFieldLimit(field.key)}
        />
      )}
      {locale !== "ar" && source[field.key] ? (
        <details className="text-xs text-slate-500">
          <summary>{dt("النص العربي")}</summary>
          <p className="whitespace-pre-wrap break-words pt-2">
            {previewText(source[field.key])}
          </p>
        </details>
      ) : null}
      {field.group === "seo" ? (
        <p dir="ltr" className="text-left text-xs text-slate-500">
          {(current[field.key] || "").length} / {contentFieldLimit(field.key)}
        </p>
      ) : null}
      {status.missing.includes(field.key) ? (
        <p className="text-xs text-amber-700">
          {dt("هذا الحقل مطلوب لاكتمال الترجمة")}
        </p>
      ) : null}
    </section>
  );
  return (
    <div
      dir={dashDir()}
      data-content-workspace="true"
      className="mx-auto max-w-[1500px] space-y-6 pb-12 text-slate-800"
    >
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-white p-4 shadow-sm">
        <div>
          <Link className="text-sm text-slate-500" href={`/dashboard/${kind}`}>
            {dt(CONFIG[kind].label)}
          </Link>
          <h1 className="mt-1 text-xl font-bold">
            {current.title || current.name || current.question || document.title || dt("محتوى جديد")}
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-500">
            <span>{id === "new" && !dirty ? dt("لم يُحفظ بعد") : dirty ? dt("تعديلات غير محفوظة") : dt("محفوظ")}</span>
            <span>
              <bdi>{done} / {SUPPORTED_LOCALES.length - 1}</bdi> {dt("ترجمات مكتملة")}
            </span>
            <span>{SUPPORTED_LOCALES.length - 1 - done} {dt("تحتاج ترجمة")}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={button + " flex items-center gap-2 bg-white"}
            onClick={() => setLanguageReview(true)}
          >
            <Globe2 size={16} />
            {dt("اللغات والمراجعة")}
          </button>
          <button
            type="button"
            className={button + " flex items-center gap-2"}
            disabled={!dirty || Boolean(busy) || uploads > 0}
            onClick={resetDraft}
          >
            <Undo2 size={16} />
            {dt("التراجع")}
          </button>
          <Link
            className={button + " flex items-center gap-2"}
            href={`/dashboard/${kind}`}
          >
            <ArrowRight size={16} />
            {dt("العودة")}
          </Link>
          <button
            type="button"
            className={button + " flex items-center gap-2 bg-white"}
            onClick={() => setPreviewOpen(true)}
          >
            <Eye size={16} />
            {kind === "campaigns" ? dt("معاينة المشروع") : dt("معاينة الصفحة")}
          </button>
          <button
            type="button"
            className={
              button +
              " flex items-center gap-2 bg-brand text-white hover:bg-brand-dark"
            }
            disabled={Boolean(busy) || uploads > 0 || (!dirty && id !== "new")}
            onClick={save}
          >
            {!dirty && savedAt && busy !== "save" ? <CheckCircle2 size={16} /> : <Save size={16} />}
            {uploads
              ? dt("جار رفع الصور…")
              : busy === "save"
                ? dt("جار الحفظ…")
                : !dirty && savedAt ? dt("تم الحفظ") : dt("حفظ التغييرات")}
          </button>
        </div>
      </header>
      <div
        className="grid items-start gap-5 md:grid-cols-[200px_minmax(0,1fr)]"
      >
        <nav
          aria-label={dt("أقسام المحرر")}
          className="flex min-w-0 gap-1 overflow-x-auto rounded-xl border bg-white p-2 md:sticky md:top-24 md:max-h-[calc(100vh-7rem)] md:flex-col md:overflow-y-auto"
        >
          {EDITOR_SECTIONS[kind].map((item, index) => {
            const Icon = sectionIcons[item.icon as keyof typeof sectionIcons];
            return (
              <button
                key={item.id}
                type="button"
                aria-current={section === item.id ? "page" : undefined}
                className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-3 md:shrink text-start text-sm ${section === item.id ? "bg-brand/5 font-bold text-brand" : "text-slate-500 hover:bg-slate-50"}`}
                onClick={() => setSection(item.id)}
              >
                <Icon size={17} className="shrink-0" />
                <span className="flex-1">{dtMaybe(item.label)}</span>
                <small className="text-[10px] opacity-50">
                  {String(index + 1).padStart(2, "0")}
                </small>
              </button>
            );
          })}
          <button type="button" className="mt-2 hidden items-center justify-center gap-2 rounded-lg bg-brand px-3 py-3 text-sm text-white disabled:opacity-50 md:flex" disabled={Boolean(busy) || uploads > 0 || (!dirty && id !== "new")} onClick={save}><Save size={16} />{busy === "save" ? dt("جار الحفظ…") : dt("حفظ جميع التغييرات")}</button>
          <p className="hidden px-3 py-3 text-xs leading-6 text-slate-400 md:block">
            {dt("كل الأقسام تخص العنصر نفسه. راجع التغييرات ثم احفظها من الشريط العلوي.")}
          </p>
        </nav>
        <div className="min-w-0 space-y-5">
      {languageButtons}
      <section aria-label={dt("الترجمة وSEO")} className="space-y-4 rounded-2xl border border-sky-100 bg-gradient-to-l from-sky-50 to-white p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 font-semibold"><Globe2 size={18} aria-hidden="true" /><h2>{dt("الترجمة وSEO")}</h2></div>
          <p className="text-xs text-slate-500">{dt("١. إعداد الاقتراحات · ٢. مراجعتها · ٣. حفظ التغييرات")}</p>
        </div>
        <div className="grid items-end gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr))]">
          <label className="space-y-1 text-sm"><span>{dt("المهمة")}</span><select aria-label={dt("المهمة")} className="w-full rounded-lg border bg-white p-3" value={assistAction} disabled={Boolean(busy)} onChange={event => setAssistAction(event.target.value as typeof assistAction)}>
            <option value="translate">{dt("ترجمة المحتوى")}</option><option value="seo">{dt("تحسين الظهور في البحث")}</option><option value="proofread">{dt("تدقيق النصوص")}</option>{!isBanner ? <option value="faq">{dt("إعداد أسئلة شائعة")}</option> : null}
          </select></label>
          <label className="space-y-1 text-sm"><span>{dt("اللغات المستهدفة")}</span><select aria-label={dt("اللغات المستهدفة")} className="w-full rounded-lg border bg-white p-3" value={assistTargetScope} disabled={Boolean(busy)} onChange={event => setAssistScope(event.target.value)}>
            <option value="current">{LOCALES[(assistAction === "translate" && locale === "ar" ? "en" : locale) as keyof typeof LOCALES]?.nativeLabel}</option>{SUPPORTED_LOCALES.filter(code => code !== locale && !(assistAction === "translate" && code === "ar") && !(assistAction === "translate" && locale === "ar" && code === "en")).map(code => <option key={code} value={code}>{LOCALES[code as keyof typeof LOCALES]?.nativeLabel}</option>)}<option value="missing">{dt("اللغات غير المكتملة")}</option><option value="all">{dt("كل اللغات")}</option>
          </select></label>
          <button type="button" className={button + " bg-brand text-white"} disabled={Boolean(busy) || uploads > 0 || id === "new"} onClick={() => {
            const targets = (assistTargetScope === "current" ? [assistAction === "translate" && locale === "ar" ? "en" : locale] : SUPPORTED_LOCALES.includes(assistTargetScope as typeof SUPPORTED_LOCALES[number]) ? [assistTargetScope] : SUPPORTED_LOCALES.filter(code => assistTargetScope === "all" || !(assistAction === "seo" ? document.statuses[code]?.seoComplete : document.statuses[code]?.complete))).filter(code => assistAction !== "translate" || code !== "ar");
            void suggest(assistAction, false, targets);
          }}>{assistAction === "translate" ? assistTargetScope === "missing" ? dt("ترجمة اللغات الناقصة") : assistTargetScope === "all" ? dt("ترجمة كل اللغات") : dt("ترجمة الحقول المحددة") : dt("إعداد الاقتراحات")}</button>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs leading-6 text-slate-600"><p>{dt("تُستخدم مسودة العربية مصدرًا للترجمة. تطبيق الاقتراح يغيّر المسودة فقط؛ راجع التغييرات قبل الحفظ.")}</p><button type="button" className="font-semibold text-brand underline underline-offset-4" onClick={() => setSection("seo")}>{dt("فتح إعدادات SEO")}</button></div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={reviewed} onChange={event => setReviewed(event.target.checked)} />{dt("راجعت نص هذه اللغة")}</label>
      </section>
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
        <p>{dirty ? dt("ستُعد الاقتراحات من نسخة مستقلة من المسودة الحالية، دون حفظها أو نشرها.") : dt("كل اقتراح يُراجع في المسودة قبل الحفظ.")}</p>
        <button type="button" className="underline underline-offset-4 disabled:opacity-50" disabled={Boolean(busy) || uploads > 0} onClick={() => { if (!dirty || window.confirm(dt("تحميل النسخة المحفوظة وإلغاء تعديلات المسودة؟"))) void initialLoad(); }}>{dt("تحميل النسخة المحفوظة")}</button>
        {busy && busy !== "save" ? <span role="status">{dt("جار إعداد")}{" "}{busy === "seo" ? dt("الاقتراح") : busy === "slug" ? dt("الرابط") : dt("الترجمة")}…</span> : null}
      </div>
      {generationProgress ? <div role="status" className="flex flex-wrap items-center gap-3 rounded-xl border bg-sky-50 p-4">
        <span>{dt("عولجت {0} من {1} لغة", [generationProgress.done, generationProgress.total])}</span>
        <progress max={generationProgress.total} value={generationProgress.done} aria-label={dt("تقدم الاقتراحات")} />
        <button type="button" className={button} onClick={() => generationAbort.current?.abort()}>{dt("إيقاف الطلب")}</button>
      </div> : null}
      {message ? (
        <p
          role={messageTone === "error" ? "alert" : "status"}
          className={`rounded-xl border p-3 text-sm ${messageTone === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : messageTone === "error" ? "border-red-200 bg-red-50 text-red-800" : "border-sky-200 bg-sky-50 text-sky-800"}`}
        >
          {message}
        </p>
      ) : null}

      {proposal ? (
        <section className="space-y-3 rounded-xl border border-sky-200 bg-sky-50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-bold">{Object.keys(proposal.proposals).length ? dt("مراجعة الاقتراحات") : dt("لم تتوفر اقتراحات للمراجعة")}</h2>
            <button type="button" className={button} disabled={Boolean(busy) || !Object.keys(proposal.proposals).length} onClick={() => {
              for (const [target, item] of Object.entries(proposal.proposals))
                for (const [key, value] of Object.entries(item.values)) apply(target, key, value);
            }}>{dt("تطبيق جميع الاقتراحات على المسودة")}</button>
            <button
              type="button"
              className={button}
              onClick={() => setProposal(null)}
            >
              {dt("إغلاق")}
            </button>
          </div>
          {Object.values(proposal.failureReasons || {}).some(code => code.startsWith("AI_")) ? <Link href="/dashboard/platform-connections/tracking#ai-connection" className="inline-block text-sm font-semibold text-brand underline">{dt("مراجعة اتصال الذكاء الاصطناعي والنموذج")}</Link> : null}
          {proposal.skipped?.length ? <p className="text-sm text-slate-600">{dt("لم تُطلب هذه اللغات: {0}", [proposal.skipped.map(code => LOCALES[code as SupportedLocale]?.nativeLabel || code).join("، ")])}</p> : null}
          {Object.entries(proposal.errors).map(([code, error]) => (
            <p role="alert" key={code}>
              <bdi className="font-semibold">{LOCALES[code as SupportedLocale]?.nativeLabel || code}</bdi>: {error}
            </p>
          ))}
          {Object.entries(proposal.proposals).map(([code, item]) => (
            <div key={code} className="space-y-3">
              <h3 className="font-semibold">
                {LOCALES[code as keyof typeof LOCALES]?.nativeLabel || code}
              </h3>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={button}
                  onClick={() => {
                    for (const [key, value] of Object.entries(item.values))
                      if (!(values[code]?.[key] || "").trim())
                        apply(code, key, value);
                  }}
                >
                  {dt("ملء الحقول الفارغة في المسودة")}
                </button>
                <button
                  type="button"
                  className={button}
                  onClick={() => {
                    if (
                      window.confirm(
                        dt("استبدال حقول هذه اللغة بالاقتراحات المعروضة في المسودة؟"),
                      )
                    )
                      for (const [key, value] of Object.entries(item.values))
                        apply(code, key, value);
                  }}
                >
                  {dt("استخدام اقتراحات هذه اللغة")}
                </button>
              </div>
              {item.research ? <aside className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm">
                <b>{dt("أساس البحث ومصادره")}</b>
                <p>{item.research.summary}</p>
                <ul>{item.research.sources.map((source) => <li key={source.url}><a className="text-blue-700 underline" href={source.url} target="_blank" rel="noopener noreferrer">{source.title}</a></li>)}</ul>
              </aside> : null}
              {item.warnings.map((warning, i) => (
                <p key={i} className="text-amber-800 text-sm">
                  {dtMaybe(warning)}
                </p>
              ))}
              {Object.entries(item.values).map(([key, value]) => (
                <article key={key} className="rounded-lg border bg-white p-3">
                  <b className="text-sm">
                    {dtMaybe(document.fields.find((f) => f.key === key)?.label || key)}
                  </b>
                  {value.length > contentFieldLimit(key) ? <p role="alert" className="mt-2 text-sm text-red-700">{dt("النص يتجاوز الحد: {0} / {1} حرفًا. عدّله قبل الحفظ.", [value.length, contentFieldLimit(key)])}</p> : null}
                  <div className="mt-2 grid gap-3 md:grid-cols-2">
                    <div className="whitespace-pre-wrap break-words text-sm text-slate-500">
                      <p className="mb-2 text-xs font-semibold">{dt("المسودة قبل الاقتراح")}</p>{previewText((proposal.base || values)[code]?.[key] || dt("فارغ"))}
                    </div>
                    <div dir={LOCALES[code as keyof typeof LOCALES]?.direction || "ltr"} className="space-y-3"><p className="text-xs font-semibold">{dt("الاقتراح القابل للتعديل")}</p>
                      {key === "faqContent" ? readFaqDraft(value).map((question, index, questions) => (
                        <fieldset key={index} className="space-y-2 rounded border p-3">
                          <input aria-label={dt("السؤال {0}", [index + 1])} className="w-full rounded border p-2" value={question.q} onChange={(event) =>
                            reviseProposal(code, key, JSON.stringify(questions.map((item, position) => position === index ? { ...item, q: event.target.value } : item)))
                          } />
                          <textarea aria-label={dt("الإجابة {0}", [index + 1])} className="w-full rounded border p-2" rows={3} value={question.a} onChange={(event) =>
                            reviseProposal(code, key, JSON.stringify(questions.map((item, position) => position === index ? { ...item, a: event.target.value } : item)))
                          } />
                        </fieldset>
                      )) : document.fields.find((field) => field.key === key)?.rich ? (
                        <RichEditor defaultValue={parseRich(value)} onUpdate={(editor) => { if (editor) reviseProposal(code, key, JSON.stringify(editor.getJSON())); }}
                          className="rounded border bg-white [&_.ProseMirror]:min-h-40 [&_.ProseMirror]:p-3" />
                      ) : (
                        <textarea aria-label={dt("الاقتراح: {0}", [key])} className="w-full rounded border bg-white p-3" rows={4} maxLength={contentFieldLimit(key)} aria-invalid={value.length > contentFieldLimit(key)} value={value} onChange={(event) => reviseProposal(code, key, event.target.value)} />
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    className={button + " mt-3"}
                    onClick={() => apply(code, key, value)}
                  >
                    {dt("استخدام في المسودة")}
                  </button>
                </article>
              ))}
            </div>
          ))}
        </section>
      ) : null}
        <div className="space-y-5" inert={busy === "save" || busy === "slug"}>
          <h2 className="text-lg font-bold">
            {dtMaybe(EDITOR_SECTIONS[kind].find((s) => s.id === section)?.label || "")}{" "}
            <small className="font-normal text-slate-400">
              · {LOCALES[locale as keyof typeof LOCALES]?.nativeLabel}
            </small>
          </h2>
          {catalogError ? (
            <p role="alert" className="text-sm text-red-700">
              {dtMaybe(catalogError)}
            </p>
          ) : null}
          {kind === "super-categories" &&
          section === "content" &&
          Boolean(document.settings.verseArabic) ? (
            <section className="rounded-xl border bg-amber-50 p-5">
              <h3 className="text-sm font-semibold">
                {dt("النص العربي المحفوظ · للقراءة فقط")}
              </h3>
              <p lang="ar" dir={dashDir()} className="mt-4 text-xl leading-10">
                {String(document.settings.verseArabic)}
              </p>
              <p className="mt-3 text-xs text-slate-500">
                {dt("لا يُرسل إلى خدمة الترجمة ولا تغيّره تعديلات الصفحة.")}
              </p>
            </section>
          ) : null}
          {["content", "page", "layout", "links", "media"].includes(section) ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {document.fields
                .filter((f) => {
                  if (section === "media")
                    return f.key === "imageAlt" || f.key === "videoUrl" || (f.key === "image" && locale !== "ar");
                  if (f.group !== "content" || f.key === "videoUrl" || f.key === "image")
                    return false;
                  if (section === "layout")
                    return (
                      f.key.startsWith("blocks.") &&
                      Array.isArray(settingsDraft.blocks) &&
                      settingsDraft.blocks.some((b: ContentRecord) =>
                        f.key.startsWith(`blocks.${b.id}.`),
                      )
                    );
                  if (section === "links")
                    return kind === "urgent-banners" && f.key.startsWith("cta");
                  if (section === "page")
                    return (
                      kind === "categories" &&
                      !["name", "description"].includes(f.key)
                    );
                  if (kind === "urgent-banners")
                    return !f.key.startsWith("cta") && f.key !== "amountLabels";
                  if (kind === "categories")
                    return ["name", "description"].includes(f.key);
                  return !f.key.startsWith("blocks.");
                })
                .map(renderField)}
              {kind === "urgent-banners" && section === "media"
                ? document.fields
                    .filter((f) => f.key === "amountLabels")
                    .map(renderField)
                : null}
            </div>
          ) : null}
          <WorkspaceSettings
            onUploadingChange={onUploadingChange}
            kind={kind}
            section={section}
            settings={{ ...settingsDraft, id }}
            onChange={setSetting}
            catalog={catalog}
          />
          {kind === "super-categories" ? (
            <ProgrammeWorkspace
              section={section}
              settings={settingsDraft}
              onChange={setSetting}
              catalog={catalog}
              locale={locale}
            />
          ) : null}
          {kind === "categories" && section === "library" ? (
            <section className="space-y-4 rounded-xl border bg-white p-5">
              <h3 className="font-bold">{dt("المشاريع المرتبطة بهذا التصنيف")}</h3>
              <button
                type="button"
                className={button}
                disabled={dirty}
                onClick={() => setCategoryOrderOpen(true)}
              >
                {dt("ترتيب المشاريع داخل التصنيف")}
              </button>
              <p className="text-xs text-slate-500">
                {dt("ترتيب التصنيف مستقل عن الترتيب العام؛ يُحفظ من نافذة الترتيب نفسها.")}
              </p>
              <p className="text-sm text-slate-500">
                {dt("تعديل عضوية المشروع متاح من محرر المشروع، دون حذف بيانات التبرعات.")}
              </p>
              {catalog.campaigns
                .filter((c) => c.categoryIds?.includes(id))
                .sort((a, b) => (a.priority || 0) - (b.priority || 0))
                .map((c) => (
                  <Link
                    key={c.id}
                    href={`/dashboard/campaigns/edit/${c.id}`}
                    className="flex items-center justify-between rounded-lg border p-3 text-sm"
                  >
                    <span>{c.title}</span>
                    <span className="text-brand">{dt("تحرير المشروع ←")}</span>
                  </Link>
                ))}
            </section>
          ) : null}
          {kind === "categories" && section === "page" ? <CategoryStructureEditor settings={settingsDraft} locale={locale} values={current} onTextChange={edit} onChange={(key, value) => setSettingsDraft((previous) => ({ ...previous, [key]: value }))} /> : null}
          {["playlists", "courses"].includes(kind) && section === "media" ? (
            <MediaCollectionEditor kind={kind as "playlists" | "courses"} values={Array.isArray(settingsDraft.videos) ? settingsDraft.videos as ContentRecord[] : []} onChange={(videos) => setSettingsDraft((previous) => ({ ...previous, videos }))} />
          ) : null}
          {section === "seo" && ["campaigns", "categories", "blog", "super-categories"].includes(kind) && <Ga4SeoEvidenceControl value={analyticsPeriod} onChange={setAnalyticsPeriod} />}
          {section === "seo" ? (
            <SeoWorkspace
              onUploadingChange={onUploadingChange}
              focusField={invalidField?.locale === locale ? invalidField.key : undefined}
              values={current}
              fields={document.fields}
              renderField={renderField}
              onChange={edit}
              locale={locale}
            />
          ) : null}
          {kind === "campaigns" ? <div hidden={section !== "donation"} inert={busy === "save" || busy === "slug"} className="space-y-5">
            <div hidden={liveSettings.fundraisingMode === "SHARES"}><SuggestedDonationsSection key={"donations-" + presetEpoch} ref={donationPresets} initialConfig={parseSuggestedDonations(document.settings.suggestedDonations)} onDirty={markPresetsDirty} /></div>
            <div hidden={liveSettings.fundraisingMode !== "SHARES"} className="space-y-5">
              <SuggestedShareCountsSection key={"shares-" + presetEpoch} ref={sharePresets} initialConfig={parseSuggestedShareCounts(document.settings.suggestedShareCounts)} onDirty={markPresetsDirty} />
              <ShareLabelsSection key={"units-" + presetEpoch} ref={unitLabels} initialConfig={parseShareLabels(document.settings.shareLabels)} onDirty={markPresetsDirty} activeLocale={locale as keyof typeof LOCALES} />
            </div>
          </div> : null}
          {section === "donation" ? (
            <section className="rounded-xl border bg-white p-5">
              <h3 className="font-bold">{dt("المبلغ المحصّل")}</h3>
              <p className="my-3 text-2xl font-bold" dir="ltr">
                $
                {Number(document.settings.currentAmount || 0).toLocaleString(
                  "en-US",
                )}
              </p>
              <p className="text-sm leading-7 text-slate-500">
                {dt("للعرض فقط؛ يُحتسب من سجل التبرعات. تعديل المحتوى أو الهدف لا يغيّر المبلغ المحصّل.")}
              </p>
            </section>
          ) : null}
          {kind === "campaigns" && section === "history" ? (<>
            <ProjectVideoLibrary campaignId={id} refreshKey={JSON.stringify([document.revision, document.settings.updates])} disabled={dirty || Boolean(busy) || id === "new"} />
            <CampaignUpdatesEditor campaignId={id} updates={document.settings.updates} disabled={dirty || Boolean(busy)} onSaved={initialLoad} onUploadingChange={onUploadingChange} />
          </>) : null}
          {kind === "blog" && section === "review" && id !== "new" ? <Link href={`/dashboard/editorial-planner?improve=${id}`} className={button}>{dt("تجهيز تحسين المقال والبحث عن مصادره")}</Link> : null}
          {section === "review" ? (
            <section className="space-y-4 rounded-xl border bg-white p-5">
              <h3 className="font-bold">{dt("المراجعة قبل النشر")}</h3>
              {document.fields
                .filter((f) => f.required)
                .map((f) => (
                  <p key={f.key} className="flex justify-between border-b pb-3">
                    <span>{dtMaybe(f.label)}</span>
                    <span
                      className={
                        current[f.key] ? "text-emerald-700" : "text-amber-700"
                      }
                    >
                      {current[f.key] ? dt("موجود") : dt("ناقص")}
                    </span>
                  </p>
                ))}
              <button
                type="button"
                className={button}
                onClick={() => setLanguageReview(true)}
              >
                {dt("مراجعة جميع اللغات")}
              </button>
              <button
                type="button"
                className={button}
                onClick={() => setPreviewOpen(true)}
              >
                {dt("معاينة قبل الحفظ")}
              </button>
            </section>
          ) : null}
          <section className="rounded-xl border bg-white p-4">
            <h3 className="font-semibold">{dt("حالة اللغة")}</h3>
            <p className="mt-2 text-sm">
              {status.complete
                ? dt("المحتوى مكتمل")
                : dt("حقول ناقصة: {0}", [status.missing.length])}{" "}
              ·{" "}
              {status.seoComplete
                ? dt("إعدادات البحث مكتملة")
                : dt("إعدادات البحث تحتاج استكمالًا")}
            </p>
          </section>
          {["campaigns", "categories", "blog", "super-categories"].includes(kind) && section === "links" ? (
            <section className="space-y-3 rounded-xl border bg-white p-4">
              <h3 className="font-semibold">{dt("الرابط وسجل التغييرات")}</h3>
              <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"><CheckCircle2 size={16} className="me-2 inline" />{dt("حماية روابط الحملات مفعّلة: كل رابط قديم يحوّل تلقائيًا للرابط الجديد مع الاحتفاظ بوسوم التتبع.")}</p>
              <p className="text-xs leading-6 text-slate-600">{dt("يمكن تعديل لغة واحدة أو مراجعة روابط كل اللغات معًا. الروابط القديمة تستمر في التحويل للرابط المعتمد.")}</p>
              <button type="button" className={button + " bg-brand text-white hover:bg-brand-dark"} disabled={Boolean(busy) || dirty || id === "new"} onClick={openBulkSlugs}>{dt("تعديل روابط كل اللغات")}</button>
              <p dir="ltr" className="break-all text-sm">
                /{locale}/{kind === "categories" ? "category" : slugFor(kind === "blog" ? "article" : "projectDetail", locale)}/{document.slugs[locale]}
              </p>
              <button
                type="button"
                className={button}
                disabled={Boolean(busy) || dirty}
                onClick={() => {
                  setSlug(document.slugs[locale]);
                  setConfirmation("");
                  setSlugOpen(true);
                }}
              >
                {dt("تعديل الرابط")}
              </button>
              <button type="button" className={button} disabled={Boolean(busy) || dirty} onClick={() => {
                setSlug(slugify(current[kind === "categories" ? "name" : "title"] || ""));
                setConfirmation(""); setSlugOpen(true);
              }}>{dt("توليد الرابط من العنوان")}</button>
              {document.previousSlugs
                .filter((entry) => (entry.locale || "ar") === locale)
                .map((entry, i) => (
                  <div className="rounded-lg border p-2 text-xs" key={i}>
                    <p dir="ltr">
                      {String(entry.from)} → {String(entry.to)}
                    </p>
                    <p>{String(entry.at)}</p>
                    <button
                      type="button"
                      className={button}
                      onClick={() => {
                        setSlug(String(entry.from));
                        setConfirmation("");
                        setSlugOpen(true);
                      }}
                    >
                      {dt("استعادة الرابط السابق")}
                    </button>
                  </div>
                ))}
            </section>
          ) : null}
        </div>
      </div>
      </div>
      {languageReview ? (
        <EditorModal
          title={dt("اللغات والمراجعة")}
          onClose={() => setLanguageReview(false)}
        >
          <section className="max-h-[85vh] w-full max-w-5xl overflow-auto rounded-2xl bg-white p-6">
            <div className="mb-5 flex items-center justify-between">
              <h2 id="language-review-heading" className="text-xl font-bold">
                {dt("اللغات والمراجعة")}
              </h2>
              <button
                type="button"
                className={button}
                onClick={() => setLanguageReview(false)}
              >
                {dt("إغلاق")}
              </button>
            </div>
            <p className="mb-4 text-sm text-slate-500">
              {dt("النص البديل عند غياب الترجمة لا يُحسب ترجمة محفوظة.")}
            </p>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-start">
                  <th className="p-3 text-start">{dt("اللغة")}</th>
                  <th>{dt("المحتوى")}</th>
                  <th>{dt("البحث والمشاركة")}</th>
                  <th>{dt("المراجعة")}</th>
                  <th>{dt("التعديل")}</th>
                </tr>
              </thead>
              <tbody>
                {SUPPORTED_LOCALES.map((code) => {
                  const s = document.statuses[code];
                  return (
                    <tr key={code} className="border-b">
                      <td className="p-3">{LOCALES[code].nativeLabel}</td>
                      <td className="text-center">
                        {s.complete ? dt("مكتمل") : dt("ناقص")}
                      </td>
                      <td className="text-center">
                        {s.seoComplete ? dt("متاح") : dt("غير مكتمل")}
                      </td>
                      <td className="text-center">
                        {s.reviewed ? dt("مراجع") : dt("مسودة")}
                      </td>
                      <td className="text-center">
                        <button
                          type="button"
                          className="p-2 text-brand"
                          onClick={() => {
                            setLocale(code);
                            setSection("content");
                            setLanguageReview(false);
                          }}
                        >
                          {dt("النص")}
                        </button>
                        {!isBanner ? (
                          <button
                            type="button"
                            className="p-2 text-brand"
                            onClick={() => {
                              setLocale(code);
                              setSection("seo");
                              setLanguageReview(false);
                            }}
                          >
                            SEO
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        </EditorModal>
      ) : null}
      {previewOpen ? (
        <EditorModal
          title={dt("معاينة الصفحة")}
          wide
          onClose={() => setPreviewOpen(false)}
        >
          <section className="max-h-[90vh] w-full overflow-auto rounded-2xl bg-slate-50 p-2">
            <div className="mb-5 flex items-center justify-between">
              <h2 id="content-preview-heading" className="text-xl font-bold">
                {dt("معاينة الصفحة")}
              </h2>
              <button
                type="button"
                className={button}
                onClick={() => setPreviewOpen(false)}
              >
                {dt("إغلاق")}
              </button>
            </div>
            {["campaigns", "super-categories", "categories", "blog"].includes(kind) ? <PublicPagePreview kind={kind} id={id} locale={locale} changes={previewDraftValues(kind,current,settingsDraft)} settings={{...Object.fromEntries(Object.entries(settingsDraft).filter(([key, value]) => JSON.stringify(value) !== JSON.stringify(settingsFor(kind, document.settings)[key]))), ...(kind === "campaigns" && presetsDirty ? {suggestedDonations: donationPresets.current?.getPayload(), suggestedShareCounts: sharePresets.current?.getPayload(), shareLabels: unitLabels.current?.getPayload()} : {})}} /> : <WorkspacePreview kind={kind} values={current} source={source} settings={liveSettings} locale={locale} expanded />}
          </section>
        </EditorModal>
      ) : null}
      {categoryOrderOpen && kind === "categories" ? (
        <CategoryOrderDialog
          open
          onOpenChange={setCategoryOrderOpen}
          categoryId={id}
          categoryName={document.title}
        />
      ) : null}
      {bulkSlugOpen ? <EditorModal title={dt("مراجعة روابط اللغات")} onClose={() => { if (!busy) setBulkSlugOpen(false); }}>
        <div className="max-h-[85vh] w-full max-w-3xl space-y-4 overflow-auto rounded-xl bg-white p-5">
          <h2 className="text-xl font-bold">{dt("مراجعة روابط اللغات")}</h2>
          <p className="text-sm leading-7 text-slate-600">{dt("ألغِ تحديد أي لغة لاستثنائها. لن يتغير رابطها حتى لو كانت تستخدم رابط العربية أو الإنجليزية. تُحفظ التغييرات المحددة معًا، وتبقى الروابط السابقة محوّلة.")}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={button} disabled={Boolean(busy)} onClick={() => { setBulkSlugs(previous => ({ ...previous, ...Object.fromEntries(bulkSlugLocales.map(code => [code, slugify(values[code]?.[kind === "categories" ? "name" : "title"] || "") || previous[code]])) })); setBulkSlugConfirmed(false); }}>{dt("توليد الروابط من عناوين اللغات")}</button>
            <button type="button" className={button} disabled={Boolean(busy)} onClick={() => { setBulkSlugs(previous => ({ ...previous, ...Object.fromEntries(bulkSlugLocales.map(code => [code, previous[locale]])) })); setBulkSlugConfirmed(false); }}>{dt("توحيد المحدد على رابط اللغة الحالية")}</button>
          </div>
          <div className="space-y-2">
            {SUPPORTED_LOCALES.map(code => {
              const available = hasText(values[code]?.[kind === "categories" ? "name" : "title"]), selected = bulkSlugLocales.includes(code);
              return <div key={code} className={`grid gap-2 rounded-lg border p-3 sm:grid-cols-[150px_minmax(0,1fr)] ${selected ? "border-brand/30 bg-brand/5" : "bg-slate-50"}`}>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={!available || Boolean(busy)} checked={selected} onChange={event => { setBulkSlugLocales(previous => event.target.checked ? [...previous, code] : previous.filter(value => value !== code)); setBulkSlugConfirmed(false); }} />{LOCALES[code].nativeLabel}<bdi className="text-xs text-slate-500">{code.toUpperCase()}</bdi></label>
                <div className="space-y-1"><p className="break-all text-xs text-slate-500" dir="ltr">{document.slugs[code]}</p><input aria-label={dt("الرابط الجديد: {0}", [LOCALES[code].nativeLabel])} dir="ltr" className="w-full rounded border bg-white p-2 text-sm" disabled={!selected || Boolean(busy)} value={bulkSlugs[code] || ""} onChange={event => { setBulkSlugs(previous => ({ ...previous, [code]: event.target.value })); setBulkSlugConfirmed(false); }} />{!available ? <small>{dt("احفظ عنوان هذه اللغة أولًا؛ رابطها الحالي سيبقى كما هو.")}</small> : null}</div>
              </div>;
            })}
          </div>
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={bulkSlugConfirmed} disabled={Boolean(busy)} onChange={event => setBulkSlugConfirmed(event.target.checked)} />{dt("راجعت الروابط المحددة وأوافق على تحديثها مع حفظ التحويلات القديمة.")}</label>
          <div className="flex gap-2"><button type="button" className={button + " bg-brand text-white hover:bg-brand-dark"} disabled={Boolean(busy) || !bulkSlugConfirmed || !bulkSlugLocales.length || bulkSlugLocales.some(code => !bulkSlugs[code]?.trim())} onClick={saveBulkSlugs}>{busy === "slug" ? dt("جار الحفظ…") : dt("حفظ الروابط المحددة")}</button><button type="button" className={button} disabled={Boolean(busy)} onClick={() => setBulkSlugOpen(false)}>{dt("إلغاء")}</button></div>
        </div>
      </EditorModal> : null}
      {slugOpen ? (
        <EditorModal
          title={dt("مراجعة تغيير الرابط")}
          onClose={() => setSlugOpen(false)}
        >
          <div className="w-full max-w-lg space-y-4 rounded-xl bg-white p-6">
            <h2 id="slug-heading" className="text-xl font-bold">
              {dt("مراجعة تغيير الرابط")}
            </h2>
            <p className="text-sm">
              {dt("الرابط الحالي:")} <span dir="ltr">{document.slugs[locale]}</span>{dt(". ستبقى الروابط السابقة محوّلة مباشرة إلى الرابط المعتمد.")}
            </p>
            <label className="block space-y-2">
              <span>{dt("الرابط الجديد")}</span>
              <input
                autoFocus
                dir="ltr"
                value={slug}
                onChange={(e) => {
                  setSlug(e.target.value);
                  setConfirmation("");
                }}
                className="w-full rounded border p-2"
              />
            </label>
            <label className="block space-y-2">
              <span>{dt("اكتب الرابط الجديد مرة أخرى للتأكيد")}</span>
              <input
                dir="ltr"
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
                className="w-full rounded border p-2"
              />
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                className={button}
                disabled={Boolean(busy) || !slug || slug !== confirmation}
                onClick={changeSlug}
              >
                {dt("حفظ الرابط")}
              </button>
              <button
                type="button"
                className={button}
                onClick={() => setSlugOpen(false)}
              >
                {dt("إلغاء")}
              </button>
            </div>
          </div>
        </EditorModal>
      ) : null}
    </div>
  );
}
