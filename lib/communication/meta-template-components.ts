import { VARIABLE_CATALOG } from "@/lib/templates/variables";

const SCALAR_RE = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;

export type HeaderDraft = {
  type?: string;
  text?: string | null;
  exampleHandle?: string | null;
  previewUrl?: string | null;
  fileName?: string | null;
  mimeType?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  address?: string | null;
};

export type ButtonDraft = {
  type?: string;
  text?: string;
  url?: string | null;
  phoneNumber?: string | null;
  example?: string | null;
};

export type AuthDraft = {
  addSecurityRecommendation?: boolean;
  codeExpirationMinutes?: number;
  otpType?: "COPY_CODE" | "ONE_TAP";
  buttonText?: string;
  autofillText?: string | null;
  packageName?: string | null;
  signatureHash?: string | null;
};

export type VariableBinding = {
  key: string;
  scope: string;
  position: number;
  exampleValue: string;
  mapping: string;
  validationStatus: "VALID";
};

const exampleByToken = (() => {
  const map = new Map<string, string>();
  for (const group of VARIABLE_CATALOG) {
    for (const entry of group.entries) {
      map.set(entry.token.replace(/[{}]/g, "").trim(), entry.exampleValue || "example");
    }
  }
  return map;
})();

export function variableOrder(text: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const match of String(text ?? "").matchAll(SCALAR_RE)) {
    const key = match[1];
    if (!seen.has(key)) { seen.add(key); out.push(key); }
  }
  return out;
}

export function sameVariables(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((key, index) => key === right[index]);
}

export function metaParameterName(key: string): string {
  const normalized = key
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
  if (!normalized) throw new Error("INVALID_META_PARAMETER_NAME");
  return /^[a-z]/.test(normalized) ? normalized : `p_${normalized}`;
}

function metaNamedText(text: string): string {
  const used = new Map<string, string>();
  return text.replace(SCALAR_RE, (_full, key: string) => {
    const candidate = metaParameterName(key);
    const previous = used.get(candidate);
    if (previous && previous !== key) throw new Error(`META_PARAMETER_NAME_COLLISION:${previous}:${key}`);
    used.set(candidate, key);
    return `{{${candidate}}}`;
  });
}

function metaPositionalText(text: string): string {
  const variables = variableOrder(text);
  const positions = new Map(variables.map((key, index) => [key, index + 1]));
  return text.replace(SCALAR_RE, (_full, key: string) => `{{${positions.get(key) ?? 1}}}`);
}

function namedExamples(text: string): Array<{ param_name: string; example: string }> {
  return variableOrder(text).map((key) => ({
    param_name: metaParameterName(key),
    example: exampleByToken.get(key) ?? "example",
  }));
}

function bindingsFor(text: string, scope: string): VariableBinding[] {
  return variableOrder(text).map((key, index) => ({
    key,
    scope,
    position: index + 1,
    exampleValue: exampleByToken.get(key) ?? "example",
    mapping: key,
    validationStatus: "VALID",
  }));
}

