'use client';

import { useMemo, useState } from 'react';

const amounts = [25, 50, 100, 250];
const frequencies = ['مرة واحدة', 'يومي', 'كل جمعة', 'شهري'];
const donationTypes = ['حيث الحاجة أشد', 'غزة', 'القدس', 'زكاة', 'وقف'];

const projects = [
  {
    tag: 'القدس · وقف',
    title: 'وقف القدس المستدام',
    body: 'ساهم في مشروع وقفي يدعم أهل القدس ومؤسساتها الإنسانية على المدى الطويل.',
    cta: 'استكشف مشروع الوقف',
    image: 'https://drive.google.com/uc?export=view&id=1vslhxCj1c7KpF0dziaG5ZRJBO8OQFmDu',
  },
  {
    tag: 'غزة · إغاثة عاجلة',
    title: 'طرود غذائية لأهل غزة',
    body: 'تجهيز وتسليم طرود غذائية للعائلات المتضررة مع توثيق مراحل التنفيذ والتسليم.',
    cta: 'تبرع لغزة',
    image: 'https://drive.google.com/uc?export=view&id=14ExUX9TVvMB-jc_mWa_iPnqSjl_UH0lv',
  },
  {
    tag: 'القدس · ترميم',
    title: 'ترميم منازل القدس',
    body: 'دعم ترميم منازل الأسر المقدسية وتعزيز بقائها وصمودها داخل المدينة.',
    cta: 'عرض تفاصيل المشروع',
    image: 'https://drive.google.com/uc?export=view&id=1vslhxCj1c7KpF0dziaG5ZRJBO8OQFmDu',
  },
];

const campaigns = [
  ['الزكاة', 'أخرج زكاتك لفلسطين'],
  ['الوقف', 'أثر يبقى في القدس'],
  ['غزة', 'الإغاثة العاجلة'],
  ['رمضان', 'عطاؤك يصنع أثرًا'],
  ['الأضاحي', 'أضحيتك تصل لمستحقيها'],
];

