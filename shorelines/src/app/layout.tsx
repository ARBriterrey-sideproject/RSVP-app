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
import { LOCALE_TAGS, isLocale } from "@/i18n/locales";
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

/**
 * Generated rather than static so the share preview a guest gets when they
 * forward the link is in their own language — for WhatsApp-first distribution
 * that snippet is often the first thing anyone reads.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return { title: t("title"), description: t("description") };
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
      </body>
    </html>
  );
}
