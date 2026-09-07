import test from "node:test";
import assert from "node:assert/strict";
import { decryptIntegrationSecret, encryptIntegrationSecret, IntegrationEncryptionError, maskIntegrationValue } from "../../lib/integration-settings/crypto";
const KEY = Buffer.alloc(32, 7).toString("base64");

test("AES-256-GCM uses unique IVs and authenticates values", () => {
  const first = encryptIntegrationSecret("secret-value", "META_WHATSAPP:ACCESS_TOKEN", KEY);
  const second = encryptIntegrationSecret("secret-value", "META_WHATSAPP:ACCESS_TOKEN", KEY);
  assert.notEqual(first, second);
  assert.equal(decryptIntegrationSecret(first, "META_WHATSAPP:ACCESS_TOKEN", KEY), "secret-value");
});

test("tampered ciphertext and incorrect field context fail closed", () => {
  const encrypted = encryptIntegrationSecret("secret-value", "META_WHATSAPP:ACCESS_TOKEN", KEY);
  const tampered = `${encrypted.slice(0, -1)}${encrypted.endsWith("A") ? "B" : "A"}`;
  assert.throws(() => decryptIntegrationSecret(tampered, "META_WHATSAPP:ACCESS_TOKEN", KEY), (error) => error instanceof IntegrationEncryptionError && error.code === "DECRYPTION_FAILED");
  assert.throws(() => decryptIntegrationSecret(encrypted, "META_WHATSAPP:APP_SECRET", KEY), (error) => error instanceof IntegrationEncryptionError && error.code === "DECRYPTION_FAILED");
});

test("missing and invalid keys are rejected", () => {
  const originalKey = process.env.INTEGRATION_SETTINGS_ENCRYPTION_KEY;

  try {
    delete process.env.INTEGRATION_SETTINGS_ENCRYPTION_KEY;
    assert.throws(() => encryptIntegrationSecret("secret", "SYSTEM:CRON_SECRET"), (error) => error instanceof IntegrationEncryptionError && error.code === "ENCRYPTION_KEY_MISSING");
  } finally {
    if (originalKey === undefined) {
      delete process.env.INTEGRATION_SETTINGS_ENCRYPTION_KEY;
    } else {
      process.env.INTEGRATION_SETTINGS_ENCRYPTION_KEY = originalKey;
    }
  }

  assert.throws(() => encryptIntegrationSecret("secret", "SYSTEM:CRON_SECRET", "not-a-key"), (error) => error instanceof IntegrationEncryptionError && error.code === "ENCRYPTION_KEY_INVALID");
});

test("masking never returns the original value", () => {
  assert.equal(maskIntegrationValue("abcdefghA92F"), "••••••••A92F");
  assert.equal(maskIntegrationValue("abc"), "••••••••");
  assert.equal(maskIntegrationValue(null), null);
});
