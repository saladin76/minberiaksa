import type { Config } from "tailwindcss";
import stockColors from "tailwindcss/colors";
import plugin from "tailwindcss/plugin";

/* ── Accent ramps: Minbar on the public site, vivid in the dashboard ─────────────────
 *
 * The chromatic ramps below were remapped onto Minbar's four colours so that Tailwind
 * utilities could never drift off-palette. That suits the public site, but inside the
 * dashboard it desaturated every accent and collapsed distinct hues into one another
 * (teal = cyan = emerald, blue = sky = indigo, violet = bronze), so KPI cards and charts
 * read as one flat wash.
 *
 * Each accent class therefore resolves through a CSS variable. `:root` carries the Minbar
 * ramps, so every page keeps them by default; `.dash-vivid`  set by the dashboard shell
 * only  swaps in Tailwind's stock ramps. Opacity modifiers (`bg-blue-500/40`) keep working
 * through `<alpha-value>`. Neutrals and `brand` are not part of this: they stay Minbar
 * everywhere, which is what keeps the dashboard recognisably on-brand.
 */
const SHADES = ["50", "100", "200", "300", "400", "500", "600", "700", "800", "900", "950"] as const;
type Ramp = Record<(typeof SHADES)[number], string>;

// Warning / highlight → Aqsa Gold. 500 is --gold, 600 is --gold-2.
const MINBAR_GOLD: Ramp = {
	50:  '#FDF9F0', 100: '#FAF0D8', 200: '#F4DEAB', 300: '#ECC977',
	400: '#E1B24B', 500: '#D39A27', 600: '#B8811C', 700: '#96681A',
	800: '#79551A', 900: '#634718', 950: '#382709',
};
// Success → Zakat Green. 600 is --green.
const MINBAR_GREEN: Ramp = {
	50:  '#EFF8F3', 100: '#D8EEE2', 200: '#B2DCC6', 300: '#82C5A4',
	400: '#4FA77E', 500: '#2C8B5D', 600: '#1F7A4D', 700: '#1A6340',
	800: '#164E34', 900: '#13402B', 950: '#082418',
};
// Destructive / urgent → Minber Red. 600 is --red, 800 is --red-2.
const MINBAR_RED: Ramp = {
	50:  '#FCF3F2', 100: '#F8E2DF', 200: '#F1C3BC', 300: '#E59B90',
	400: '#D3705F', 500: '#BC4B3B', 600: '#A93428', 700: '#8E2A20',
	800: '#7C2318', 900: '#661E15', 950: '#380F0A',
};
// Informational → a lighter navy rather than a blue the palette does not contain.
const MINBAR_INFO: Ramp = {
	50:  '#EEF5F9', 100: '#D8E8F0', 200: '#B2D0E0', 300: '#83B2C9',
	400: '#548FAC', 500: '#35708F', 600: '#295A75', 700: '#234A60',
	800: '#1F3D50', 900: '#1B3443', 950: '#10212B',
};
// Hues with no counterpart in a four-colour identity: bronze sits between gold and red.
const MINBAR_BRONZE: Ramp = {
	50:  '#FAF4EF', 100: '#F3E6D9', 200: '#E5CAB1', 300: '#D2A981',
	400: '#BC8755', 500: '#A06B3C', 600: '#8A5D16', 700: '#6F4A14',
	800: '#5A3C14', 900: '#4A3213', 950: '#291B09',
};
const MINBAR_TERRACOTTA: Ramp = {
	50:  '#FDF5F0', 100: '#FAE7DA', 200: '#F3CBB2', 300: '#E8A783',
	400: '#D9825A', 500: '#C6613C', 600: '#B04A2C', 700: '#8F3A23',
	800: '#74301F', 900: '#5F291C', 950: '#34140C',
};

const MINBAR_ACCENTS: Record<string, Ramp> = {
	amber: MINBAR_GOLD, yellow: MINBAR_GOLD,
	emerald: MINBAR_GREEN, green: MINBAR_GREEN, teal: MINBAR_GREEN, cyan: MINBAR_GREEN, lime: MINBAR_GREEN,
	red: MINBAR_RED, rose: MINBAR_RED, pink: MINBAR_RED,
	blue: MINBAR_INFO, sky: MINBAR_INFO, indigo: MINBAR_INFO,
	violet: MINBAR_BRONZE, purple: MINBAR_BRONZE, fuchsia: MINBAR_BRONZE,
	orange: MINBAR_TERRACOTTA,
};
const ACCENT_HUES = Object.keys(MINBAR_ACCENTS);

