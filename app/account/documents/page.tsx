import type { Metadata } from "next";
import { AccountShell } from "@/components/account/account-shell";
import { DocumentLibrary } from "@/components/account/document-library";
export const metadata: Metadata = { title: "وثائق عطائك | مؤسسة منبر الأقصى الدولية" };
export default function DocumentsPage(){return <AccountShell><DocumentLibrary/></AccountShell>}
