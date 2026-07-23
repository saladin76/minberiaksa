import Image from "next/image";
import { visualAssets } from "@/config/visual-assets";
import { OfficialAssetPlaceholder } from "@/components/brand/official-asset-placeholder";

export function OfficialLetterShowcase() {
  const asset = visualAssets.find((item) => item.id === "waqf-letter");
  if (!asset) return null;
  return (
    <section className="document-showcase" aria-label="معاينة خطاب الاعتماد">
      {asset.path && asset.status !== "required" ? (
        <Image src={asset.path} alt={asset.alt} width={1200} height={1600} sizes="(max-width: 767px) 92vw, 38vw" />
      ) : (
        <OfficialAssetPlaceholder asset={asset} />
      )}
      <p>معاينة فقط — لا توقيع ولا ختم ولا خطاب قانوني حتى اعتماد الأصل الرسمي.</p>
    </section>
  );
}
