import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { projects } from "@/data/projects";
import { knowledge, stories } from "@/data/homepage";
import {
  FundsSelector,
  QuickDonation,
  RecurringGivingTool,
  ReelsExperience,
  WaqfBuilder,
  ZakatCalculator,
} from "./homepage-interactions";

const regionLabels: Record<string, string> = {
  gaza: "غزة",
  "al-quds": "القدس",
  "al-aqsa": "الأقصى