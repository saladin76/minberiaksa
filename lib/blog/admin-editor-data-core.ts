export type BlogAdminEditorDataDependencies<TPost, TCategory, TCampaign> = {
  loadDashboardPageData: <T>(
    permission: "blog",
    loader: () => Promise<T>,
  ) => Promise<T>;
  getPost: (postId: string) => Promise<TPost | null>;
  loadCategories: () => Promise<TCategory[]>;
  loadCampaigns: () => Promise<TCampaign[]>;
};

export function createBlogAdminEditorDataLoaders<TPost, TCategory, TCampaign>(
  dependencies: BlogAdminEditorDataDependencies<TPost, TCategory, TCampaign>,
) {
  async function loadBlogCreateEditorData() {
    return dependencies.loadDashboardPageData("blog", async () => {
      const [categories, campaigns] = await Promise.all([
        dependencies.loadCategories(),
        dependencies.loadCampaigns(),
      ]);

      return { categories, campaigns };
    });
  }

  async function loadBlogEditEditorData(postId: string) {
    return dependencies.loadDashboardPageData("blog", async () => {
      const post = await dependencies.getPost(postId);
      if (!post) {
        return {
          post: null,
          categories: [] as TCategory[],
          campaigns: [] as TCampaign[],
        };
      }

      const [categories, campaigns] = await Promise.all([
        dependencies.loadCategories(),
        dependencies.loadCampaigns(),
      ]);

      return { post, categories, campaigns };
    });
  }

  return {
    loadBlogCreateEditorData,
    loadBlogEditEditorData,
  };
}
