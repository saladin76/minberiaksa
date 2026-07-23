export function BrandMark({ compact = false, inverse = false }: { compact?: boolean; inverse?: boolean }) {
  return (
    <span
      className={`brand-mark${compact ? " brand-mark--compact" : ""}${inverse ? " brand-mark--inverse" : ""}`}
      role="img"
      aria-label="شعار مؤسسة منبر الأقصى الدولية"
    >
      <img
        src="https://minberiaksa.org/favicon.ico"
        width={compact ? 42 : 58}
        height={compact ? 42 : 58}
        alt=""
        loading="eager"
        decoding="async"
        referrerPolicy="no-referrer"
      />
      {!compact ? <span aria-hidden="true">منبر الأقصى</span> : null}
    </span>
  );
}
