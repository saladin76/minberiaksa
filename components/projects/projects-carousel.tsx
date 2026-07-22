"use client";

import { useId } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { A11y, Navigation, Pagination } from "swiper/modules";
import { Swiper, SwiperSlide } from "swiper/react";
import type { ProjectRecord } from "@/data/projects";
import { ProjectCard, toProjectCardProps } from "./project-card";

type ProjectsCarouselProps = {
  projects: ProjectRecord[];
  state?: "ready" | "loading" | "error";
  className?: string;
};

function SkeletonCard() {
  return <div className="project-card-skeleton" aria-hidden="true"><span /><span /><span /><span /></div>;
}

export function ProjectsCarousel({ projects, state = "ready", className = "" }: ProjectsCarouselProps) {
  const instanceId = useId().replace(/:/g, "");
  const previousClass = `projects-carousel-prev-${instanceId}`;
  const nextClass = `projects-carousel-next-${instanceId}`;

  if (state === "loading") {
    return <div className="projects-carousel-state projects-carousel-state--loading" aria-busy="true" aria-label="جار تحميل المشاريع"><SkeletonCard /><SkeletonCard /><SkeletonCard /></div>;
  }

  if (state === "error") {
    return (
      <div className="projects-carousel-state" role="alert">
        <h3>تعذر تحميل المشاريع.</h3>
        <button type="button" onClick={() => window.location.reload()}>إعادة المحاولة</button>
      </div>
    );
  }

  if (!projects.length) {
    return (
      <div className="projects-carousel-state">
        <h3>لا توجد مشاريع مطابقة حاليًا.</h3>
        <a href="/projects">عرض جميع المشاريع</a>
      </div>
    );
  }

  return (
    <div className={`projects-carousel-shell ${className}`.trim()}>
      <div className="projects-carousel-controls" aria-label="التنقل بين المشاريع">
        <button className={`projects-carousel-button ${previousClass}`} type="button" aria-label="المشروع السابق"><ChevronRight size={20} aria-hidden="true" /></button>
        <button className={`projects-carousel-button ${nextClass}`} type="button" aria-label="المشروع التالي"><ChevronLeft size={20} aria-hidden="true" /></button>
      </div>
      <Swiper
        className="projects-carousel"
        dir="rtl"
        modules={[Navigation, Pagination, A11y]}
        navigation={{ prevEl: `.${previousClass}`, nextEl: `.${nextClass}` }}
        pagination={{ clickable: true }}
        slidesPerView={1.08}
        spaceBetween={14}
        grabCursor
        watchOverflow
        breakpoints={{
          768: { slidesPerView: 2, spaceBetween: 18 },
          1024: { slidesPerView: 2.2, spaceBetween: 20 },
          1280: { slidesPerView: 3, spaceBetween: 24 },
        }}
      >
        {projects.map((project) => (
          <SwiperSlide key={project.id}>
            <ProjectCard {...toProjectCardProps(project)} />
          </SwiperSlide>
        ))}
      </Swiper>
    </div>
  );
}
