import type { MetaComponent, MetaParameter } from "./providers/meta-whatsapp/parameters";

export type WhatsappRenderedPreview = {
  header: {
    type: "text" | "image" | "video" | "document" | "location";
    text?: string | null;
    mediaUrl?: string | null;
    fileName?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    address?: string | null;
    name?: string | null;
  } | null;
  body: string;
  footerText: string | null;
  buttons: Array<{
    type: string;
    text: string;
    url?: string | null;
    phoneNumber?: string | null;
    payload?: string | null;
    index: number;
  }>;
  providerTemplateName: string | null;
  languageCode: string | null;
};

type SchemaComponent = {
  type?: unknown;
  format?: unknown;
  text?: unknown;
  buttons?: unknown;
};

function arr(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function replaceParams(text: string, params: MetaParameter[] = []): string {
  let positionalIndex = 0;
  return String(text ?? "").replace(/\{\{\s*([\w._-]+)\s*\}\}/g, (match, raw: string) => {
    const named = params.find((p) => p.type === "text" && "parameter_name" in p && p.parameter_name === raw);
    if (named && named.type === "text") return named.text;

    const numeric = Number(raw);
    if (Number.isFinite(numeric) && numeric > 0) {
      const p = params[numeric - 1];
      return p?.type === "text" ? p.text : match;
    }

    const p = params[positionalIndex++];
    return p?.type === "text" ? p.text : match;
  });
}

function builtComponent(
  components: MetaComponent[],
  type: MetaComponent["type"],
  index?: number,
): MetaComponent | undefined {
  if (type !== "button") return components.find((c) => c.type === type);
  return components.find((c) => c.type === "button" && Number(c.index) === index);
}

/**
 * Freeze the WhatsApp message exactly as the approved provider template plus
 * resolved parameters looked at send time. The snapshot is stored on the
 * delivery row so later template edits cannot change what the inbox displays.
 */
export function buildWhatsappRenderedPreview(input: {
  componentsSchema: unknown;
  builtComponents: MetaComponent[];
  fallbackBody: string;
  providerTemplateName?: string | null;
  languageCode?: string | null;
}): WhatsappRenderedPreview {
  const schema = arr(input.componentsSchema) as SchemaComponent[];
  let header: WhatsappRenderedPreview["header"] = null;
  let body = input.fallbackBody;
  let footerText: string | null = null;
  const buttons: WhatsappRenderedPreview["buttons"] = [];

  for (const s of schema) {
    const type = String(s.type ?? "").toUpperCase();

    if (type === "HEADER") {
      const format = String(s.format ?? "TEXT").toUpperCase();
      const built = builtComponent(input.builtComponents, "header");

      if (format === "TEXT") {
        header = {
          type: "text",
          text: replaceParams(String(s.text ?? ""), built?.parameters ?? []),
        };
      } else {
        const p = built?.parameters?.[0];
        if (format === "IMAGE" && p?.type === "image") {
          header = { type: "image", mediaUrl: p.image.link };
        } else if (format === "VIDEO" && p?.type === "video") {
          header = { type: "video", mediaUrl: p.video.link };
        } else if (format === "DOCUMENT" && p?.type === "document") {
          header = {
            type: "document",
            mediaUrl: p.document.link,
            fileName: p.document.filename ?? null,
          };
        } else if (format === "LOCATION" && p?.type === "location") {
          header = {
            type: "location",
            latitude: p.location.latitude,
            longitude: p.location.longitude,
            address: p.location.address ?? null,
            name: p.location.name ?? null,
          };
        }
      }
      continue;
    }

    if (type === "BODY") {
      const built = builtComponent(input.builtComponents, "body");
      const providerBody = String(s.text ?? "");
      if (providerBody) body = replaceParams(providerBody, built?.parameters ?? []);
      continue;
    }

    if (type === "FOOTER") {
      footerText = String(s.text ?? "") || null;
      continue;
    }

    if (type === "BUTTONS") {
      const list = arr(s.buttons) as Array<{
        type?: unknown;
        text?: unknown;
        url?: unknown;
        phone_number?: unknown;
        phoneNumber?: unknown;
        payload?: unknown;
      }>;

      list.forEach((b, index) => {
        const kind = String(b.type ?? "").toLowerCase();
        const built = builtComponent(input.builtComponents, "button", index);
        const textParam = built?.parameters?.find((p) => p.type === "text");
        const dynamic = textParam?.type === "text" ? textParam.text : null;

        let url = typeof b.url === "string" ? b.url : null;
        if (url && dynamic) {
          url = url.replace(/\{\{\s*[\w._-]+\s*\}\}/, dynamic);
        }

        buttons.push({
          type: kind,
          text: String(b.text ?? ""),
          url,
          phoneNumber:
            typeof b.phone_number === "string"
              ? b.phone_number
              : typeof b.phoneNumber === "string"
                ? b.phoneNumber
                : null,
          payload: typeof b.payload === "string" ? b.payload : null,
          index,
        });
      });
    }
  }

  return {
    header,
    body,
    footerText,
    buttons,
    providerTemplateName: input.providerTemplateName ?? null,
    languageCode: input.languageCode ?? null,
  };
}
