type Category = "MARKETING" | "DOCUMENTS";

const CLIENT_CHUNK_BYTES = 1_500_000;
const DIRECT_UPLOAD_MAX_BYTES = 3_000_000;

type UploadArgs = {
  category: Category;
  title: string;
  notes?: string;
  file: File;
  linkedCollectionId?: string;
  linkedProjectId?: string;
  onProgress?: (progress: number) => void;
};

export async function uploadArchiveFile({ category, title, notes, file, linkedCollectionId, linkedProjectId, onProgress }: UploadArgs) {
  if (file.size <= DIRECT_UPLOAD_MAX_BYTES) {
    const formData = new FormData();
    formData.set("category", category);
    formData.set("title", title || file.name);
    formData.set("notes", notes || "");
    formData.set("linkedCollectionId", linkedCollectionId || "");
    formData.set("linkedProjectId", linkedProjectId || "");
    formData.set("file", file);
    const response = await fetch("/api/admin/archive/uploaded-files", { method: "POST", body: formData });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.ok) throw new Error(result?.error || result?.message || "تعذر رفع الملف");
    onProgress?.(100);
    return result;
  }

  const totalChunks = Math.ceil(file.size / CLIENT_CHUNK_BYTES);
  const startResponse = await fetch("/api/admin/archive/uploaded-files/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      category,
      title: title || file.name,
      notes: notes || "",
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      sizeBytes: file.size,
      totalChunks,
      linkedCollectionId: linkedCollectionId || "",
      linkedProjectId: linkedProjectId || "",
    }),
  });
  const startResult = await startResponse.json().catch(() => null);
  if (!startResponse.ok || !startResult?.ok || !startResult.uploadId) {
    throw new Error(startResult?.error || startResult?.message || "تعذر بدء رفع الملف");
  }

  const uploadId = startResult.uploadId as string;
  for (let index = 0; index < totalChunks; index += 1) {
    const start = index * CLIENT_CHUNK_BYTES;
    const end = Math.min(start + CLIENT_CHUNK_BYTES, file.size);
    const chunk = file.slice(start, end);
    const formData = new FormData();
    formData.set("index", String(index));
    formData.set("total", String(totalChunks));
    formData.set("chunk", new File([chunk], `${file.name}.part-${index}`, { type: "application/octet-stream" }));

    const chunkResponse = await fetch(`/api/admin/archive/uploaded-files/${encodeURIComponent(uploadId)}/chunk`, { method: "POST", body: formData });
    const chunkResult = await chunkResponse.json().catch(() => null);
    if (!chunkResponse.ok || !chunkResult?.ok) {
      throw new Error(chunkResult?.error || chunkResult?.message || `تعذر رفع الجزء ${index + 1}`);
    }
    onProgress?.(Math.round(((index + 1) / totalChunks) * 95));
  }

  const completeResponse = await fetch(`/api/admin/archive/uploaded-files/${encodeURIComponent(uploadId)}/complete`, { method: "POST" });
  const completeResult = await completeResponse.json().catch(() => null);
  if (!completeResponse.ok || !completeResult?.ok) {
    throw new Error(completeResult?.error || completeResult?.message || "تعذر إنهاء رفع الملف");
  }
  onProgress?.(100);
  return completeResult;
}
