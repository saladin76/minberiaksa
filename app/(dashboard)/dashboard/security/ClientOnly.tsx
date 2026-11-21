"use client";
// Drawn in the browser only: dates and country names come from the browser's own language data (ICU), which differs
// from the server's, so a server-drawn copy never matched and React reported #418 (found by the dashboard walk, 2026-11-21).
import dynamic from "next/dynamic";
const Placeholder = () => <div className="h-24 animate-pulse rounded-lg bg-slate-100" />;
export const EmergencySwitch = dynamic(() => import("./EmergencySwitch"), { ssr: false, loading: Placeholder });
export const SiteSecurityManager = dynamic(() => import("./SiteSecurityManager"), { ssr: false, loading: Placeholder });
export const DonorGatewayOverrides = dynamic(() => import("./DonorGatewayOverrides"), { ssr: false, loading: Placeholder });
