import type { Metadata } from "next";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { TopUtilityBar } from "@/components/layout/top-utility-bar";
import { siteConfig } from "@/config/site";
export const metadata:Metadata={title:"من نحن | مؤسسة منبر الأقصى الدولية",description:"تعرف إلى مؤسسة منبر الأقصى الدولية ومجالات عملها وآلية تنفيذ مشاريعها."};
const fields=["الإغاثة والغذاء والمياه","دعم الأسر في القدس وغزة","ترميم المنازل والمشاريع الوقفية","التعليم ورعاية الشباب","المشاريع الموسمية والأضاحي"];
const steps=["تحديد الاحتياج بالتنسيق مع الفرق الميدانية.","اختيار المشروع ونطاق التنفيذ والمستفيدين.","تجهيز الموارد وتنفيذ المشروع.","توثيق التنفيذ ومراجعة المواد المتاحة.","نشر التحديثات والتقارير المعتمدة عند توفرها."];
export default function AboutPage(){return <><TopUtilityBar/><SiteHeader/><main id="main-content" className="about-direct-page">
<section className="simple-page-hero"><div className="site-container"><span>من نحن</span><h1>مؤسسة منبر الأقصى الدولية</h1><p>مؤسسة إنسانية تعمل على دعم مشاريع القدس والأقصى وإغاثة أهل غزة والفئات الأكثر احتياجًا.</p></div></section>
<section><div className="site-container about-direct-content"><h2>ماذا تفعل المؤسسة؟</h2><p>تستقبل المؤسسة المساهمات وتوجهها إلى المشاريع المنشورة وفق طبيعة كل مشروع واحتياجه. وتشمل الأعمال الإغاثة والغذاء والمياه، ودعم الأسر، والتعليم، وترميم المنازل، والمشاريع الوقفية والموسمية.</p></div></section>
<section><div className="site-container about-direct-content"><h2>مجالات العمل</h2><ul>{fields.map(item=><li key={item}>{item}</li>)}</ul></div></section>
<section><div className="site-container about-direct-content"><h2>كيف يتم تنفيذ المشاريع؟</h2><ol>{steps.map((item,index)=><li key={item}><b>{index+1}</b><span>{item}</span></li>)}</ol></div></section>
<section><div className="site-container about-direct-content about-data"><h2>بيانات المؤسسة</h2><dl><div><dt>الاسم</dt><dd>{siteConfig.nameAr}</dd></div><div><dt>الاسم بالإنجليزية</dt><dd dir="ltr">{siteConfig.nameEn}</dd></div><div><dt>العنوان</dt><dd dir="ltr">{siteConfig.address}</dd></div></dl></div></section>
<section id="contact"><div className="site-container about-direct-content"><h2>التواصل</h2><p><a href={`mailto:${siteConfig.email}`}>{siteConfig.email}</a></p><p className="about-phones">{siteConfig.phones.map(phone=><a key={phone} dir="ltr" href={`tel:${phone.replace(/\s/g,"")}`}>{phone}</a>)}</p></div></section>
</main><SiteFooter/></>}
