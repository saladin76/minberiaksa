import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProjectDetailExperience } from "@/components/project-detail/project-detail-sections";
import { buildProjectFaqs, getProjectDetail } from "@/data/project-details";
import { projectMetrics } from "@/data/project-metrics";
import { getProjectBySlug, projects, type ProjectRecord } from "@/data/projects";

type ProjectPageProps = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return projects.map((project) => ({ slug: project.slug }));
}

export async function generateMetadata({ params }: ProjectPageProps): Promise<Metadata> {
  const { slug } = await params;
  const project = getProjectBySlug(slug);
  if (!project) return { title: "المشروع غير موجود | مؤسسة منبر الأقصى الدولية" };
  const region = project.region === "gaza" ? "غزة" : project.region === "al-quds" ? "القدس" : project.region === "al-aqsa" ? "الأقصى" : "مشاريع المؤسسة";
  return {
    title: `${project.title.ar} | مؤسسة منبر الأقصى الدولية`,
    description: `${project.summary.ar} — ${region}.`,
  };
}

function relatedScore(current: ProjectRecord, candidate: ProjectRecord) {
  let score = 0;
  if (candidate.region === current.region) score += 6;
  score += candidate.donationTypes.filter((type) => current.donationTypes.includes(type)).length * 3;
  score += candidate.tags.filter((tag) => current.tags.includes(tag)).length;
  if (candidate.featured) score += 1;
  return score;
}

export default async function ProjectDetailPage({ params }: ProjectPageProps) {
  const { slug } = await params;
  const project = getProjectBySlug(slug);
  if (!project) notFound();
  const detail = getProjectDetail(project);
  const metric = projectMetrics.find((item) => item.projectId === project.id);
  const relatedProjects = projects
    .filter((candidate) => candidate.id !== project.id)
    .map((candidate) => ({ candidate, score: relatedScore(project, candidate) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(({ candidate }) => candidate);
  return <ProjectDetailExperience project={project} detail={detail} metric={metric} relatedProjects={relatedProjects} faqs={buildProjectFaqs(project)} />;
}
