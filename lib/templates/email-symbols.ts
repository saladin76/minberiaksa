export const EMAIL_SYMBOL_FONT = 'Arial,"Segoe UI Symbol","Apple Symbols","Noto Sans Symbols 2",sans-serif';

/** A one-character status badge is a graphic, not body copy. Mark only these
 * leaves so typography normalization can retain its size and vertical rhythm. */
export function markEmailSymbols(html: string): string {
  return html.replace(/<(div|span|td|p)\b([^>]*)>(\s*(?:[✓✔✕✖×!ℹ⚠♥❤★☆→←↗↘+−?]\uFE0F?|&#(?:x[\da-f]+|\d+);)\s*)<\/\1>/gi, (tag, name: string, attrs: string, content: string) => {
    const decoded = content.trim().replace(/&#(x[\da-f]+|\d+);/gi, (_, code: string) => { const value = code[0].toLowerCase() === "x" ? parseInt(code.slice(1), 16) : Number(code); return value <= 0x10ffff ? String.fromCodePoint(value) : ""; });
    if (!/^[✓✔✕✖×!ℹ⚠♥❤★☆→←↗↘+−?]\uFE0F?$/.test(decoded)) return tag;
    if (/data-email-symbol\s*=/i.test(attrs)) return tag;
    // Do not mistake short table values (or an exclamation in prose) for badges.
    if (!/font-size\s*:|border-radius\s*:|line-height\s*:/i.test(attrs)) return tag;
    return `<${name} data-email-symbol="true"${attrs}>${content}</${name}>`;
  });
}
