import { songKey } from "./songKey";

export interface TrackHit {
  trackId: number;
  title: string;
  artist: string;
  album: string;
  artworkUrl: string;
  songKey: string;
}

const MAX_RESULTS = 8;

/**
 * Client-only song search against the iTunes Search API.
 *
 * Called from the browser on purpose, never through our server: Apple limits
 * by IP (~20 requests a minute), and a guest's phone has its own budget,
 * whereas a Cloud Function's shared egress IPs would pool every guest into
 * one bucket and start drawing 403s. CORS is open, so no proxy is needed.
 *
 * Artwork is hot-linked from Apple's mzstatic CDN only — we never copy or
 * re-host the images. The server accepts an `artworkUrl` only if it is an
 * https `*.mzstatic.com` URL.
 *
 * iTunes lists one recording under many trackIds (film + compilations), so
 * results are de-duplicated by `songKey`, keeping the first (best-ranked).
 */
export async function searchTracks(
  query: string,
  signal?: AbortSignal
): Promise<TrackHit[]> {
  const term = query.trim();
  if (term.length < 2) return [];

  const url =
    "https://itunes.apple.com/search?term=" +
    encodeURIComponent(term) +
    "&entity=song&country=IN&limit=15";
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`iTunes search failed (${res.status})`);

  const json = (await res.json()) as {
    results?: Array<{
      trackId?: number;
      trackName?: string;
      artistName?: string;
      collectionName?: string;
      artworkUrl100?: string;
    }>;
  };

  const seen = new Set<string>();
  const hits: TrackHit[] = [];
  for (const r of json.results ?? []) {
    if (typeof r.trackId !== "number" || !r.trackName) continue;
    const artist = r.artistName ?? "";
    const key = songKey(r.trackName, artist);
    if (seen.has(key)) continue;
    seen.add(key);
    hits.push({
      trackId: r.trackId,
      title: r.trackName,
      artist,
      album: r.collectionName ?? "",
      artworkUrl: (r.artworkUrl100 ?? "").replace("100x100bb", "200x200bb"),
      songKey: key,
    });
    if (hits.length >= MAX_RESULTS) break;
  }
  return hits;
}
