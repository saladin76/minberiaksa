import type { MetadataRoute } from "next";
import { SITE_URL, isProductionDeployment } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  /* A preview or development deployment must never be indexed under its own
     URL. Header (`next.config.ts`), robots and metadata all say so, for the
     crawlers that read each (`DEPLOYED_VS_DESIGN_AUDIT.md` § P1.1). */
  if (!isProductionDeployment()) {
    return { rules: [{ userAgent: "*", disallow: "/" }] };
  }

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/dashboard/",
          "/api/",
          "/auth/",
          "/_next/",
        ],
      },
      {
        // Give Googlebot full crawl budget on public pages
        userAgent: "Googlebot",
        allow: "/",
        disallow: ["/dashboard/", "/api/", "/auth/"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