export default function HomePage() {
  const [amount, setAmount] = useState(100);
  const [frequency, setFrequency] = useState('مرة واحدة');
  const [donationType, setDonationType] = useState('حيث الحاجة أشد');
  const [menuOpen, setMenuOpen] = useState(false);

  const summary = useMemo(
    () => `${amount} USD · ${frequency} · ${donationType}`,
    [amount, frequency, donationType],
  );

  return (
    <main>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="مؤسسة منبر الأقصى الدولية">
          <span className="brand-mark" aria-hidden="true">م</span>
          <span><strong>مؤسسة منبر الأقصى الدولية</strong><small>Minbar al-Aqsa Association</small></span>
        </a>
        <nav className={menuOpen ? 'nav open' : 'nav'} aria-label="التنقل الرئيسي">
          <a href="#projects">المشاريع</a><a href="#zakat">الزكاة</a><a href="#waqf">الأوقاف</a>
          <a href="#recurring">التبرع المستمر</a><a href="#reports">التقارير</a><a href="#about">من نحن</a>
        </nav>
        <div className="header-actions"><button className="lang">AR</button><a className="button primary small" href="#donate">تبرع الآن</a><button className="menu" onClick={() => setMenuOpen(!menuOpen)} aria-label="فتح القائمة">☰</button></div>
      </header>

      <section className="hero" id="top">
        <div className="hero-media" role="img" aria-label="توثيق ميداني لمشروع إنساني في فلسطين">
          <div className="hero-badges"><span>غزة — فلسطين</span><span className="urgent">استجابة عاجلة</span></div>
          <div className="field-note"><small>تحديث ميداني</small><strong>مساعدات موثقة تصل إلى العائلات الأكثر احتياجًا</strong></div>
        </div>
        <div className="hero-copy">
          <span className="eyebrow">من القدس وغزة إلى كل صاحب أثر</span>
          <h1>عطاء واضح.<br/>أثر موثّق.</h1>
          <p>منصة تبرعات مؤسسية تربط مساهمتك بالمشروع والتحديثات الميدانية، مع مسارات واضحة للإغاثة والزكاة والوقف.</p>
          <div className="hero-actions"><a className="button primary" href="#donate">ابدأ التبرع</a><a className="button ghost" href="#major">موّل مشروعًا كاملًا</a></div>
          <div className="trust-line"><span>دفع آمن</span><span>مشاريع موثقة</span><span>تقارير ميدانية</span></div>
        </div>
      </section>

      <section className="donation-shell" id="donate">
        <div className="section-heading compact"><span className="eyebrow">تبرع سريع</span><h2>اختر طريق عطائك في خطوات واضحة</h2><p>نوع التبرع منفصل عن التكرار والمبلغ، ويمكنك مراجعة اختيارك قبل الدفع.</p></div>
        <div className="donation-grid">
          <div className="choice-group"><h3>نوع التبرع</h3><div className="pills">{donationTypes.map((item)=><button key={item} className={donationType===item?'active':''} onClick={()=>setDonationType(item)}>{item}</button>)}</div></div>
          <div className="choice-group"><h3>التكرار</h3><div className="pills">{frequencies.map((item)=><button key={item} className={frequency===item?'active':''} onClick={()=>setFrequency(item)}>{item}</button>)}</div></div>
          <div className="choice-group"><h3>المبلغ</h3><div className="pills amount-pills">{amounts.map((item)=><button key={item} className={amount===item?'active':''} onClick={()=>setAmount(item)}>{item}</button>)}<button>مبلغ آخر</button></div></div>
          <div className="donation-summary"><small>ملخص اختيارك</small><strong>{summary}</strong><p>يساهم تبرعك في دعم الاحتياجات الأكثر إلحاحًا في القدس وغزة.</p><button className="button primary full">أكمل التبرع</button></div>
        </div>
      </section>

      <section className="campaigns" id="zakat">
        <div className="section-heading"><span className="eyebrow">بوابة الحملات</span><h2>طرق متعددة، وهدف واحد: أثر يصل</h2></div>
        <div className="campaign-row">{campaigns.map(([tag,title])=><a href="#projects" className="campaign" key={tag}><small>{tag}</small><strong>{title}</strong><span>استكشف الحملة ←</span></a>)}</div>
      </section>

      <section className="projects" id="projects">
        <div className="section-heading"><span className="eyebrow">مشاريع مفتوحة</span><h2>مشاريع واضحة في القدس وغزة</h2><p>اطلع على طبيعة المشروع، المنطقة، ومسار التوثيق قبل التبرع.</p></div>
        <div className="project-grid">{projects.map((project, index)=><article className={index===0?'project-card featured':'project-card'} key={project.title}>
          <div className="project-image" style={{backgroundImage:`linear-gradient(180deg,transparent,rgba(2,34,34,.72)),url(${project.image})`}}><span>{project.tag}</span></div>
          <div className="project-body"><h3>{project.title}</h3><p>{project.body}</p><a href="#donate">{project.cta} ←</a></div>
        </article>)}</div>
      </section>

      <section className="legacy" id="waqf">
        <div className="legacy-copy"><span className="eyebrow light">أثر القدس الممتد</span><h2>تبرع اليوم يتحول إلى أثر يبقى</h2><p>المساهمة الوقفية ليست رقمًا يختفي بعد الدفع، بل مسار واضح يبدأ بمساهمتك وينتهي بمنفعة موثقة تتجدد.</p><a href="#donate" className="button sand">ساهم في وقف القدس</a></div>
        <ol className="legacy-track"><li><span>01</span><strong>مساهمتك</strong><p>سهم وقفي أو مساهمة مفتوحة.</p></li><li><span>02</span><strong>مشروع مستدام</strong><p>يُعتمد بعد التحقق والتوثيق.</p></li><li><span>03</span><strong>منفعة مستمرة</strong><p>تخدم أهل القدس على المدى الطويل.</p></li><li><span>04</span><strong>تقرير وأثر</strong><p>تحديثات توضح التنفيذ والنتائج.</p></li></ol>
      </section>

      <section className="evidence" id="reports">
        <div className="section-heading"><span className="eyebrow">الثقة والتوثيق</span><h2>أثر موثّق من الميدان</h2><p>صور وتحديثات وتقارير تشرح أين وصل المشروع وما مرحلته الحالية.</p></div>
        <div className="evidence-layout">
          <div className="evidence-photo"><span>توثيق ميداني · غزة</span></div>
          <div className="evidence-copy"><small>آخر تحديث</small><h3>تدخل إنساني قيد التنفيذ</h3><dl><div><dt>الموقع</dt><dd>غزة — فلسطين</dd></div><div><dt>نوع التدخل</dt><dd>إغاثة عاجلة</dd></div><div><dt>الحالة</dt><dd>قيد التنفيذ</dd></div><div><dt>المصدر</dt><dd>فريق المؤسسة — قيد التحقق</dd></div></dl><a href="#">عرض التقرير الكامل ←</a></div>
        </div>
      </section>

      <section className="recurring" id="recurring">
        <div><span className="eyebrow light">عطاء مستمر</span><h2>اجعل دعمك عادة تصنع أثرًا</h2><p>اختر يوميًا، كل جمعة، أو شهريًا. ويمكن تعديل التبرع أو إيقافه لاحقًا.</p></div>
        <div className="recurring-card"><div className="pills">{['يومي','كل جمعة','شهري'].map(item=><button key={item} className={frequency===item?'active':''} onClick={()=>setFrequency(item)}>{item}</button>)}</div><div className="big-amount"><strong>{amount}</strong><span>USD</span></div><p>حيث الحاجة أشد في القدس وغزة</p><a className="button primary full" href="#donate">ابدأ تبرعًا مستمرًا</a></div>
      </section>

      <section className="major" id="major"><div><span className="eyebrow">المساهمات الكبرى</span><h2>موّل مشروعًا كاملًا في القدس أو غزة</h2><p>مسار خاص للعائلات والشركات والراغبين في مساهمة مخصصة مع متابعة وتقارير.</p></div><ul><li>وقف مخصص باسمك أو عائلتك</li><li>تمويل مشروع أو مرحلة تنفيذ</li><li>تخصيص المساهمة لمشروع محدد</li><li>تقارير ومتابعة مخصصة</li></ul><a className="button gold" href="#">اطلب ملف مشروع</a></section>

      <section className="knowledge" id="about"><div className="section-heading"><span className="eyebrow">مركز المعرفة</span><h2>معلومات تساعدك قبل التبرع</h2></div><div className="knowledge-grid"><article><small>دليل الزكاة</small><h3>كيف تخرج زكاتك لفلسطين بوضوح؟</h3><a href="#">اقرأ الدليل ←</a></article><article><small>دليل الوقف</small><h3>ما الفرق بين الوقف والصدقة؟</h3><a href="#">اقرأ الدليل ←</a></article><article><small>متابعة الأثر</small><h3>كيف تصل إلى تقارير مشروعك؟</h3><a href="#">اقرأ الدليل ←</a></article></div></section>

      <footer><div className="footer-brand"><div className="brand-mark">م</div><h3>مؤسسة منبر الأقصى الدولية</h3><p>مشاريع القدس وغزة، من التبرع إلى التوثيق والأثر.</p></div><div><h4>التبرع</h4><a href="#projects">المشاريع</a><a href="#zakat">الزكاة</a><a href="#waqf">الأوقاف</a><a href="#recurring">التبرع المستمر</a></div><div><h4>الثقة</h4><a href="#reports">التقارير</a><a href="#">الفيديوهات الميدانية</a><a href="#">الحسابات البنكية</a><a href="#">الأسئلة الشائعة</a></div><div><h4>المؤسسة</h4><a href="#about">من نحن</a><a href="#">التطوع</a><a href="#">تواصل معنا</a><a href="#">الخصوصية والشروط</a></div></footer>
      <a className="mobile-donate" href="#donate">تبرع الآن</a>
    </main>
  );
}
