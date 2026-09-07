import { CheckCircle2 } from "lucide-react";

export function MarketingQuickGuide({
  title = "ماذا أفعل هنا؟",
  steps,
}: {
  title?: string;
  steps: string[];
}) {
  return <div className="rounded-2xl border border-brand/15 bg-brand/5 p-4">
    <h2 className="text-sm font-black text-slate-950">{title}</h2>
    <div className="mt-3 grid gap-2 md:grid-cols-2">
      {steps.map((step, index) => <div key={`${step}-${index}`} className="flex items-start gap-2 rounded-xl bg-white/70 p-3 text-sm leading-6 text-slate-700">
        <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-brand" />
        <span>{step}</span>
      </div>)}
    </div>
  </div>;
}
