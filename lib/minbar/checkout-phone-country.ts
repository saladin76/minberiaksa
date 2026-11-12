/**
 * Choose the phone field's initial flag using a verified two-letter country.
 *
 * New donors (and signed-in donors without a phone) should see the calling
 * code for the country of their current visit, not the page's language or an
 * old profile country. Existing E.164 phones keep account-country priority
 * so travelling donors don't accidentally change their saved prefix.
 *
 * This is only a UI default; it never changes a saved donor phone or the
 * server's payment-routing decision.
 */
export function checkoutDefaultPhoneCountry({
  ipCountry,
  accountCountry,
  existingPhone,
}: {
  ipCountry?: string | null;
  accountCountry?: string | null;
  existingPhone?: string | null;
}): string {
  const normalize = (value: string | null | undefined): string | null => {
    const code = typeof value === "string" ? value.trim().toUpperCase() : "";
    return /^[A-Z]{2}$/.test(code) && !["XX", "EU", "AP"].includes(code)
      ? code.toLowerCase()
      : null;
  };

  const ip = normalize(ipCountry);
  const account = normalize(accountCountry);
  return existingPhone?.trim() ? account ?? ip ?? "tr" : ip ?? account ?? "tr";
}
