/** Invalid legacy records remain visible for repair, but are never selected by default. */
export function bankOptionName(bank: { nameAr?: string | null; nameTr?: string | null; nameEn?: string | null }): string | null {
  const names = [bank.nameAr, bank.nameTr, bank.nameEn];
  return names.find(name => name?.trim() && name.trim() !== "بنك بدون اسم")?.trim() ?? null;
}
