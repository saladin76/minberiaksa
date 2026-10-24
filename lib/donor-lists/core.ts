export type DonorListContactInput = {
  name: string;
  email?: string;
  phone?: string;
};

export type NormalizedDonorListContact = {
  name: string;
  email: string | null;
  phone: string | null;
  normalizedEmail: string | null;
  normalizedPhone: string | null;
};

export function normalizeDonorListContact(value: unknown): NormalizedDonorListContact | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (typeof row.name !== "string") return null;
  const name = row.name.trim();
  const email = typeof row.email === "string" ? row.email.trim() : "";
  const phone = typeof row.phone === "string" ? row.phone.trim() : "";
  if (!name || name.length > 120 || email.length > 254 || phone.length > 40) return null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  const digits = phone.replace(/\D/g, "");
  if (phone && (digits.length < 7 || digits.length > 15)) return null;
  if (!email && !phone) return null;
  return {
    name,
    email: email || null,
    phone: phone || null,
    normalizedEmail: email ? email.toLowerCase() : null,
    normalizedPhone: phone ? digits : null,
  };
}

function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const source = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (quoted) {
      if (ch === '"' && source[i + 1] === '"') { cell += '"'; i += 1; }
      else if (ch === '"') quoted = false;
      else cell += ch;
      continue;
    }
    if (ch === '"' && cell.length === 0) quoted = true;
    else if (ch === ",") { row.push(cell.trim()); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && source[i + 1] === "\n") i += 1;
      row.push(cell.trim());
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  row.push(cell.trim());
  if (row.some((value) => value.length > 0)) rows.push(row);
  return rows;
}

function headerKey(value: string): "name" | "email" | "phone" | null {
  const key = value.trim().toLowerCase().replace(/[\s_-]+/g, "");
  if (["name", "fullname", "الاسم", "الاسمكاملا", "اسم"] .includes(key)) return "name";
  if (["email", "emailaddress", "البريد", "البريداﻹلكتروني", "البريدالإلكتروني", "الايميل", "الإيميل"] .includes(key)) return "email";
  if (["phone", "phonenumber", "mobile", "الهاتف", "رقمالهاتف", "الجوال", "رقمالجوال"] .includes(key)) return "phone";
  return null;
}

export function parseDonorListCsv(text: string): { contacts: DonorListContactInput[]; errors: string[] } {
  if (text.length > 2_000_000) return { contacts: [], errors: ["CSV is larger than 2 MB"] };
  const rows = parseCsvRows(text);
  if (rows.length < 2) return { contacts: [], errors: ["CSV needs a header and at least one contact"] };
  const headers = rows[0].map(headerKey);
  const nameIndex = headers.indexOf("name");
  const emailIndex = headers.indexOf("email");
  const phoneIndex = headers.indexOf("phone");
  if (nameIndex < 0 || (emailIndex < 0 && phoneIndex < 0)) {
    return { contacts: [], errors: ["CSV headers must include name and at least one of email or phone"] };
  }
  const contacts: DonorListContactInput[] = [];
  const errors: string[] = [];
  for (const [index, row] of rows.slice(1).entries()) {
    const candidate = normalizeDonorListContact({
      name: row[nameIndex] ?? "",
      email: emailIndex >= 0 ? row[emailIndex] ?? "" : "",
      phone: phoneIndex >= 0 ? row[phoneIndex] ?? "" : "",
    });
    if (!candidate) errors.push(`Row ${index + 2}: invalid name, email, or phone`);
    else contacts.push({ name: candidate.name, email: candidate.email ?? undefined, phone: candidate.phone ?? undefined });
  }
  if (contacts.length > 250) return { contacts: [], errors: ["Import up to 250 contacts at a time"] };
  return { contacts, errors };
}
