import { z } from "zod";

export const searchChatRequest = z.object({
  action: z.literal("chat"), id: z.string().regex(/^[a-f0-9]{24}$/i), version: z.number().int().positive(),
  requestId: z.string().uuid(), message: z.string().trim().min(1).max(4000),
}).strict();
export const searchChatReply = z.object({
  reply: z.string().trim().min(1).max(6000),
  recommendation: z.enum(["none", "validate", "create", "enable", "pause", "budget", "replan"]),
  suggestedDailyBudget: z.number().positive().max(1e6).nullable(),
}).strict();
export type SearchChatReply = z.infer<typeof searchChatReply>;
export type SearchChatTurn = { requestId: string; planVersion: number; at: string; user: string; assistant: SearchChatReply };
export function availableSearchActions(status: string) {
  if (status === "DRAFT") return ["none", "validate", "replan"];
  if (status === "VALIDATED") return ["none", "validate", "create", "replan"];
  if (status === "PAUSED") return ["none", "enable", "budget"];
  if (status === "ACTIVE" || status === "MIXED") return ["none", "pause", "budget"];
  if (status === "PLANNING_FAILED") return ["none", "replan"];
  return ["none"];
}
