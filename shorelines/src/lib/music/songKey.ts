/**
 * Song identity for de-duplicating DJ requests.
 *
 * DUPLICATED VERBATIM in functions/src/index.ts (`normaliseSongText` /
 * `songKey`) — Cloud Functions can't import from src/. Keep the two in sync,
 * same pattern as `normaliseDietary`. The server computes the key itself and
 * never trusts one sent by the client; this copy exists so the browser can
 * show "someone already asked for this" and so old docs lacking a `songKey`
 * can be keyed on read.
 *
 * Why not iTunes' `trackId`: the same recording is listed under several ids
 * (the film soundtrack, then each compilation it was reissued on). Title +
 * first artist, normalised, collapses those.
 */

/** Fold case and Latin diacritics only — Indic combining marks are meaningful and must survive. */
function fold(s: string): string {
  return s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Punctuation to spaces, whitespace collapsed. \p{M} kept so Devanagari/Odia/Kannada vowel signs survive. */
function squash(s: string): string {
  return s
    .replace(/[^\p{L}\p{N}\p{M}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Title-ish text: drops "(From "Film")" / "[Remix]" segments, a trailing
 * " - Trending Version" style suffix and any "feat./ft." clause.
 */
export function normaliseSongText(s: string): string {
  let t = fold(s);
  t = t.replace(/\([^)]*\)|\[[^\]]*\]/g, " ");
  t = t.replace(/\s[-–—]\s.*$/, " ");
  t = t.replace(/\s(?:feat|ft)\b.*$/, " ");
  return squash(t);
}

/** First credited artist only: "A, B & C" and "A feat. B" both become "A". */
function firstArtist(artist: string): string {
  const t = fold(artist);
  const first = t.split(/\s*,\s*|\s*&\s*|\s+x\s+|\s+feat\b|\s+ft\b|\s+and\s+/)[0] ?? "";
  return squash(first.replace(/\([^)]*\)|\[[^\]]*\]/g, " "));
}

export function songKey(title: string, artist: string): string {
  return `${normaliseSongText(title)}|${firstArtist(artist ?? "")}`;
}
