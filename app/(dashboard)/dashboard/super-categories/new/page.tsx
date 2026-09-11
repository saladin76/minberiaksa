'use client';

import { SuperCategoryForm, emptySuperCategory } from '../_components/SuperCategoryForm';

export default function NewSuperCategoryPage() {
  return <SuperCategoryForm mode="create" initial={emptySuperCategory()} />;
}
