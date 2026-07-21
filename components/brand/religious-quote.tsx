import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
  source?: string;
  status?: "approved" | "source-required";
};

export function ReligiousQuote({ children, source, status = "approved" }: Props) {
  return (
    <figure className="religious-quote">
      <blockquote>{children}</blockquote>
      {source ? <figcaption>{source}</figcaption> : null}
      {status === "source-required" ? <small>SOURCE REFERENCE REQUIRED</small> : null}
    </figure>
  );
}
