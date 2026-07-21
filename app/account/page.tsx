import type { Metadata } from "next";
import { AccountShell } from "@/components/account/account-shell";
import { AccountOverview } from "@/components/account/account-overview";
export const metadata: Metadata = { title: "حساب عطائك | مؤسسة منبر الأقصى الدولية" };
export default function AccountPage() { return <AccountShell><AccountOverview/></AccountShell>; }
