import type { Metadata } from "next";
import { AccountShell } from "@/components/account/account-shell";
import { RecurringPlansManager } from "@/components/account/recurring-plans-manager";
export const metadata: Metadata = { title: "خطط عطائك المستمر | مؤسسة منبر الأقصى الدولية" };
export default function AccountRecurringPage(){return <AccountShell><RecurringPlansManager/></AccountShell>}
