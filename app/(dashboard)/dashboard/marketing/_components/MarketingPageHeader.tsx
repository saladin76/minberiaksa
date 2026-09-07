import type { ReactNode } from "react";

export function MarketingPageHeader({
  eyebrow = "Marketing Operating System",
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return <div className="rounded-2xl border bg-gradient-to-l from-brand to-[#01396f] p-5 text-white shadow-sm">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <p className="text-xs text-white/70">{eyebrow}</p>
        <h1 className="mt-1.5 text-xl sm:text-2xl font-bold tracking-tight">{title}</h1>
        <p className="mt-2 max-w-4xl text-sm leading-6 text-white/85">{description}</p>
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  </div>;
}
