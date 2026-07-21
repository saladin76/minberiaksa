export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <span
      className={`brand-mark-placeholder${compact ? " brand-mark-placeholder--compact" : ""}`}
      role="img"
      aria-label="شعار مؤسسة منبر الأقصى الدولية"
    >
      <span aria-hidden="true">منبر الأقصى</span>
    </span>
  );
}
