"use client";
import { useEffect,useId,useRef,useState } from "react";
import { currencies } from "@/config/currencies";
import { CheckIcon,WalletIcon } from "./icons";
import { SelectTrigger } from "./select-trigger";
export function CurrencySelector({compact=false}:{compact?:boolean}){
 const [selectedCode,setSelectedCode]=useState("USD"),[open,setOpen]=useState(false);const rootRef=useRef<HTMLDivElement>(null),triggerRef=useRef<HTMLButtonElement>(null),listId=useId();
 const selected=currencies.find(x=>x.code===selectedCode)??currencies[0];
 useEffect(()=>{if(!open)return;const outside=(e:MouseEvent)=>{if(!rootRef.current?.contains(e.target as Node))setOpen(false)};const key=(e:KeyboardEvent)=>{if(e.key==="Escape"){setOpen(false);triggerRef.current?.focus()}};document.addEventListener("mousedown",outside);document.addEventListener("keydown",key);requestAnimationFrame(()=>rootRef.current?.querySelector<HTMLButtonElement>("[aria-selected='true']")?.focus());return()=>{document.removeEventListener("mousedown",outside);document.removeEventListener("keydown",key)}},[open]);
 return <div className={`selector ${compact?"selector--compact":""}`} ref={rootRef}><SelectTrigger ref={triggerRef} aria-label="اختيار العملة" aria-haspopup="listbox" aria-expanded={open} aria-controls={listId} onClick={()=>setOpen(v=>!v)}><span className="selector-trigger-content"><WalletIcon width={18} height={18}/><span>{compact?selected.code:`${selected.code} ${selected.symbol}`}</span></span></SelectTrigger>{open?<div className="selector-menu selector-menu--currency" id={listId} role="listbox" aria-label="العملات المتاحة"><div className="selector-menu-heading">العملة</div>{currencies.map(currency=><button key={currency.code} type="button" role="option" aria-selected={currency.code===selectedCode} className="selector-option" onClick={()=>{setSelectedCode(currency.code);setOpen(false);triggerRef.current?.focus()}}><span className="currency-option-copy"><strong>{currency.code}</strong><small>{currency.symbol} · {currency.label}</small></span>{currency.code===selectedCode?<CheckIcon width={18} height={18}/>:null}</button>)}</div>:null}</div>
}
