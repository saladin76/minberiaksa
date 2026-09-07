"use client";

import * as React from "react";
import {
  ImageIcon,
  Video,
  FileText,
  MapPin,
  ExternalLink,
  Phone,
  Copy,
  Reply,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface PreviewHeader {
  type: "text" | "image" | "video" | "document" | "location";
  text?: string | null;
  mediaUrl?: string | null;
  mediaSid?: string | null;
  mimeType?: string | null;
  fileName?: string | null;
  previewUrl?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  address?: string | null;
}

export interface PreviewButton {
  type:
    | "url"
    | "phone"
    | "quick_reply"
    | "copy_code"
    | "donation_cta"
    | "tracking_url";
  text: string;
  url?: string | null;
  phoneNumber?: string | null;
  payload?: string | null;
  index: number;
}

export interface PreviewVariable {
  key: string;
  exampleValue?: string | null;
  mapping?: string | null;
  validationStatus?: "ok" | "missing_example" | "unknown_mapping";
}

export interface WhatsappTemplatePreviewProps {
  name: string;
  body: string;
  header?: PreviewHeader | null;
  footerText?: string | null;
  buttons?: PreviewButton[];
  variables?: PreviewVariable[];
  language?: string | null;
  category?: string | null;
  approvalStatus?: string | null;
  templateType?: string | null;
  externalTemplateId?: string | null;
  lastImportedAt?: string | null;
}

const APPROVAL_PILL: Record<string, string> = {
  approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  rejected: "bg-rose-50 text-rose-700 border-rose-200",
  unknown: "bg-slate-50 text-slate-600 border-slate-200",
};

const BUTTON_ICON: Record<PreviewButton["type"], React.ComponentType<{ className?: string }>> = {
  url: ExternalLink,
  phone: Phone,
  quick_reply: Reply,
  copy_code: Copy,
  donation_cta: ExternalLink,
  tracking_url: ExternalLink,
};

function renderBodyWithVariables(body: string): React.ReactNode {
  // Highlight {{1}} / {{name}} / {{ donor_name }} placeholders.
  const parts: React.ReactNode[] = [];
  const regex = /(\{\{\s*[\w._-]+\s*\}\})/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(body))) {
    if (match.index > last) parts.push(body.slice(last, match.index));
    parts.push(
      <span
        key={`v-${match.index}`}
        className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-emerald-100 text-emerald-800 text-[11px] font-mono"
      >
        {match[0]}
      </span>
    );
    last = match.index + match[0].length;
  }
  if (last < body.length) parts.push(body.slice(last));
  return parts;
}

function MediaHeader({ header }: { header: PreviewHeader }) {
  if (header.type === "image") {
    return (
      <div className="relative aspect-video rounded-md overflow-hidden bg-slate-200 mb-2">
        {header.mediaUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={header.mediaUrl}
            alt={header.text ?? "media"}
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-slate-500">
            <ImageIcon className="w-8 h-8" />
          </div>
        )}
      </div>
    );
  }
  if (header.type === "video") {
    return (
      <div className="relative aspect-video rounded-md overflow-hidden bg-slate-900 mb-2 flex items-center justify-center">
        <Video className="w-10 h-10 text-white/70" />
        {header.fileName ? (
          <span className="absolute bottom-1.5 left-1.5 right-1.5 text-[10px] text-white/80 truncate">
            {header.fileName}
          </span>
        ) : null}
      </div>
    );
  }
  if (header.type === "document") {
    return (
      <div className="rounded-md bg-slate-100 border border-slate-200 px-3 py-2 mb-2 flex items-center gap-2">
        <FileText className="w-5 h-5 text-slate-500" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-slate-800 truncate">
            {header.fileName ?? "ملف مرفق"}
          </p>
          {header.mimeType ? (
            <p className="text-[10px] text-slate-500 truncate">{header.mimeType}</p>
          ) : null}
        </div>
      </div>
    );
  }
  if (header.type === "location") {
    return (
      <div className="rounded-md bg-slate-100 border border-slate-200 px-3 py-2 mb-2 flex items-center gap-2">
        <MapPin className="w-5 h-5 text-slate-500" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-slate-800 truncate">
            {header.address ?? header.text ?? "موقع"}
          </p>
          {header.latitude != null && header.longitude != null ? (
            <p className="text-[10px] text-slate-500 truncate">
              {header.latitude}, {header.longitude}
            </p>
          ) : null}
        </div>
      </div>
    );
  }
  if (header.type === "text" && header.text) {
    return (
      <p className="text-xs font-semibold text-slate-900 mb-2 leading-relaxed">
        {header.text}
      </p>
    );
  }
  return null;
}

