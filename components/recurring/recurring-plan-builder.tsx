"use client";
import { useMemo, useState } from "react";
import type { ProjectRecord } from "@/data/projects";

const frequencies = [
  { id: "يومي", label: "يومي" },
  { id: "كل جمعة", label: "كل جمعة" },
  { id: "شهري", label: "شهري" },
] as const;

export function RecurringPlanBuilder({ projects }: { projects: ProjectRecord[] }) {
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [frequency, setFrequency] = useState("شهري");
  const [amount, setAmount] = useState("50");
  const [added, setAdded] = useState(false);
  const project = useMemo(() => projects.find((item) => item.id === projectId), [projects, projectId]);
  const value = Number(amount);
  const valid = Boolean(project && Number.isFinite(value) && value > 0);
  const add = () => {
    if (!project || !valid) return;
    window.dispatchEvent(new CustomEvent("minber:add-to-basket", { detail: {
      projectId: project.id, slug: project.slug, projectTitle: project.title.ar,
      intent: "recurring", intentLabel: "عطاء مستمر", donationMode: "recurring",
      frequency, amount: value, currency: "USD", receiptType: "recurring", available: true,
    }}));
    setAdded(true); window.setTimeout(() => setAdded(false), 2200);
  };
  return <div className="simple-giving-builder" id="recurring-plan-builder">
    <section><span>1</span><div><h3>اختيار المشروع</h3><label><span>المشروع</span><select value={projectId} onChange={(e)=>setProjectId(e.target.value)}>{projects.map((item)=><option key={item.id} value={item.id}>{item.title.ar}</option>)}</select></label>{project?<p>{project.summary.ar}</p>:null}</div></section>
    <section><span>2</span><div><h3>اختيار التكرار</h3><div className="choice-row">{frequencies.map((item)=><button type="button" key={item.id} className={frequency===item.id?"is-selected":""} aria-pressed={frequency===item.id} onClick={()=>setFrequency(item.id)}>{item.label}</button>)}</div></div></section>
    <section><span>3</span><div><h3>اختيار المبلغ</h3><div className="choice-row">{[10,25,50,100].map((item)=><button type="button" key={item} className={amount===String(item)?"is-selected":""} onClick={()=>setAmount(String(item))}>{item} USD</button>)}</div><label><span>مبلغ آخر</span><input inputMode="decimal" value={amount} onChange={(e)=>setAmount(e.target.value.replace(/[^0-9.]/g,""))}/></label></div></section>
    <section className="builder-review"><span>4</span><div><h3>مراجعة الاختيار</h3><dl><div><dt>المشروع</dt><dd>{project?.title.ar ?? "—"}</dd></div><div><dt>التكرار</dt><dd>{frequency}</dd></div><div><dt>المبلغ</dt><dd>{valid?`${value.toFixed(2)} USD`:"—"}</dd></div></dl></div></section>
    <button className="builder-submit" type="button" disabled={!valid} onClick={add}>5. إضافة إلى السلة</button>
    {added?<p className="builder-success" role="status">تمت إضافة خطة العطاء إلى السلة.</p>:null}
  </div>;
}

export function RecurringProjectSelectButton({ id }: { id: string }) { return <a href={`#recurring-plan-builder`} onClick={()=>window.dispatchEvent(new CustomEvent("minber:select-recurring-destination",{detail:{id}}))}>اختيار المشروع</a>; }
export function RecurringManagementPreview(){return null;}
