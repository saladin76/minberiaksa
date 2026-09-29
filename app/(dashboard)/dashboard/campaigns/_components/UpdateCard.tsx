'use client';

import { Calendar, Edit3, ImageOff, Mail, PlayCircle, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * One project update in the campaign editor: its photo or video on top, then
 * the date, title and text, and the actions  send to the project's donors as
 * an email campaign, edit, delete. Laid out as a card so a campaign's updates
 * read as a grid of posts, the way donors see them on the project page.
 */

export interface UpdateCardData {
  id: string;
  title: string;
  description: string;
  image?: string | null;
  videoUrl?: string | null;
  createdAt: string;
}

/** A still for a YouTube link; uploaded videos preview themselves. */
function youtubeStill(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\.|^m\./, '');
    if (host !== 'youtube.com' && host !== 'youtu.be') return null;
    const id =
      u.searchParams.get('v') ||
      (host === 'youtu.be' ? u.pathname.slice(1).split('/')[0] : u.pathname.match(/\/(?:shorts|embed|live)\/([^/?]+)/)?.[1]);
    return id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : null;
  } catch {
    return null;
  }
}

export function UpdateCard({
  update,
  dateLabel,
  onSend,
  onEdit,
  onDelete,
}: {
  update: UpdateCardData;
  dateLabel: string;
  onSend: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const video = update.videoUrl || '';
  const uploaded = video.includes('/video/upload/');
  const still = update.image || (video && !uploaded ? youtubeStill(video) : null);

  return (
    <article className="group flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md">
      <div className="relative aspect-video bg-slate-100">
        {uploaded && !update.image ? (
          <video src={video} controls preload="metadata" className="h-full w-full bg-black object-contain" />
        ) : still ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={still} alt={update.title} className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 text-slate-400">
            <ImageOff className="h-7 w-7" />
            <span className="text-xs">بدون صورة أو فيديو</span>
          </div>
        )}
        {video && !(uploaded && !update.image) ? (
          <a
            href={video}
            target="_blank"
            rel="noopener noreferrer"
            className="absolute bottom-2 start-2 inline-flex items-center gap-1 rounded-full bg-black/70 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur hover:bg-black/80"
          >
            <PlayCircle className="h-3.5 w-3.5" />
            فيديو
          </a>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
          <Calendar className="h-3.5 w-3.5" />
          {dateLabel}
        </span>
        <h3 className="line-clamp-2 text-base font-semibold leading-7 text-slate-900">{update.title}</h3>
        <p className="line-clamp-3 whitespace-pre-line text-sm leading-6 text-slate-600">{update.description}</p>

        <div className="mt-auto flex items-center gap-2 border-t border-slate-100 pt-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onSend}
            title="إرسال التحديث كحملة بريد لمتبرعي المشروع"
            className="flex-1 gap-1.5 border-emerald-200 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800"
          >
            <Mail className="h-4 w-4" />
            إرسال للمتبرعين
          </Button>
          <Button type="button" variant="ghost" size="icon" onClick={onEdit} title="تعديل" aria-label="تعديل التحديث" className="h-9 w-9 text-slate-600">
            <Edit3 className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onDelete}
            title="حذف"
            aria-label="حذف التحديث"
            className="h-9 w-9 text-red-600 hover:bg-red-50 hover:text-red-700"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </article>
  );
}
