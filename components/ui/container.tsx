import type { HTMLAttributes,ReactNode } from "react";
export function Container({children,className="",...props}:HTMLAttributes<HTMLDivElement>&{children:ReactNode}){return <div className={`site-container ${className}`.trim()} {...props}>{children}</div>}
