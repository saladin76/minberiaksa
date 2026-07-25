import { visualAssets } from "@/config/visual-assets";

export function GoldenIdentityPattern({ className = "" }: { className?: string }) {
  const asset = visualAssets.find((item) => item.id === "islamic-pattern");
  if (!asset?.path) return null;

  return (
    <span
      className={["golden-identity-pattern", className].filter(Boolean).join(" ")}
      aria-hidden="true"
    />
  );
}
