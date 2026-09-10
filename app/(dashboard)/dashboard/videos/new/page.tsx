'use client';

import { VideoForm, emptyVideo } from '../_components/VideoForm';

export default function NewVideoPage() {
  return <VideoForm mode="create" initial={emptyVideo()} />;
}
