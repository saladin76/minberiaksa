export type BasketIntent = "zakat" | "waqf" | "recurring" | "urgent" | "general";
export type DonationMode = "one-time" | "recurring" | "gift";
export type BasketCurrency = "USD";
export type ReceiptType = "general" | "zakat" | "recurring";
export type CertificateType = "waqf";

export type BasketMetadataValue = string | number | boolean | null;
export type BasketMetadata = Record<string, BasketMetadataValue>;

export type BasketItem = {
  id: string;
  projectId?: string;
  fundId?: string;
  slug?: string;
  projectTitle: string;
  region?: string;
  intent: BasketIntent;
  intentLabel: string;
  donationMode: DonationMode;
  frequency?: string;
  amount: number;
  currency: BasketCurrency;
  source?: string;
  receiptType?: ReceiptType;
  certificateType?: CertificateType;
  waqfType?: string;
  ownerName?: string;
  dedication?: string;
  giftRecipient?: string;
  giftEmail?: string;
  giftOccasion?: string;
  giftMessage?: string;
  giftSender?: string;
  startPreference?: string;
  estimatedMonthly?: number;
  estimatedAnnual?: number;
  qurbaniUnits?: number;
  qurbaniName?: string;
  metadata?: BasketMetadata;
};

export type BasketItemInput = Omit<BasketItem, "id"> & { id?: string };

export type LegacyBasketDetail = Partial<BasketItemInput> & {
  project?: string;
  giftData?: {
    recipient?: string;
    email?: string;
    occasion?: string;
    message?: string;
    sender?: string;
  };
  dedicationData?: {
    ownerName?: string;
    dedication?: string;
  };
};

export type BasketTotals = {
  oneTimeAmount: number;
  zakatAmount: number;
  waqfAmount: number;
  giftAmount: number;
  generalOneTimeAmount: number;
  amountDueNow: number;
  recurringPlans: BasketItem[];
};

export type CheckoutSnapshot = {
  paymentMethod: "card" | "wallet" | "bank";
  amountDueNow: number;
  recurringPlanCount: number;
  intentionCount: number;
  documentCount: number;
  currency: BasketCurrency;
  status: "prototype-only";
};
