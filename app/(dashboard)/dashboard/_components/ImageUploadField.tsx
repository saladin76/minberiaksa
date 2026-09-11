'use client';

import { useState } from 'react';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import { Loader2, Upload, X } from 'lucide-react';
import { errorMessage } from '@/lib/dashboard/client-error-message';
import { validateImageFile } from '@/lib/uploads/image-file-rules';

/**
 * The single-image field the content forms share: preview with a remove
 * button when set, an upload control when not. Uploads go through
 * `/api/upload`, whose limits `validateImageFile` mirrors so a bad file is
 * refused before the round trip.
 */
export function ImageUploadField({
  label,
  value,
  onChange,
  required,
  /** Tailwind size classes for the preview, e.g. "w-40 h-24". */
  previewClass = 'w-40 h-40',
}: {
  label: string;
  value: string;
  onChange: (url: string) => void;
  required?: boolean;
  previewClass?: string;
}) {
  const [uploading, setUploading] = useState(false);

  const upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const rejection = validateImageFile(file);
    if (rejection) {
      toast.error(rejection);
      e.target.value = '';
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await axios.post('/api/upload', fd);
      onChange(res.data.url);
    } catch (err) {
      toast.error(errorMessage(err, 'تعذّر رفع الصورة'));
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  return (
    <div className="space-y-1.5">
      <span className="text-xs font-semibold text-slate-600">
        {label}{required ? ' *' : ''}
      </span>
      {value ? (
        <div className={`relative ${previewClass.split(' ')[0]}`}>
          {/* Sources include Drive thumbnails and YouTube stills, which
              next/image would need configured hosts for. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt="" className={`${previewClass} object-cover rounded-lg border`} />
          <button
            type="button"
            onClick={() => onChange('')}
            className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <label className="flex items-center gap-2 w-fit px-3 py-2 border rounded-lg cursor-pointer hover:bg-slate-50">
          {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          <span className="text-sm">رفع صورة</span>
          <input type="file" accept="image/*" className="hidden" onChange={upload} />
        </label>
      )}
    </div>
  );
}
