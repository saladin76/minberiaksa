/**
 * `pdf-parse` ships no type declarations and no @types package exists for the
 * version in use. The statement parser only ever calls it as
 * `pdfParse(buffer) -> { text }`, casting through `unknown` at the call site,
 * so a minimal declaration is enough and keeps the module from resolving to an
 * implicit `any` under `noImplicitAny`.
 */
declare module "pdf-parse" {
  interface PdfParseResult {
    text?: string;
    numpages?: number;
    info?: unknown;
    metadata?: unknown;
  }
  function pdfParse(buffer: Buffer | Uint8Array): Promise<PdfParseResult>;
  export default pdfParse;
}
