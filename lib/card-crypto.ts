import crypto from "crypto";
const LEGACY_ALGO = "aes-256-cbc";
const AAD = Buffer.from("minber:saved-card:v2");
function getKey(): Buffer {
 const configured=process.env.CARD_ENCRYPTION_KEY||process.env.NEXTAUTH_SECRET;
 if(!configured&&process.env.NODE_ENV==="production")throw new Error("CARD_ENCRYPTION_NOT_CONFIGURED");
 return crypto.createHash("sha256").update(configured||"fallback-dev-key-32-chars-padded!").digest();
}
export function encryptCard(plain:string):string {
 const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv("aes-256-gcm",getKey(),iv);cipher.setAAD(AAD);
 const data=Buffer.concat([cipher.update(plain,"utf8"),cipher.final()]);
 return ["v2",iv.toString("hex"),cipher.getAuthTag().toString("hex"),data.toString("hex")].join(":");
}
export function decryptCard(stored:string):string {
 if(stored.startsWith("v2:")){
  const [version,iv,tag,data,extra]=stored.split(":");
  if(version!=="v2"||extra!==undefined||!/^[a-f0-9]{24}$/.test(iv)||!/^[a-f0-9]{32}$/.test(tag)||!/^(?:[a-f0-9]{2})+$/.test(data))throw new Error("INVALID_ENCRYPTED_CARD");
  const decipher=crypto.createDecipheriv("aes-256-gcm",getKey(),Buffer.from(iv,"hex"));decipher.setAAD(AAD);decipher.setAuthTag(Buffer.from(tag,"hex"));
  return Buffer.concat([decipher.update(Buffer.from(data,"hex")),decipher.final()]).toString("utf8");
 }
 const [ivHex,dataHex]=stored.split(":"),decipher=crypto.createDecipheriv(LEGACY_ALGO,getKey(),Buffer.from(ivHex,"hex"));
 return Buffer.concat([decipher.update(Buffer.from(dataHex,"hex")),decipher.final()]).toString("utf8");
}

/** Detect card brand from first digit / BIN */
export function detectCardType(cardNumber: string): string {
  const n = cardNumber.replace(/\s/g, "");
  if (/^4/.test(n)) return "visa";
  if (/^5[1-5]/.test(n) || /^2[2-7]/.test(n)) return "mastercard";
  if (/^3[47]/.test(n)) return "amex";
  if (/^9792/.test(n) || /^65/.test(n)) return "troy";
  if (/^6/.test(n)) return "discover";
  return "unknown";
}

/** Returns last 4 digits from a decrypted card number */
export function maskCardNumber(cardNumber: string): string {
  const n = cardNumber.replace(/\s/g, "");
  return "**** **** **** " + n.slice(-4);
}
