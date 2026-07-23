import { visualAssets } from "@/config/visual-assets";

export function GoldenIdentityPattern({ className = "" }: { className?: string }) {
  const asset = visualAssets.find((item) => item.id === "approved-islamic-pattern");
  if (!asset?.path || asset.status === "required") return null;

  return (
    <span
      className={["golden-identity-pattern", className].filter(Boolean).join(" ")}
      aria-hidden="true"
    />
  );
}
