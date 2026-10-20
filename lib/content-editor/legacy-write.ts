import { randomUUID } from "node:crypto";
export function contentWriteWhere<T extends object>(
  where: T,
  body: Record<string, unknown>,
) {
  if (!Object.prototype.hasOwnProperty.call(body, "expectedEditorVersion"))
    return where;
  const version = body.expectedEditorVersion;
  if (version !== null && typeof version !== "string")
    throw new Error("Invalid content version");
  return {
    ...where,
    AND: [
      {
        OR:
          version === null
            ? [{ editorVersion: null }, { editorVersion: { isSet: false } }]
            : [{ editorVersion: version }],
      },
    ],
  };
}
export function contentVersionPatch() {
  return { editorVersion: randomUUID() };
}
export function isContentWriteConflict(error: unknown) {
  return Boolean(
    error &&
    typeof error === "object" &&
    "code" in error &&
    (error.code === "P2025" || error.code === "P2034"),
  );
}
