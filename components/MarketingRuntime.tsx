"use client";

import React from "react";
import TrackingPixels from "@/components/TrackingPixels";
import { AttributionCapture } from "@/components/AttributionCapture";
import { TrackingPixelBootstrap } from "@/components/TrackingPixelBootstrap";
import { RoutePageViewTracker } from "@/components/RoutePageViewTracker";
import { SuccessFinalConversionTracker } from "@/components/SuccessFinalConversionTracker";
import ReferralTracker from "@/components/ReferralTracker";

/**
 * Single public-site marketing runtime.
 *
 * Keep every tracking/attribution component mounted from one obvious place so
 * app/[locale]/layout.tsx stays readable and future tracking changes do not
 * scatter across the root layout.
 *
 * Ownership map:
 * - TrackingPixels: canonical browser pixel loader + tracking context.
 * - TrackingPixelBootstrap: eagerly opens the existing TrackingPixels load gate.
 * - RoutePageViewTracker: client-side route-change PageView only.
 * - SuccessFinalConversionTracker: final browser conversions on /success/:id.
 * - AttributionCapture: UTM/click-id persistence.
 * - ReferralTracker: referral-code persistence.
 */
export function MarketingRuntime({ children }: { children: React.ReactNode }) {
  return (
    <TrackingPixels>
      <TrackingPixelBootstrap />
      <RoutePageViewTracker />
      <SuccessFinalConversionTracker />
      <AttributionCapture />
      <ReferralTracker />
      {children}
    </TrackingPixels>
  );
}
