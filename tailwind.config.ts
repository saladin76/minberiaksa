import type { Config } from "tailwindcss";

export default {
    darkMode: ["class"],
    content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
  	extend: {
  		fontFamily: {
  			arabic: ["var(--font-arabic)"],
  			poppins: ["var(--font-poppins)"],
  		},
  		colors: {
  			// ── Yedi Cihan brand palette (design_inspiration) ──
  			// The public site (app/[locale] + the shared shell) is built on these.
  			deep: '#021D32',
  			navy: '#073452',
  			soft: '#0B4568',
  			burgundy: '#A5243D',
  			burgundyDark: '#7D1830',
  			gold: '#D8AA55',
  			offwhite: '#F7F4EF',
  			ink: '#17212B',
  			ice: '#CDE0EA',
  			// Brand palette. Previously the brand blue was pasted as a raw `#025EB8` literal
  			// in ~750 places across ~170 dashboard files, so a palette change meant editing
  			// every one of them. `brand-600` IS `#025EB8`; `brand-700` is `#024A92` and
  			// `brand.dark` is `#014FA0`, both of which already appeared as hover-state
  			// literals in the existing code, so the scale is a superset of what was in use.
  			brand: {
  				DEFAULT: '#025EB8',
  				dark: '#014FA0',
  				50:  '#EFF6FF',
  				100: '#DBEBFE',
  				200: '#BEDBFD',
  				300: '#8FC4FB',
  				400: '#3E9BF4',
  				500: '#0E76D9',
  				600: '#025EB8',
  				700: '#024A92',
  				800: '#053C74',
  				900: '#0A3260',
  				950: '#07203F',
  			},
  			// Deliberately NOT named `accent` — that key is already the shadcn neutral-gray
  			// token used by every `hover:bg-accent` ghost button. Overloading it would
  			// turn every ghost hover orange.
  			'brand-orange': {
  				DEFAULT: '#FA5D17',
  				50:  '#FFF4ED',
  				100: '#FFE6D5',
  				200: '#FEC8AA',
  				300: '#FDA274',
  				400: '#FC7A3C',
  				500: '#FA5D17',
  				600: '#EB420D',
  				700: '#C32F0D',
  				800: '#9B2813',
  				900: '#7D2413',
  			},
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
  			sm: 'calc(var(--radius) - 4px)'
  		},
  		boxShadow: {
  			soft: '0 18px 40px -20px rgba(0,0,0,.18)',
  			lift: '0 24px 70px -36px rgba(2,29,50,.45)'
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
  ],
} satisfies Config;
