import { forwardRef,type ButtonHTMLAttributes,type ReactNode } from "react";
import { ChevronDownIcon } from "./icons";
export const SelectTrigger=forwardRef<HTMLButtonElement,ButtonHTMLAttributes<HTMLButtonElement>&{children:ReactNode}>(function SelectTrigger({children,className="",...props},ref){return <button ref={ref} type="button" className={`select-trigger ${className}`.trim()} {...props}><span>{children}</span><ChevronDownIcon width={16} height={16}/></button>});
