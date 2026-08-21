import type { Metadata, Viewport } from "next";
import {
  Parisienne,
  Cormorant_Garamond,
  Jost,
  Noto_Sans_Devanagari,
  Noto_Sans_Kannada,
  Noto_Sans_Oriya,
} from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { COUPLE } from "@/content/wedding";
import { LOCALE_TAGS, isLocale } from "@/i18n/locales";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import "./globals.css";

const parisienne = Parisienne({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-parisienne",
  display: "swap",
});

const cormorant = Cormorant_Garamond({
  weight: ["300", "400", "500", "600"],
  subsets: ["latin"],
  variable: "--font-cormorant",
  display: "swap",
});

const jost = Jost({
  subsets: ["latin"],
  variable: "--font-jost",
  display: "swap",
});

/**
 * Parisienne, Cormorant and Jost are Latin-only — they have no Devanagari,
 * Kannada or Odia glyphs at all. Without these, three of the four languages
 * fall back to whatever the OS picks, which on a mid-range Android is often a
 * mismatched weight beside the Latin numerals in the same line.
 *
 * Loaded for every locale rather than conditionally: `next/font` needs a static
 * call, and a font is only fetched when a glyph actually needs it.
 */
const notoDevanagari = Noto_Sans_Devanagari({
  subsets: ["devanagari"],
  variable: "--font-indic-hi",
  display: "swap",
});

const notoKannada = Noto_Sans_Kannada({
  subsets: ["kannada"],
  variable: "--font-indic-kn",
  display: "swap",
});

const notoOriya = Noto_Sans_Oriya({
  subsets: ["oriya"],
  variable: "--font-indic-or",
  display: "swap",
});

const SITE_URL = "https://amrutashubham.com";

/**
 * Generated rather than static so the share preview a guest gets when they
 * forward the link is in their own language — for WhatsApp-first distribution
 * that snippet is often the first thing anyone reads.
 *
 * The title is built from the couple's names, not `APP_NAME` — "Shorelines"
 * is this build's internal project name, not something a guest or a search
 * result should show. Names are proper nouns and stay untranslated in all
 * four languages, same reasoning as `APP_NAME` used to get. It comes from the
 * config so a different couple's build retitles every tab without touching a
 * catalogue.
 *
 * `metadataBase` + explicit `robots`/`openGraph` exist because the bare
 * domain had nothing for a crawler to key off before this — just the
 * internal project name and a two-line tagline — which is why Google's first
 * pass rendered it as a generic parked-domain snippet.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  const title = `${COUPLE.partnerB} & ${COUPLE.partnerA}'s Wedding`;
  const description = t("description");

  return {
    metadataBase: new URL(SITE_URL),
    title,
    description,
    robots: { index: true, follow: true },
    alternates: { canonical: "/" },
    openGraph: {
      title,
      description,
      url: "/",
      siteName: title,
      type: "website",
    },
    twitter: {
      card: "summary",
      title,
      description,
    },
  };
}

export const viewport: Viewport = {
  themeColor: "#1f6f73",
  // The RSVP is a fixed-height app shell, so it has to extend under the
  // notch and home indicator rather than letterboxing inside them.
  viewportFit: "cover",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const locale = await getLocale();
  const lang = isLocale(locale) ? LOCALE_TAGS[locale] : "en-IN";

  return (
    <html
      lang={lang}
      className={[
        parisienne.variable,
        cormorant.variable,
        jost.variable,
        notoDevanagari.variable,
        notoKannada.variable,
        notoOriya.variable,
        "h-full",
      ].join(" ")}
    >
      {/* overscroll-none stops the rubber-band bounce revealing white behind
          the sand background on iOS, which reads as a broken app shell. */}
      <body className="h-full overscroll-none font-sans">
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
