'use client';

import { use, useEffect, useState } from 'react';
import axios from 'axios';
import { Loader2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { errorMessage } from '@/lib/dashboard/client-error-message';
import { translationsFromRows } from '../../../_components/ContentTranslationTabs';
import type { YoutubeRow } from '../../../_components/YoutubeRowsEditor';
import {
  PlaylistForm,
  PLAYLIST_TRANSLATION_FIELDS,
  emptyPlaylist,
  type PlaylistFormValues,
} from '../../_components/PlaylistForm';

type ApiVideo = {
  id: string; youtubeId: string; url: string; thumbnail: string | null;
  title: string | null; durationSeconds: number | null; isActive: boolean;
};

export default function EditPlaylistPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [initial, setInitial] = useState<PlaylistFormValues | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let live = true;
    axios
      .get(`/api/playlists/${id}`)
      .then((res) => {
        if (!live) return;
        const p = res.data;
        setInitial({
          ...emptyPlaylist(),
          slug: p.slug ?? '',
          title: p.title ?? '',
          description: p.description ?? '',
          youtubePlaylistUrl: p.youtubePlaylistUrl ?? '',
          kind: p.kind ?? 'PROGRAM',
          coverImage: p.coverImage ?? '',
          isActive: p.isActive !== false,
          translations: translationsFromRows(p.translations ?? [], PLAYLIST_TRANSLATION_FIELDS),
          videos: ((p.videos ?? []) as ApiVideo[]).map<YoutubeRow>((v) => ({
            id: v.id,
            youtubeId: v.youtubeId ?? '',
            url: v.url ?? '',
            thumbnail: v.thumbnail ?? '',
            title: v.title ?? '',
            durationSeconds: v.durationSeconds == null ? '' : String(v.durationSeconds),
            isActive: v.isActive !== false,
          })),
        });
      })
      .catch((e) => {
        if (!live) return;
        setMissing(true);
        toast.error(errorMessage(e, 'تعذّر تحميل قائمة التشغيل'));
      });
    return () => {
      live = false;
    };
  }, [id]);

  if (missing) {
    return <p className="py-24 text-center text-sm text-slate-500">قائمة التشغيل غير موجودة.</p>;
  }

  if (!initial) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return <PlaylistForm key={id} mode="edit" playlistId={id} initial={initial} />;
}
