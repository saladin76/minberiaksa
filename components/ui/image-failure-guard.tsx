"use client";

import { useEffect } from "react";

export function ImageFailureGuard() {
  useEffect(() => {
    const markUnavailable = (image: HTMLImageElement) => {
      image.hidden = true;
      image.setAttribute("aria-hidden", "true");
      image.closest("figure, article, .brand-mark, .home-hero-v4__visual, .account-field-visual, .project-detail-hero-media, .project-media-feature")?.classList.add("is-image-unavailable");
    };

    const inspect = (image: HTMLImageElement) => {
      if (image.complete && image.naturalWidth === 0) markUnavailable(image);
    };

    const onError = (event: Event) => {
      if (event.target instanceof HTMLImageElement) markUnavailable(event.target);
    };

    document.addEventListener("error", onError, true);
    document.querySelectorAll("img").forEach((image) => inspect(image));

    const observer = new MutationObserver((entries) => {
      for (const entry of entries) {
        for (const node of entry.addedNodes) {
          if (node instanceof HTMLImageElement) inspect(node);
          if (node instanceof HTMLElement) node.querySelectorAll("img").forEach((image) => inspect(image));
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      document.removeEventListener("error", onError, true);
      observer.disconnect();
    };
  }, []);

  return null;
}
