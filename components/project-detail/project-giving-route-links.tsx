import { Button } from "@/components/ui/button";
import type { ProjectRecord } from "@/data/projects";

export function ProjectGivingRouteLinks({ project }: { project: ProjectRecord }) {
  const links = [
    project.donationTypes.includes("zakat")
      ? { href: "/zakat", label: "استكشف الزكاة" }
      : null,
    project.donationTypes.includes("waqf")
      ? { href: "/waqf", label: "استكشف الوقف" }
      : null,
    project.donationTypes.includes("recurring")
      ? { href: "/recurring", label: "أنشئ عطاءً مستمرًا" }
      : null,
    { href: "/impact", label: "الأثر والتقارير" },
  ].filter(Boolean) as Array<{ href: string; label: string }>;

  return (
    <section className="project-giving-route-links" aria-label="مسارات مرتبطة بالمشروع">
      <div className="site-container">
        <div>
          <span>مسارات مرتبطة</span>
          <h2>اختر طريقة العطاء أو تعرّف إلى الأثر والتقارير</h2>
        </div>
        <div>
          {links.map((link) => (
            <Button key={`${link.href}-${link.label}`} href={link.href} variant="outline">
              {link.label}
            </Button>
          ))}
        </div>
      </div>
    </section>
  );
}
