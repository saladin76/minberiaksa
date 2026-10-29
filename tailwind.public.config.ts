import base from "./tailwind.config";
import type { Config } from "tailwindcss";

/** The public site shares the tokens but does not download editor/dashboard utilities. */
export default {
  ...base,
  content: ["./pages/**/*.{js,ts,jsx,tsx,mdx}", "./app/**/*.{js,ts,jsx,tsx,mdx}", "!./app/(dashboard)/**/*.{js,ts,jsx,tsx,mdx}", "./components/**/*.{js,ts,jsx,tsx,mdx}", "!./components/dashboard/**/*.{js,ts,jsx,tsx,mdx}", "./lib/minbar/**/*.{ts,tsx}"],
} satisfies Config;