const VIVID_ACCENTS: Record<string, Ramp> = Object.fromEntries(
	ACCENT_HUES.map((hue) => [hue, (stockColors as unknown as Record<string, Ramp>)[hue]]),
);

function rgbTriplet(hex: string): string {
	const n = parseInt(hex.replace('#', ''), 16);
	return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}

function accentVars(ramps: Record<string, Ramp>): Record<string, string> {
	const vars: Record<string, string> = {};
	for (const hue of ACCENT_HUES) {
		for (const shade of SHADES) vars[`--c-${hue}-${shade}`] = rgbTriplet(ramps[hue][shade]);
	}
	return vars;
}

const accentColors = Object.fromEntries(
	ACCENT_HUES.map((hue) => [
		hue,
		Object.fromEntries(SHADES.map((shade) => [shade, `rgb(var(--c-${hue}-${shade}) / <alpha-value>)`])),
	]),
);

const accentVarsPlugin = plugin(({ addBase }) => {
	addBase({
		':root': accentVars(MINBAR_ACCENTS),
		'.dash-vivid': accentVars(VIVID_ACCENTS),
	});
});

export default {
    darkMode: ["class"],
    content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
  	extend: {
  		/**
  		 * The platform's faces: Cairo for Arabic, Montserrat for Latin.
  		 *
  		 * `font-arabic` sits on `<body>` in `app/layout.tsx`, so it is the default
  		 * for the dashboard and the auth pages. It pointed at `--font-arabic`
  		 * (Tajawal), which is the legacy face  Minbar's Arabic stack is Cairo, with
  		 * Tajawal kept only as a fallback. The public site is unaffected either way:
  		 * `.mia-scope` sets `font-family` on itself.
  		 */
  		fontFamily: {
  			sans: ["var(--font-montserrat)", "Montserrat", "system-ui", "sans-serif"],
  			arabic: ["var(--font-cairo)", "Cairo", "Almarai", "var(--font-arabic)", "system-ui", "sans-serif"],
  			latin: ["var(--font-montserrat)", "Montserrat", "system-ui", "sans-serif"],
  			poppins: ["var(--font-poppins)"],
  		},
  		colors: {
  			/* ── Minbar Al-Aqsa identity ───────────────────────────────────────────
			 * The locked palette from `styles/minbar/minbar.css`:
			 *   Navy #10212B · Gold #D39A27 · Red #A93428 · Green #1F7A4D
			 *   Ivory #FFFDF8 · Sand #F7F2EA · Muted #52616B
			 *
			 * Why the palette moves rather than the pages: the dashboard is ~190 files
			 * of Tailwind utilities  `text-slate-500` alone appears 416 times  while
			 * the public Minbar pages use inline styles under `.mia-scope` and not one
			 * Tailwind colour utility. Retuning the ramps therefore restyles the whole
			 * dashboard and cannot reach the public site. The same reasoning is already
			 * recorded below for `brand`, where ~750 literals were folded into a scale.
			 *
			 * Role mapping, following Minbar's own rules (red is "donate CTA + urgent
			 * states only", so it stays destructive here rather than becoming every
			 * primary button):
			 *   navy  → chrome, primary actions      gold  → accents, highlights
			 *   red   → destructive, urgent          green → success, confirmed
			 */
			deep: '#10212B',
			navy: '#132C38',
			soft: '#1F3F4F',
			burgundy: '#A93428',
			burgundyDark: '#7C2318',
			gold: '#D39A27',
			goldDark: '#B8811C',
			offwhite: '#FFFDF8',
			sand: '#F7F2EA',
			ink: '#10212B',
			ice: '#DDE4E8',
			// Brand palette. Previously the brand blue was pasted as a raw `#025EB8` literal
			// in ~750 places across ~170 dashboard files, so a palette change meant editing
			// every one of them. The scale keys are unchanged  only the colours move, from
			// the old blue onto Minbar navy, so every existing `bg-brand-600` follows.
			brand: {
				DEFAULT: '#1F3F4F',
				dark: '#19323F',
				50:  '#F0F4F6',
				100: '#DBE4E9',
				200: '#B7C8D1',
				300: '#8AA5B2',
				400: '#587C8C',
				500: '#35586A',
				600: '#1F3F4F',
				700: '#19323F',
				800: '#142834',
				900: '#10212B',
				950: '#0A161D',
			},
			// Deliberately NOT named `accent`  that key is already the shadcn neutral-gray
			// token used by every `hover:bg-accent` ghost button. Overloading it would
			// turn every ghost hover gold.
			'brand-orange': {
				DEFAULT: '#D39A27',
				50:  '#FDF9F0',
				100: '#FAF0D8',
				200: '#F4DEAB',
				300: '#ECC977',
				400: '#E1B24B',
				500: '#D39A27',
				600: '#B8811C',
				700: '#96681A',
				800: '#79551A',
				900: '#634718',
			},

			/* ── Stock ramps, retuned ───────────────────────────────────────────────
			 * Each is replaced whole: `extend` merges one level deep, so a partial
			 * object would delete the shades it omits and break every class using one.
			 */

			// Neutrals carry a navy tint so greys sit under the brand rather than
			// beside it. 600 is Minbar's own --muted and 950 its --deep.
			...(() => {
				const neutral = {
					50:  '#F7F9FA', 100: '#EEF2F4', 200: '#DDE4E8', 300: '#C3CED4',
					400: '#96A6AF', 500: '#6E818B', 600: '#52616B', 700: '#3E4C55',
					800: '#2B3941', 900: '#1A2831', 950: '#10212B',
				};
				return { slate: neutral, gray: neutral, zinc: neutral, neutral, stone: neutral };
			})(),

			// Chromatic ramps resolve through CSS variables  Minbar by default, Tailwind's
			// stock ramps under `.dash-vivid`. See the note above `accentColors`.
			...accentColors,

			background: 'hsl(var(--background))',
  			foreground: 'hsl(var(--foreground))',
  			card: {
  				DEFAULT: 'hsl(var(--card))',
  				foreground: 'hsl(var(--card-foreground))'
  			},
  			popover: {
  				DEFAULT: 'hsl(var(--popover))',
  				foreground: 'hsl(var(--popover-foreground))'
  			},
  			primary: {
  				DEFAULT: 'hsl(var(--primary))',
  				light: 'hsl(var(--primary-light))',
  				foreground: 'hsl(var(--primary-foreground))'
  			},
  			secondary: {
  				DEFAULT: 'hsl(var(--secondary))',
  				light: 'hsl(var(--secondary-light))',
  				foreground: 'hsl(var(--secondary-foreground))'
  			},
  			muted: {
  				DEFAULT: 'hsl(var(--muted))',
  				foreground: 'hsl(var(--muted-foreground))'
  			},
  			accent: {
  				DEFAULT: 'hsl(var(--accent))',
  				foreground: 'hsl(var(--accent-foreground))'
  			},
  			destructive: {
  				DEFAULT: 'hsl(var(--destructive))',
  				foreground: 'hsl(var(--destructive-foreground))'
  			},
  			border: 'hsl(var(--border))',
  			input: 'hsl(var(--input))',
  			ring: 'hsl(var(--ring))',
  			chart: {
  				'1': 'hsl(var(--chart-1))',
  				'2': 'hsl(var(--chart-2))',
  				'3': 'hsl(var(--chart-3))',
  				'4': 'hsl(var(--chart-4))',
  				'5': 'hsl(var(--chart-5))'
  			}
  		},
  		borderRadius: {
  			lg: 'var(--radius)',
  			md: 'calc(var(--radius) - 2px)',
  			sm: 'calc(var(--radius) - 4px)',
  			/* Minbar's --r-md, for the larger cards. */
  			xl: 'calc(var(--radius) + 6px)',
  			pill: '999px'
  		},
  		/* Minbar's elevation, from `styles/minbar/minbar.css`: shadows are tinted
  		   with the navy rather than neutral black, which is what stops a card
  		   reading as grey against the ivory ground. */
  		boxShadow: {
  			soft: '0 2px 8px rgba(16, 33, 43, .06)',
  			card: '0 18px 50px rgba(16, 33, 43, .12)',
  			lift: '0 18px 50px rgba(16, 33, 43, .12)',
  			pop: '0 22px 48px rgba(0, 0, 0, .28)',
  			cta: '0 12px 26px rgba(169, 52, 40, .32)'
  		},
  		keyframes: {
  			'accordion-down': {
  				from: {
  					height: '0'
  				},
  				to: {
  					height: 'var(--radix-accordion-content-height)'
  				}
  			},
  			'accordion-up': {
  				from: {
  					height: 'var(--radix-accordion-content-height)'
  				},
  				to: {
  					height: '0'
  				}
  			}
  		},
  		animation: {
  			'accordion-down': 'accordion-down 0.2s ease-out',
  			'accordion-up': 'accordion-up 0.2s ease-out'
  		},
  		backgroundImage: {
			'logo': "url('logo.png')",
			'logo_white': "url('logo.png')",
  			'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
  			'gradient-conic':
  				'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
  		},
  	}
  },
  plugins: [
    require("tailwindcss-animate"),
    accentVarsPlugin,
  ],
} satisfies Config;
