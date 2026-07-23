"use client";

import { useMemo, useState } from "react";
import { ProjectCard, projectDonationLabels, projectFieldLabels, projectRegionLabels, toProjectCardProps } from "@/components/projects/project-card";
import { Button } from "@/components/ui/button";
import type { DonationType, ProjectRecord, ProjectRegion, ProjectStatus } from "@/data/projects";
import type { ProjectMetric } from "@/data/project-metrics";

type Filters = {
  region: ProjectRegion | "all";
  donation: DonationType | "all";
  field: string;
  status: ProjectStatus | "all";
};

const emptyFilters: Filters = {
  region: "all",
  donation: "all",
  field: "all",
  status: "active",
};

function SelectFilter({ label, value, options, onChange }: {
  label: string;
  value: string;
  options: Array<[string, string]>;
  onChange: (value: string) => void;
}) {
  return (
    <label>
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map(([optionValue, optionLabel]) => <option value={optionValue} key={optionValue}>{optionLabel}</option>)}
      </select>
    </label>
  );
}

export function ProjectsExplorer({ projects, metrics }: { projects: ProjectRecord[]; metrics: ProjectMetric[] }) {
  void metrics;
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [sort, setSort] = useState("priority");

  const regions = useMemo(() => Array.from(new Set(projects.map((project) => project.region))), [projects]);
  const donationTypes = useMemo(() => Array.from(new Set(projects.flatMap((project) => project.donationTypes))), [projects]);
  const fields = useMemo(
    () => Array.from(new Set(projects.flatMap((project) => project.tags.map((tag) => projectFieldLabels[tag]).filter(Boolean)))).sort(),
    [projects],
  );

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const result = projects.filter((project) => {
      const searchable = [
        project.title.ar,
        project.summary.ar,
        projectRegionLabels[project.region],
        ...project.tags,
        ...project.donationTypes.map((type) => projectDonationLabels[type]),
      ].join(" ").toLowerCase();

      return (!normalizedQuery || searchable.includes(normalizedQuery))
        && (filters.region === "all" || project.region === filters.region)
        && (filters.donation === "all" || project.donationTypes.includes(filters.donation))
        && (filters.field === "all" || project.tags.some((tag) => projectFieldLabels[tag] === filters.field))
        && (filters.status === "all" || project.status === filters.status);
    });

    return result.sort((first, second) => {
      if (sort === "featured") return Number(Boolean(second.featured)) - Number(Boolean(first.featured));
      if (sort === "seasonal") return Number(Boolean(second.seasonal)) - Number(Boolean(first.seasonal));
      if (sort === "region") return projectRegionLabels[first.region].localeCompare(projectRegionLabels[second.region], "ar");
      return Number(Boolean(second.featured)) - Number(Boolean(first.featured))
        || Number(second.status === "active") - Number(first.status === "active");
    });
  }, [projects, query, filters, sort]);

  const reset = () => {
    setQuery("");
    setFilters({ ...emptyFilters, status: "all" });
  };

  return (
    <section className="projects-explorer" id="projects-explorer" aria-labelledby="projects-explorer-title">
      <div className="site-container">
        <header className="projects-explorer-heading">
          <div><span className="section-eyebrow">مستكشف المشاريع</span><h2 id="projects-explorer-title">ابحث حسب المنطقة أو نية العطاء</h2></div>
          <p>لا تظهر أرقام تمويل أو نسب إنجاز قبل ربطها بمصدر وتقارير معتمدة.</p>
        </header>

        <div className="projects-toolbar">
          <label className="projects-search">
            <span>ابحث عن مشروع</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="مثال: غزة، تعليم، مياه، وقف" />
            {query ? <button type="button" onClick={() => setQuery("")} aria-label="مسح البحث">×</button> : null}
          </label>

          <div className="desktop-filters">
            <SelectFilter label="المنطقة" value={filters.region} options={[["all", "كل المناطق"], ...regions.map((region) => [region, projectRegionLabels[region]] as [string, string])]} onChange={(value) => setFilters((current) => ({ ...current, region: value as Filters["region"] }))} />
            <SelectFilter label="نوع العطاء" value={filters.donation} options={[["all", "كل أنواع العطاء"], ...donationTypes.map((type) => [type, projectDonationLabels[type]] as [string, string])]} onChange={(value) => setFilters((current) => ({ ...current, donation: value as Filters["donation"] }))} />
            <SelectFilter label="المجال" value={filters.field} options={[["all", "كل المجالات"], ...fields.map((field) => [field, field] as [string, string])]} onChange={(value) => setFilters((current) => ({ ...current, field: value }))} />
            <SelectFilter label="الحالة" value={filters.status} options={[["all", "كل الحالات"], ["active", "متاح للدعم"], ["seasonal", "موسمي"], ["archived", "مكتمل"], ["needs-verification", "قيد المراجعة"]]} onChange={(value) => setFilters((current) => ({ ...current, status: value as Filters["status"] }))} />
          </div>

          <label className="projects-sort">
            <span>الترتيب</span>
            <select value={sort} onChange={(event) => setSort(event.target.value)}>
              <option value="priority">حسب الأولوية</option><option value="featured">المشاريع المميزة</option><option value="seasonal">المشاريع الموسمية</option><option value="region">حسب المنطقة</option>
            </select>
          </label>
        </div>

        <div className="results-summary" aria-live="polite">
          <strong>{filtered.length} {filtered.length === 1 ? "مشروع" : "مشروعًا"}</strong>
          {(query || filters.region !== "all" || filters.donation !== "all" || filters.field !== "all" || filters.status !== "all") ? <button type="button" className="text-action" onClick={reset}>مسح البحث والفلاتر</button> : null}
        </div>

        {filtered.length ? (
          <div className="projects-cards-grid">
            {filtered.map((project) => <ProjectCard key={project.id} {...toProjectCardProps(project)} />)}
          </div>
        ) : (
          <div className="projects-no-results">
            <h2>لا توجد مشاريع مطابقة حاليًا.</h2>
            <p>غيّر كلمة البحث أو امسح بعض الفلاتر لعرض خيارات أخرى.</p>
            <Button type="button" onClick={reset}>عرض جميع المشاريع</Button>
          </div>
        )}
      </div>

      <section className="project-selection-guide" aria-labelledby="selection-guide-title">
        <div className="site-container">
          <div><span className="section-eyebrow">دليل الاختيار</span><h2 id="selection-guide-title">اختر المشروع انطلاقًا من نيتك</h2><p>ابدأ بالاحتياج العاجل، أو مشاريع الوقف، أو المشروعات المؤهلة للزكاة.</p></div>
          <div className="selection-paths">
            <button type="button" onClick={() => setFilters({ ...emptyFilters, region: "gaza" })}><span>01</span><strong>دعم غزة</strong><small>الغذاء والمياه والإغاثة</small></button>
            <button type="button" onClick={() => setFilters({ ...emptyFilters, donation: "waqf" })}><span>02</span><strong>وقف للقدس</strong><small>أثر طويل المدى</small></button>
            <button type="button" onClick={() => setFilters({ ...emptyFilters, donation: "zakat" })}><span>03</span><strong>إخراج الزكاة</strong><small>مشروعات مؤهلة للزكاة</small></button>
          </div>
        </div>
      </section>
    </section>
  );
}
