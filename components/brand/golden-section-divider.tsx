export function GoldenSectionDivider({ label }: { label?: string }) {
  return (
    <div className="golden-section-divider" aria-hidden={label ? undefined : true}>
      <span />
      {label ? <strong>{label}</strong> : null}
      <span />
    </div>
  );
}