export function WhatsappTemplatePreview(props: WhatsappTemplatePreviewProps) {
  const {
    name,
    body,
    header,
    footerText,
    buttons,
    variables,
    language,
    category,
    approvalStatus,
    templateType,
    externalTemplateId,
    lastImportedAt,
  } = props;
  const approvalKey = (approvalStatus ?? "unknown").toLowerCase();
  const approvalClass =
    APPROVAL_PILL[approvalKey] ?? APPROVAL_PILL.unknown;

  return (
    <div className="space-y-3" dir="rtl">
      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <span className="font-semibold text-slate-900 text-sm">{name}</span>
        {approvalStatus ? (
          <span
            className={cn(
              "inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-medium",
              approvalClass
            )}
          >
            {approvalStatus}
          </span>
        ) : null}
        {category ? (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full border border-slate-200 bg-slate-50 text-slate-600">
            {category}
          </span>
        ) : null}
        {language ? (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full border border-slate-200 bg-white text-slate-600">
            {language}
          </span>
        ) : null}
        {templateType ? (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full border border-violet-200 bg-violet-50 text-violet-700">
            {templateType}
          </span>
        ) : null}
        {externalTemplateId ? (
          <span className="font-mono text-[10px] text-slate-500">{externalTemplateId}</span>
        ) : null}
      </div>

      {/* WhatsApp bubble */}
      <div className="max-w-md ml-auto mr-0">
        <div className="rounded-2xl rounded-tr-md bg-[#DCF8C6] border border-emerald-100 p-3 shadow-sm">
          {header ? <MediaHeader header={header} /> : null}
          <div className="text-[13px] text-slate-900 whitespace-pre-wrap leading-relaxed">
            {renderBodyWithVariables(body)}
          </div>
          {footerText ? (
            <p className="text-[11px] text-slate-500 mt-2 leading-relaxed">
              {footerText}
            </p>
          ) : null}
        </div>
        {buttons && buttons.length > 0 ? (
          <div className="mt-1 flex flex-col gap-1">
            {buttons.map((b) => {
              const Icon = BUTTON_ICON[b.type] ?? ExternalLink;
              const labelExtra =
                b.type === "phone"
                  ? b.phoneNumber
                  : b.type === "url" || b.type === "donation_cta" || b.type === "tracking_url"
                  ? b.url
                  : b.type === "copy_code"
                  ? b.url
                  : b.payload;
              return (
                <div
                  key={b.index}
                  className="rounded-xl bg-white border border-slate-200 px-3 py-2 flex items-center gap-2 shadow-sm"
                >
                  <Icon className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="text-[12px] font-medium text-slate-900 flex-1 truncate">
                    {b.text}
                  </span>
                  {labelExtra ? (
                    <span className="text-[10px] text-slate-500 font-mono truncate max-w-[160px]">
                      {labelExtra}
                    </span>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}
      </div>

      {variables && variables.length > 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <h4 className="text-[11px] font-semibold text-slate-700 mb-2">
            المتغيرات
          </h4>
          <ul className="space-y-1">
            {variables.map((v) => (
              <li key={v.key} className="flex items-center gap-2 text-[11px]">
                <span className="font-mono text-emerald-700">{`{{${v.key}}}`}</span>
                <span className="text-slate-500">
                  {v.mapping ? `→ ${v.mapping}` : "بدون ربط معروف"}
                </span>
                <span className="text-slate-400 mr-auto truncate">
                  {v.exampleValue ?? "—"}
                </span>
                {v.validationStatus === "missing_example" ? (
                  <span className="px-1.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                    بدون مثال
                  </span>
                ) : v.validationStatus === "unknown_mapping" ? (
                  <span className="px-1.5 rounded-full bg-slate-50 text-slate-600 border border-slate-200">
                    ربط غير محدد
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {lastImportedAt ? (
        <p className="text-[10px] text-slate-500">
          آخر استيراد: {new Date(lastImportedAt).toLocaleString("ar-EG")}
        </p>
      ) : null}
    </div>
  );
}
