import { prisma } from "@/lib/prisma";
import { orderCampaignsByIds } from "@/lib/blog/campaign-ids";
import { whereByIdOrLocaleSlug } from "@/lib/slug";

export default async function getPost(postId: string, locale: string = "ar") {
  try {
    // Caller may pass an ID, the base slug, or a per-locale slug. The locale arg lets
    // the resolver match the right per-locale translation slug; if it doesn't match
    // we fall back through other locales.
    const probeLocales = Array.from(
      new Set([locale, "en", "ar", "fr", "tr", "id", "pt", "es"])
    );
    let post = null;
    for (const loc of probeLocales) {
      post = await prisma.post.findFirst({
        where: whereByIdOrLocaleSlug(postId, loc),
        include: {
          category: true,
          translations: true,
        },
      });
      if (post) break;
    }

    if (!post) return null;

    const ids = post.campaignIds ?? [];
    const campaignRows =
      ids.length === 0
        ? []
        : await prisma.campaign.findMany({
            where: { id: { in: ids } },
            select: {
              id: true,
              title: true,
              currentAmount: true,
              targetAmount: true,
              images: true,
              goalType: true,
              fundraisingMode: true,
              sharePriceUSD: true,
              suggestedShareCounts: true,
            },
          });
    const campaigns = orderCampaignsByIds(ids, campaignRows);

    return { ...post, campaigns };
  } catch (error) {
    console.error("Error fetching post:", error);
    return null;
  }
}
