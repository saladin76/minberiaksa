'use client';

import { StoryForm, emptyStory } from '../_components/StoryForm';

export default function NewStoryPage() {
  return <StoryForm mode="create" initial={emptyStory()} />;
}
