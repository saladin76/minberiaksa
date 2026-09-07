import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { STATUS_CLASS, STATUS_LABEL, type ConnStatus } from "@/lib/platform-connections/readiness";

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("ar");
}

export function StatusBadge({ status }: { status: ConnStatus }) {
  // Matches the StatusChip shape used on the providers page so the section has
  // one pill, not two that differ only in radius and weight.
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${STATUS_CLASS[status]}`}>{STATUS_LABEL[status]}</span>;
}

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
  // Defaulted to the ربط المنصات overview until that page was removed. There is no hub to go back
  // to now, so the back link is opt-in: pass a backHref explicitly if a page needs one.
  backHref = null,
  backLabel = "رجوع",
}: {
  eyebrow?: string;
  title: string;
  subtitle: string;
  actions?: ReactNode;
  backHref?: string | null;
  backLabel?: string;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          {eyebrow ? <p className="text-xs font-bold text-brand">{eyebrow}</p> : null}
          <h1 className="mt-1 text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">{title}</h1>
          <p className="mt-1.5 max-w-3xl text-sm leading-6 text-slate-600">{subtitle}</p>
        </div>
        {backHref ? (
          <Link href={backHref} className="inline-flex h-9 shrink-0 items-center gap-2 rounded-md border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 transition hover:border-brand/50 hover:text-brand">
            {backLabel} <ArrowLeft className="h-4 w-4" />
          </Link>
        ) : null}
      </div>
      {actions ? <div className="mt-4 flex flex-wrap gap-2">{actions}</div> : null}
    </section>
  );
}

export function PrimaryLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="inline-flex h-10 items-center gap-2 rounded-md bg-brand px-4 text-sm font-bold text-white shadow-sm transition hover:bg-brand-700">
      {children}
    </Link>
  );
}

export function GhostLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 transition hover:border-brand/50 hover:text-brand">
      {children}
    </Link>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-xl border border-slate-200 bg-white shadow-sm ${className}`}>{children}</section>;
}

export function CardHeader({ title, description, action }: { title: ReactNode; description?: string; action?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-slate-200 p-4">
      <div>
        {/* Was font-black — heavier than the page's own h1, which reads as the
            card title outranking the page title. */}
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        {description ? <p className="mt-0.5 text-xs leading-5 text-slate-500">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

/** Status card for the overview setup band. `detail` may be a single string or several lines. */
export function StatusCard({
  title,
  status,
  lastCheck,
  actionHref,
  actionLabel,
  detail,
}: {
  title: string;
  status: ConnStatus;
  lastCheck?: string | null;
  actionHref: string;
  actionLabel: string;
  detail?: ReactNode;
}) {
  return (
    <div className="flex flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-bold text-slate-700">{title}</span>
        <StatusBadge status={status} />
      </div>
      {detail ? <div className="mt-2 space-y-0.5 text-xs text-slate-500">{detail}</div> : null}
      {lastCheck ? <p className="mt-2 text-[11px] text-slate-400">آخر فحص: {fmtDate(lastCheck)}</p> : null}
      <Link href={actionHref} className="mt-auto pt-3 inline-block text-xs font-bold text-brand hover:underline">{actionLabel} ←</Link>
    </div>
  );
}

export function EnvOnlyNote() {
  return (
    <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-6 text-slate-500">
      يتم ضبط هذا الربط من إعدادات السيرفر حاليًا.
    </p>
  );
}

/** Small "quick link" tile for the روابط سريعة grid. */
export function QuickLink({ href, label, icon }: { href: string; label: string; icon: ReactNode }) {
  return (
    <Link href={href} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-brand/50 hover:shadow">
      {/* bg-blue-50 is a different hue from brand (#025EB8) and clashed with the
          brand-coloured icon sitting on it. */}
      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand">{icon}</span>
      <span className="text-sm font-semibold text-slate-800">{label}</span>
    </Link>
  );
}
