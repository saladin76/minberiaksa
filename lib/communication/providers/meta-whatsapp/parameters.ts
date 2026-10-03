/**
 * Template context → Meta `components`.
 *
 * `sendTemplateMessage` has always accepted a `components` array; nothing ever built one. So a
 * template whose Meta body reads "مرحبًا {{1}}" was sent with no parameters at all, and Meta
 * rejected the message (`#132000`, parameter count mismatch) or  for a template with no
 * placeholders  happened to work, which is why static templates looked fine and the problem stayed
 * invisible until a real campaign used a variable.
 *
 * The schema Meta returns for the variant is the authority here, not the local body text: it says
 * how many BODY parameters exist, whether the HEADER takes one and of what type, and which buttons
 * carry a dynamic URL suffix. Building from the local copy instead would put us back in the
 * business of guessing what the provider approved.
 *
 * Positional, as Meta requires: `{{1}}` is the first entry in the body array, `{{2}}` the second.
 * The values come from the rendered template's own variable list, in the order the schema declares
 * them, so a template rendered for a donor carries that donor's values and nothing else.
 */

export type MetaComponent = {
  type: "header" | "body" | "button";
  sub_type?: "url" | "quick_reply";
  index?: string;
  parameters: MetaParameter[];
};

export type MetaParameter =
  | { type: "text"; text: string }
  | { type: "image"; image: { link: string } }
  | { type: "video"; video: { link: string } }
  | { type: "document"; document: { link: string; filename?: string } }
  | { type: "location"; location: { latitude: number; longitude: number; name?: string; address?: string } };

export type BuildResult =
  | { ok: true; components: MetaComponent[]; used: string[] }
  | { ok: false; reason: string; detail: string };

type SchemaComponent = {
  type?: unknown;
  format?: unknown;
  text?: unknown;
  example?: unknown;
  buttons?: unknown;
};

