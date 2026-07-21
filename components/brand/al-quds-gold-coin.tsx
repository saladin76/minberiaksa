import Image from "next/image";
import { visualAssets } from "@/config/visual-assets";
import { OfficialAssetPlaceholder } from "./official-asset-placeholder";

type Props = {
  decorative?: boolean;
  priority?: boolean;
  className?: string;
};

export function AlQudsGoldCoin({ decorative = false, priority = false, className = "" }: Props) {
  const asset = visualAssets.find((item) => item.id === "al-quds-gold-coin");
  if (!asset) return null;

  if (!asset.path || asset.status === "required") {
    return <OfficialAssetPlaceholder asset={asset} decorative={decorative} className={["al-quds-coin", className].filter(Boolean).join(" ")} />;
  }

  return (
    <figure className={["al-quds-coin", className].filter(Boolean).join(" ")} aria-hidden={decorative || undefined}>
      <Image src={asset.path} alt={decorative ? "" : asset.alt} width={1200} height={1200} sizes="(max-width: 767px) 68vw, 34vw" priority={priority} />
    </figure>
  );
}
