"use server";

import { cookies, headers } from "next/headers";
import {
  DEFAULT_LOCALE,
  isLocale,
  matchLocale,
  type Locale,
} from "./locales";

/**
 * Where the chosen language lives.
 *
 * A cookie rather than a URL segment, because the invite is one link the couple
 * pastes into WhatsApp — `/?tier=f` and `/i/ABC123` have to stay exactly that.
 * A `/[locale]` segment would put the sender's language into every forwarded
 * link, so a guest who picked Odia would hand an Odia link to a cousin who
 * reads Kannada. With a cookie, everyone gets their own.
 *
 * The trade-off is that pages can't be statically rendered per locale. That
 * costs nothing here: every screen is already dynamic (Firebase, tier param).
 */
const COOKIE = "shorelines_locale";

/** A year — this is a preference, not a session. */
const MAX_AGE = 60 * 60 * 24 * 365;

export async function getUserLocale(): Promise<Locale> {
  const stored = (await cookies()).get(COOKIE)?.value;
  if (isLocale(stored)) return stored;

  // No choice made yet: guess from the browser, and don't persist the guess.
  // Writing it here would freeze a wrong guess in place, and cookies can't be
  // set during a render anyway.
  const accept = (await headers()).get("accept-language");
  return matchLocale(accept);
}

export async function setUserLocale(locale: Locale): Promise<void> {
  if (!isLocale(locale)) return; // a Server Action is a public endpoint
  (await cookies()).set(COOKIE, locale, {
    maxAge: MAX_AGE,
    sameSite: "lax",
    path: "/",
  });
}

export async function getDefaultLocale(): Promise<Locale> {
  return DEFAULT_LOCALE;
}
