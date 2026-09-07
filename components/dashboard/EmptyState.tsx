import type { ReactNode } from "react";
import { Inbox, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  title: string;
  description?: string;
  icon?: LucideIcon;
  /** Primary CTA — the way out of the dead end. */
  action?: ReactNode;
  /** `inline` drops the border/background, for use inside an existing Card or table cell. */
  variant?: "card" | "inline";
  className?: string;
};

/**
 * Replaces the bare `<p>لا توجد بيانات</p>` that every page used as its empty state.
 * A text-only empty state leaves the user at a dead end with no indication of whether
 * something is broken, still loading, or genuinely empty — and no way forward.
 */
export function EmptyState({
  title, description, icon: Icon = Inbox, action, variant = "card", className,
}: Props) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center px-6 py-12",
        variant === "card" && "rounded-xl border border-dashed border-slate-200 bg-slate-50/60",
        className,
      )}
    >
      <span className="w-12 h-12 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-400 mb-3">
        <Icon className="w-5 h-5" />
      </span>
      <p className="text-sm font-semibold text-slate-800">{title}</p>
      {description && (
        <p className="mt-1 text-[13px] text-slate-500 max-w-sm leading-6">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