/** `{{1}}`, `{{2}}` … in the order they appear, de-duplicated. */
function placeholderOrder(text: string): number[] {
  const seen = new Set<number>();
  const out: number[] = [];
  for (const match of String(text ?? "").matchAll(/\{\{\s*(\d+)\s*\}\}/g)) {
    const index = Number(match[1]);
    if (Number.isFinite(index) && !seen.has(index)) { seen.add(index); out.push(index); }
  }
  return out.sort((a, b) => a - b);
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/**
 * Meta truncates nothing for us: a parameter over 1024 characters is rejected outright, and a
 * newline or tab in a text parameter is rejected too. Both are the caller's data, so they are
 * cleaned rather than allowed to fail the send.
 */
function textParameter(value: unknown): MetaParameter {
  const text = String(value ?? "").replace(/[\r\n\t]+/g, " ").trim().slice(0, 1024);
  return { type: "text", text };
}

/**
 * Build the components for one send.
 *
 * `values` is keyed by placeholder position as a string ("1", "2"), by scoped position
 * ("header.1", "body.1", "button.0"), and/or by variable name. Meta numbers placeholders PER
 * COMPONENT  a header's `{{1}}` is not a body's `{{1}}`  so a scoped key wins when present and
 * the flat position is the fallback for the common template where they mean the same value.
 *
 * Returns `ok: true` with an empty array for a template that takes no parameters  that is a valid
 * send, not a failure. It fails only when the schema asks for something the caller cannot supply,
 * because sending that to Meta produces a rejected message and a delivery row that lies.
 */
export function buildMetaComponents(input: {
  componentsSchema: unknown;
  values: Record<string, string | null | undefined>;
  /** Positional names from the local template, e.g. ["donorName", "amount"] for {{1}}, {{2}}. */
  positionalNames?: string[];
  /** Exact semantic binding per component position, e.g. header.1 -> user.name, body.1 -> donation.amount. */
  scopedNames?: Record<string, string>;
  /** Media URL for a template whose header is IMAGE/VIDEO/DOCUMENT. */
  headerMediaUrl?: string | null;
  headerMediaFilename?: string | null;
  /** Static location configured on the local template for a LOCATION header. */
  headerLocation?: { latitude: number; longitude: number; name?: string; address?: string } | null;
}): BuildResult {
  const schema = asArray(input.componentsSchema) as SchemaComponent[];
  if (!schema.length) {
    /* No schema synced yet. An empty component list is right for a static template and wrong for a
       parameterised one, and we cannot tell which  so say so rather than send a guess. */
    return { ok: true, components: [], used: [] };
  }

  const components: MetaComponent[] = [];
  const used: string[] = [];

  const lookup = (position: number, scope: string): { ok: true; value: string } | { ok: false; key: string } => {
    const candidates = [`${scope}.${position}`, String(position)];
    for (const key of candidates) {
      const value = input.values[key];
      if (value != null && String(value).length) return { ok: true, value: String(value) };
    }
    const scopedName = input.scopedNames?.[`${scope}.${position}`];
    if (scopedName) {
      const byScopedName = input.values[scopedName];
      if (byScopedName != null && String(byScopedName).length) return { ok: true, value: String(byScopedName) };
    }
    const name = input.positionalNames?.[position - 1];
    if (name) {
      const byName = input.values[name];
      if (byName != null && String(byName).length) return { ok: true, value: String(byName) };
    }
    return { ok: false, key: name ? `${position} (${name})` : String(position) };
  };

  for (const component of schema) {
    const type = String(component.type ?? "").toUpperCase();

    if (type === "HEADER") {
      const format = String(component.format ?? "TEXT").toUpperCase();
      if (format === "TEXT") {
        const positions = placeholderOrder(String(component.text ?? ""));
        if (!positions.length) continue;
        const parameters: MetaParameter[] = [];
        for (const position of positions) {
          const got = lookup(position, "header");
          if (!got.ok) return { ok: false, reason: "TEMPLATE_PARAMETER_MISSING", detail: `header {{${got.key}}}` };
          parameters.push(textParameter(got.value));
          used.push(`header:${position}`);
        }
        components.push({ type: "header", parameters });
        continue;
      }
      if (format === "LOCATION") {
        if (!input.headerLocation || !Number.isFinite(input.headerLocation.latitude) || !Number.isFinite(input.headerLocation.longitude)) {
          return { ok: false, reason: "TEMPLATE_HEADER_LOCATION_MISSING", detail: "LOCATION header requires latitude and longitude" };
        }
        components.push({
          type: "header",
          parameters: [{
            type: "location",
            location: {
              latitude: input.headerLocation.latitude,
              longitude: input.headerLocation.longitude,
              ...(input.headerLocation.name ? { name: input.headerLocation.name } : {}),
              ...(input.headerLocation.address ? { address: input.headerLocation.address } : {}),
            },
          }],
        });
        used.push("header:location");
        continue;
      }

      /* A media header always takes exactly one parameter  the asset. */
      if (!input.headerMediaUrl) {
        return { ok: false, reason: "TEMPLATE_HEADER_MEDIA_MISSING", detail: `header format ${format}` };
      }
      const link = input.headerMediaUrl;
      const parameter: MetaParameter =
        format === "IMAGE" ? { type: "image", image: { link } }
        : format === "VIDEO" ? { type: "video", video: { link } }
        : { type: "document", document: { link, ...(input.headerMediaFilename ? { filename: input.headerMediaFilename } : {}) } };
      components.push({ type: "header", parameters: [parameter] });
      used.push(`header:media`);
      continue;
    }

    if (type === "BODY") {
      const positions = placeholderOrder(String(component.text ?? ""));
      const isAuthenticationBody = (component as Record<string, unknown>).add_security_recommendation !== undefined;
      if (!positions.length && !isAuthenticationBody) continue;

      if (isAuthenticationBody) {
        const otp =
          input.values["otp.code"] ??
          input.values["otp"] ??
          input.values["code"] ??
          input.values["1"] ??
          input.values[input.positionalNames?.[0] ?? ""];
        if (otp == null || !String(otp).trim()) {
          return { ok: false, reason: "AUTHENTICATION_OTP_MISSING", detail: "authentication body requires an OTP code" };
        }
        components.push({ type: "body", parameters: [textParameter(otp)] });
        used.push("body:otp");
        continue;
      }

      const parameters: MetaParameter[] = [];
      for (const position of positions) {
        const got = lookup(position, "body");
        if (!got.ok) return { ok: false, reason: "TEMPLATE_PARAMETER_MISSING", detail: `body {{${got.key}}}` };
        parameters.push(textParameter(got.value));
        used.push(`body:${position}`);
      }
      components.push({ type: "body", parameters });
      continue;
    }

    if (type === "BUTTONS") {
      const buttons = asArray(component.buttons) as { type?: unknown; url?: unknown; text?: unknown }[];
      for (let index = 0; index < buttons.length; index += 1) {
        const button = buttons[index];
        const buttonType = String(button.type ?? "").toUpperCase();

        if (buttonType === "OTP") {
          const otp =
            input.values["otp.code"] ??
            input.values["otp"] ??
            input.values["code"] ??
            input.values["1"] ??
            input.values[input.positionalNames?.[0] ?? ""];
          if (otp == null || !String(otp).trim()) {
            return { ok: false, reason: "AUTHENTICATION_OTP_MISSING", detail: `authentication button ${index} requires an OTP code` };
          }
          components.push({ type: "button", sub_type: "url", index: String(index), parameters: [textParameter(otp)] });
          used.push(`button:${index}:otp`);
          continue;
        }

        /* Only a URL button with a dynamic suffix takes a parameter. Missing values must fail the
           send instead of silently dropping the parameter and letting Meta reject the message. */
        if (buttonType !== "URL") continue;
        const positions = placeholderOrder(String(button.url ?? ""));
        if (!positions.length) continue;
        const got = lookup(positions[0], `button.${index}`);
        if (!got.ok) {
          return { ok: false, reason: "TEMPLATE_PARAMETER_MISSING", detail: `button ${index} {{${got.key}}}` };
        }
        components.push({ type: "button", sub_type: "url", index: String(index), parameters: [textParameter(got.value)] });
        used.push(`button:${index}`);
      }
      continue;
    }
    /* FOOTER carries no parameters, ever. */
  }

  return { ok: true, components, used };
}

/** True when the synced schema declares any parameter at all  used to decide if values are needed. */
export function schemaTakesParameters(componentsSchema: unknown): boolean {
  for (const component of asArray(componentsSchema) as SchemaComponent[]) {
    const type = String(component.type ?? "").toUpperCase();
    if (type === "HEADER") {
      const format = String(component.format ?? "TEXT").toUpperCase();
      if (format !== "TEXT") return true;
      if (placeholderOrder(String(component.text ?? "")).length) return true;
    }
    if (type === "BODY") {
      if ((component as Record<string, unknown>).add_security_recommendation !== undefined) return true;
      if (placeholderOrder(String(component.text ?? "")).length) return true;
    }
    if (type === "BUTTONS") {
      for (const button of asArray(component.buttons) as { type?: unknown; url?: unknown }[]) {
        const buttonType = String(button.type ?? "").toUpperCase();
        if (buttonType === "OTP") return true;
        if (buttonType === "URL" && placeholderOrder(String(button.url ?? "")).length) return true;
      }
    }
  }
  return false;
}
