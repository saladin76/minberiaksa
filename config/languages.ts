export type LanguageDirection = "rtl" | "ltr";

export type LanguageOption = {
  code: string;
  label: string;
  nativeLabel: string;
  direction: LanguageDirection;
  translated: boolean;
};

export const languages: LanguageOption[] = [
  ["ar","Arabic","العربية","rtl"],["tr","Turkish","Türkçe","ltr"],["en","English","English","ltr"],["fr","French","Français","ltr"],["de","German","Deutsch","ltr"],["es","Spanish","Español","ltr"],["id","Indonesian","Bahasa Indonesia","ltr"],["pt","Portuguese","Português","ltr"],["ur","Urdu","اردو","rtl"],["sq","Albanian","Shqip","ltr"],["it","Italian","Italiano","ltr"],["nl","Dutch","Nederlands","ltr"],["sv","Swedish","Svenska","ltr"]
].map(([code,label,nativeLabel,direction]) => ({code,label,nativeLabel,direction: direction as LanguageDirection,translated: code === "ar"}));
