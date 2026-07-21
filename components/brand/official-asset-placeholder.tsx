import type { VisualAsset } from "@/config/visual-assets";

type Props = {
  asset: VisualAsset;
  className?: string;
  compact?: boolean;
  decorative?: boolean;
};

export function OfficialAssetPlaceholder({ asset, className = "", compact = false, decorative = false }: Props) {
  return (
    <div
      className={["official-asset-placeholder", compact ? "is-compact" : "", className].filter(Boolean).join(" ")}
      role={decorative ? undefined : "img"}
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : `${asset.alt}. الأصل الرسمي مطلوب.`}
    >
      <span>{asset.status.toUpperCase()}</span>
      <strong>{asset.replacementNote}</strong>
      <small>{asset.alt}</small>
    </div>
  );
}
