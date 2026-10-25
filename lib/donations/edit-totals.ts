/** Donation principal and team support are separate ledger amounts, in the
 * donation's currency. Editing support never allocates it to a project. */
export function donationEditTotals(amount: number, teamSupport: number, fees: number, coverFees: boolean) {
  if (![amount, teamSupport, fees].every((value) => Number.isFinite(value) && value >= 0 && value <= 1_000_000_000)) {
    throw new Error("Invalid donation amount");
  }
  const totalAmount = Math.round((amount + teamSupport + (coverFees ? fees : 0)) * 100) / 100;
  return { amount, teamSupport, totalAmount };
}
