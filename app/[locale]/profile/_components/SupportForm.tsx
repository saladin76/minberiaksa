"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import { toast } from "react-hot-toast";
import { Headphones, Loader2, Send, MessageSquare, Clock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { MESSAGE_SUBJECTS, type MessageSubject } from "@/lib/messages/subjects";
import { useLocale, useTranslations } from "next-intl";

interface PreviousMessage {
  id: string;
  subject: MessageSubject | null;
  body: string;
  locale: string;
  createdAt: string;
}

interface Props {
  userId: string;
}

export default function SupportForm({ userId }: Props) {
  const t = useTranslations("Profile.support");
  const locale = useLocale();
  const isRtl = locale === "ar";

  const [subject, setSubject] = useState<MessageSubject>("GENERAL");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [messages, setMessages] = useState<PreviousMessage[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await axios.get(`/api/users/${userId}/messages`);
        if (!cancelled) setMessages(res.data?.messages ?? []);
      } catch (err) {
        console.error("support history error:", err);
      } finally {
        if (!cancelled) setLoadingHistory(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = body.trim();
    if (trimmed.length < 3) {
      toast.error(t("errorMin"));
      return;
    }
    setSubmitting(true);
    try {
      const res = await axios.post("/api/messages", {
        subject,
        body: trimmed,
        locale,
      });
      if (res.data?.id) {
        setMessages((prev) => [
          {
            id: res.data.id,
            subject,
            body: trimmed,
            locale,
            createdAt: new Date().toISOString(),
          },
          ...prev,
        ]);
      }
      setBody("");
      setSubject("GENERAL");
      toast.success(t("sent"));
    } catch (err) {
      console.error("support send error:", err);
      toast.error(t("failed"));
    } finally {
      setSubmitting(false);
    }
  };

  const subjectLabel = (s: MessageSubject | null) =>
    s ? t(`subjects.${s}` as const) : t("subjects.GENERAL");

  return (
    <div className="space-y-6" dir={isRtl ? "rtl" : "ltr"}>
      <Card className="p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-[#A5243D]/10 flex items-center justify-center">
            <Headphones className="w-5 h-5 text-[#A5243D]" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">{t("newTitle")}</h3>
            <p className="text-xs text-gray-500">{t("newSubtitle")}</p>
          </div>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-1.5">
            <Label htmlFor="support-subject">{t("subjectLabel")}</Label>
            <Select value={subject} onValueChange={(v) => setSubject(v as MessageSubject)}>
              <SelectTrigger id="support-subject">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MESSAGE_SUBJECTS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {subjectLabel(s)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="support-body">{t("bodyLabel")}</Label>
            <Textarea
              id="support-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={t("bodyPlaceholder")}
              className="min-h-[120px]"
              required
              minLength={3}
              maxLength={2000}
            />
            <p className="text-xs text-gray-500">{t("bodyHint", { remaining: 2000 - body.length })}</p>
          </div>

          <Button
            type="submit"
            disabled={submitting}
            className="w-full bg-[#A5243D] hover:bg-[#7D1830] text-white gap-2"
          >
            {submitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
            {t("submit")}
          </Button>
        </form>
      </Card>

      <Card className="p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
            <MessageSquare className="w-5 h-5 text-amber-700" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">{t("historyTitle")}</h3>
            <p className="text-xs text-gray-500">{t("historySubtitle")}</p>
          </div>
        </div>

        {loadingHistory ? (
          <div className="py-10 flex justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
          </div>
        ) : messages.length === 0 ? (
          <div className="py-10 text-center text-sm text-gray-500">
            {t("historyEmpty")}
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((m) => (
              <div
                key={m.id}
                className="p-4 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <Badge variant="outline" className="text-xs">
                    {subjectLabel(m.subject)}
                  </Badge>
                  <span className="text-xs text-gray-500 flex items-center gap-1 shrink-0">
                    <Clock className="w-3 h-3" />
                    {new Date(m.createdAt).toLocaleDateString(
                      locale === "ar" ? "ar-EG" : undefined,
                      { day: "numeric", month: "short", year: "numeric" }
                    )}
                  </span>
                </div>
                <p className="text-sm text-gray-700 whitespace-pre-wrap line-clamp-3">{m.body}</p>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
