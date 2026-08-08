import { getRequestConfig } from "next-intl/server";
import { getUserLocale } from "./locale";

/**
 * Read on every request by the next-intl plugin (wired in next.config.ts).
 *
 * There is no `requestLocale` to read because we don't use a `[locale]` route
 * segment — see the note in locale.ts for why.
 */
export default getRequestConfig(async () => {
  const locale = await getUserLocale();

  return {
    locale,

    // Asia/Kolkata everywhere, deliberately. A countdown to the muhurat has to
    // read the same to a guest in London as to one in Bhubaneswar — it counts
    // down to a moment in Odisha, not to a local wall-clock time.
    timeZone: "Asia/Kolkata",

    /**
     * Editing a catalogue does NOT hot-reload — this dynamic import stays
     * resolved to the module cached when the dev server booted, so the page
     * keeps rendering the old strings (or bare key paths, if the key is new)
     * with nothing in the console to explain it. Restart `npm run dev`.
     * Moving the directory under `src/` was tried and changes nothing.
     */
    messages: (await import(`../../messages/${locale}.json`)).default,

    /**
     * A missing key renders the key path rather than throwing. Three of the
     * four catalogues are awaiting native review, so a gap is plausible — and
     * an invite that renders "days.title" is recoverable, while one that
     * renders an error screen is not.
     */
    onError(error) {
      if (process.env.NODE_ENV !== "production") {
        console.warn(`[i18n] ${error.message}`);
      }
    },
    getMessageFallback({ namespace, key }) {
      return [namespace, key].filter(Boolean).join(".");
    },
  };
});
