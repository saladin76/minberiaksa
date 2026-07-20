"use client";

import { useState } from "react";

export function ProjectFaq({ items }: { items: { question: string; answer: string }[] }) {
  const [open, setOpen] = useState(0);
  return <div className="project-faq-list">{items.map((item, index) => { const expanded = open === index; const panelId = `faq-panel-${index}`; return <article key={item.question}><h3><button type="button" aria-expanded={expanded} aria-controls={panelId} onClick={() => setOpen(expanded ? -1 : index)}><span>{item.question}</span><b aria-hidden="true">{expanded ? "−" : "+"}</b></button></h3><div id={panelId} role="region" hidden={!expanded}><p>{item.answer}</p></div></article>; })}</div>;
}
