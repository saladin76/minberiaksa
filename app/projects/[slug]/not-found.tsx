import { Button } from "@/components/ui/button";

export default function ProjectNotFound() {
  return <main id="main-content" className="project-not-found"><div className="site-container"><span aria-hidden="true">404</span><h1>المشروع غير موجود</h1><p>قد يكون رابط المشروع غير صحيح أو أن المشروع لم يعد متاحًا.</p><div><Button href="/projects">العودة إلى جميع المشاريع</Button><Button href="/#donate" variant="outline">تبرع حيث الحاجة أشد</Button><Button href="/" variant="text">العودة إلى الصفحة الرئيسية</Button></div></div></main>;
}
