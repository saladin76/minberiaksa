export function generateEventId(prefix = "evt"): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function metaDonationEventId(
  donationId: string,
  kind: "success" | "failed"
): string {
  return kind === "failed"
    ? `donate_${donationId}_failed`
    : `donate_${donationId}`;
}

export type CanonicalEventName =
  | "page_view"
  | "view_content"
  | "view_donation_page"
  | "customize_product"
  | "add_to_cart"
  | "begin_checkout"
  | "add_payment_info"
  | "payment_submit"
  | "payment_failed"
  | "donation_complete"
  | "sign_up"
  | "scroll_depth"
  | "user_engagement"
  | "_missing_event";

export interface CanonicalPage {
  url?: string;
  referrer?: string;
  title?: string;
  language?: string;
  locale?: string;
  country?: string;
}

export interface CanonicalSession {
  session_id?: string;
  client_id?: string;
  source?: string;
  medium?: string;
  campaign?: string;
  campaign_id?: string;
  campaign_name?: string;
  adset_id?: string;
  adset_name?: string;
  ad_group_id?: string;
  ad_group_name?: string;
  ad_id?: string;
  ad_name?: string;
  creative_id?: string;
  creative_name?: string;
  content?: string;
  term?: string;
  placement?: string;
  publisher_platform?: string;
  site_source_name?: string;
  platform?: string;
  device?: string;
  device_platform?: string;
  network?: string;
  matchtype?: string;
  keyword?: string;
  target_id?: string;
  loc_interest?: string;
  loc_physical?: string;
  audience_type?: string;
  audience_segment?: string;
  message_variant?: string;
  channel?: string;
  twilio_campaign_id?: string;
  twilio_template_id?: string;
  target_country?: string;
  target_region?: string;
  language?: string;
  locale?: string;
  currency?: string;
  funnel?: string;
  objective?: string;
  fbclid?: string;
  fbc?: string;
  fbp?: string;
  ttclid?: string;
  gclid?: string;
  gbraid?: string;
  wbraid?: string;
  twclid?: string;
  ga_client_id?: string;
  ga_session_id?: string;
}

export interface CanonicalUser {
  external_id?: string;
  email?: string;
  phone?: string;
  first_name?: string;
  last_name?: string;
  city?: string;
  state?: string;
  zip?: string;
  country_code?: string;
  gender?: string;
  date_of_birth?: string;
  subscription_id?: string;
  fbp?: string;
  fbc?: string;
  user_agent?: string;
  ip?: string;
}

export interface CanonicalDonation {
  donation_type?: "ONE_TIME" | "MONTHLY";
  amount?: number;
  amount_usd?: number;
  currency?: string;
  cause_id?: string;
  cause_name?: string;
  content_category?: string;
  content_name?: string;
  delivery_category?: string;
  description?: string;
  status?: string;
  payment_info_available?: 0 | 1;
  predicted_ltv?: number;
  donor_type?: "new" | "returning";
  recurring?: boolean;
}

export interface CanonicalPayment {
  method?: string;
  gateway?: "stripe" | "albaraka" | "payfor" | "paypal";
  is_3ds?: boolean;
  payment_status?: "pending" | "success" | "failed";
  transaction_id?: string;
  failure_reason?: string;
  attempt_number?: number;
}

export interface CanonicalItem {
  item_id: string;
  item_name?: string;
  item_category?: string;
  price?: number;
  quantity?: number;
}

export interface CanonicalEvent {
  event: CanonicalEventName;
  event_id: string;
  event_time: number;
  page?: CanonicalPage;
  session?: CanonicalSession;
  user?: CanonicalUser;
  donation?: CanonicalDonation;
  payment?: CanonicalPayment;
  items?: CanonicalItem[];
  custom?: Record<string, unknown>;
}

export const META_EVENT_MAP: Partial<Record<CanonicalEventName, string>> = {
  page_view: "PageView",
  view_content: "ViewContent",
  view_donation_page: "ViewContent",
  customize_product: "CustomizeProduct",
  add_to_cart: "AddToCart",
  begin_checkout: "InitiateCheckout",
  add_payment_info: "AddPaymentInfo",
  donation_complete: "Donate",
  sign_up: "CompleteRegistration",
};

export const META_CAPI_OFF_CHANNEL: ReadonlySet<CanonicalEventName> = new Set([
  "donation_complete",
  "payment_failed",
]);

export const META_CAPI_WEBHOOK_OWNED = META_CAPI_OFF_CHANNEL;

export const TIKTOK_EVENT_MAP: Partial<Record<CanonicalEventName, string>> = {
  page_view: "PageView",
  view_content: "ViewContent",
  view_donation_page: "ViewContent",
  add_to_cart: "AddToCart",
  begin_checkout: "InitiateCheckout",
  add_payment_info: "AddPaymentInfo",
  sign_up: "CompleteRegistration",
};

export const GA4_EVENT_MAP: Partial<Record<CanonicalEventName, string>> = {
  page_view: "page_view",
  view_content: "view_item",
  view_donation_page: "view_item",
  customize_product: "select_item",
  add_to_cart: "add_to_cart",
  begin_checkout: "begin_checkout",
  add_payment_info: "add_payment_info",
  payment_failed: "exception",
  sign_up: "sign_up",
  scroll_depth: "scroll",
  user_engagement: "user_engagement",
};
