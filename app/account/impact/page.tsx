import type { Metadata } from "next";
import { AccountShell } from "@/components/account/account-shell";
import { ImpactWallet } from "@/components/account/impact-wallet";
export const metadata: Metadata = { title: "محفظة أثر عطائك | مؤسسة منبر الأقصى الدولية" };
export default function ImpactPage(){return <AccountShell><ImpactWallet/></AccountShell>}
