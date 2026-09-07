import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  title: string;
  /**
   * ReactNode rather than string: the revenue and monthly pages render a subtitle that
   * switches to a highlighted donor name when `?userId=` is present, so it has to carry
   * markup, not just text.
   */
  description?: ReactNode;
  /** Small label above the title — section name, breadcrumb-ish context. */
  eyebrow?: string;
  icon?: LucideIcon;
  /** Buttons, filters, export controls. */
  actions?: ReactNode;
  /** Tabs or a secondary nav row rendered flush under the header. */
  children?: ReactNode;
  className?: string;
};

/**
 * The single page header for the dashboard.
 *
 * Before this existed each page hand-rolled its own: `/campaigns` used
 * `text-xl sm:text-2xl`, `/monthly` used `text-xl sm:text-2xl md:text-3xl`, and the
 * marketing section used a full-bleed blue gradient card — so no two sections agreed on
 * what a page title looked like. Deliberately flat rather than a coloured slab: the shell
 * is neutral now, so the header should not compete with the content.
 */
export function PageHeader({
  title, description, eyebrow, icon: Icon, actions, children, className,
}: Props) {
  return (
    <div className={cn("mb-5", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          {Icon && (
            <span className="mt-0.5 w-10 h-10 shrink-0 rounded-xl bg-brand-50 text-brand flex items-center justify-center">
              <Icon className="w-5 h-5" />
            </span>
          )}
          <div className="min-w-0">
            {eyebrow && (
              <p className="text-[11px] font-semibold uppercase tracking-wider text-brand mb-0.5">
                {eyebrow}
              </p>
            )}
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
              {title}
            </h1>
            {description && (
              <div className="mt-1 text-sm text-slate-500 leading-6 max-w-3xl break-words">{description}</div>
            )}
          </div>
        </div>

        {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
      </div>

      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}
