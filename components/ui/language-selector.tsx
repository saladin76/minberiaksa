"use client";
import { useEffect,useId,useRef,useState } from "react";
import { languages } from "@/config/languages";
import { CheckIcon,GlobeIcon } from "./icons";
import { SelectTrigger } from "./select-trigger";
export function LanguageSelector({compact=false}:{compact?:boolean}){
 const [selectedCode,setSelectedCode]=useState("ar"),[open,setOpen]=useState(false),[showAll,setShowAll]=useState(false);
 const rootRef=useRef<HTMLDivElement>(null),triggerRef=useRef<HTMLButtonElement>(null),listId=useId();
 const selected=languages.find(x=>x.code===selectedCode)??languages[0],visible=showAll?languages:languages.slice(0,3);
 useEffect(()=>{if(!open)return;const outside=(e:MouseEvent)=>{if(!rootRef.current?.contains(e.target as Node))setOpen(false)};const key=(e:KeyboardEvent)=>{if(e.key==="Escape"){setOpen(false);triggerRef.current?.focus()}};document.addEventListener("mousedown",outside);document.addEventListener("keydown",key);requestAnimationFrame(()=>rootRef.current?.querySelector<HTMLButtonElement>("[aria-selected='true']")?.focus());return()=>{document.removeEventListener("mousedown",outside);document.removeEventListener("keydown",key)}},[open]);
 return <div className={`selector ${compact?"selector--compact":""}`} ref={rootRef}><SelectTrigger ref={triggerRef} aria-label="اختيار اللغة" aria-haspopup="listbox" aria-expanded={open} aria-controls={listId} onClick={()=>setOpen(v=>!v)}><span className="selector-trigger-content"><GlobeIcon width={18} height={18}/><span>{compact?selected.code.toUpperCase():selected.nativeLabel}</span></span></SelectTrigger>{open?<div className="selector-menu" id={listId} role="listbox" aria-label="اللغات المتاحة"><div className="selector-menu-heading">اللغة</div>{visible.map(language=><button key={language.code} type="button" role="option" aria-selected={language.code===selectedCode} className="selector-option" onClick={()=>{setSelectedCode(language.code);setOpen(false);triggerRef.current?.focus()}}><span><strong>{language.nativeLabel}</strong><small>{language.direction.toUpperCase()}</small></span>{language.code===selectedCode?<CheckIcon width={18} height={18}/>:null}</button>)}{!showAll?<button type="button" className="selector-show-all" onClick={()=>setShowAll(true)}>عرض جميع اللغات</button>:null}</div>:null}</div>
}
