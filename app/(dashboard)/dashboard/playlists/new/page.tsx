'use client';

import { PlaylistForm, emptyPlaylist } from '../_components/PlaylistForm';

export default function NewPlaylistPage() {
  return <PlaylistForm mode="create" initial={emptyPlaylist()} />;
}
