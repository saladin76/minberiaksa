import type { Metadata } from "next";
import { AccountShell } from "@/components/account/account-shell";
import { DonationHistory } from "@/components/account/donation-history";
export const metadata: Metadata = { title: "سجل تبرعاتك | مؤسسة منبر الأقصى الدولية" };
export default function DonationsPage(){return <AccountShell><DonationHistory/></AccountShell>}
