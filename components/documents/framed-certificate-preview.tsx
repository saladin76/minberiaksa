import Image from "next/image";
import { visualAssets } from "@/config/visual-assets";
import { OfficialAssetPlaceholder } from "@/components/brand/official-asset-placeholder";

export function FramedCertificatePreview() {
  const asset = visualAssets.find((item) => item.id === "waqf-certificate");
  if (!asset) return null;
  return (
    <section className="framed-certificate-preview" aria-label="شكل شهادة الوقف بعد الإصدار">
      <div className="framed-certificate-preview__frame">
        {asset.path && asset.status !== "required" ? (
          <Image src={asset.path} alt={asset.alt} width={1400} height={1000} sizes="(max-width: 767px) 90vw, 42vw" />
        ) : (
          <OfficialAssetPlaceholder asset={asset} compact />
        )}
      </div>
      <p>تصور عرض فقط. الإطار والقاعدة والقلم تحتاج أصولًا معتمدة، ولا تمثل وثيقة صادرة.</p>
    </section>
  );
}
