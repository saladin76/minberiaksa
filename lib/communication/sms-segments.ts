/**
 * SMS segmentation — the unit SMS is actually billed in.
 *
 * An SMS is not charged per message but per 140-byte segment, and how many characters fit in a
 * segment depends entirely on the alphabet. Text that stays inside the GSM 03.38 alphabet packs
 * 7 bits per character (160 per segment); a single character outside it forces the whole message
 * into UCS-2 at 16 bits (70 per segment).
 *
 * That matters more here than it would elsewhere: **Arabic is not in the GSM alphabet**, so every
 * Arabic SMS this platform sends is UCS-2 and fits 70 characters, not 160. A message an operator
 * reads as "short" can quietly cost three segments. Counting them is the only way the SMS page can
 * report real volume instead of a message count that under-states the bill by 2–3×.
 *
 * Concatenated messages lose room to the segmentation header (UDH): 153 per segment in GSM-7,
 * 67 in UCS-2. This is the same arithmetic Netgsm and Brevo bill against.
 */

/** GSM 03.38 basic set. Characters here cost one unit. */
const GSM7_BASIC = new Set(
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà",
);

/** Escape-prefixed extensions. Each costs two units, not one. */
const GSM7_EXTENDED = new Set("^{}\\[~]|€");

export type SmsEncoding = "GSM7" | "UCS2";

export type SmsSegmentation = {
  encoding: SmsEncoding;
  /** Billable units: GSM-7 septets (extensions count 2) or UTF-16 code units for UCS-2. */
  units: number;
  segments: number;
  /** Characters still free in the current segment — what "one more word" actually costs. */
  remaining: number;
};

const LIMITS = {
  GSM7: { single: 160, concat: 153 },
  UCS2: { single: 70, concat: 67 },
} as const;

export function detectSmsEncoding(text: string): SmsEncoding {
  for (const char of text) {
    if (!GSM7_BASIC.has(char) && !GSM7_EXTENDED.has(char)) return "UCS2";
  }
  return "GSM7";
}

export function segmentSms(text: string | null | undefined): SmsSegmentation {
  const body = text ?? "";
  if (!body) return { encoding: "GSM7", units: 0, segments: 0, remaining: LIMITS.GSM7.single };

  const encoding = detectSmsEncoding(body);
  // UCS-2 is billed in UTF-16 code units, so an emoji (a surrogate pair) genuinely costs two.
  // `body.length` is exactly that count; iterating code points would under-count it.
  const units =
    encoding === "GSM7"
      ? [...body].reduce((sum, char) => sum + (GSM7_EXTENDED.has(char) ? 2 : 1), 0)
      : body.length;

  const limit = LIMITS[encoding];
  const segments = units <= limit.single ? 1 : Math.ceil(units / limit.concat);
  const capacity = segments === 1 ? limit.single : segments * limit.concat;

  return { encoding, units, segments, remaining: Math.max(0, capacity - units) };
}

/** Aggregate segmentation across a set of message bodies — the page's cost picture. */
export function summarizeSmsSegments(bodies: Array<string | null | undefined>): {
  messages: number;
  segments: number;
  ucs2Messages: number;
  gsm7Messages: number;
  avgSegments: number;
} {
  let segments = 0;
  let ucs2Messages = 0;
  let counted = 0;

  for (const body of bodies) {
    if (!body) continue;
    const seg = segmentSms(body);
    segments += seg.segments;
    if (seg.encoding === "UCS2") ucs2Messages++;
    counted++;
  }

  return {
    messages: counted,
    segments,
    ucs2Messages,
    gsm7Messages: counted - ucs2Messages,
    avgSegments: counted > 0 ? Math.round((segments / counted) * 10) / 10 : 0,
  };
}
