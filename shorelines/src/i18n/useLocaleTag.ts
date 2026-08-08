"use client";

import { useLocale } from "next-intl";
import { DEFAULT_LOCALE, LOCALE_TAGS, isLocale } from "./locales";

/**
 * The BCP-47 tag the `Intl` formatters in `content/wedding.ts` want.
 *
 * Those helpers all default to `en-IN`, which is the right fallback and the
 * wrong thing to leave in place: a Hindi guest reading "Mon, 28 December" under
 * an otherwise Hindi screen looks like a half-finished translation. Every
 * client component that formats a date or a time needs this.
 *
 * The server-side twin is the `localeTag()` helper in InviteLanding — it can't
 * be shared, because `getLocale()` is async and a hook can't be.
 */
export function useLocaleTag(): string {
  const locale = useLocale();
  return LOCALE_TAGS[isLocale(locale) ? locale : DEFAULT_LOCALE];
}
