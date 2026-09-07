"use client";

import { useState } from "react";
import axios from "axios";
import { toast } from "react-hot-toast";
import { Eye, EyeOff, KeyRound, Loader2, ShieldCheck } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useLocale, useTranslations } from "next-intl";

interface Props {
  userId: string;
  /** True when this user already has a password (credentials auth). When false
   *  the user signed up via OAuth and we let them set an initial password
   *  without proving the (non-existent) current one. */
  hasPassword: boolean;
  /** Render-prop trigger. Defaults to a styled button. */
  trigger?: React.ReactNode;
}

export default function ChangePasswordDialog({ userId, hasPassword, trigger }: Props) {
  const t = useTranslations("Profile.password");
  const locale = useLocale();
  const isRtl = locale === "ar";

  const [open, setOpen] = useState(false);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNext, setShowNext] = useState(false);
  const [currentPwd, setCurrentPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setCurrentPwd("");
    setNewPwd("");
    setConfirmPwd("");
    setShowCurrent(false);
    setShowNext(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPwd.length < 8) {
      toast.error(t("errorMinLength"));
      return;
    }
    if (newPwd !== confirmPwd) {
      toast.error(t("errorMismatch"));
      return;
    }
    setSubmitting(true);
    try {
      await axios.post(`/api/users/${userId}/password`, {
        currentPassword: currentPwd,
        newPassword: newPwd,
      });
      toast.success(t("success"));
      reset();
      setOpen(false);
    } catch (err: unknown) {
      const msg =
        (axios.isAxiosError(err) && (err.response?.data as { error?: string })?.error) ||
        t("failed");
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const passwordStrengthLabel = (() => {
    if (!newPwd) return null;
    if (newPwd.length < 8) return { label: t("strengthWeak"), color: "text-red-600 bg-red-50" };
    const hasLower = /[a-z]/.test(newPwd);
    const hasUpper = /[A-Z]/.test(newPwd);
    const hasNum = /\d/.test(newPwd);
    const hasSym = /[^A-Za-z0-9]/.test(newPwd);
    const score = [hasLower, hasUpper, hasNum, hasSym].filter(Boolean).length;
    if (score >= 3 && newPwd.length >= 12) return { label: t("strengthStrong"), color: "text-emerald-700 bg-emerald-50" };
    if (score >= 2) return { label: t("strengthOk"), color: "text-amber-700 bg-amber-50" };
    return { label: t("strengthWeak"), color: "text-red-600 bg-red-50" };
  })();

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" className="gap-2">
            <KeyRound className="w-4 h-4" />
            {hasPassword ? t("change") : t("set")}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent dir={isRtl ? "rtl" : "ltr"} className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#A5243D]/10 flex items-center justify-center">
              <ShieldCheck className="w-4.5 h-4.5 text-[#A5243D]" />
            </div>
            <DialogTitle>{hasPassword ? t("change") : t("set")}</DialogTitle>
          </div>
        </DialogHeader>
        <form className="space-y-4 pt-2" onSubmit={handleSubmit}>
          {hasPassword && (
            <div className="space-y-1.5">
              <Label htmlFor="current-pwd">{t("currentLabel")}</Label>
              <div className="relative">
                <Input
                  id="current-pwd"
                  type={showCurrent ? "text" : "password"}
                  value={currentPwd}
                  onChange={(e) => setCurrentPwd(e.target.value)}
                  required
                  autoComplete="current-password"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrent((v) => !v)}
                  className="absolute inset-y-0 end-0 px-3 text-gray-400 hover:text-gray-700"
                  aria-label={showCurrent ? t("hide") : t("show")}
                >
                  {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="new-pwd">{t("newLabel")}</Label>
            <div className="relative">
              <Input
                id="new-pwd"
                type={showNext ? "text" : "password"}
                value={newPwd}
                onChange={(e) => setNewPwd(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowNext((v) => !v)}
                className="absolute inset-y-0 end-0 px-3 text-gray-400 hover:text-gray-700"
                aria-label={showNext ? t("hide") : t("show")}
              >
                {showNext ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {passwordStrengthLabel && (
              <p
                className={`inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full font-medium ${passwordStrengthLabel.color}`}
              >
                {passwordStrengthLabel.label}
              </p>
            )}
            <p className="text-xs text-gray-500">{t("hint")}</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="confirm-pwd">{t("confirmLabel")}</Label>
            <Input
              id="confirm-pwd"
              type={showNext ? "text" : "password"}
              value={confirmPwd}
              onChange={(e) => setConfirmPwd(e.target.value)}
              required
              autoComplete="new-password"
            />
          </div>

          <div className="flex gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => setOpen(false)}
              disabled={submitting}
            >
              {t("cancel")}
            </Button>
            <Button
              type="submit"
              className="flex-1 bg-[#A5243D] hover:bg-[#7D1830]"
              disabled={submitting}
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : t("save")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
