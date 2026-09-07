import "server-only";

import getPost from "@/actions/get-post";
import { prisma } from "@/lib/prisma";
import { loadDashboardPageData } from "@/lib/dashboard/require-page-permission";
import { createBlogAdminEditorDataLoaders } from "./admin-editor-data-core";

const editorDataLoaders = createBlogAdminEditorDataLoaders({
  loadDashboardPageData,
  getPost,
  loadCategories: () =>
    prisma.postCategory.findMany({
      orderBy: { name: "asc" },
    }),
  loadCampaigns: () =>
    prisma.campaign.findMany({
      select: { id: true, title: true },
      orderBy: { createdAt: "desc" },
    }),
});

export const loadBlogCreateEditorData =
  editorDataLoaders.loadBlogCreateEditorData;

export const loadBlogEditEditorData =
  editorDataLoaders.loadBlogEditEditorData;
