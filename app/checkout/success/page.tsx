import type{Metadata}from"next";import{SuccessExperience}from"@/components/checkout-result/success-experience";import{CheckoutShell}from"@/components/checkout/checkout-shell";
export const metadata:Metadata={title:"تمت معاينة نجاح التبرع | مؤسسة منبر الأقصى الدولية"};
export default function CheckoutSuccessPage(){return <CheckoutShell><SuccessExperience/></CheckoutShell>}
