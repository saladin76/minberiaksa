/** Match every search term against a command's label, section, or keywords. */
export function dashboardCommandFilter(value: string, search: string): number {
  const normalizedValue = value.toLowerCase();
  const terms = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return terms.every((term) => normalizedValue.includes(term)) ? 1 : 0;
}
