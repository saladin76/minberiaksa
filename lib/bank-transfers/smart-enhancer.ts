import type { ParsedBankTransferRow } from "./statement-parser";

function compactText(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function cleanName(value: string | null) {
  if (!value) return null;
  const cleaned = value
    .replace(/\b(TÜRKİYE|TURKIYE|BANKASI|BANK|KUVEYT|ALBARAKA|ZİRAAT|ZIRAAT|GARANTİ|GARANTI|YAPI|AKBANK|QNB|ENPARA|FİNANS|FINANS)\b.*$/i, "")
    .replace(/\b(FAST|EFT|HAVALE|PARA TRANSFERI|PARA TRANSFERİ)\b.*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length >= 3 ? cleaned : null;
}

function donorFromDescription(description: string) {
  const patterns = [
    /gönderen\s*[:：]\s*([^,;|]+)/i,
    /gonderen\s*[:：]\s*([^,;|]+)/i,
    /gönderen adı\s*[:：]\s*([^,;|]+)/i,
    /gonderen adi\s*[:：]\s*([^,;|]+)/i,
    /SN[:\s]*\d+\s+([A-ZÇĞİÖŞÜ][A-ZÇĞİÖŞÜ\s.'-]{3,90})\s+(?:Açıklama|GönBanka|GonBanka|FastRef|EftRef|$)/i,
    /ATM\s+KARTSIZ\s+PARA\s+YATIRMA.*?-\s*([A-ZÇĞİÖŞÜ\s.'-]{4,80})$/i,
  ];
  for (const pattern of patterns) {
    const match = description.match(pattern);
    const name = cleanName(match?.[1]?.trim() ?? null);
    if (name) return name;
  }
  return null;
}

function smartProject(description: string) {
  const d = compactText(description);
  if (/zekat|zakat|زكاة|زكاه/.test(d)) return "زكاة";
  if (/gazze|gaza|filistin|palestine|kudüs|kudus|aksa|غزة|فلسطين|الاقصى|الأقصى/.test(d)) return "فلسطين / غزة";
  if (/afrika|africa|افريقيا|أفريقيا/.test(d)) return "إفريقيا";
  if (/kurban|qurban|vekalet|vekâlet|قربان|اضحية|أضحية/.test(d)) return "الأضاحي / القربان";
  if (/yetim|orphan|ايتام|أيتام|يتيم/.test(d)) return "كفالة الأيتام";
  if (/yemek|sıcak yemek|sicak yemek|ekmek|fırın|firin|وجبة|وجبات|اطعام|إطعام/.test(d)) return "إطعام / وجبات";
  if (/ameliyat|medical|surgery|علاج|طبي|عملية|عمليه/.test(d)) return "المشاريع الطبية";
  if (/bağış|bagis|bağis|sadaka|sadaqa|infak|تبرع|صدقة|صدقه/.test(d)) return "تبرع عام";
  return null;
}

function smartDirection(row: ParsedBankTransferRow) {
  const d = compactText(`${row.description} ${row.raw.join(" ")}`);
  if (/giden fast|giden eft|hesaba virman|çekilen|cekilen|gönderilen|gonderilen|masraf|komisyon|ücret|ucret/.test(d)) return "DEBIT" as const;
  if (/hesabınıza|hesabiniza|gelen fast|gelen eft|ibana gelen|para yatirma|para yatırma|alacak|gelen havale/.test(d)) return "CREDIT" as const;
  return row.direction;
}

export function enhanceBankTransferRowsSmart(rows: ParsedBankTransferRow[]) {
  return rows.map((row) => {
    const description = `${row.description} ${row.raw.join(" ")}`;
    const donorName = row.donorName || donorFromDescription(description);
    const project = smartProject(description) || row.suggestedProject;
    const direction = smartDirection(row);
    const confidence = donorName || project !== "تبرع عام" || direction !== "UNKNOWN" ? "HIGH" : row.confidence;
    return {
      ...row,
      donorName,
      suggestedProject: project,
      direction,
      confidence,
    } satisfies ParsedBankTransferRow;
  });
}
