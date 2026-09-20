import "server-only";

import { prisma } from "@/lib/prisma";
import { messagesFor } from "@/i18n/locale-messages";
import {
  resolveReceiptCopy,
  resolveReceiptOrg,
  resolveThanksCopy,
  resolveWaqfCopy,
  sanitizeCopyOverrides,
  type CertificateCopyOverrides,
  type ReceiptCopy,
  type ReceiptOrgData,
  type ThanksCopy,
  type WaqfCopy,
} from "./copy-defaults";

/**
 * The wording each document renders in a locale: the i18n text with the
 * dashboard's overrides (`GlobalSettings.certificateCopy`) laid over it.
 *
 * Read once per render. The settings row is tiny and the documents are
 * rendered a handful of times per donation, so there is nothing to cache.
 */

export async function loadCopyOverrides(): Promise<CertificateCopyOverrides> {
  try {
    const row = await prisma.globalSettings.findFirst({ orderBy: { createdAt: "asc" }, select: { certificateCopy: true } });
    return sanitizeCopyOverrides(row?.certificateCopy ?? null);
  } catch (error) {
    console.error("[certificates] copy overrides unavailable, using i18n defaults:", error);
    return {};
  }
}

function certificatesNamespace(locale: string): Record<string, unknown> {
  const ns = messagesFor(locale).certificates;
  return ns && typeof ns === "object" ? (ns as Record<string, unknown>) : {};
}

export async function getThanksCopy(locale: string, overrides?: CertificateCopyOverrides): Promise<ThanksCopy> {
  const o = overrides ?? (await loadCopyOverrides());
  return resolveThanksCopy(certificatesNamespace(locale), o.thanks?.[locale]);
}

export async function getWaqfCopy(locale: string, overrides?: CertificateCopyOverrides): Promise<WaqfCopy> {
  const o = overrides ?? (await loadCopyOverrides());
  return resolveWaqfCopy(certificatesNamespace(locale), o.waqf?.[locale]);
}

export async function getReceiptCopy(
  locale: string,
  overrides?: CertificateCopyOverrides
): Promise<{ copy: ReceiptCopy; org: ReceiptOrgData }> {
  const o = overrides ?? (await loadCopyOverrides());
  return {
    copy: resolveReceiptCopy(certificatesNamespace(locale), o.receipt?.[locale]),
    org: resolveReceiptOrg(o.receiptOrg),
  };
}
