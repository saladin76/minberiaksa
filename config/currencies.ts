export type CurrencyOption = { code: string; symbol: string; label: string; decimalDigits: number; enabled: boolean };

export const currencies: CurrencyOption[] = [
  ["USD","$","US Dollar",2],["EUR","€","Euro",2],["GBP","£","British Pound",2],["TRY","₺","Turkish Lira",2],["SAR","﷼","Saudi Riyal",2],["AED","د.إ","UAE Dirham",2],["CAD","C$","Canadian Dollar",2],["AUD","A$","Australian Dollar",2],["KWD","د.ك","Kuwaiti Dinar",3],["QAR","﷼","Qatari Riyal",2],["BHD","د.ب","Bahraini Dinar",3],["OMR","﷼","Omani Rial",3],["JOD","د.ا","Jordanian Dinar",3],["MAD","د.م.","Moroccan Dirham",2]
].map(([code,symbol,label,decimalDigits]) => ({code,symbol,label,decimalDigits:Number(decimalDigits),enabled:true}));
