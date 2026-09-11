'use client';

import { UrgentBannerForm, emptyUrgentBanner } from '../_components/UrgentBannerForm';

export default function NewUrgentBannerPage() {
  return <UrgentBannerForm mode="create" initial={emptyUrgentBanner()} />;
}
