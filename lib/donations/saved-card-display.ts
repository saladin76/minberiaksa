type StoredCard = {
  id: string; cardNumber: string; cardType: string; expiryDate: string;
  cardholderName: string | null; nickname: string | null; isDefault: boolean; createdAt: Date;
};

/** Deduplicate only a successfully decrypted full identity, never its suffix.
 * No stored card is removed: historical payments keep their original reference. */
export function maskedSavedCards(cards: StoredCard[], decrypt: (value: string) => string) {
  const seen = new Set<string>();
  return cards.flatMap(card => {
    let pan: string;
    try { pan = decrypt(card.cardNumber).replace(/\D/g, ""); } catch { return []; }
    if (!/^\d{13,19}$/.test(pan)) return [];
    const identity = `${pan}:${card.expiryDate.replace(/\s/g, "")}`;
    if (seen.has(identity)) return [];
    seen.add(identity);
    return [{ id: card.id, cardType: card.cardType, expiryDate: card.expiryDate,
      cardholderName: card.cardholderName, nickname: card.nickname,
      isDefault: card.isDefault, createdAt: card.createdAt, last4: pan.slice(-4) }];
  });
}
