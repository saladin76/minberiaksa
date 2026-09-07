import type { IntegrationFieldDefinition, IntegrationProvider } from "./catalog";
import { getFieldDefinition } from "./catalog";
import { IntegrationSettingsError } from "./types";

function invalid(field: IntegrationFieldDefinition): never {
  throw new IntegrationSettingsError("INVALID_FIELD_VALUE", `القيمة المدخلة في حقل ${field.labelAr} غير صالحة.`);
}

function hasOuterWhitespace(value: string): boolean {
  return value !== value.trim();
}

export function validateIntegrationSettingValue(provider: IntegrationProvider, key: string, rawValue: string): string {
  const field = getFieldDefinition(provider, key);
  if (!field) throw new IntegrationSettingsError("UNKNOWN_FIELD", "حقل الإعداد غير معروف.");

  const value = field.secret ? rawValue : rawValue.trim();
  if (!value) invalid(field);
  if (value.length > 10_000) invalid(field);

  switch (field.validation) {
    case "ACCESS_TOKEN":
      if (value.length < 20 || hasOuterWhitespace(value)) invalid(field);
      break;
    case "APP_SECRET":
      if (value.length < 16 || hasOuterWhitespace(value)) invalid(field);
      break;
    case "VERIFY_TOKEN":
      if (value.length < 8 || hasOuterWhitespace(value) || /\s/.test(value)) invalid(field);
      break;
    case "NUMERIC_ID":
      if (!/^\d{5,40}$/.test(value)) invalid(field);
      break;
    case "GRAPH_VERSION":
      if (!/^v\d{1,3}\.\d{1,2}$/.test(value)) invalid(field);
      break;
    case "API_KEY":
      if (value.length < 20 || hasOuterWhitespace(value)) invalid(field);
      break;
    case "SENDER_NAME":
      if (value.length > 100) invalid(field);
      break;
    case "EMAIL":
      if (value.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) invalid(field);
      break;
    case "SMS_SENDER":
      if (value.length < 2 || value.length > 20 || !/^[\p{L}\p{N} ._+-]+$/u.test(value)) invalid(field);
      break;
    case "WEBHOOK_SECRET":
      if (value.length < 16 || hasOuterWhitespace(value)) invalid(field);
      break;
    case "USERCODE":
      if (value.length > 100 || hasOuterWhitespace(value)) invalid(field);
      break;
    case "PASSWORD":
      if (value.length < 4 || value.length > 256 || hasOuterWhitespace(value)) invalid(field);
      break;
    case "HEADER":
      if (value.length > 30) invalid(field);
      break;
    case "CRON_SECRET":
      if (value.length < 24 || hasOuterWhitespace(value) || /^(.)\1+$/.test(value)) invalid(field);
      break;
  }

  return value;
}
