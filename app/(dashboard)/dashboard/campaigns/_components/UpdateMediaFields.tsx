'use client';

import { useEffect, useState } from 'react';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import { Film, Link2, Loader2, Upload, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { validateImageFile } from '@/lib/uploads/image-file-rules';

/**
 * The media of a campaign update: a photo, and a video that is either
 * uploaded from the device or a link (YouTube, Vimeo, Facebook).
 *
 * Photos go through `/api/upload` as before. Videos are too large for a
 * serverless request body, so the browser uploads them straight to
 * Cloudinary with a signature from `/api/upload/video-signature`; only the
 * resulting URL is stored on the update (`Update.videoUrl`), exactly as a
 * pasted link would be. The public page plays either kind.
 */

const MAX_VIDEO_BYTES = 100 * 1024 * 1024;

type VideoMode = 'link' | 'upload';

function isUploadedVideo(url: string): boolean {
  return /res\.cloudinary\.com\/.+\/video\/upload\//.test(url);
}

export function UpdateMediaFields({
  image,
  onImageChange,
  videoUrl,
  onVideoChange,
  idPrefix,
  onBusyChange,
}: {
  image: string;
  onImageChange: (url: string) => void;
  videoUrl: string;
  onVideoChange: (url: string) => void;
  /** Keeps the file inputs' ids unique when two dialogs are mounted. */
  idPrefix: string;
  /** Told when an upload starts and ends, so the dialog can hold its submit. */
  onBusyChange?: (busy: boolean) => void;
}) {
  const [uploadingImage, setUploadingImage] = useState(false);
  const [videoMode, setVideoMode] = useState<VideoMode>(videoUrl && isUploadedVideo(videoUrl) ? 'upload' : 'link');
  const [videoProgress, setVideoProgress] = useState<number | null>(null);
  const busy = uploadingImage || videoProgress !== null;
  useEffect(() => {
    onBusyChange?.(busy);
  }, [busy, onBusyChange]);

  const uploadImage = async (file: File) => {
    const rejection = validateImageFile(file);
    if (rejection) {
      toast.error(rejection);
      return;
    }
    setUploadingImage(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await axios.post('/api/upload', formData);
      onImageChange(response.data.url);
      toast.success('تم رفع الصورة بنجاح');
    } catch (error) {
      console.error('update image upload failed', error);
      toast.error('فشل في رفع الصورة');
    } finally {
      setUploadingImage(false);
    }
  };

  const uploadVideo = async (file: File) => {
    if (!file.type.startsWith('video/')) {
      toast.error('الملف المختار ليس فيديو');
      return;
    }
    if (file.size > MAX_VIDEO_BYTES) {
      toast.error('حجم الفيديو أكبر من 100 ميجابايت');
      return;
    }
    setVideoProgress(0);
    try {
      const { data: sig } = await axios.post('/api/upload/video-signature');
      const formData = new FormData();
      formData.append('file', file);
      formData.append('api_key', sig.apiKey);
      formData.append('timestamp', String(sig.timestamp));
      formData.append('signature', sig.signature);
      formData.append('folder', sig.folder);
      const response = await axios.post(sig.uploadUrl, formData, {
        onUploadProgress: (event) => {
          if (event.total) setVideoProgress(Math.round((event.loaded / event.total) * 100));
        },
      });
      const url = response.data?.secure_url as string | undefined;
      if (!url) throw new Error('no url');
      onVideoChange(url);
      toast.success('تم رفع الفيديو بنجاح');
    } catch (error) {
      console.error('update video upload failed', error);
      toast.error('فشل في رفع الفيديو');
    } finally {
      setVideoProgress(null);
    }
  };

  const dropzone = (busy: boolean) =>
    `flex flex-col items-center justify-center h-32 w-full border-2 border-dashed rounded-lg cursor-pointer hover:border-gray-400 transition-colors ${busy ? 'opacity-50 cursor-not-allowed' : ''}`;

  return (
    <div className="space-y-5">
      {/* Photo */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">صورة التحديث (اختياري)</label>
        {image ? (
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={image} alt="" className="h-48 w-full object-cover rounded-lg" />
            <button
              type="button"
              onClick={() => onImageChange('')}
              className="absolute top-2 right-2 p-1 bg-red-600 text-white rounded-full hover:bg-red-700 transition-colors"
              aria-label="إزالة الصورة"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              id={`${idPrefix}-image`}
              disabled={uploadingImage}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file) void uploadImage(file);
              }}
            />
            <label htmlFor={`${idPrefix}-image`} className={dropzone(uploadingImage)}>
              {uploadingImage ? (
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
              ) : (
                <>
                  <Upload className="w-6 h-6 text-gray-400" />
                  <span className="mt-2 text-sm text-gray-500">اضغط لرفع صورة</span>
                </>
              )}
            </label>
          </div>
        )}
      </div>

      {/* Video */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <label className="block text-sm font-medium text-gray-700">فيديو التحديث (اختياري)</label>
          <div className="inline-flex rounded-lg border p-0.5 text-xs">
            {(
              [
                { id: 'link', label: 'رابط يوتيوب / فيديو', icon: Link2 },
                { id: 'upload', label: 'رفع فيديو', icon: Film },
              ] as const
            ).map((mode) => (
              <button
                key={mode.id}
                type="button"
                onClick={() => setVideoMode(mode.id)}
                className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 font-semibold transition-colors ${videoMode === mode.id ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
              >
                <mode.icon className="w-3.5 h-3.5" />
                {mode.label}
              </button>
            ))}
          </div>
        </div>

        {videoMode === 'upload' && videoUrl && isUploadedVideo(videoUrl) ? (
          <div className="relative">
            <video src={videoUrl} controls preload="metadata" className="w-full max-h-64 rounded-lg bg-black" />
            <button
              type="button"
              onClick={() => onVideoChange('')}
              className="absolute top-2 right-2 p-1 bg-red-600 text-white rounded-full hover:bg-red-700 transition-colors"
              aria-label="إزالة الفيديو"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : videoMode === 'upload' ? (
          <div>
            <input
              type="file"
              accept="video/*"
              className="hidden"
              id={`${idPrefix}-video`}
              disabled={videoProgress !== null}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file) void uploadVideo(file);
              }}
            />
            <label htmlFor={`${idPrefix}-video`} className={dropzone(videoProgress !== null)}>
              {videoProgress !== null ? (
                <>
                  <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                  <span className="mt-2 text-sm text-gray-500">جارٍ الرفع… {videoProgress}%</span>
                </>
              ) : (
                <>
                  <Film className="w-6 h-6 text-gray-400" />
                  <span className="mt-2 text-sm text-gray-500">اضغط لرفع فيديو (حتى 100 ميجابايت)</span>
                </>
              )}
            </label>
          </div>
        ) : (
          <Input
            dir="ltr"
            value={isUploadedVideo(videoUrl) ? '' : videoUrl}
            onChange={(e) => onVideoChange(e.target.value.trim())}
            placeholder="https://www.youtube.com/watch?v=…"
          />
        )}
      </div>
    </div>
  );
}

