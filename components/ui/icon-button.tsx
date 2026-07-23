import { forwardRef,type ButtonHTMLAttributes,type ReactNode } from "react";
export const IconButton=forwardRef<HTMLButtonElement,ButtonHTMLAttributes<HTMLButtonElement>&{children:ReactNode}>(function IconButton({children,className="",...props},ref){return <button ref={ref} type="button" className={`icon-button ${className}`.trim()} {...props}>{children}</button>});
