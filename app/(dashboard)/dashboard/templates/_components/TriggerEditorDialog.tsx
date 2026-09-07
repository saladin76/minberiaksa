"use client";

import * as React from "react";
import axios from "axios";
import { toast } from "react-hot-toast";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Zap } from "lucide-react";
import { TemplateDialogShell, FieldLabel } from "./TemplateDialogShell";
import { EVENT_CATALOG, DEFAULT_COOLDOWN_DAYS, DEFAULT_LAPSE_DAYS } from "@/lib/events/catalog";
import type { MessageTriggerEvent } from "@/lib/events/dispatch";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface TemplateRow {
  id: string;
  name: string;
}

export function TriggerEditorDialog({ open, onOpenChange }: Props) {
  const [event, setEvent] = React.useState<MessageTriggerEvent | "">("");
  const [channel, setChannel] = React.useState<"EMAIL" | "WHATSAPP">("EMAIL");
  const [templateId, setTemplateId] = React.useState<string>("");
  const [emailTemplates, setEmailTemplates] = React.useState<TemplateRow[]>([]);
  const [whatsappTemplates, setWhatsappTemplates] = React.useState<TemplateRow[]>([]);
  const [lapseDays, setLapseDays] = React.useState(String(DEFAULT_LAPSE_DAYS));
  const [cooldownDays, setCooldownDays] = React.useState(String(DEFAULT_COOLDOWN_DAYS));
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setEvent("");
    setChannel("EMAIL");
    setTemplateId("");
    setLapseDays(String(DEFAULT_LAPSE_DAYS));
    setCooldownDays(String(DEFAULT_COOLDOWN_DAYS));

    setLoading(true);
    Promise.all([
      axios.get("/api/templates/email").then((res) => res.data?.templates ?? []),
      axios.get("/api/templates/whatsapp").then((res) => res.data?.templates ?? []),
    ])
      .then(([emails, wa]) => {
        setEmailTemplates(emails);
        setWhatsappTemplates(wa);
      })
      .catch(() => toast.error("فشل تحميل القوالب"))
      .finally(() => setLoading(false));
  }, [open]);

  React.useEffect(() => {
    setTemplateId("");
  }, [channel]);

  const eventDef = event ? EVENT_CATALOG.find((e) => e.event === event) : null;
  const templates = channel === "EMAIL" ? emailTemplates : whatsappTemplates;
  const isScheduled = eventDef?.scheduled === true;
  const lapseValue = Number(lapseDays);
  const cooldownValue = Number(cooldownDays);
  const timingValid =
    !isScheduled ||
    (Number.isInteger(lapseValue) && lapseValue >= 1 && Number.isInteger(cooldownValue) && cooldownValue >= 1);

  const save = async () => {
    if (!event || !templateId) {
      toast.error("اختر الحدث والقالب");
      return;
    }
    if (!timingValid) {
      toast.error("أدخل عدد أيام صحيح");
      return;
    }
    setSaving(true);
    try {
      await axios.post("/api/templates/triggers", {
        event,
        channel,
        templateId,
        ...(isScheduled ? { lapseDays: lapseValue, cooldownDays: cooldownValue } : {}),
      });
      toast.success("تم إضافة الحدث");
      onOpenChange(false);
    } catch (err) {
      const e = err as { response?: { data?: { error?: string } } };
      toast.error(e.response?.data?.error || "فشل الحفظ");
    } finally {
      setSaving(false);
    }
  };

  return (
    <TemplateDialogShell
      open={open}
      onOpenChange={onOpenChange}
      title="حدث تلقائي جديد"
      subtitle="اربط حدثًا في النظام بقالب موجود — سيُرسل تلقائيًا للمتبرع المعني عند وقوع الحدث."
      icon={<Zap className="h-4 w-4" />}
      size="sm"
      loading={loading}
      onCancel={() => onOpenChange(false)}
      onSave={save}
      saving={saving}
      saveDisabled={!event || !templateId || !timingValid}
    >
      <div className="space-y-4">
        <div className="space-y-1.5">
          <FieldLabel>الحدث</FieldLabel>
          <Select value={event} onValueChange={(v) => setEvent(v as MessageTriggerEvent)}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="اختر الحدث" />
            </SelectTrigger>
            <SelectContent>
              {EVENT_CATALOG.map((e) => (
                <SelectItem key={e.event} value={e.event}>
                  {e.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {eventDef && (
            <div className="rounded-lg border border-border bg-slate-50/70 p-2.5">
              <p className="text-[11px] leading-relaxed text-slate-600">{eventDef.description}</p>
              {eventDef.hasDonation && (
                <p className="mt-1 flex flex-wrap items-center gap-1 text-[11px] text-brand">
                  ✓ متاح لهذا الحدث
                  <code className="break-all rounded bg-brand/10 px-1 font-mono">{"{{donation.*}}"}</code>
                  و
                  <code className="break-all rounded bg-brand/10 px-1 font-mono">{"{{#donation.items}}"}</code>
                </p>
              )}
            </div>
          )}
        </div>

        {isScheduled && (
          <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50/60 p-3">
            <p className="text-[11px] leading-relaxed text-amber-900">
              هذا حدث مجدول — يُفحص يوميًا بدل أن يُطلق فورًا. يُرسل للمتبرّع الذي مضى على آخر تبرّع ناجح له المدة أدناه.
            </p>
            {/* Was grid-cols-2 unconditionally, which squeezed two number inputs plus their
                Arabic labels into a narrow dialog on phones. */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="min-w-0 space-y-1.5">
                <FieldLabel>يُرسل بعد (يوم)</FieldLabel>
                <Input type="number" min={1} max={3650} value={lapseDays} onChange={(e) => setLapseDays(e.target.value)} className="text-right" />
              </div>
              <div className="min-w-0 space-y-1.5">
                <FieldLabel>لا يتكرّر قبل (يوم)</FieldLabel>
                <Input type="number" min={1} max={3650} value={cooldownDays} onChange={(e) => setCooldownDays(e.target.value)} className="text-right" />
              </div>
            </div>
            {!timingValid && <p className="text-[11px] text-red-600">أدخل عددًا صحيحًا لا يقل عن ١ في الحقلين.</p>}
          </div>
        )}

        <div className="space-y-1.5">
          <FieldLabel>القناة</FieldLabel>
          <Select value={channel} onValueChange={(v) => setChannel(v as "EMAIL" | "WHATSAPP")}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="EMAIL">بريد إلكتروني</SelectItem>
              <SelectItem value="WHATSAPP">واتساب</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <FieldLabel>القالب</FieldLabel>
          <Select value={templateId} onValueChange={setTemplateId}>
            <SelectTrigger className="w-full">
              <SelectValue
                placeholder={
                  templates.length === 0
                    ? "لا توجد قوالب — أنشئ قالبًا من تبويبة البريد/الواتساب"
                    : "اختر قالبًا"
                }
              />
            </SelectTrigger>
            <SelectContent>
              {templates.map((t) => (
                <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </TemplateDialogShell>
  );
}
