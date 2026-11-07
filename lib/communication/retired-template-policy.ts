export function retiredTemplateDisposition(input: { retired: boolean; triggers: number; campaigns: number; history: number }) {
  if (!input.retired || input.triggers > 0 || input.campaigns > 0) return "KEEP" as const;
  return input.history > 0 ? "ARCHIVE" as const : "DELETE" as const;
}
