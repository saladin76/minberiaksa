import type { Metadata } from "next";
import { AccountShell } from "@/components/account/account-shell";
import { AccountSettings } from "@/components/account/account-settings";
export const metadata: Metadata = { title: "إعدادات حساب العطاء | مؤسسة منبر الأقصى الدولية" };
export default function SettingsPage(){return <AccountShell><AccountSettings/></AccountShell>}
