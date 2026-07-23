"use client";

import { useState } from "react";
import { ArrowLeft, Bookmark, CircleDot, ImageOff, MapPin, Users } from "lucide-react";
import type { DonationType, ProjectRecord, ProjectRegion, ProjectStatus } from "@/data/projects";

export const projectRegionLabels: Record<ProjectRegion, string> = {
  "al-quds": "القدس",
  "al-aqsa": "الأقصى",
  gaza: "غزة",
  syria: "سوريا",
  sudan: "السودان",
  yemen: "اليمن",
  global: "فلسطين والعالم",
};

export const projectDonationLabels: Record<DonationType, string> = {
  sadaqah: "صدقة",
  zakat: "زكاة",
  waqf: "وقف",
  recurring: "عطاء مستمر",
  qurbani: "أضاحي",
};

export const projectStatusLabels: Record<ProjectStatus, string> = {
  active: "متاح للدعم",
  seasonal: "موسمي",
  archived: "مكتمل",
  "needs-verification": "قيد المراجعة",
};

export const projectFieldLabels: Record<string, string> = {
  food: "غذاء",
  meals: "وجبات ساخنة",
  bread: "خبز",
  water: "مياه",
  restoration: "ترميم",
  housing: "إسكان",
  education: "تعليم",
  courses: "دورات تعليمية",
  quran: "تعليم القرآن",
  youth: "رعاية الشباب",
  relief: "إغاثة",
  emergency: "استجابة عاجلة",
  shelter: "إيواء",
  families: "رعاية أسر",
  winter: "إغاثة شتوية",
  ramadan: "مشروع موسمي",
  qurbani: "أضاحي",
};

const projectImageFocalPositions: Partial<Record<string, string>> = {
  "gaza-food-parcels": "50% 34%",
  "al-quds-home-restoration": "50% 42%",
};

const optimizedDriveImage = (sourceUrl: string) => {
  try {
    const url = new URL(sourceUrl);
    const fileId = url.searchParams.get("id");
    return fileId ? `https://drive.google.com/thumbnail?id=${encodeURIComponent(fileId)}&sz=w1600` : sourceUrl;
  } catch {
    return sourceUrl;
  }
};

export type ProjectCardProps = {
  slug: string;
  title: string;
  summary?: string;
  image?: {
    src: string;
    alt: string;
    focalPosition?: string;
  };
  organizationLabel?: string;
  regionLabel?: string;
  categoryLabel?: string;
  donorCount?: number;
  raised?: number;
  goal?: number;
  currency?: string;
  statusLabel?: string;
  priority?: boolean;
};

export function toProjectCardProps(project: ProjectRecord): ProjectCardProps {
  const categoryLabel = project.tags.map((tag) => projectFieldLabels[tag]).find(Boolean)
    ?? projectDonationLabels[project.donationTypes[0]];

  return {
    slug: project.slug,
    title: project.title.ar,
    summary: project.summary.ar,
    image: project.image ? {
      src: optimizedDriveImage(project.image.sourceUrl),
      alt: project.image.alt.ar,
      focalPosition: projectImageFocalPositions[project.slug],
    } : undefined,
    organizationLabel: "مؤسسة منبر الأقصى الدولية",
    regionLabel: projectRegionLabels[project.region],
    categoryLabel,
    statusLabel: projectStatusLabels[project.status],
  };
}

const formatAmount = (value: number, currency: string) => new Intl.NumberFormat("ar", {
  style: "currency",
  currency,
  maximumFractionDigits: 0,
}).format(value);

export function ProjectCard({
  slug,
  title,
  summary,
  image,
  organizationLabel = "مؤسسة منبر الأقصى الدولية",
  regionLabel,
  categoryLabel,
  donorCount,
  raised,
  goal,
  currency = "USD",
  statusLabel,
  priority = false,
}: ProjectCardProps) {
  const [saved, setSaved] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const hasImage = Boolean(image && !imageFailed);
  const hasDonors = typeof donorCount === "number" && donorCount > 0;
  const hasFunding = typeof raised === "number" && typeof goal === "number" && goal > 0 && raised >= 0;
  const hasMetrics = hasDonors || hasFunding;
  const progress = hasFunding ? Math.min(100, Math.max(0, (raised / goal) * 100)) : 0;

  return (
    <article
      className={`project-image-card${hasImage ? " has-image" : " no-image"}${hasMetrics ? " has-metrics" : " is-compact"}`}
      data-project-slug={slug}
      data-has-metrics={hasMetrics ? "true" : "false"}
    >
      <div className="project-image-card__media">
        {hasImage && image ? (
          <img
            src={image.src}
            alt={image.alt}
            width={1200}
            height={1600}
            sizes="(max-width: 640px) 88vw, (max-width: 1024px) 45vw, 33vw"
            loading={priority ? "eager" : "lazy"}
            fetchPriority={priority ? "high" : "auto"}
            decoding="async"
            style={{ objectPosition: image.focalPosition ?? "50% 40%" }}
            onError={() => setImageFailed(true)}
          />
        ) : (
          <div className="project-image-card__fallback" role="img" aria-label={`${regionLabel ?? "فلسطين"}: ${title}`}>
            <ImageOff size={28} strokeWidth={1.7} aria-hidden="true" />
            <span>{regionLabel ?? "فلسطين"}</span>
          </div>
        )}
      </div>

      <div className="project-image-card__topline">
        <span className="project-image-card__organization" title={organizationLabel}>
          <i aria-hidden="true" />
          <span>{organizationLabel}</span>
        </span>
        <button
          type="button"
          className={`project-image-card__bookmark${saved ? " is-saved" : ""}`}
          aria-label={saved ? `إزالة المشروع من المحفوظات: ${title}` : `حفظ المشروع: ${title}`}
          aria-pressed={saved}
          title="حفظ محلي داخل هذه الصفحة"
          onClick={() => setSaved((value) => !value)}
        >
          <Bookmark size={18} strokeWidth={2.2} fill={saved ? "currentColor" : "none"} aria-hidden="true" />
        </button>
      </div>

      <div className="project-image-card__content">
        <div className="project-image-card__meta">
          {regionLabel ? <span><MapPin size={14} aria-hidden="true" />{regionLabel}</span> : null}
          {categoryLabel ? <span>{categoryLabel}</span> : null}
          {statusLabel ? <span><CircleDot size={13} aria-hidden="true" />{statusLabel}</span> : null}
        </div>

        <h3><a href={`/projects/${slug}`}>{title}</a></h3>
        {summary ? <p>{summary}</p> : null}

        {hasDonors ? (
          <div className="project-image-card__donors"><Users size={15} aria-hidden="true" /><span>{donorCount.toLocaleString("ar")} مساهمًا</span></div>
        ) : null}

        {hasFunding ? (
          <div className="project-image-card__funding">
            <div className="project-image-card__funding-values">
              <span><small>تم جمعه</small><strong>{formatAmount(raised, currency)}</strong></span>
              <span><small>الهدف</small><strong>{formatAmount(goal, currency)}</strong></span>
            </div>
            <div className="project-image-card__progress" role="progressbar" aria-label={`نسبة تمويل ${title}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}>
              <span style={{ width: `${progress}%` }} />
            </div>
          </div>
        ) : null}

        <a className="project-image-card__donate" href={`/projects/${slug}`}>
          <span>تبرع الآن</span>
          <ArrowLeft size={18} strokeWidth={2.4} aria-hidden="true" />
        </a>
      </div>
    </article>
  );
}
