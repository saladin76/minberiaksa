"use client";
import {useEffect} from "react";

const routeFor=(text:string)=>text.includes("زكاة")?"/zakat":text.includes("وقف")||text.includes("الأوقاف")?"/waqf":text.includes("مشروع")?"/projects":"/#about";
export function HomepageRouteEnhancer(){
 useEffect(()=>{
  const addGateway=(id:string,href:string,label:string)=>{const section=document.getElementById(id),heading=section?.querySelector<HTMLElement>(".gateway-heading");if(!heading||heading.querySelector(`[href='${href}']`))return;const link=document.createElement("a");link.href=href;link.className="ui-button ui-button--outline ui-button--medium homepage-full-route";link.textContent=label;heading.appendChild(link)};
  addGateway("zakat","/zakat","انتقل إلى صفحة الزكاة");addGateway("waqf","/waqf","انتقل إلى صفحة الوقف");
  document.querySelectorAll<HTMLAnchorElement>('main a[href="#"]').forEach(a=>a.href=routeFor(a.textContent||""));
  const capture=(event:Event)=>{const target=(event.target as HTMLElement).closest("button");if(!target)return;const text=target.textContent||"";if(text.includes("انتقل إلى صفحة الزكاة")){event.preventDefault();event.stopImmediatePropagation();window.location.assign("/zakat")}};
  document.addEventListener("click",capture,true);return()=>document.removeEventListener("click",capture,true);
 },[]);
 return null;
}
