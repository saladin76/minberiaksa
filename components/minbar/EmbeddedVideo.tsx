import { describeVideoSource } from "@/lib/content/video-platform";
/** The dashboard and public page accept the same validated providers. */
export function EmbeddedVideo({ source, title }: { source: string; title: string }) {
  const media = describeVideoSource({ url: source });
  if (media.directVideo && media.embedUrl) return <video src={media.embedUrl} title={title} controls playsInline preload="metadata" style={{ width: "100%", height: "100%", background: "#000" }} />;
  if (media.embedUrl) return <iframe src={media.embedUrl} title={title} loading="lazy" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 }} allow="encrypted-media; picture-in-picture; fullscreen" referrerPolicy="strict-origin-when-cross-origin" allowFullScreen />;
  return media.watchUrl ? <a href={media.watchUrl} target="_blank" rel="noopener noreferrer" style={{ display: "grid", placeItems: "center", width: "100%", height: "100%" }}>{title}</a> : null;
}
