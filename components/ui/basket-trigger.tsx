"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "./badge";
import { Button } from "./button";
import { BasketIcon, CloseIcon, MinusIcon, PlusIcon, TrashIcon } from "./icons";
import { IconButton } from "./icon-button";

type BasketIntent = "zakat" | "waqf" | "urgent" | "general";
type GiftData = { recipient?: string; email?: string; occasion?: string; message?: string; sender?: string };
type DedicationData = { target?: string; ownerName?: string; dedication?: string };
type BasketItem = { id:number; projectId?:string; fundId?:string; slug?:string; intent:BasketIntent; intentLabel:string; project:string; donationMode?:"one-time"|"recurring"|"gift"; frequency?:string; amount:number; currency:"USD"; giftData?:GiftData; dedicationData?:DedicationData; source?:string; calculationReference?:string; receiptType?:"zakat"; waqfType?:string; ownerName?:string; dedication?:string; certificateType?:"waqf" };
type AddBasketDetail = Omit<BasketItem,"id">;
const modeLabels={"one-time":"مرة واحدة",recurring:"عطاء مستمر",gift:"إهداء تبرع"} as const;
const initialItems: BasketItem[] = [
  { id:1,intent:"zakat",intentLabel:"زكاة",project:"زكاة لفلسطين",donationMode:"one-time",amount:120,currency:"USD",receiptType:"zakat" },
  { id:2,intent:"waqf",intentLabel:"وقف",project:"سهم وقفي للقدس",donationMode:"one-time",amount:250,currency:"USD",certificateType:"waqf" },
  { id:3,intent:"urgent",intentLabel:"إغاثة عاجلة",project:"إغاثة غزة",donationMode:"one-time",amount:75,currency:"USD" },
];

export function BasketTrigger({ compact=false }:{ compact?:boolean }) {
  const [open,setOpen]=useState(false),[items,setItems]=useState(initialItems);
  const closeRef=useRef<HTMLButtonElement>(null),triggerRef=useRef<HTMLButtonElement>(null);
  const total=useMemo(()=>items.reduce((sum,item)=>sum+item.amount,0),[items]);
  useEffect(()=>{const addItem=(event:Event)=>{const detail=(event as CustomEvent<AddBasketDetail>).detail;if(!detail||!detail.project||!Number.isFinite(detail.amount)||detail.amount<=0)return;setItems(current=>[...current,{...detail,id:Date.now()+Math.random()}]);};window.addEventListener("minber:add-to-basket",addItem);return()=>window.removeEventListener("minber:add-to-basket",addItem);},[]);
  useEffect(()=>{if(!open)return;const previousOverflow=document.body.style.overflow;document.body.style.overflow="hidden";closeRef.current?.focus();const onKeyDown=(event:KeyboardEvent)=>{if(event.key==="Escape"){setOpen(false);triggerRef.current?.focus();}};document.addEventListener("keydown",onKeyDown);return()=>{document.body.style.overflow=previousOverflow;document.removeEventListener("keydown",onKeyDown);};},[open]);
  const changeAmount=(id:number,direction:1|-1)=>setItems(current=>current.map(item=>item.id===id?{...item,amount:Math.max(1,item.amount+direction*25)}:item));
  return <>
    <button ref={triggerRef} type="button" className={`basket-trigger ${compact?"basket-trigger--compact":""}`} aria-label={`سلة العطاء، ${items.length} عناصر`} aria-haspopup="dialog" aria-expanded={open} onClick={()=>setOpen(true)}><BasketIcon/>{!compact?<span>سلة العطاء</span>:null}<span className="basket-count" aria-hidden="true">{items.length}</span></button>
    {open?<div className="drawer-layer"><button className="drawer-backdrop" type="button" aria-label="إغلاق سلة العطاء" onClick={()=>setOpen(false)}/><aside className="basket-drawer" role="dialog" aria-modal="true" aria-labelledby="basket-title">
      <div className="drawer-header"><div><span className="drawer-kicker">واجهة تجريبية</span><h2 id="basket-title">سلة العطاء</h2></div><IconButton ref={closeRef} aria-label="إغلاق السلة" onClick={()=>setOpen(false)}><CloseIcon/></IconButton></div>
      {items.length===0?<div className="basket-empty"><BasketIcon width={34} height={34}/><h3>سلة العطاء فارغة</h3><p>أضف مشروعًا أو نية تبرع لتظهر هنا قبل المراجعة.</p><Button href="/projects" variant="outline" onClick={()=>setOpen(false)}>استكشف المشاريع</Button></div>:<div className="basket-items" aria-live="polite">{items.map(item=><article className={`basket-item basket-item--${item.intent}`} key={item.id}><div className="basket-item-top"><Badge tone={item.intent==="general"?"neutral":item.intent}>{item.intentLabel}</Badge><IconButton aria-label={`إزالة ${item.project}`} onClick={()=>setItems(current=>current.filter(entry=>entry.id!==item.id))}><TrashIcon width={17} height={17}/></IconButton></div><h3>{item.project}</h3><div className="basket-item-context"><span>{item.donationMode?modeLabels[item.donationMode]:"مرة واحدة"}</span>{item.frequency&&<span>{item.frequency}</span>}{item.receiptType==="zakat"&&<span>إيصال زكاة مستقل</span>}{item.certificateType==="waqf"&&<span>شهادة وقف</span>}{item.waqfType&&<span>نوع الوقف: {item.waqfType}</span>}{item.giftData?.recipient&&<span>إهداء إلى: {item.giftData.recipient}</span>}{(item.ownerName||item.dedicationData?.ownerName)&&<span>صاحب الوقف: {item.ownerName||item.dedicationData?.ownerName}</span>}</div><div className="basket-item-bottom"><strong>{item.amount} {item.currency}</strong><div className="amount-controls" aria-label={`تعديل مبلغ ${item.project}`}><IconButton aria-label="خفض المبلغ" onClick={()=>changeAmount(item.id,-1)}><MinusIcon width={16} height={16}/></IconButton><span>تعديل</span><IconButton aria-label="زيادة المبلغ" onClick={()=>changeAmount(item.id,1)}><PlusIcon width={16} height={16}/></IconButton></div></div></article>)}</div>}
      <div className="basket-summary"><div><span>الإجمالي</span><strong>{total} USD</strong></div><Button disabled={items.length===0} fullWidth>مراجعة سلة العطاء</Button><button type="button" className="text-action" onClick={()=>setItems([])}>عرض الحالة الفارغة</button><small>نموذج Frontend فقط — لا يتم حفظ البيانات أو تنفيذ الدفع.</small></div>
    </aside></div>:null}
  </>;
}
