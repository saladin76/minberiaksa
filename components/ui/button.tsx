import type { AnchorHTMLAttributes,ButtonHTMLAttributes,ReactNode } from "react";
type Variant="primary"|"secondary"|"outline"|"ghost"|"text"|"danger"; type Size="small"|"medium"|"large";
type Shared={children:ReactNode;variant?:Variant;size?:Size;fullWidth?:boolean;loading?:boolean;className?:string};
type LinkProps=Shared&AnchorHTMLAttributes<HTMLAnchorElement>&{href:string;disabled?:boolean}; type NativeProps=Shared&ButtonHTMLAttributes<HTMLButtonElement>&{href?:never};
export type ButtonProps=LinkProps|NativeProps;
export function Button({children,variant="primary",size="medium",fullWidth=false,loading=false,className="",...props}:ButtonProps){
 const classes=["ui-button",`ui-button--${variant}`,`ui-button--${size}`,fullWidth?"ui-button--full":"",loading?"is-loading":"",className].filter(Boolean).join(" ");
 const content=<>{loading?<span className="button-spinner" aria-hidden="true"/>:null}<span>{children}</span></>;
 if("href" in props&&props.href){const {disabled,...anchorProps}=props;return <a className={classes} aria-disabled={disabled||loading||undefined} tabIndex={disabled||loading?-1:anchorProps.tabIndex} {...anchorProps}>{content}</a>}
 return <button className={classes} disabled={props.disabled||loading} aria-busy={loading||undefined} {...props}>{content}</button>;
}
