"use client";

export type ArchiveFileActivityItem = {
  id: string;
  message: string;
  actor: string;
  createdAt: string;
};

type Props = {
  items: ArchiveFileActivityItem[];
  loading: boolean;
};

export function ArchiveFileActivityPanel({ items, loading }: Props) {
  return (
    <div className="mt-3 rounded-lg border bg-white p-3 text-xs text-slate-600">
      <p className="mb-2 font-black text-slate-800">سجل النشاط</p>
      {loading ? (
        <p>جاري تحميل سجل النشاط...</p>
      ) : items.length === 0 ? (
        <p>لا يوجد نشاط مسجل لهذا الملف.</p>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <div key={item.id} className="border-b pb-2 last:border-b-0 last:pb-0">
              <p className="font-bold text-slate-800">{item.message}</p>
              <p className="mt-1 text-[11px] text-slate-400">{item.actor} · {formatDate(item.createdAt)}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ar", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
