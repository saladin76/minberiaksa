// Minberi Aksa has no impact-builder settlement campaign integration.
export const HAS_IMPACT_BACKING_CAMPAIGNS = false;
export const HAS_CATEGORY_PAGE_LIBRARY = true;
export function campaignWorkspaceWhere():Record<string,unknown>{return {AND:[{OR:[{isDeleted:false},{isDeleted:null},{isDeleted:{isSet:false}}]},...(HAS_IMPACT_BACKING_CAMPAIGNS?[{impactCampaign:{is:null}}]:[])]};}
