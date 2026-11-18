"use client";
import { useEffect, useState } from "react";
import { pauseTexts } from "@/lib/site-security/emergency-texts";

/** Shows the fixed notice while donations are paused from /dashboard/security. Renders nothing otherwise. */
export default function DonationPauseBanner({ locale }: { locale: string }) {
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    let alive = true;
    const check = () => fetch("/api/site-status", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => { if (alive) setPaused(s?.donationsPaused === true); })
      .catch(() => undefined);
    void check();
    const timer = setInterval(check, 60_000);
    return () => { alive = false; clearInterval(timer); };
  }, []);
  if (!paused) return null;
  return (
    <div role="status" style={{ background: "#fff7e6", borderBottom: "1px solid #f5c26b", color: "#7a4b00", padding: "10px 16px", textAlign: "center", fontSize: 14, lineHeight: 1.6 }}>
      {pauseTexts(locale).banner}
    </div>
  );
}
