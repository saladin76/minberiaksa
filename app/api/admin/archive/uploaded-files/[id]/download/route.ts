import { metadataObject, numberField, stringField } from "@/lib/archive/uploaded-files";
import { prisma } from "@/lib/prisma";
import { requireArchiveApiAccess, requireArchiveUploadedFileListAccess } from "../../../_auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> | { id: string } };

export async function GET(_request: Request, context: Params) {
  const { denied } = await requireArchiveApiAccess();
  if (denied) return denied;

  const { id } = await Promise.resolve(context.params);
  const row = await prisma.auditLog.findUnique({ where: { id }, select: { id: true, metadata: true, action: true, entityType: true } });
  if (!isArchiveUploadedFile(row)) return new Response("Not found", { status: 404 });

  const metadata = metadataObject(row.metadata);
  if (stringField(metadata.category) === "DOCUMENTS") {
    const docsAccess = await requireArchiveUploadedFileListAccess("DOCUMENTS");
    if (docsAccess.denied) return docsAccess.denied;
  }

  const fileName = safeFileName(stringField(metadata.fileName) || stringField(metadata.title) || "archive-file");
  const mimeType = stringField(metadata.mimeType) || "application/octet-stream";
  const blobDownloadUrl = stringField(metadata.blobDownloadUrl) || stringField(metadata.blobUrl);

  if (stringField(metadata.storageMode) === "BLOB" && blobDownloadUrl) {
    return streamBlobFile(blobDownloadUrl, fileName, mimeType);
  }

  const base64 = await readStoredBase64(row.id, metadata);
  if (!base64) return new Response("Not found", { status: 404 });

  return fileResponse(Buffer.from(base64, "base64"), fileName, mimeType);
}

function isArchiveUploadedFile(row: { action: string; entityType: string } | null): row is { id: string; metadata: unknown; action: string; entityType: string } {
  return Boolean(row && row.action === "archive.uploadedFile.create" && row.entityType === "ArchiveUploadedFile");
}

async function streamBlobFile(url: string, fileName: string, fallbackMimeType: string) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok || !response.body) return new Response("Not found", { status: 404 });
  return new Response(response.body, {
    headers: downloadHeaders(fileName, response.headers.get("Content-Type") || fallbackMimeType),
  });
}

function fileResponse(bytes: Buffer, fileName: string, mimeType: string) {
  return new Response(bytes, { headers: downloadHeaders(fileName, mimeType) });
}

function downloadHeaders(fileName: string, mimeType: string) {
  return {
    "Content-Type": mimeType,
    "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    "Cache-Control": "no-store",
  };
}

async function readStoredBase64(id: string, metadata: Record<string, unknown>) {
  const inline = stringField(metadata.base64);
  if (inline) return inline;

  const rows = await prisma.auditLog.findMany({
    where: { action: "archive.uploadedFile.chunk", entityType: "ArchiveUploadedFileChunk", entityId: id },
    orderBy: { createdAt: "asc" },
    select: { metadata: true },
  });

  return rows
    .map((row) => {
      const chunkMetadata = metadataObject(row.metadata);
      return { index: numberField(chunkMetadata.index), base64: stringField(chunkMetadata.base64) };
    })
    .filter((chunk) => chunk.base64)
    .sort((a, b) => a.index - b.index)
    .map((chunk) => chunk.base64)
    .join("");
}

function safeFileName(value: string) {
  return value.replace(/[\\/\u0000-\u001f]/g, "-");
}
