import type{CheckoutPaymentMethod}from"@/types/checkout";
export const checkoutSteps=[{id:"donor",label:"بيانات المتبرع"},{id:"documents",label:"الإيصالات والإهداءات"},{id:"payment",label:"طريقة الدفع"},{id:"review",label:"المراجعة والتأكيد"}]as const;
export const checkoutCountries=["Türkiye","Saudi Arabia","United Arab Emirates","Qatar","Kuwait","United Kingdom","United States","Canada","Germany","France","Other"];
export const checkoutLanguages=["العربية","Türkçe","English","Français"];
export const paymentMethods:{id:CheckoutPaymentMethod;label:string;description:string}[]=[{id:"card",label:"بطاقة مصرفية",description:"حقول تصميمية لا تقرأ أو تحفظ البيانات."},{id:"wallet",label:"محفظة رقمية",description:"ستظهر الخيارات بعد ربط بوابة الدفع."},{id:"bank",label:"تحويل بنكي",description:"بيانات الحساب تحتاج اعتماد المؤسسة."}];
