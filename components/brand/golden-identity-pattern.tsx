import Image from "next/image";
import { visualAssets } from "@/config/visual-assets";

export function GoldenIdentityPattern({ className = "" }: { className?: string }) {
  const asset = visualAssets.find((item) => item.id === "approved-islamic-pattern");
  if (!asset?.path || asset.status === "required") {
    return <span className={["golden-identity-pattern", "is-placeholder", className].filter(Boolean).join(" ")} aria-hidden="true" />;
  }
  return (
    <span className={["golden-identity-pattern", className].filter(Boolean).join(" ")} aria-hidden="true">
      <Image src={asset.path} alt="" fill sizes="100vw" />
    </span>
  );
}
