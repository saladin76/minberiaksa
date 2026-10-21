// Isolated UI QA only. Generates static assets; never reads or writes a live database.
import { build } from "esbuild";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import postcss from "postcss";
import tailwindcss from "tailwindcss";
const require = createRequire(import.meta.url);
const { documentFor } = require("../lib/content-editor/service.ts");
const { SUPPORTED_LOCALES } = require("../lib/locales.ts");
const output = process.argv[2];
if (
  !output ||
  !path.isAbsolute(output) ||
  !output.startsWith("/workspace/scratch/")
)
  throw new Error("Supply a dedicated absolute scratch preview directory");
const id = "111111111111111111111111",
  blockId = "222222222222222222222222";
const rich = (text) =>
  JSON.stringify({
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  });
const fixtures = {
  campaigns: {
    id,
    title: "سقيا الماء للأسر المحتاجة",
    description: rich(
      "ساهم في توفير المياه النظيفة للأسر التي تحتاجها. نعمل مع فرقنا الميدانية على توصيل المياه ومتابعة أثر المشروع.",
    ),
    targetAmount: 25000,
    currentAmount: 14750,
    baselineAmount: 5000,
    goalType: "FIXED",
    fundraisingMode: "AMOUNT",
    sharePriceUSD: 0,
    categoryIds: [id],
    images: [],
    isActive: true,
    priority: 1,
    translations: [
      {
        locale: "en",
        title: "Clean water for families",
        description: rich("Help provide clean water to families in need."),
      },
    ],
    updates: [],
  },
  categories: {
    id,
    name: "مشاريع المياه",
    description: "توفير المياه النظيفة ودعم استدامتها",
    isActive: true,
    navigationVisible: true,
    values: [],
    infoCards: [],
    translations: [],
  },
  blog: {
    id,
    title: "أثر مشروع المياه",
    description: "متابعة تنفيذ المشروع ميدانيًا",
    content: rich("تعرّف على خطوات تنفيذ المشروع ومتابعة نتائجه."),
    published: false,
    campaignIds: [],
    translations: [],
  },
  "super-categories": {
    id,
    title: "برنامج المياه",
    subtitle: "مياه نظيفة وحياة أفضل",
    intro: "صفحة تجمع مشاريع البرنامج ومقالاته وتحديثاته.",
    isActive: false,
    heroVideoLocales: [],
    translations: [],
    blocks: [
      {
        id: blockId,
        kind: "TEXT",
        title: "حول البرنامج",
        body: "نعمل على توفير المياه النظيفة للأسر.",
        anchor: "about",
        isActive: true,
        order: 0,
        translations: [],
      },
    ],
    items: [],
  },
  "urgent-banners": {
    id,
    title: "ساهم في مشروع المياه",
    description: "تبرعك يدعم توصيل المياه للأسر.",
    ctaLabel: "ساهم الآن",
    ctaUrl: "/ar/projects",
    tone: "navy",
    textSide: "start",
    suggestedAmounts: [50, 100, 250],
    locales: [],
    placements: ["home:top"],
    isActive: false,
    priority: 1,
    translations: [],
  },
};
const docs = Object.fromEntries(
  Object.entries(fixtures).map(([kind, row]) => [kind, documentFor(kind, row)]),
);
const css = (
  await postcss([
    tailwindcss({
      content: [
        "components/dashboard/content-editor/*.tsx",
        "app/(dashboard)/dashboard/_components/ImageUploadField.tsx",
      ],
      theme: {
        extend: { colors: { brand: { DEFAULT: "#025EB8", dark: "#014FA0" } } },
      },
    }),
  ]).process(
    "@tailwind base;@tailwind components;@tailwind utilities;body{background:#f4f6f8;font-family:Arial,sans-serif}button:disabled{cursor:not-allowed}",
    { from: undefined },
  )
).css;
const entry = `import React,{useState} from 'react';import{createRoot}from'react-dom/client';import{ContentEditor}from'./components/dashboard/content-editor/ContentEditor';import{CampaignWorkspaceList}from'./components/dashboard/content-editor/CampaignWorkspaceList';
const docs=${JSON.stringify(docs)},fixtures=${JSON.stringify(fixtures)},id=${JSON.stringify(id)},locales=${JSON.stringify(SUPPORTED_LOCALES)};let version=0;
window.fetch=async(url,options={})=>{const parts=String(url).split('/'),kind=parts[4];let body;
 if(String(url).endsWith('/content-options'))body={CAMPAIGN:[{id,title:fixtures.campaigns.title,live:true}],POST:[{id,title:fixtures.blog.title,live:false}]};
 else if(String(url).endsWith('/catalog'))body={categories:[{id,title:fixtures.categories.name}],campaigns:[{id,title:fixtures.campaigns.title,categoryIds:[id],priority:1}],postCategories:[],linked:{}};
 else if(String(url).includes('/workspace-list'))body={items:[{...fixtures.campaigns,categories:[{id,name:fixtures.categories.name}],searchTitles:['Clean water for families'],archived:false,revision:'list1',statuses:docs.campaigns.statuses}],nextCursor:null};
 else if(options.method==='PUT'){const input=JSON.parse(options.body);Object.assign(docs[kind].values,input.localeChanges||{});docs[kind].values[input.locale]={...docs[kind].values[input.locale],...input.changes};Object.assign(docs[kind].settings,input.settings||{});docs[kind].revision='qa-'+(++version);body=docs[kind];}
 else body=docs[kind]||{items:[]};return new Response(JSON.stringify(body),{status:200,headers:{'Content-Type':'application/json'}});};
function App(){const[kind,setKind]=useState('campaigns'),[listing,setListing]=useState(false);return <><div dir="rtl" className="sticky top-0 z-20 flex flex-wrap items-center gap-2 border-b bg-white p-3 text-sm"><strong className="me-4">معاينة اختبارية · بيانات محلية فقط</strong>{[['campaigns','المشاريع'],['categories','التصنيفات'],['blog','المدونة'],['super-categories','البرامج'],['urgent-banners','البانرات']].map(([key,label])=><button className="rounded border px-3 py-2" key={key} onClick={()=>{setKind(key);setListing(false);}}>{label}</button>)}<button className="rounded border px-3 py-2" onClick={()=>setListing(true)}>قائمة المشاريع</button></div><div className="p-4 lg:p-8">{listing?<CampaignWorkspaceList/>:<ContentEditor key={kind} kind={kind} id={id}/>}</div></>;}createRoot(document.getElementById('root')).render(<App/>);`;
const bundle = await build({
  stdin: { contents: entry, resolveDir: process.cwd(), loader: "tsx" },
  bundle: true,
  platform: "browser",
  format: "iife",
  write: false,
  jsx: "automatic",
  tsconfig: path.join(process.cwd(), "tsconfig.json"),
  define: { "process.env.NODE_ENV": '"development"' },
  plugins: [
    {
      name: "qa-next",
      setup(b) {
        b.onResolve({ filter: /wysiwyg-editor$/ }, () => ({
          path: "empty-rich",
          namespace: "qa-rich",
        }));
        b.onLoad({ filter: /.*/, namespace: "qa-rich" }, () => ({
          contents: "export default function Rich(){return null;}",
          loader: "js",
        }));
        b.onResolve({ filter: /^next\/(link|image|dynamic)$/ }, (a) => ({
          path: a.path,
          namespace: "qa-next",
        }));
        b.onLoad({ filter: /.*/, namespace: "qa-next" }, (a) => ({
          loader: "jsx",
          resolveDir: process.cwd(),
          contents:
            a.path === "next/dynamic"
              ? `import React from'react';export default function(){return function Rich({defaultValue,onUpdate,isEditable}){const[value,setValue]=React.useState(JSON.stringify(defaultValue));return <textarea aria-label="محتوى غني (بديل المعاينة المعزولة)" className="min-h-48 w-full rounded border p-3" disabled={!isEditable} value={value} onChange={e=>{setValue(e.target.value);try{const json=JSON.parse(e.target.value);onUpdate({getJSON:()=>json});}catch{}}}/>;};}`
              : a.path === "next/image"
                ? `import React from'react';export default function Image({unoptimized,...props}){return <img {...props}/>;}`
                : `import React from'react';export default function Link(props){return <a {...props}/>;}`,
        }));
      },
    },
  ],
});
await mkdir(path.join(output, "dist"), { recursive: true });
await mkdir(path.join(output, ".openai"), { recursive: true });
await writeFile(
  path.join(output, ".openai/hosting.json"),
  JSON.stringify({ static: { directory: "dist" } }),
);
await writeFile(
  path.join(output, "dist/index.html"),
  '<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>اختبار محررات المحتوى</title><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>',
);
await writeFile(path.join(output, "dist/style.css"), css);
await writeFile(
  path.join(output, "dist/bundle.js"),
  bundle.outputFiles[0].text,
);
console.log(
  "Static UI QA prepared at " + output + " (mock data, no live writes).",
);
