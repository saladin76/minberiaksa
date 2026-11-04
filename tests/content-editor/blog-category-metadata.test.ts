import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { buildPageMetadata, SITE_URL } from "../../lib/seo";

test("blog-category metadata awaits route params and uses that language for copy, brand and canonical URL", async () => {
  for (const locale of ["ar", "en", "tr"]) {
    const calls: { url: string; locale: string }[] = [];
    const category = { title: locale === "ar" ? "أخبار المؤسسة" : locale === "tr" ? "Dernek haberleri" : "Association news", description: locale === "ar" ? "أخبار المشاريع" : "Project news", slug: locale + "-news" };
    const code = ts.transpileModule(readFileSync("app/[locale]/blog/category/[categoryId]/page.tsx", "utf8"), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
    const loaded={exports:{} as {generateMetadata:(input:{params:Promise<{locale:string;categoryId:string}>})=>Promise<Record<string,unknown>>;default:(input:{params:Promise<{locale:string;categoryId:string}>})=>Promise<{props:{id:string}}>}};
    const deps:Record<string,unknown>={
      axios:{get:async(url:string,options:{params:{locale:string}})=>{calls.push({url,locale:options.params.locale});return {data:category};}},
      "@/lib/server-base-url":{getServerBaseUrl:async()=>"https://site.example"},
      "@/lib/seo":{buildPageMetadata,SITE_URL},
      "./_components/MainPage":()=>null,
      "react/jsx-runtime":{jsx:(_type:unknown,props:unknown)=>({props})},
    };
    new vm.Script(code).runInNewContext({module:loaded,exports:loaded.exports,console,encodeURIComponent,require:(name:string)=>{if(!(name in deps))throw new Error(name);return deps[name];}});
    let resolveParams!:(value:{locale:string;categoryId:string})=>void;
    const params=new Promise<{locale:string;categoryId:string}>(resolve=>{resolveParams=resolve;});
    const result=loaded.exports.generateMetadata({params});
    assert.equal(calls.length,0,"route values must resolve before requesting localized data");
    resolveParams({locale,categoryId:"category-id"});
    const metadata=await result;
    assert.equal(calls[0].locale,locale); assert.equal(calls[0].url,"https://site.example/api/post-categories/category-id");
    assert.equal((metadata.alternates as {canonical:string}).canonical,`${SITE_URL}/${locale}/blog/category/${locale}-news`);
    assert.match(JSON.stringify(metadata.title),new RegExp(category.title));
    if(locale!=="ar")assert.doesNotMatch(JSON.stringify(metadata.title),/منبر|الأقصي/);
    const page=await loaded.exports.default({params}); assert.equal(page.props.id,"category-id");
  }
});
