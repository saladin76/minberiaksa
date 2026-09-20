import "server-only";

import { prisma } from "@/lib/prisma";

/**
 * The counters behind every serial the site prints.
 *
 * `DONATION_LOGIC_SPEC §2`: a serial is minted by the server, once, after
 * payment is confirmed. The counter is a single MongoDB document per sequence
 * advanced with an atomic `$inc`, so two confirmations landing in the same
 * millisecond get two different numbers — never the same one twice.
 *
 * The waqf counters start where the foundation's printed books left off
 * (`شهادة الاوقاف.dc.html`: "الأمتار من 9876، الأسهم من 76543"), so the first
 * certificate the site issues continues the paper series rather than
 * restarting it. The thank-you and receipt counters run per calendar year.
 */

export type SequenceKey = "waqf-share" | "waqf-meter" | `thanks-${number}` | `receipt-${number}`;

/** The first number each sequence hands out. */
const FIRST_NUMBER: Record<string, number> = {
  "waqf-share": 76543,
  "waqf-meter": 9876,
};

function firstNumber(key: string): number {
  return FIRST_NUMBER[key] ?? 1;
}

/**
 * Claim the next number in a sequence.
 *
 * The row is created on first use holding the series' first number; every
 * later call increments it in place. A concurrent first use is caught by the
 * primary key and retried as a plain increment, so no number is skipped or
 * handed out twice.
 */
export async function nextSequenceNumber(key: SequenceKey): Promise<number> {
  const existing = await prisma.documentSequence.findUnique({ where: { id: key } });
  if (!existing) {
    try {
      const created = await prisma.documentSequence.create({ data: { id: key, value: firstNumber(key) } });
      return created.value;
    } catch {
      /* Someone else created it between the read and the write — fall through
         to the atomic increment, which is the ordinary path from here on. */
    }
  }
  const updated = await prisma.documentSequence.update({
    where: { id: key },
    data: { value: { increment: 1 } },
  });
  return updated.value;
}

/** Zero-padded, e.g. `000123`. */
export function padSerial(n: number, width = 6): string {
  return String(n).padStart(width, "0");
}
