import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Shared loading skeletons.
 *
 * `components/ui/skeleton.tsx` shipped with the shadcn install and had zero imports across
 * the whole dashboard — every page instead hand-wrote its own `animate-pulse` divs, using a
 * different grey (`bg-muted` here, `bg-slate-200` there) and a different block layout. These
 * wrappers give one shape per content type so loading states stop looking like five
 * different products.
 */

export function StatsSkeleton({ count = 4, className }: { count?: number; className?: string }) {
  return (
    <div className={cn("grid gap-3 grid-cols-2 lg:grid-cols-4", className)}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-xl border border-slate-200 bg-white p-4 space-y-2.5">
          <div className="flex items-start justify-between gap-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-7 w-7 rounded-lg" />
          </div>
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-2.5 w-16" />
        </div>
      ))}
    </div>
  );
}

export function TableSkeleton({
  rows = 8, columns = 5, className,
}: { rows?: number; columns?: number; className?: string }) {
  return (
    <div className={cn("rounded-xl border border-slate-200 bg-white overflow-hidden", className)}>
      <div className="flex items-center gap-4 px-4 py-3 border-b border-slate-200 bg-slate-50">
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={i} className="h-3 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-4 px-4 py-3.5 border-b border-slate-100 last:border-0">
          {Array.from({ length: columns }).map((_, c) => (
            <Skeleton key={c} className={cn("h-3.5 flex-1", c === 0 && "max-w-[40%]")} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function ChartSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("rounded-xl border border-slate-200 bg-white p-4", className)}>
      <Skeleton className="h-3.5 w-40 mb-4" />
      <div className="flex items-end gap-2 h-48">
        {[55, 80, 40, 95, 65, 75, 45, 85, 60, 70, 50, 90].map((h, i) => (
          <Skeleton key={i} className="flex-1 rounded-t" style={{ height: `${h}%` }} />
        ))}
      </div>
    </div>
  );
}

export function FilterBarSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2 mb-4", className)}>
      <Skeleton className="h-9 flex-1 min-w-[200px] rounded-lg" />
      <Skeleton className="h-9 w-36 rounded-lg" />
      <Skeleton className="h-9 w-36 rounded-lg" />
    </div>
  );
}

export function PageHeaderSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("mb-5 flex items-start justify-between gap-3", className)}>
      <div className="space-y-2">
        <Skeleton className="h-7 w-52" />
        <Skeleton className="h-3.5 w-72" />
      </div>
      <Skeleton className="h-9 w-28 rounded-lg" />
    </div>
  );
}

/** Whole-page fallback — header + stats + filters + table. Used by route `loading.tsx`. */
export function PageSkeleton({
  stats = 4, rows = 8, columns = 5,
}: { stats?: number; rows?: number; columns?: number }) {
  return (
    <div>
      <PageHeaderSkeleton />
      {stats > 0 && <StatsSkeleton count={stats} className="mb-4" />}
      <FilterBarSkeleton />
      <TableSkeleton rows={rows} columns={columns} />
    </div>
  );
}
