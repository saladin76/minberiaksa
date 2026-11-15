"use client";
import { useEffect } from "react";
/** Quietly marks this browser as a verified donor (see /api/donation-guard/trust). Renders nothing. */
export default function DonationTrustMark({ donationId, token }: { donationId: string; token: string | null }) {
  useEffect(() => {
    void fetch("/api/donation-guard/trust", {
      method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", keepalive: true,
      body: JSON.stringify({ donationId, token }),
    }).catch(() => undefined);
  }, [donationId, token]);
  return null;
}
