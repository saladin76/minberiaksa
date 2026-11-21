"use client";
// Browser-only: provider check times are formatted with the browser's language data, which differs from the server's (React #418).
import dynamic from "next/dynamic";
const Placeholder = () => <div className="h-24 animate-pulse rounded-lg bg-slate-100" />;
export const IntegrationSettingsManager = dynamic(() => import("./IntegrationSettingsManager").then((m) => m.IntegrationSettingsManager), { ssr: false, loading: Placeholder });
export const SenderRoutingManager = dynamic(() => import("./SenderRoutingManager").then((m) => m.SenderRoutingManager), { ssr: false, loading: Placeholder });
