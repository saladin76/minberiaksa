import type { ReactNode } from "react";
export function SectionHeading({eyebrow,title,description,children}:{eyebrow?:string;title:string;description?:string;children?:ReactNode}){return <div className="section-heading">{eyebrow?<span className="section-eyebrow">{eyebrow}</span>:null}<h2>{title}</h2>{description?<p>{description}</p>:null}{children}</div>}
