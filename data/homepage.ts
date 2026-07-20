export const stories = [
  ["غزة", "ميداني", "gaza"], ["الأقصى", "جديد", "aqsa"], ["عطاء الجمعة", "مستمر", "gold"],
  ["الوقف", "تقرير", "waqf"], ["الزكاة", "جديد", "zakat"], ["التقارير", "تقرير", "navy"], ["الفريق الميداني", "ميداني", "field"],
] as const;

export const officialProjects = [
  { id:"million-meals", title:"حملة مليون وجبة لأهل غزة", type:"غزة · إغاثة غذائية", description:"مساهمة في توفير وجبات جاهزة للأسر الأكثر احتياجًا ضمن حملة غذائية مستمرة.", raised:239090.51, goal:1000000, donors:4097, unit:10, featured:true, image:"GAZA MEALS — APPROVED FIELD IMAGE REQUIRED" },
  { id:"food-parcels", title:"الطرود الغذائية لأهل غزة", type:"غزة · غذاء", description:"طرود غذائية متكاملة تدعم الأسر المتضررة وتساعدها على تأمين احتياجاتها الأساسية.", raised:7579.36, goal:30000, donors:149, unit:70, image:"GAZA PARCELS — APPROVED FIELD IMAGE REQUIRED" },
  { id:"quds-restoration", title:"ترميم عاجل في القدس", type:"القدس · ترميم", description:"المساهمة في ترميم منزل مقدسي قديم ليبقى مأوى آمنًا لعائلة داخل المدينة.", raised:2604.42, goal:60000, donors:80, unit:400, image:"AL-QUDS RESTORATION — APPROVED FIELD IMAGE REQUIRED" },
] as const;

export const funds = [
  { id:"gaza", title:"صندوق طوارئ غزة", kind:"صدقة وإغاثة", tone:"urgent", description:"استجابة مرنة للاحتياجات الإنسانية الأكثر إلحاحًا في غزة." },
  { id:"waqf", title:"صندوق وقف القدس", kind:"وقف", tone:"waqf", description:"مساهمات مستدامة مرتبطة بمشاريع القدس طويلة الأثر." },
  { id:"zakat", title:"صندوق زكاة فلسطين", kind:"زكاة", tone:"zakat", description:"مسار مستقل لحفظ نية الزكاة وتوجيهها للمستحقين." },
  { id:"aqsa", title:"صندوق دعم الأقصى", kind:"دعم مؤسسي", tone:"navy", description:"دعم المشاريع المرتبطة بالأقصى واحتياجاته المعتمدة." },
  { id:"need", title:"صندوق حيث الحاجة أشد", kind:"عطاء عام", tone:"general", description:"يوجّه إلى الاحتياج الأكثر أولوية وفق التقييم الميداني." },
] as const;

export const reels = [
  ["أنا القدس", "القدس", "00:42"], ["القدس خطنا الأحمر", "القدس", "00:58"], ["رسالة إلى علماء الأمة", "الأقصى", "01:12"], ["تجهيز طرود غزة", "غزة", "00:37"], ["توزيع المياه في غزة", "غزة", "00:45"],
] as const;

export const knowledge = [
  "كيف تخرج زكاتك لفلسطين بوضوح؟", "ما الفرق بين الوقف والصدقة؟", "كيف تصل إلى تقارير مشروعك؟", "كيف يصل تبرعك إلى العائلات؟", "لماذا ندعم القدس والأقصى؟",
] as const;
