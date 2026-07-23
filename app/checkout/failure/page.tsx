import type{Metadata}from"next";import{FailureExperience}from"@/components/checkout-result/failure-experience";import{CheckoutShell}from"@/components/checkout/checkout-shell";
export const metadata:Metadata={title:"تعذر إكمال التبرع | مؤسسة منبر الأقصى الدولية"};
export default function CheckoutFailurePage(){return <CheckoutShell><FailureExperience/></CheckoutShell>}
