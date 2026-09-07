import type { ReactElement } from "react";

/**
 * Glyphs for the six programmes — drawn to match what each programme does,
 * carried from `progIcon()` in `Minbar/إنجازات وتقارير المؤسسة.dc.html`.
 */
export const PROGRAM_ICONS: Record<string, ReactElement> = {
  utensils: <path d="M7 3v8a2 2 0 1 0 4 0V3M9 11v10M17 3v18M14 3v6a3 3 0 0 0 3 3" />,
  droplets: <path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11Z" />,
  tent: (
    <>
      <path d="M4 20 12 4l8 16" />
      <path d="M8 20 12 11l4 9" />
      <path d="M2 20h20" />
    </>
  ),
  "graduation-cap": (
    <>
      <path d="M12 4 2 9l10 5 10-5-10-5Z" />
      <path d="M6 11.5V16c0 1.7 2.7 3 6 3s6-1.3 6-3v-4.5" />
    </>
  ),
  home: <path d="m4 10 8-6 8 6v9a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1v-9Z" />,
  "heart-pulse": (
    <path d="M12 20.5S3.5 15.2 3.5 9a4.7 4.7 0 0 1 8.5-2.7A4.7 4.7 0 0 1 20.5 9c0 1-.2 1.9-.6 2.7H16l-2 3-2.5-5-1.5 2H7" />
  ),
};

export function ProgramIcon({ name }: { name: string }) {
  return (
    <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PROGRAM_ICONS[name]}
    </svg>
  );
}
