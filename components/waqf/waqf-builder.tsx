"use client";
import { useState } from "react";
import { useCurrency } from "@/components/currency/currency-provider";
type Project={id:string;slug:string;title:string};
export function WaqfBuilder({projects}:{projects:Project[]}){
 const {currency}=useCurrency();
 const [projectId,setProjectId]=useState(projects[0]?.id??""); const [amount,setAmount]=useState("250"); const [owner,setOwner]=useState(""); const [dedication,setDedication]=useState(""); const [added,setAdded]=useState(false);
 const project=projects.find(item=>item.id===projectId); const value=Number(amount); const valid=Boolean(project&&value>0&&owner.trim());
 const add=()=>{if(!project||!valid)return;window.dispatchEvent(new CustomEvent("minber:add-to-basket",{detail:{projectId:project.id,slug:project.slug,projectTitle:project.title,intent:"waqf",intentLabel:"وقف",donationMode:"one-time",amount:value,currency:currency.code,waqfType:"مساهمة وقفية",ownerName:owner,dedication,available:true}}));setAdded(true);setTimeout(()=>setAdded(false),2200)};
 return <div className="simple-giving-builder" id="waqf-builder">
  <section><span>1</span><div><h3>اختيار المشروع</h3><label><span>المشروع الوقفي</span><select value={projectId} onChange={e=>setProjectId(e.target.value)}>{projects.map(item=><option value={item.id} key={item.id}>{item.title}</option>)}</select></label></div></section>
  <section><span>2</span><div><h3>اختيار المبلغ</h3><div className="choice-row">{[100,250,500,1000].map(item=><button type="button" key={item} className={amount===String(item)?"is-selected":""} onClick={()=>setAmount(String(item))}>{item} {currency.code}</button>)}</div><label><span>مبلغ آخر</span><input inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value.replace(/[^0-9.]/g,""))}/></label></div></section>
  <section><span>3</span><div><h3>بيانات الوقف</h3><label><span>اسم صاحب الوقف</span><input value={owner} onChange={e=>setOwner(e.target.value)}/></label><label><span>النية أو الإهداء — اختياري</span><textarea maxLength={180} value={dedication} onChange={e=>setDedication(e.target.value)}/></label></div></section>
  <section className="builder-review"><span>4</span><div><h3>مراجعة الاختيار</h3><dl><div><dt>المشروع</dt><dd>{project?.title??"—"}</dd></div><div><dt>المبلغ</dt><dd>{value>0?`${value.toFixed(2)} ${currency.code}`:"—"}</dd></div><div><dt>صاحب الوقف</dt><dd>{owner||"—"}</dd></div></dl></div></section>
  <button className="builder-submit" type="button" disabled={!valid} onClick={add}>إضافة الوقف إلى السلة</button>{added?<p className="builder-success" role="status">تمت إضافة الوقف إلى السلة.</p>:null}
 </div>
}
