/** The unified editor owns SEO, translation and save feedback on these routes. */
export function isUnifiedContentEditorPath(pathname: string): boolean {
  return /^\/dashboard\/content\/[^/]+\/[^/]+\/?$/.test(pathname)
    || /^\/dashboard\/blog\/create(?:\/[^/]+)?\/?$/.test(pathname)
    || /^\/dashboard\/(?:campaigns|categories|super-categories|urgent-banners|videos|playlists|courses|reports|booklets|faqs)\/(?:new|edit\/[^/]+)\/?$/.test(pathname)
    || /^\/dashboard\/campaigns\/[^/]+\/seo\/?$/.test(pathname);
}
