import { createCampaignOutcomeSnapshotReader } from "./campaign-outcome-snapshot";
import { readCampaignDeliveryCounters } from "./campaign-counter-service";

// Delivery evidence is independent of lifetime financial attribution.
export const getCampaignDeliverySnapshot=createCampaignOutcomeSnapshotReader(readCampaignDeliveryCounters);
