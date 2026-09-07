"use client";

import type { ArchiveRefs } from "./archiveUploadedFileTypes";

type Props = {
  refs: ArchiveRefs;
  collectionId: string;
  projectId: string;
  onCollectionChange: (value: string) => void;
  onProjectChange: (value: string) => void;
  compact?: boolean;
};

export function ArchiveReferenceSelects({ refs, collectionId, projectId, onCollectionChange, onProjectChange, compact = false }: Props) {
  const projects = refs.projects.filter((project) => !collectionId || project.collectionId === collectionId);
  const inputClass = `${compact ? "h-8 text-xs" : "h-9 text-sm"} rounded-md border bg-white px-2 outline-none focus:border-brand`;

  return (
    <div className={compact ? "grid gap-2" : "grid gap-3 md:grid-cols-2"}>
      <select
        value={collectionId}
        onChange={(event) => {
          onCollectionChange(event.target.value);
          onProjectChange("");
        }}
        className={inputClass}
      >
        <option value="">بدون مجموعة</option>
        {refs.collections.map((collection) => (
          <option key={collection.id} value={collection.id}>{collection.name}</option>
        ))}
      </select>
      <select value={projectId} onChange={(event) => onProjectChange(event.target.value)} className={inputClass}>
        <option value="">بدون مشروع</option>
        {projects.map((project) => (
          <option key={project.id} value={project.id}>{project.title}</option>
        ))}
      </select>
    </div>
  );
}
