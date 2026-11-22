/**
 * Old links that still bring visitors (old platform paths under /bagis, retired landing pages, ad URLs) but answered
 * 404 (nginx, 18–21 Nov 2026: ~250 visits in 3 days, a third from paid ads). Permanent redirects to the page that
 * replaced each; the query string (utm_*, fbclid, gclid) is kept, so ad measurement still works. Order matters:
 * specific paths first, the /bagis catch-all last.
 */
const L = ":locale([a-z]{2})";
export const LEGACY_REDIRECTS = [
  { source: "/:locale(da|de|en|es|fr|hi|id|it|ja|ms|nl|no|pt|sq|sv|tr|ur|zh)/monthly-donate", destination: "/:locale/recurring-donation", permanent: true },
  { source: `/${L}/bagis/ar/monthly-donation`, destination: "/:locale/recurring-donation", permanent: true },
  { source: `/${L}/hot-meals-campaign`, destination: "/:locale/bagislar/gaza-hot-meals", permanent: true },
  { source: `/${L}/gazze-yardim-paketi`, destination: "/:locale/bagislar/gaza-food-parcels", permanent: true },
  { source: `/${L}/mshrwa-alsl-alghdayy-:n(\\d+)`, destination: "/:locale/bagislar/gaza-food-parcels", permanent: true },
  { source: `/${L}/bagis/ar/zakat`, destination: "/:locale/pay-zakat-to-palestine", permanent: true },
  { source: `/${L}/bagis/proje/zekat/:id`, destination: "/:locale/pay-zakat-to-palestine", permanent: true },
  { source: `/${L}/bagis/proje/:slug(acil-yardim|filistin-icin-acil-yardim|gazze-icin-acil-yardim)/:id`, destination: "/:locale/category/region-gaza", permanent: true },
  { source: `/${L}/bagis/proje/yerinden-edilmis-bir-aile-destek-paketi/:id`, destination: "/:locale/bagislar/gaza-shelter-winter-family", permanent: true },
  { source: `/${L}/bagis/ar/ibadan-lana-projects`, destination: "/:locale/bagislar/ibadan-lana", permanent: true },
  { source: `/${L}/water-relief-in-gaza`, destination: "/:locale/category/region-gaza", permanent: true },
  { source: `/${L}/gaza`, destination: "/:locale/category/region-gaza", permanent: true },
  { source: `/${L}/al-quds`, destination: "/:locale/al-quds-and-the-old-city", permanent: true },
  { source: `/${L}/:post(visit-to-.*|commemoration-.*)`, destination: "/:locale/blog", permanent: true },
  { source: `/${L}/:old(udhiyah-.*|hml-alaahy-\\d+|ramadan-projects)`, destination: "/:locale/bagislar", permanent: true },
  { source: `/${L}/bagis`, destination: "/:locale/bagislar", permanent: true },
  { source: `/${L}/bagis/:path*`, destination: "/:locale/bagislar", permanent: true },
];
