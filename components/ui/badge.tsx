import type { HTMLAttributes,ReactNode } from "react";
type Tone="neutral"|"zakat"|"waqf"|"urgent";
export function Badge({children,tone="neutral",className="",...props}:HTMLAttributes<HTMLSpanElement>&{children:ReactNode;tone?:Tone}){return <span className={`ui-badge ui-badge--${tone} ${className}`.trim()} {...props}>{children}</span>}
