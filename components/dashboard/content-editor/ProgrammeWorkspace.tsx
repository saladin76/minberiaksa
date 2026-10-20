"use client";
import { useState } from "react";
import type { ContentRecord } from "@/lib/content-editor/contracts";
import type { EditorCatalog } from "./WorkspaceSettings";
const labels: Record<string, string> = {
  CAMPAIGN: "المشاريع",
  POST: "المقالات",
  VIDEO: "الفيديوهات",
  PLAYLIST: "السلاسل",
  COURSE: "الدورات",
  REPORT: "التقارير",
  BOOKLET: "الكتيبات",
};
const kinds: Record<string, string> = {
  TEXT: "قسم نصي",
  CAMPAIGNS: "شبكة المشاريع",
  POSTS: "شبكة المقالات",
  VIDEOS: "الفيديوهات",
  PLAYLISTS: "السلاسل",
  COURSES: "الدورات",
  REPORTS: "التقارير",
  BOOKLETS: "الكتيبات",
  VIDEO: "فيديو مفرد",
  PLAYLIST_EPISODES: "حلقات سلسلة",
};
const control = "rounded-lg border bg-white px-3 py-2 text-sm";
export function ProgrammeWorkspace({
  section,
  settings,
  catalog,
  onChange,
  locale,
}: {
  section: string;
  settings: ContentRecord;
  catalog: EditorCatalog;
  onChange: (key: string, value: unknown) => void;
  locale: string;
}) {
  const [search, setSearch] = useState("");
  const [newKind, setNewKind] = useState("TEXT");
  const items = (
    Array.isArray(settings.items) ? settings.items : []
  ) as ContentRecord[];
  const blocks = (
    Array.isArray(settings.blocks) ? settings.blocks : []
  ) as ContentRecord[];
  const move = (
    key: "blocks" | "items",
    list: ContentRecord[],
    index: number,
    delta: number,
  ) => {
    const next = [...list];
    [next[index], next[index + delta]] = [next[index + delta], next[index]];
    onChange(
      key,
      next.map((v, order) => ({ ...v, order })),
    );
  };
  if (section === "library")
    return (
      <section className="space-y-5 rounded-xl border bg-white p-5">
        <div>
          <h3 className="font-bold">مكتبة المحتوى المرتبط</h3>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            اختر من المحتوى الموجود. الربط لا ينشر العناصر غير المنشورة ولا ينشئ
            بيانات تجريبية.
          </p>
        </div>
        <input
          className={control + " w-full"}
          aria-label="البحث في مكتبة المحتوى"
          placeholder="ابحث بالاسم أو المعرّف"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {Object.entries(catalog.linked)
          .filter(([, options]) => options.length)
          .map(([kind, options]) => (
            <fieldset key={kind} className="rounded-lg border p-4">
              <legend className="px-2 font-semibold">
                {labels[kind] || kind}
              </legend>
              <div className="grid max-h-64 gap-2 overflow-auto sm:grid-cols-2">
                {options
                  .filter((o) =>
                    (o.title + " " + o.id)
                      .toLowerCase()
                      .includes(search.toLowerCase()),
                  )
                  .map((o) => (
                    <label
                      key={o.id}
                      className="flex items-start gap-2 rounded border p-3 text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={items.some(
                          (i) => i.kind === kind && i.refId === o.id,
                        )}
                        onChange={(e) =>
                          onChange(
                            "items",
                            e.target.checked
                              ? [
                                  ...items,
                                  { kind, refId: o.id, order: items.length },
                                ]
                              : items.filter(
                                  (i) => i.kind !== kind || i.refId !== o.id,
                                ),
                          )
                        }
                      />
                      <span>
                        {o.title}
                        {o.live === false ? (
                          <small className="block text-amber-700">
                            غير منشور
                          </small>
                        ) : null}
                      </span>
                    </label>
                  ))}
              </div>
            </fieldset>
          ))}
        <h4 className="font-bold">ترتيب المحتوى المختار ({items.length})</h4>
        {items.map((item, index) => (
          <div
            key={String(item.kind) + String(item.refId)}
            className="flex items-center gap-2 rounded border p-3"
          >
            <span className="flex-1 text-sm">
              {catalog.linked[String(item.kind)]?.find(
                (o) => o.id === item.refId,
              )?.title || String(item.refId)}
            </span>
            <button
              type="button"
              className={control}
              disabled={!index}
              onClick={() => move("items", items, index, -1)}
            >
              ↑
            </button>
            <button
              type="button"
              className={control}
              disabled={index === items.length - 1}
              onClick={() => move("items", items, index, 1)}
            >
              ↓
            </button>
            <button
              type="button"
              className={control}
              onClick={() =>
                onChange(
                  "items",
                  items.filter((_, n) => n !== index),
                )
              }
            >
              إزالة الربط
            </button>
          </div>
        ))}
      </section>
    );
  if (section !== "layout") return null;
  const available = Object.keys(kinds).filter(
    (k) =>
      ["TEXT", "VIDEO"].includes(k) ||
      (k === "PLAYLIST_EPISODES" && catalog.linked.PLAYLIST?.length) ||
      Object.entries(labels).some(
        ([singular]) =>
          k === singular + "S" && catalog.linked[singular]?.length,
      ),
  );
  return (
    <section className="space-y-4 rounded-xl border bg-white p-5">
      <h3 className="font-bold">ترتيب أقسام الصفحة</h3>
      <p className="text-sm leading-6 text-slate-500">
        رتّب الأقسام وحدد ظهورها وروابطها. نصوص الأقسام الحالية أدناه قابلة
        للتحرير لكل لغة؛ تُضاف الأقسام الجديدة بالعربية ثم تظهر حقول ترجمتها بعد
        الحفظ.
      </p>
      {blocks.map((block, index) => {
        const update = (key: string, value: unknown) =>
          onChange(
            "blocks",
            blocks.map((b, n) => (n === index ? { ...b, [key]: value } : b)),
          );
        return (
          <fieldset
            key={String(block.id || "new-" + index)}
            className="space-y-3 rounded-xl border p-4"
          >
            <legend className="px-2 text-sm font-bold">
              {index + 1}. {kinds[String(block.kind)] || String(block.kind)}
            </legend>
            <div className="flex flex-wrap items-center gap-2">
              <label className="me-auto flex gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={block.isActive !== false}
                  onChange={(e) => update("isActive", e.target.checked)}
                />
                عرض القسم
              </label>
              <button
                type="button"
                className={control}
                disabled={!index}
                onClick={() => move("blocks", blocks, index, -1)}
              >
                ↑
              </button>
              <button
                type="button"
                className={control}
                disabled={index === blocks.length - 1}
                onClick={() => move("blocks", blocks, index, 1)}
              >
                ↓
              </button>
              <button
                type="button"
                className={control + " text-red-700"}
                onClick={() => {
                  if (
                    window.confirm(
                      "إزالة هذا القسم ونصوصه من الصفحة عند الحفظ؟",
                    )
                  )
                    onChange(
                      "blocks",
                      blocks.filter((_, n) => n !== index),
                    );
                }}
              >
                إزالة
              </button>
            </div>
            {!block.id ? (
              <label className="block space-y-2 text-sm">
                عنوان القسم الجديد
                <input
                  className={control + " w-full"}
                  value={String(block.title || "")}
                  onChange={(e) => update("title", e.target.value)}
                />
              </label>
            ) : null}
            <label className="block space-y-2 text-sm">
              معرّف الارتساء (مثل projects)
              <input
                dir="ltr"
                className={control + " w-full"}
                value={String(block.anchor || "")}
                onChange={(e) => update("anchor", e.target.value)}
              />
            </label>
            {["TEXT", "PLAYLIST_EPISODES"].includes(String(block.kind)) ? (
              <label className="block space-y-2 text-sm">
                وجهة رابط القسم
                <input
                  dir="ltr"
                  className={control + " w-full"}
                  value={String(block.linkUrl || "")}
                  onChange={(e) => update("linkUrl", e.target.value)}
                />
              </label>
            ) : null}
            {block.kind === "TEXT" ? (
              <label className="block space-y-2 text-sm">
                رابط الصورة
                <input
                  dir="ltr"
                  className={control + " w-full"}
                  value={String(block.image || "")}
                  onChange={(e) => update("image", e.target.value)}
                />
              </label>
            ) : null}
            {block.kind === "VIDEO" ? (
              <label className="block space-y-2 text-sm">
                معرّف YouTube
                <input
                  dir="ltr"
                  className={control + " w-full"}
                  value={String(block.youtubeId || "")}
                  onChange={(e) => update("youtubeId", e.target.value)}
                />
              </label>
            ) : null}
            {block.kind === "PLAYLIST_EPISODES" ? (
              <select
                aria-label="سلسلة حلقات القسم"
                className={control + " w-full"}
                value={String(block.refId || "")}
                onChange={(e) => update("refId", e.target.value)}
              >
                <option value="">اختر سلسلة</option>
                {catalog.linked.PLAYLIST?.map((o) => (
                  <option value={o.id} key={o.id}>
                    {o.title}
                  </option>
                ))}
              </select>
            ) : null}
            {!["TEXT", "VIDEO", "PLAYLIST_EPISODES"].includes(
              String(block.kind),
            ) ? (
              <label className="block space-y-2 text-sm">
                الحد الأقصى للعناصر
                <input
                  type="number"
                  min="1"
                  max="200"
                  className={control + " w-full"}
                  value={String(block.maxItems ?? "")}
                  onChange={(e) =>
                    update(
                      "maxItems",
                      e.target.value ? Number(e.target.value) : null,
                    )
                  }
                />
              </label>
            ) : null}
          </fieldset>
        );
      })}
      <div className="flex flex-wrap gap-2">
        <select
          aria-label="نوع القسم الجديد"
          className={control}
          value={newKind}
          onChange={(e) => setNewKind(e.target.value)}
        >
          {available.map((k) => (
            <option key={k} value={k}>
              {kinds[k]}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={locale !== "ar" || blocks.length >= 60}
          className={control + " bg-brand text-white disabled:opacity-40"}
          onClick={() =>
            onChange("blocks", [
              ...blocks,
              {
                kind: newKind,
                anchor: "",
                linkUrl: "",
                image: "",
                youtubeId: "",
                refId: "",
                maxItems: null,
                isActive: true,
                order: blocks.length,
                title: "قسم جديد",
              },
            ])
          }
        >
          إضافة قسم
        </button>
      </div>
    </section>
  );
}
