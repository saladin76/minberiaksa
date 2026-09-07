import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH_BYTES = 12;
const AUTH_TAG_LENGTH_BYTES = 16;
const ENVELOPE_VERSION = "v1";
const KEY_ENV_NAME = "INTEGRATION_SETTINGS_ENCRYPTION_KEY";

export type IntegrationEncryptionErrorCode =
  | "ENCRYPTION_KEY_MISSING"
  | "ENCRYPTION_KEY_INVALID"
  | "ENCRYPTED_VALUE_INVALID"
  | "DECRYPTION_FAILED";

export class IntegrationEncryptionError extends Error {
  readonly code: IntegrationEncryptionErrorCode;

  constructor(code: IntegrationEncryptionErrorCode, message: string) {
    super(message);
    this.name = "IntegrationEncryptionError";
    this.code = code;
  }
}

function decodeEncryptionKey(raw: string | undefined): Buffer {
  const value = raw?.trim();
  if (!value) {
    throw new IntegrationEncryptionError(
      "ENCRYPTION_KEY_MISSING",
      `${KEY_ENV_NAME} is required for secret integration settings`
    );
  }

  const candidates: Buffer[] = [];
  if (/^[a-fA-F0-9]{64}$/.test(value)) {
    candidates.push(Buffer.from(value, "hex"));
  }

  try {
    candidates.push(Buffer.from(value, "base64url"));
  } catch {
    // The generic invalid-key error below is intentionally value-free.
  }

  try {
    candidates.push(Buffer.from(value, "base64"));
  } catch {
    // The generic invalid-key error below is intentionally value-free.
  }

  const key = candidates.find((candidate) => candidate.length === 32);
  if (!key) {
    throw new IntegrationEncryptionError(
      "ENCRYPTION_KEY_INVALID",
      `${KEY_ENV_NAME} must decode to exactly 32 bytes`
    );
  }

  return key;
}

function encodePart(value: Buffer): string {
  return value.toString("base64url");
}

function decodePart(value: string): Buffer {
  try {
    return Buffer.from(value, "base64url");
  } catch {
    throw new IntegrationEncryptionError(
      "ENCRYPTED_VALUE_INVALID",
      "Encrypted integration setting has an invalid envelope"
    );
  }
}

function associatedData(context: string): Buffer {
  return Buffer.from(
    `gozbebekleri:integration-setting:${ENVELOPE_VERSION}:${context}`,
    "utf8"
  );
}

export function encryptIntegrationSecret(
  plaintext: string,
  context: string,
  rawKey: string | undefined = process.env[KEY_ENV_NAME]
): string {
  const key = decodeEncryptionKey(rawKey);
  const iv = randomBytes(IV_LENGTH_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH_BYTES,
  });
  cipher.setAAD(associatedData(context));

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    ENVELOPE_VERSION,
    encodePart(iv),
    encodePart(authTag),
    encodePart(encrypted),
  ].join(".");
}

export function decryptIntegrationSecret(
  envelope: string,
  context: string,
  rawKey: string | undefined = process.env[KEY_ENV_NAME]
): string {
  const key = decodeEncryptionKey(rawKey);
  const [version, ivPart, authTagPart, encryptedPart, extra] = envelope.split(".");

  if (
    version !== ENVELOPE_VERSION ||
    !ivPart ||
    !authTagPart ||
    !encryptedPart ||
    extra
  ) {
    throw new IntegrationEncryptionError(
      "ENCRYPTED_VALUE_INVALID",
      "Encrypted integration setting has an unsupported envelope"
    );
  }

  const iv = decodePart(ivPart);
  const authTag = decodePart(authTagPart);
  const encrypted = decodePart(encryptedPart);

  if (iv.length !== IV_LENGTH_BYTES || authTag.length !== AUTH_TAG_LENGTH_BYTES) {
    throw new IntegrationEncryptionError(
      "ENCRYPTED_VALUE_INVALID",
      "Encrypted integration setting has invalid cryptographic parameters"
    );
  }

  try {
    const decipher = createDecipheriv(ALGORITHM, key, iv, {
      authTagLength: AUTH_TAG_LENGTH_BYTES,
    });
    decipher.setAAD(associatedData(context));
    decipher.setAuthTag(authTag);

    return Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new IntegrationEncryptionError(
      "DECRYPTION_FAILED",
      "Unable to decrypt integration setting"
    );
  }
}

export function integrationEncryptionKeyIsConfigured(
  rawKey: string | undefined = process.env[KEY_ENV_NAME]
): boolean {
  try {
    decodeEncryptionKey(rawKey);
    return true;
  } catch {
    return false;
  }
}

export function maskIntegrationValue(value: string | null | undefined): string | null {
  if (!value) return null;
  const suffix = value.length >= 4 ? value.slice(-4) : "";
  return suffix ? `••••••••${suffix}` : "••••••••";
}

export function integrationSecretContext(provider: string, key: string): string {
  return `${provider}:${key}`;
}
