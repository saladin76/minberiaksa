"use client";
import { useMemo, useState } from "react";
import { useCurrency } from "@/components/currency/currency-provider";

type Project = { id: string; slug: string; title: string };
const fields=["النقد والمدخرات","الذهب والفضة","الاستثمارات والتجارة","المستحقات المتوقع تحصيلها","أصول زكوية أخرى"];
const clean=(value:string)=>value.replace(/[^0-9.]/g,"").replace(/(\..*)\./g,"$1");
const n=(value:string)=>Number(value)||0;
export function ZakatCalculator({projects}:{projects:Project[]}){
 const {currency}=useCurrency();
 const [values,setValues]=useState(fields.map(()=>"")); const [liabilities,setLiabilities]=useState(""); const [projectId,setProjectId]=useState(projects[0]?.id??""); const [confirmed,setConfirmed]=useState(false); const [added,setAdded]=useState(false);
 const result=useMemo(()=>{const assets=values.reduce((sum,v)=>sum+n(v),0);const net=Math.max(0,assets-n(liabilities));return {assets,net,zakat:net*.025}},[values,liabilities]);
 const project=projects.find(item=>item.id===projectId); const valid=Boolean(project&&result.zakat>0&&confirmed);
 const add=()=>{if(!project||!valid)return;window.dispatchEvent(new CustomEvent("minber:add-to-basket",{detail:{projectId:project.id,slug:project.slug,projectTitle:project.title,intent:"zakat",intentLabel:"زكاة",donationMode:"one-time",amount:Number(result.zakat.toFixed(2)),currency:currency.code,receiptType:"zakat",available:true}}));setAdded(true);setTimeout(()=>setAdded(false),2200)};
 return <div className="simple-giving-builder zakat-simple-builder" id="zakat-calculator">
  <section><span>1</span><div><h3>الحاسبة</h3><div className="calculator-fields">{fields.map((label,index)=><label key={label}><span>{label}</span><input inputMode="decimal" value={values[index]} onChange={e=>setValues(current=>current.map((v,i)=>i===index?clean(e.target.value):v))}/></label>)}<label><span>الالتزامات القابلة للخصم</span><input inputMode="decimal" value={liabilities} onChange={e=>setLiabilities(clean(e.target.value))}/></label></div></div></section>
  <section className="calculator-result"><span>2</span><div><h3>النتيجة التقديرية</h3><dl><div><dt>إجمالي الأموال</dt><dd>{result.assets.toFixed(2)} {currency.code}</dd></div><div><dt>الصافي</dt><dd>{result.net.toFixed(2)} {currency.code}</dd></div><div><dt>الزكاة المقدرة 2.5%</dt><dd>{result.zakat.toFixed(2)} {currency.code}</dd></div></dl><small>هذه أداة تقديرية، والحالات الخاصة تحتاج سؤال جهة شرعية موثوقة.</small></div></section>
  <section><span>3</span><div><h3>اختيار المشروع</h3><label><span>مشروع مؤهل للزكاة</span><select value={projectId} onChange={e=>setProjectId(e.target.value)}>{projects.map(item=><option value={item.id} key={item.id}>{item.title}</option>)}</select></label><label className="confirm-row"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/><span>أنوي المبلغ الظاهر زكاة</span></label></div></section>
  <button type="button" className="builder-submit" disabled={!valid} onClick={add}>إضافة الزكاة إلى السلة</button>{added?<p className="builder-success" role="status">تمت إضافة الزكاة إلى السلة.</p>:null}
 </div>
}
