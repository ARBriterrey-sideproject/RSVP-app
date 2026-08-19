/**
 * The four languages, and how each is offered to the person who reads it.
 *
 * Client-safe: no next-intl imports, so a Client Component can render the
 * switcher without pulling the server config in.
 *
 * Each language is named in its own script. A guest who reads only Odia can't
 * be asked to find "Odia" in a list written in English — that's the one string
 * in the app that can never be translated, because it has to be legible before
 * the language is chosen.
 */
export const LOCALES = ["en", "hi", "kn", "or"] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

export const LOCALE_NAMES: Record<Locale, string> = {
  en: "English",
  hi: "हिन्दी",
  kn: "ಕನ್ನಡ",
  or: "ଓଡ଼ିଆ",
};

/**
 * A two-letter-equivalent abbreviation for the collapsed switcher trigger, in
 * each language's own script — hand-picked, not sliced. A naive `.slice(0, 2)`
 * on a Devanagari/Kannada/Odia string can split a base letter from its own
 * combining vowel sign or nukta mid-grapheme; these were checked against
 * `Intl.Segmenter`'s actual grapheme-cluster boundaries for each name above.
 * "or" additionally trims the vowel sign off the second cluster, which is
 * still a well-formed standalone akshara on its own, not a broken half-glyph.
 */
export const LOCALE_SHORT: Record<Locale, string> = {
  en: "EN",
  hi: "हि",
  kn: "ಕನ್",
  or: "ଓଡ଼",
};

/**
 * The `lang` attribute and the BCP-47 tag used for date and number formatting.
 * `en-IN` rather than `en-US` on purpose: the wedding is in Odisha, so a date
 * should format as 28/12/2026, not 12/28/2026.
 */
export const LOCALE_TAGS: Record<Locale, string> = {
  en: "en-IN",
  hi: "hi-IN",
  kn: "kn-IN",
  or: "or-IN",
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/**
 * Picks the best supported language from an Accept-Language header.
 *
 * Deliberately simple — matching only the primary subtag, so `hi-IN`, `hi` and
 * `hi-Latn` all land on Hindi. A guest can always override with the switcher,
 * and the cookie then wins forever, so the cost of a wrong guess is one tap.
 */
export function matchLocale(acceptLanguage: string | null): Locale {
  if (!acceptLanguage) return DEFAULT_LOCALE;

  const ranked = acceptLanguage
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params
        .map((p) => p.trim())
        .find((p) => p.startsWith("q="))
        ?.slice(2);
      return { tag: tag.toLowerCase(), q: q === undefined ? 1 : Number(q) || 0 };
    })
    .sort((a, b) => b.q - a.q);

  for (const { tag } of ranked) {
    const primary = tag.split("-")[0];
    if (isLocale(primary)) return primary;
  }
  return DEFAULT_LOCALE;
}
