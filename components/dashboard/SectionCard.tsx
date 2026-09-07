import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  title?: string;
  description?: string;
  icon?: LucideIcon;
  actions?: ReactNode;
  children: ReactNode;
  /** Removes the body padding — for tables that should sit flush against the card edge. */
  flush?: boolean;
  className?: string;
  bodyClassName?: string;
};

/**
 * A titled surface. The shell used to wrap every route in one big white card, which meant
 * pages nested cards inside cards; now the content well is neutral and each section brings
 * its own surface.
 */
export function SectionCard({
  title, description, icon: Icon, actions, children, flush, className, bodyClassName,
}: Props) {
  const hasHeader = Boolean(title || description || actions);

  return (
    <section className={cn("rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden", className)}>
      {hasHeader && (
        <header className="flex flex-wrap items-start justify-between gap-3 px-4 py-3.5 border-b border-slate-100">
          <div className="flex items-start gap-2.5 min-w-0">
            {Icon && (
              <span className="mt-0.5 w-8 h-8 shrink-0 rounded-lg bg-slate-50 text-slate-500 flex items-center justify-center">
                <Icon className="w-4 h-4" />
              </span>
            )}
            <div className="min-w-0">
              {title && <h2 className="text-[15px] font-semibold text-slate-900 truncate">{title}</h2>}
              {description && <p className="mt-0.5 text-xs text-slate-500 leading-5">{description}</p>}
            </div>
          </div>
          {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
        </header>
      )}
      <div className={cn(!flush && "p-4", bodyClassName)}>{children}</div>
    </section>
  );
}
