/** Keep the page intent and one complete institutional suffix. */
export function institutionalTitle(title: string, name: string): string {
  if (title.includes(name)) return title;
  const intent = title.replace(/\s*\|\s*(?:مؤسسة منبر الأقصى(?: الدولية)?|Minberiaksa|Minbar Al[- ]Aqsa|Minber-i Aks[aâ]|Minberi Aks[aâ])\s*$/iu, "").trim();
  return intent ? `${intent} | ${name}` : name;
}
