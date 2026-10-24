import type { Prisma } from "@prisma/client";

export type CommunicationPurposeGroup = "AUTOMATIC" | "MARKETING";

/**
 * Split the communication log into the two operational views used by the dashboard.
 * Unknown purpose values stay with the automatic/system view so older deliveries
 * remain visible instead of silently disappearing.
 */
export function communicationPurposeWhere(
  group: CommunicationPurposeGroup | null | undefined,
): Prisma.CommunicationDeliveryWhereInput {
  if (group === "MARKETING") return { purpose: "MARKETING" };
  if (group === "AUTOMATIC") return { purpose: { not: "MARKETING" } };
  return {};
}

export function parseCommunicationPurposeGroup(
  value: string | null | undefined,
): CommunicationPurposeGroup | undefined {
  if (value === "AUTOMATIC" || value === "MARKETING") return value;
  return undefined;
}

/**
 * Keep tab navigation aligned with its data scope. A campaign deep-link is
 * marketing-only; switching to automatic messages must leave that campaign
 * scope behind or the automatic view would be empty by construction.
 */
export function setCommunicationPurposeParams(
  search: string,
  group: CommunicationPurposeGroup,
): URLSearchParams {
  const params = new URLSearchParams(search);
  params.delete("page");
  if (group === "MARKETING") {
    params.set("view", "marketing");
  } else {
    params.delete("view");
    params.delete("campaign");
  }
  return params;
}
