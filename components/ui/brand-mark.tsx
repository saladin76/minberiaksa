export function BrandMark({ compact = false, inverse = false }: { compact?: boolean; inverse?: boolean }) {
  return <span className={`brand-mark${compact?" brand-mark--compact":""}${inverse?" brand-mark--inverse":""}`} role="img" aria-label="شعار مؤسسة منبر الأقصى الدولية"><img src="/assets/brand/minber-al-aqsa-logo.png" width={compact?164:230} height={compact?40:56} alt="مؤسسة منبر الأقصى الدولية" loading="eager" decoding="async" /></span>;
}
