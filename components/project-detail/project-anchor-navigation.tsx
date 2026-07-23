"use client";

import { useEffect, useState } from "react";

const items = [
  ["story", "عن المشروع"],
  ["impact-plan", "كيف يصل تبرعك؟"],
  ["updates", "التحديثات"],
  ["proof", "التقارير"],
  ["media", "الصور"],
  ["faq", "أسئلة شائعة"],
] as const;

export function ProjectAnchorNavigation() {
  const [active, setActive] = useState("story");
  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (visible?.target.id) setActive(visible.target.id);
    }, { rootMargin: "-25% 0px -60%", threshold: [0.1, 0.4] });
    items.forEach(([id]) => { const node = document.getElementById(id); if (node) observer.observe(node); });
    return () => observer.disconnect();
  }, []);
  return <nav className="project-anchor-nav" aria-label="أقسام صفحة المشروع"><div className="project-anchor-scroll">{items.map(([id, label]) => <a key={id} href={`#${id}`} className={active === id ? "is-active" : ""} aria-current={active === id ? "location" : undefined}>{label}</a>)}</div></nav>;
}
