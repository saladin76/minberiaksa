import { PageSkeleton } from '@/components/dashboard/skeletons';

/**
 * Default loading fallback for every dashboard route.
 *
 * Only one `loading.tsx` existed across all 151 routes, so navigating to a `force-dynamic`
 * server page left the previous screen frozen with no feedback until the server responded.
 * Individual sections can still override this with their own `loading.tsx`.
 */
export default function DashboardLoading() {
  return <PageSkeleton />;
}
