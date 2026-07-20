import type { SVGProps } from "react";
export type IconProps = SVGProps<SVGSVGElement>;
const base = { width:20,height:20,viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:1.8,strokeLinecap:"round" as const,strokeLinejoin:"round" as const,"aria-hidden":true };
export function MenuIcon(p:IconProps){return <svg {...base} {...p}><path d="M4 7h16M4 12h16M4 17h16"/></svg>}
export function CloseIcon(p:IconProps){return <svg {...base} {...p}><path d="m6 6 12 12M18 6 6 18"/></svg>}
export function ChevronDownIcon(p:IconProps){return <svg {...base} {...p}><path d="m7 10 5 5 5-5"/></svg>}
export function GlobeIcon(p:IconProps){return <svg {...base} {...p}><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.5 3 14 0 18M12 3c-3 3.5-3 14 0 18"/></svg>}
export function WalletIcon(p:IconProps){return <svg {...base} {...p}><path d="M4 7.5h15a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-11a2 2 0 0 1 2-2h12"/><path d="M16 12h5v4h-5a2 2 0 1 1 0-4Z"/></svg>}
export function BasketIcon(p:IconProps){return <svg {...base} {...p}><path d="m4 8 2 11h12l2-11H4Z"/><path d="m9 8 3-4 3 4M9 12v3M15 12v3"/></svg>}
export function TrashIcon(p:IconProps){return <svg {...base} {...p}><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/></svg>}
export function MinusIcon(p:IconProps){return <svg {...base} {...p}><path d="M6 12h12"/></svg>}
export function PlusIcon(p:IconProps){return <svg {...base} {...p}><path d="M12 6v12M6 12h12"/></svg>}
export function CheckIcon(p:IconProps){return <svg {...base} {...p}><path d="m5 12 4 4L19 6"/></svg>}