export function buildStandardMetaComponents(input: {
  body: string;
  header: HeaderDraft;
  headerText: string;
  footerText: string;
  buttons: ButtonDraft[];
}): { components: unknown[]; bindings: VariableBinding[]; parameterFormat: "named" | "positional" } {
  const components: unknown[] = [];
  const bindings: VariableBinding[] = [];
  const headerType = String(input.header.type ?? "NONE").toUpperCase();

  // The supplied Meta docs explicitly document named body parameters. For templates that also
  // parameterize a text header or URL button, keep the whole template positional until those
  // named component shapes are explicitly verified. Meta's parameter_format applies template-wide.
  const hasDynamicHeader = headerType === "TEXT" && variableOrder(input.headerText).length > 0;
  const hasDynamicUrl = input.buttons.some((button) =>
    String(button.type ?? "").toUpperCase() === "URL" && variableOrder(String(button.url ?? "")).length > 0,
  );
  const parameterFormat: "named" | "positional" = hasDynamicHeader || hasDynamicUrl ? "positional" : "named";

  if (headerType === "TEXT" && input.headerText.trim()) {
    const vars = variableOrder(input.headerText);
    const component: Record<string, unknown> = {
      type: "HEADER",
      format: "TEXT",
      text: parameterFormat === "named" ? metaNamedText(input.headerText.trim()) : metaPositionalText(input.headerText.trim()),
    };
    if (vars.length) component.example = { header_text: vars.map((key) => exampleByToken.get(key) ?? "example") };
    components.push(component);
    bindings.push(...bindingsFor(input.headerText, "header"));
  } else if (["IMAGE", "VIDEO", "DOCUMENT"].includes(headerType)) {
    if (!input.header.exampleHandle) throw new Error("MEDIA_SAMPLE_HANDLE_REQUIRED");
    components.push({
      type: "HEADER",
      format: headerType,
      example: { header_handle: [input.header.exampleHandle] },
    });
  } else if (headerType === "LOCATION") {
    components.push({ type: "HEADER", format: "LOCATION" });
  }

  const bodyVars = variableOrder(input.body);
  const body: Record<string, unknown> = {
    type: "BODY",
    text: parameterFormat === "named" ? metaNamedText(input.body) : metaPositionalText(input.body),
  };
  if (bodyVars.length) {
    body.example = parameterFormat === "named"
      ? { body_text_named_params: namedExamples(input.body) }
      : { body_text: [bodyVars.map((key) => exampleByToken.get(key) ?? "example")] };
  }
  components.push(body);
  bindings.push(...bindingsFor(input.body, "body"));

  if (input.footerText.trim()) components.push({ type: "FOOTER", text: input.footerText.trim() });

  if (input.buttons.length) {
    const buttons = input.buttons.map((button, index) => {
      const type = String(button.type ?? "").toUpperCase();
      if (type === "QUICK_REPLY") return { type: "QUICK_REPLY", text: String(button.text ?? "").trim() };
      if (type === "PHONE_NUMBER") {
        return {
          type: "PHONE_NUMBER",
          text: String(button.text ?? "").trim(),
          phone_number: String(button.phoneNumber ?? "").replace(/[^+0-9]/g, ""),
        };
      }
      if (type === "URL") {
        const rawUrl = String(button.url ?? "").trim();
        const vars = variableOrder(rawUrl);
        if (vars.length > 1) throw new Error("URL_BUTTON_SUPPORTS_ONE_VARIABLE");
        bindings.push(...bindingsFor(rawUrl, `button.${index}`));
        return {
          type: "URL",
          text: String(button.text ?? "").trim(),
          url: parameterFormat === "named" ? metaNamedText(rawUrl) : metaPositionalText(rawUrl),
          ...(vars.length ? { example: [button.example?.trim() || exampleByToken.get(vars[0]) || "example"] } : {}),
        };
      }
      throw new Error("UNSUPPORTED_BUTTON_TYPE");
    });
    components.push({ type: "BUTTONS", buttons });
  }

  return { components, bindings, parameterFormat };
}

export function buildAuthenticationMetaComponents(auth: AuthDraft): unknown[] {
  const otpType = auth.otpType ?? "COPY_CODE";
  const button: Record<string, unknown> = {
    type: "OTP",
    otp_type: otpType,
    text: auth.buttonText?.trim() || "Copy Code",
  };
  if (otpType === "ONE_TAP") {
    if (!auth.packageName?.trim() || !auth.signatureHash?.trim()) throw new Error("AUTH_ONE_TAP_APP_DATA_REQUIRED");
    button.autofill_text = auth.autofillText?.trim() || "Autofill";
    button.package_name = auth.packageName.trim();
    button.signature_hash = auth.signatureHash.trim();
  }
  return [
    { type: "BODY", add_security_recommendation: auth.addSecurityRecommendation !== false },
    { type: "FOOTER", code_expiration_minutes: Math.min(Math.max(auth.codeExpirationMinutes ?? 10, 1), 90) },
    { type: "BUTTONS", buttons: [button] },
  ];
}
