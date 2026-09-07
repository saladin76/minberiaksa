import React from "react";
import ReactCountryFlag from "react-country-flag";
import {
  Heart, Users, BookOpen, Home, Droplets, Stethoscope,
  Baby, Globe, Building2, Star, Leaf, GraduationCap,
  Shirt, Zap, Handshake, Wheat, HandHeart, Church,
  Ambulance, TreePine, Lightbulb, ShieldCheck, Gift,
  // Relief
  Utensils, Soup, Sandwich, ShoppingBasket, Package, Truck, Milk, Carrot,
  Salad, Beef, GlassWater, Pill, Syringe, Bandage, BriefcaseMedical,
  HeartPulse, Cross, Thermometer, Snowflake, Umbrella, Flame,
  // Shelter & reconstruction
  Tent, TentTree, Warehouse, Hammer, Wrench, Landmark, Bed, DoorOpen, Sofa,
  Waves, Sun,
  // Community development
  School, Library, BookMarked, Pen, Pencil, Ruler, Microscope, FlaskConical,
  Backpack, Award, Trophy, Target, Sprout, Recycle, Coins, HandCoins,
  Banknote, PiggyBank, Wallet, Scale, Briefcase, Accessibility, PersonStanding,
  Glasses, MapPin, Bus, Hand,
  LucideIcon,
} from "lucide-react";
import { CUSTOM_CATEGORY_ICONS, type CategoryGlyph } from "./category-glyphs";

/**
 * Lucide icons offered for a category. Everything here must exist in the pinned
 * 0.474 release — newer names typecheck and survive `next dev` but fail the
 * production build. Subjects Lucide has no icon for live in `category-glyphs`.
 */
export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  Heart,
  Users,
  BookOpen,
  Home,
  Droplets,
  Stethoscope,
  Baby,
  Globe,
  Building2,
  Star,
  Leaf,
  GraduationCap,
  Shirt,
  Zap,
  Handshake,
  Wheat,
  HandHeart,
  Church,
  Ambulance,
  TreePine,
  Lightbulb,
  ShieldCheck,
  Gift,
  Utensils,
  Soup,
  Sandwich,
  ShoppingBasket,
  Package,
  Truck,
  Milk,
  Carrot,
  Salad,
  Beef,
  GlassWater,
  Pill,
  Syringe,
  Bandage,
  BriefcaseMedical,
  HeartPulse,
  Cross,
  Thermometer,
  Snowflake,
  Umbrella,
  Flame,
  Tent,
  TentTree,
  Warehouse,
  Hammer,
  Wrench,
  Landmark,
  Bed,
  DoorOpen,
  Sofa,
  Waves,
  Sun,
  School,
  Library,
  BookMarked,
  Pen,
  Pencil,
  Ruler,
  Microscope,
  FlaskConical,
  Backpack,
  Award,
  Trophy,
  Target,
  Sprout,
  Recycle,
  Coins,
  HandCoins,
  Banknote,
  PiggyBank,
  Wallet,
  Scale,
  Briefcase,
  Accessibility,
  PersonStanding,
  Glasses,
  MapPin,
  Bus,
  Hand,
};

export const CATEGORY_ICON_NAMES = Object.keys(CATEGORY_ICONS) as (keyof typeof CATEGORY_ICONS)[];

/** Locally drawn glyphs, offered alongside the Lucide ones. */
export const CUSTOM_ICON_NAMES = Object.keys(CUSTOM_CATEGORY_ICONS);

/** Every glyph name a category may store, Lucide and custom together. */
export const ALL_CATEGORY_ICON_NAMES = [...CATEGORY_ICON_NAMES, ...CUSTOM_ICON_NAMES];

/** Canonical stored form for a locally drawn glyph, e.g. `custom:Mosque`. */
export function customIconValue(name: string): string {
  return `custom:${name}`;
}

/**
 * The site's own locales and the flag each one is shown with — the same pairing
 * the dashboard language tabs already use. Applied only to a **lowercase**
 * token, so `ar` means العربية (السعودية) while `AR` means the Argentine flag.
 */
export const LOCALE_FLAGS: Record<string, string> = {
  ar: "SA",
  en: "GB",
  fr: "FR",
  tr: "TR",
  id: "ID",
  pt: "PT",
  es: "ES",
  de: "DE",
};

/** Canonical stored form for a flag, e.g. `flag:TR`. */
export function flagIconValue(countryCode: string): string {
  return `flag:${countryCode.toUpperCase()}`;
}

const FLAG_PREFIX = /^flag\s*[:_\-\s]\s*/i;
const REGIONAL_INDICATOR_A = 0x1f1e6;
const REGIONAL_INDICATOR_Z = 0x1f1ff;

/** 🇹🇷 → "TR". Flag emoji are two regional indicator symbols, nothing else. */
function countryCodeFromEmoji(value: string): string | null {
  const points = Array.from(value).map((character) => character.codePointAt(0) ?? 0);
  if (points.length !== 2) return null;
  if (points.some((point) => point < REGIONAL_INDICATOR_A || point > REGIONAL_INDICATOR_Z)) {
    return null;
  }
  return points
    .map((point) => String.fromCharCode(point - REGIONAL_INDICATOR_A + 65))
    .join("");
}

