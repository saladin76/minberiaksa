"use client";

import { useEffect, useState } from "react";
import { Link2, ChartNoAxesCombined } from "lucide-react";
import TrackingLinkBuilder from "./TrackingLinkBuilder";
import CampaignLinksPanel from "./CampaignLinksPanel";
import { dt } from "@/lib/dashboard/i18n";

export default function AttributionWorkspace({ canExport }: { canExport: boolean }) {
  const [active, setActive] = useState("builder");
  const [linksVisited, setLinksVisited] = useState(false);
  useEffect(() => {
    const sync = () => { const next = window.location.hash === "#links" ? "links" : "builder"; setActive(next); if (next === "links") setLinksVisited(true); };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);
  const select = (next: string) => { setActive(next); if (next === "links") setLinksVisited(true); window.location.hash = next; };
  return <div className="space-y-5">
    <div role="tablist" aria-label={dt("روابط الحملات")} className="flex w-full gap-1 rounded-xl border bg-slate-100 p-1 sm:w-fit" onKeyDown={event => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === "Home" ? "builder" : event.key === "End" ? "links" : active === "builder" ? "links" : "builder";
      select(next); document.getElementById(`attribution-tab-${next}`)?.focus();
    }}>
      {([{ id: "builder", label: dt("إنشاء رابط"), Icon: Link2 }, { id: "links", label: dt("الروابط المحفوظة والأداء"), Icon: ChartNoAxesCombined }]).map(({ id, label, Icon }) => <button key={id} type="button" role="tab" id={`attribution-tab-${id}`} aria-selected={active === id} aria-controls={id} tabIndex={active === id ? 0 : -1} onClick={() => select(id)} className={`flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition sm:flex-none ${active === id ? "bg-white text-slate-950 shadow-sm" : "text-slate-600 hover:text-slate-950"}`}><Icon className="h-4 w-4 shrink-0" />{label}</button>)}
    </div>
    <section id="builder" role="tabpanel" aria-labelledby="attribution-tab-builder" hidden={active !== "builder"} className="min-w-0"><TrackingLinkBuilder /></section>
    <section id="links" role="tabpanel" aria-labelledby="attribution-tab-links" hidden={active !== "links"} className="min-w-0">{linksVisited ? <CampaignLinksPanel canExport={canExport} /> : null}</section>
  </div>;
}
