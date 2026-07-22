import type { ReactNode } from "react";

type PatternBackgroundProps = {
  children: ReactNode;
  intensity?: "soft" | "medium";
  position?: "full" | "top" | "bottom";
  fadeDirection?: "top" | "bottom" | "both";
  className?: string;
};

export function PatternBackground({
  children,
  intensity = "soft",
  position = "full",
  fadeDirection = "both",
  className = "",
}: PatternBackgroundProps) {
  const classes = [
    "pattern-background",
    `pattern-background-${intensity}`,
    `pattern-position-${position}`,
    `pattern-fade-${fadeDirection}`,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classes}>
      <span className="pattern-background__ornament" aria-hidden="true" />
      <span className="pattern-background__wash" aria-hidden="true" />
      <div className="pattern-background__content">{children}</div>
    </div>
  );
}
