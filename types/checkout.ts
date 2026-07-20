export type CheckoutPaymentMethod="card"|"wallet"|"bank";
export type DonorDetails={firstName:string;lastName:string;email:string;country:string;phone:string;city:string;preferredLanguage:string;organization:string};
export type DonorErrors=Partial<Record<keyof DonorDetails,string>>;
