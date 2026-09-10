'use client';

import { FaqForm, emptyFaq } from '../_components/FaqForm';

export default function NewFaqPage() {
  return <FaqForm mode="create" initial={emptyFaq()} />;
}
