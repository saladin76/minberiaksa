"use client";

import { useEffect } from "react";
import type { ProjectRecord } from "@/data/projects";

const focusableSelector='a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function ProjectsDetailLinkEnhancer({projects}:{projects:ProjectRecord[]}){
  useEffect(()=>{
    const slugByTitle=new Map(projects.map(project=>[project.title.ar,project.slug]));
    const navigate=(slug:string)=>{document.body.style.overflow="";window.location.assign(`/projects/${slug}`)};
    const titleOf=(root:Element)=>root.querySelector("h2,h3")?.textContent?.trim()||"";
    const enhance=()=>{
      document.querySelectorAll<HTMLElement>(".featured-listing-project,.listing-project-card").forEach(card=>{
        const title=titleOf(card),slug=slugByTitle.get(title);if(!slug)return;
        card.querySelectorAll<HTMLElement>("h2,h3,.project-visual,.project-image-placeholder").forEach(target=>{
          if(target.dataset.detailLink)return;target.dataset.detailLink="true";target.tabIndex=0;target.setAttribute("role","link");target.setAttribute("aria-label",`عرض صفحة مشروع ${title}`);
          target.addEventListener("click",()=>navigate(slug));target.addEventListener("keydown",event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();navigate(slug)}});
        });
        card.querySelectorAll<HTMLButtonElement>("button").forEach(button=>{if(button.textContent?.trim()!=="عرض المشروع"||button.dataset.detailLink)return;button.dataset.detailLink="true";button.addEventListener("click",event=>{event.preventDefault();event.stopImmediatePropagation();navigate(slug)},{capture:true});});
      });
      document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]').forEach(dialog=>{
        const title=titleOf(dialog),slug=slugByTitle.get(title);if(!slug)return;
        dialog.querySelectorAll<HTMLButtonElement>("button").forEach(button=>{const text=button.textContent?.trim();if((text!=="صفحة التفاصيل قريبًا"&&text!=="عرض صفحة المشروع")||button.dataset.detailLink)return;button.dataset.detailLink="true";button.textContent="عرض صفحة المشروع";button.disabled=false;button.removeAttribute("aria-disabled");button.addEventListener("click",event=>{event.preventDefault();event.stopImmediatePropagation();navigate(slug)},{capture:true});});
      });
    };
    enhance();const observer=new MutationObserver(enhance);observer.observe(document.body,{childList:true,subtree:true});
    const trap=(event:KeyboardEvent)=>{if(event.key!=="Tab")return;const dialogs=Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]')).filter(node=>node.offsetParent!==null);const dialog=dialogs.at(-1);if(!dialog)return;const nodes=Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector)).filter(node=>node.offsetParent!==null);if(!nodes.length)return;const first=nodes[0],last=nodes[nodes.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}else if(!dialog.contains(document.activeElement)){event.preventDefault();first.focus()}};
    document.addEventListener("keydown",trap,true);return()=>{observer.disconnect();document.removeEventListener("keydown",trap,true)};
  },[projects]);
  return null;
}
