"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { projectImageAttempts } from "@/lib/minbar/project-image-fallback";

interface ProjectImageProps {
  sources: readonly (string | null | undefined)[];
  alt: string;
  width?: number;
  sizes?: string;
  loading?: "eager" | "lazy";
  fetchPriority?: "high" | "low" | "auto";
  style?: CSSProperties;
  className?: string;
  draggable?: boolean;
}

/** Use the optimized image while it works, but recover from blocked
 * Cloudinary/Drive transforms and stale translated URLs. A real error event,
 * not just a missing URL, advances to the next same-campaign source. */
export default function ProjectImage({
  sources, alt, width = 760, sizes,
  loading = "lazy", fetchPriority = "auto", style, className, draggable,
}: ProjectImageProps) {
  const sourceKey = sources.join("\u0001");
  const attempts = useMemo(() => projectImageAttempts(sources, width), [sourceKey, width]); // eslint-disable-line react-hooks/exhaustive-deps
  const [failure, setFailure] = useState({ sourceKey, index: 0 });
  const index = failure.sourceKey === sourceKey ? failure.index : 0;
  const current = attempts[index];
  if (!current) {
    return (
      <span
        role="img"
        aria-label={alt}
        className={className}
        style={{ ...style, background: "var(--sand) center/72px no-repeat url('/minbar/assets/logo-mark.png')" }}
      />
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      key={sourceKey + ":" + index}
      src={current.src}
      srcSet={current.srcSet}
      sizes={current.srcSet ? sizes : undefined}
      alt={alt}
      loading={loading}
      fetchPriority={fetchPriority}
      decoding="async"
      className={className}
      draggable={draggable}
      style={style}
      onError={() => setFailure({ sourceKey, index: index + 1 })}
    />
  );
}
