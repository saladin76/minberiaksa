"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { funds, reels, stories } from "@/data/homepage";

type Intent = { label: string; kind: "zakat" | "waqf" | "urgent" | "general" };
const intents: Intent[] = [
  { label: "زكاة", kind: "zakat" },
  { label: "وقف", kind: "waqf" },
  { label: "غ