"use client";

import { useEffect, useState } from "react";
import type { IntegrationProvider } from "@/lib/integration-settings/catalog";
import type { SafeProviderConnectionTestResponse } from "@/lib/integration-settings/types";
import { safeErrorMessage } from "@/lib/integration-settings/ui";
import { ROTATABLE_WEBHOOK_PROVIDERS, type IntegrationUiSnapshot } from "./model";

type Notice = { kind: "success" | "error"; text: string } | null;
type Drafts = Record<string, string>;

type WebhookReveal = { url: string; candidateVersion: string | null } | null;

async function json(response: Response): Promise<Record<string, any>> {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(body.error || "تعذر تنفيذ العملية."), { code: body.code });
  return body;
}

function cleanDrafts(snapshot: IntegrationUiSnapshot): Drafts {
  return Object.fromEntries(snapshot.fields.map((field) => [field.key, field.isSecret ? "" : field.displayValue ?? ""]));
}

export function useIntegrationSettings(initialProviders: IntegrationUiSnapshot[]) {
  const [providers, setProviders] = useState(initialProviders);
  const [active, setActive] = useState<IntegrationProvider>("META_WHATSAPP");
  const [drafts, setDrafts] = useState<Drafts>(() => cleanDrafts(initialProviders[0]));
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [lastCandidateTest, setLastCandidateTest] = useState<SafeProviderConnectionTestResponse | null>(null);
  const [lastActiveTest, setLastActiveTest] = useState<SafeProviderConnectionTestResponse | null>(null);
  const [webhookReveal, setWebhookReveal] = useState<WebhookReveal>(null);
  const snapshot = providers.find((item) => item.provider === active)!;
  const hasDirty = dirty.size > 0;

  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (!hasDirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasDirty]);

  useEffect(() => {
    const selected = providers.find((item) => item.provider === active);
    if (!selected) return;
    setDrafts(cleanDrafts(selected));
    setDirty(new Set());
    setLastCandidateTest(null);
    setLastActiveTest(null);
    setWebhookReveal(null);
    setNotice(null);
  }, [active]);

  function replaceSnapshot(next: IntegrationUiSnapshot) {
    setProviders((current) => current.map((item) => item.provider === next.provider ? next : item));
  }

  function chooseProvider(provider: IntegrationProvider) {
    if (provider === active) return;
    if (hasDirty && !window.confirm("لديك تغييرات لم يتم حفظها. هل تريد الانتقال دون حفظها؟")) return;
    setActive(provider);
  }

  function updateDraft(key: string, value: string) {
    setDrafts((current) => ({ ...current, [key]: value }));
    setDirty((current) => new Set(current).add(key));
    setNotice(null);
  }

  async function refreshProvider(provider: IntegrationProvider = active) {
    const body = await json(await fetch(`/api/admin/integration-settings/${provider}`, { cache: "no-store" }));
    replaceSnapshot(body.provider as IntegrationUiSnapshot);
    return body.provider as IntegrationUiSnapshot;
  }

  async function saveChanges() {
    if (active === "SYSTEM") return;
    const settings = snapshot.fields
      .filter((field) => dirty.has(field.key))
      .filter((field) => !field.isSecret || drafts[field.key]?.length > 0)
      .map((field) => ({ key: field.key, value: drafts[field.key] ?? "" }));
    if (!settings.length) return setNotice({ kind: "error", text: "لا توجد تغييرات صالحة للحفظ." });
    if (!snapshot.encryptionKeyConfigured && settings.some((item) => snapshot.fields.find((field) => field.key === item.key)?.isSecret)) {
      return setNotice({ kind: "error", text: "مفتاح تشفير إعدادات التكاملات غير مضبوط على السيرفر." });
    }
    setBusy("save");
    try {
      const body = await json(await fetch(`/api/admin/integration-settings/${active}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ settings }),
      }));
      const next = body.snapshot as IntegrationUiSnapshot;
      replaceSnapshot(next);
      setDrafts(cleanDrafts(next));
      setDirty(new Set());
      setLastCandidateTest(null);
      setNotice({ kind: "success", text: "تم حفظ التغييرات بأمان، ويجب اختبار الاتصال قبل اعتمادها." });
    } catch (error) {
      const e = error as Error & { code?: string };
      setNotice({ kind: "error", text: safeErrorMessage(e.code, e.message) });
    } finally { setBusy(null); }
  }

  async function testCandidate() {
    setBusy("test-candidate");
    setNotice(null);
    try {
      const body = await json(await fetch(`/api/admin/integration-settings/${active}/test-candidate`, {
        method: "POST", headers: { "content-type": "application/json" }, body: "{}",
      }));
      setLastCandidateTest(body as unknown as SafeProviderConnectionTestResponse);
      await refreshProvider();
      setNotice({ kind: body.success ? "success" : "error", text: body.success ? "نجح اختبار التغييرات. يمكنك الآن اعتماد الإعدادات." : `${safeErrorMessage(body.failureCode, body.messageAr)} التكوين العامل لم يتغير.` });
    } catch (error) {
      const e = error as Error & { code?: string };
      setNotice({ kind: "error", text: safeErrorMessage(e.code, e.message) });
    } finally { setBusy(null); }
  }

  async function testActive() {
    setBusy("test-active");
    setNotice(null);
    try {
      const body = await json(await fetch(`/api/admin/integration-settings/${active}/test-active`, {
        method: "POST", headers: { "content-type": "application/json" }, body: "{}",
      }));
      setLastActiveTest(body as unknown as SafeProviderConnectionTestResponse);
      await refreshProvider();
      setNotice({ kind: body.success ? "success" : "error", text: body.success ? "نجح فحص الإعدادات الحالية." : safeErrorMessage(body.failureCode, body.messageAr) });
    } catch (error) {
      const e = error as Error & { code?: string };
      setNotice({ kind: "error", text: safeErrorMessage(e.code, e.message) });
    } finally { setBusy(null); }
  }

  async function activateCandidate() {
    const candidateVersion = snapshot.candidate.version;
    if (!candidateVersion) return;
    setBusy("activate");
    try {
      const body = await json(await fetch(`/api/admin/integration-settings/${active}/activate-candidate`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ candidateVersion }),
      }));
      const next = await refreshProvider();
      setDrafts(cleanDrafts(next));
      setDirty(new Set());
      setLastCandidateTest(null);
      setWebhookReveal(null);
      setNotice({ kind: "success", text: "تم اعتماد الإعدادات بنجاح." });
    } catch (error) {
      const e = error as Error & { code?: string };
      if (e.code === "CANDIDATE_VERSION_MISMATCH" || e.code === "CANDIDATE_NOT_VERIFIED") await refreshProvider().catch(() => null);
      setNotice({ kind: "error", text: safeErrorMessage(e.code, e.message) });
    } finally { setBusy(null); }
  }

  async function discardCandidate() {
    const candidateVersion = snapshot.candidate.version;
    if (!candidateVersion || !window.confirm("سيتم حذف التغييرات غير المعتمدة، وستظل الإعدادات الحالية تعمل. هل تريد المتابعة؟")) return;
    setBusy("discard");
    try {
      await json(await fetch(`/api/admin/integration-settings/${active}/discard-candidate`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ candidateVersion }),
      }));
      const next = await refreshProvider();
      setDrafts(cleanDrafts(next));
      setDirty(new Set());
      setLastCandidateTest(null);
      setWebhookReveal(null);
      setNotice({ kind: "success", text: "تم إلغاء التغييرات، ولم يتأثر التكوين العامل." });
    } catch (error) {
      const e = error as Error & { code?: string };
      setNotice({ kind: "error", text: safeErrorMessage(e.code, e.message) });
    } finally { setBusy(null); }
  }

  /** Rotates the server-minted webhook secret for whichever provider is currently open. */
  async function rotateWebhook() {
    if (!ROTATABLE_WEBHOOK_PROVIDERS[active]) return;
    setBusy("rotate-webhook");
    setNotice(null);
    try {
      const body = await json(await fetch(`/api/admin/integration-settings/${active}/webhook-token`, { method: "POST" }));
      setWebhookReveal({ url: String(body.webhookUrl), candidateVersion: body.candidateVersion ?? null });
      await refreshProvider(active);
      setNotice({ kind: "success", text: "تم إنشاء رابط جديد بانتظار اعتماد الإعدادات." });
    } catch (error) {
      const e = error as Error & { code?: string };
      setNotice({ kind: "error", text: safeErrorMessage(e.code, e.message) });
    } finally { setBusy(null); }
  }

  async function deleteField(key: string, label: string) {
    if (active === "SYSTEM") return;
    if (!window.confirm(`سيتم حذف إعداد «${label}». قد يعود النظام إلى قيمة إعدادات السيرفر إن كانت موجودة. هل تريد المتابعة؟`)) return;
    setBusy(`delete:${key}`);
    try {
      await json(await fetch(`/api/admin/integration-settings/${active}`, { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ key, confirm: true }) }));
      await refreshProvider();
      setNotice({ kind: "success", text: `تم حذف إعداد ${label}.` });
    } catch (error) {
      const e = error as Error & { code?: string };
      setNotice({ kind: "error", text: safeErrorMessage(e.code, e.message) });
    } finally { setBusy(null); }
  }

  async function toggleProvider() {
    if (active === "SYSTEM") return;
    const action = snapshot.enabled ? "DISABLE" : "ENABLE";
    const warning = active === "ELASTIC_EMAIL"
      ? "تعطيل Elastic Email سيوقف كل رسائل البريد الإلكتروني."
      : active === "BREVO"
        ? "تعطيل Brevo سيوقف SMS للأرقام الدولية."
        : "تعطيل المزود قد يوقف إرسال الرسائل المرتبطة به.";
    if (!window.confirm(`${warning} هل تريد المتابعة؟`)) return;
    setBusy("toggle");
    try {
      await json(await fetch(`/api/admin/integration-settings/${active}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action }) }));
      await refreshProvider();
      setNotice({ kind: "success", text: action === "ENABLE" ? "تم تفعيل المزود." : "تم تعطيل المزود." });
    } catch (error) {
      const e = error as Error & { code?: string };
      setNotice({ kind: "error", text: safeErrorMessage(e.code, e.message) });
    } finally { setBusy(null); }
  }

  return {
    providers, active, snapshot, drafts, dirty, busy, notice, lastCandidateTest, lastActiveTest,
    webhookReveal, hasDirty, chooseProvider, updateDraft, saveChanges, testCandidate, testActive,
    activateCandidate, discardCandidate, rotateWebhook, deleteField, toggleProvider, setNotice,
  };
}