/** Accepts `TR`, `tr`, `ar-SA`, `en_GB`, or 🇹🇷 and returns an ISO 3166-1 code. */
function countryCodeFromToken(token: string): string | null {
  const trimmed = token.trim();
  if (!trimmed) return null;

  const fromEmoji = countryCodeFromEmoji(trimmed);
  if (fromEmoji) return fromEmoji;

  const parts = trimmed.split(/[-_\s]+/).filter(Boolean);

  // A single lowercase token is read as a locale first, so `ar` resolves to the
  // Saudi flag rather than to Argentina.
  if (parts.length === 1 && parts[0] === parts[0].toLowerCase()) {
    const localeFlag = LOCALE_FLAGS[parts[0].toLowerCase()];
    if (localeFlag) return localeFlag;
  }

  // BCP-47 tags carry the country in the last subtag: ar-SA, en_GB, pt-BR.
  const region = parts[parts.length - 1];
  return /^[A-Za-z]{2}$/.test(region) ? region.toUpperCase() : null;
}

export type CategoryIconValue =
  | { kind: "lucide"; name: string }
  | { kind: "custom"; name: string }
  | { kind: "flag"; countryCode: string };

const CUSTOM_PREFIX = /^custom\s*[:_\-\s]\s*/i;

function findCustom(value: string): string | null {
  if (CUSTOM_CATEGORY_ICONS[value]) return value;
  return (
    Object.keys(CUSTOM_CATEGORY_ICONS).find(
      (name) => name.toLowerCase() === value.toLowerCase(),
    ) ?? null
  );
}

/**
 * Resolves whatever is stored in `category.icon` into something renderable.
 *
 * A category icon is one of the Lucide names above, one of the locally drawn
 * glyphs, or a country flag. Both the custom and flag halves are deliberately
 * permissive so hand-entered values still work: `custom:Mosque` and a bare
 * `Mosque` resolve the same way, as do `flag:TR`, `flag-tr`, `flag TR`, a bare
 * `TR`, a locale like `ar` or `en-GB`, and a pasted 🇹🇷. Anything unrecognised
 * falls back to Heart, which is what this component has always done.
 */
export function parseCategoryIcon(raw?: string | null): CategoryIconValue {
  const value = (raw || "").trim();
  if (!value) return { kind: "lucide", name: "Heart" };

  // An explicit `custom:` prefix wins outright, so a glyph can never be
  // shadowed if Lucide later ships a name that collides with one of ours.
  if (CUSTOM_PREFIX.test(value)) {
    const name = findCustom(value.replace(CUSTOM_PREFIX, ""));
    if (name) return { kind: "custom", name };
  }

  if (CATEGORY_ICONS[value]) return { kind: "lucide", name: value };

  const bareCustom = findCustom(value);
  if (bareCustom) return { kind: "custom", name: bareCustom };

  const lucideName = CATEGORY_ICON_NAMES.find(
    (name) => name.toLowerCase() === value.toLowerCase(),
  );
  if (lucideName) return { kind: "lucide", name: lucideName };

  const explicitFlag = FLAG_PREFIX.test(value);
  const countryCode = countryCodeFromToken(value.replace(FLAG_PREFIX, ""));
  if (countryCode) return { kind: "flag", countryCode };

  // `flag:` was asked for but the code is unusable — still better than pretending
  // it is an icon name.
  if (explicitFlag) return { kind: "lucide", name: "Globe" };

  return { kind: "lucide", name: "Heart" };
}

interface CategoryIconProps {
  name?: string | null;
  className?: string;
}

/**
 * Renders whatever `category.icon` holds — a Lucide icon, one of the locally
 * drawn glyphs, or a country flag — at the size the caller asks for. Lucide and
 * custom glyphs share the same 24×24 stroke geometry, so a className that sizes
 * or colours one sizes and colours the other identically.
 * Flags come from react-country-flag, whose
 * `svg` mode hard-codes a 1em box in an inline style, so the flag is wrapped in
 * a span that carries the caller's sizing classes and filled to 100%.
 */
const CategoryIcon = ({ name, className = "w-4 h-4" }: CategoryIconProps) => {
  const icon = parseCategoryIcon(name);

  if (icon.kind === "flag") {
    return (
      <span
        className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-[2px] ${className}`}
      >
        <ReactCountryFlag
          countryCode={icon.countryCode}
          svg
          alt=""
          aria-hidden
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
        />
      </span>
    );
  }

  if (icon.kind === "custom") {
    const Glyph: CategoryGlyph = CUSTOM_CATEGORY_ICONS[icon.name];
    if (Glyph) return <Glyph className={className} />;
  }

  const Icon = CATEGORY_ICONS[icon.name] ?? Heart;
  return <Icon className={className} />;
};

export default CategoryIcon;
