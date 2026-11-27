"use client";

/**
 * Song requests on the Today screen.
 *
 * Replaces the old inline banner. A guest searches the iTunes catalogue (the
 * keyless Search API, via `searchTracks`) and taps a match, or falls back to
 * sending what they typed. Everything that matters — Sangeet only, one count
 * per guest per song, the 10-song cap, the cutoff — is re-checked inside
 * `submitSongRequest`'s callable; `open` and `signedIn` here only decide
 * which version of the card to draw.
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { searchTracks, type TrackHit } from "@/lib/music/itunes";
import {
  songRequestErrorKey,
  submitSongRequest,
} from "@/lib/firebase/songRequests";

const MAX_RESULTS = 8;
const DEBOUNCE_MS = 350;

type SearchStatus = "idle" | "searching" | "done" | "failed";
type Choice = { kind: "track"; hit: TrackHit } | { kind: "typed" } | null;
type Outcome = "sent" | "already" | null;

const INPUT_CLASS =
  "w-full rounded-card bg-card px-3.5 py-2.5 font-sans text-[14px] text-driftwood outline-none placeholder:text-driftwood-faint focus-visible:ring-2 focus-visible:ring-deeptide/40";

function Artwork({ url, size }: { url: string; size: number }) {
  const box = { width: size, height: size };
  if (!url) {
    return (
      <span
        aria-hidden="true"
        style={box}
        className="flex-none rounded-[10px] bg-driftwood/10"
      />
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- remote mzstatic hot-link; no next/image domain config, and 48px thumbnails gain nothing from optimisation
    <img
      src={url}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      style={box}
      className="flex-none rounded-[10px] bg-driftwood/10 object-cover"
    />
  );
}

export function SongRequestCard({
  open,
  overrideActive,
  signedIn,
}: {
  /** The cutoff (or the admin override) already folded in by the caller. */
  open: boolean;
  /** The override is what's keeping requests open past the normal cutoff. */
  overrideActive: boolean;
  signedIn: boolean;
}) {
  const t = useTranslations("today");

  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<TrackHit[]>([]);
  const [status, setStatus] = useState<SearchStatus>("idle");
  const [choice, setChoice] = useState<Choice>(null);
  const [artist, setArtist] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome>(null);

  const trimmed = query.trim();
  const searchable = expanded && choice === null && outcome === null;

  // Debounced search. Every state write happens inside the timer / promise
  // callbacks, never synchronously in the effect body; `onQueryChange` sets
  // the immediate "searching" state so the list doesn't look stale.
  useEffect(() => {
    if (!searchable || trimmed.length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setStatus("searching");
      searchTracks(trimmed, controller.signal)
        .then((hits) => {
          if (controller.signal.aborted) return;
          setResults(hits.slice(0, MAX_RESULTS));
          setStatus("done");
        })
        .catch(() => {
          if (controller.signal.aborted) return;
          setResults([]);
          setStatus("failed");
        });
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [searchable, trimmed]);

  function onQueryChange(value: string) {
    setQuery(value);
    setError(null);
    if (value.trim().length < 2) {
      setResults([]);
      setStatus("idle");
    } else {
      setStatus("searching");
    }
  }

  function reset() {
    setQuery("");
    setResults([]);
    setStatus("idle");
    setChoice(null);
    setArtist("");
    setNote("");
    setError(null);
    setOutcome(null);
  }

  const submitRef = useRef(false);
  async function handleSubmit() {
    if (busy || submitRef.current) return;
    const hit = choice?.kind === "track" ? choice.hit : null;
    const title = hit ? hit.title : trimmed;
    if (!title) return;
    submitRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await submitSongRequest({
        title,
        artist: hit ? hit.artist : artist.trim() || undefined,
        note: note.trim() || undefined,
        trackId: hit?.trackId,
        album: hit?.album || undefined,
        artworkUrl: hit?.artworkUrl || undefined,
      });
      setOutcome(result.alreadyRequested ? "already" : "sent");
    } catch (cause) {
      setError(t(`songRequests.error.${songRequestErrorKey(cause)}`));
    } finally {
      submitRef.current = false;
      setBusy(false);
    }
  }

  const header = (
    <div>
      <p className="font-sans text-[9.5px] font-semibold uppercase tracking-[0.28em] text-driftwood-faint">
        {t("songRequests.title")}
      </p>
      <p className="mt-1.5 font-sans text-[13px] leading-[1.5] text-driftwood-soft">
        {t("songRequests.body")}
      </p>
      {open && overrideActive ? (
        <p className="mt-1 font-sans text-[11.5px] text-coral-ink">
          {t("songRequests.overrideNote")}
        </p>
      ) : null}
    </div>
  );

  const shell = "rounded-card border border-driftwood/[0.08] bg-foam px-5 py-4.5";

  if (!open) {
    return (
      <div className={shell}>
        {header}
        <p className="mt-2 font-sans text-[12.5px] text-driftwood-faint">
          {t("songRequests.closed")}
        </p>
      </div>
    );
  }

  if (!signedIn) {
    return (
      <div className={`${shell} flex items-center justify-between gap-3`}>
        {header}
        <Link
          href="/join"
          className="flex-none font-sans text-[11.5px] font-medium text-coral-ink"
        >
          {t("songRequests.signIn")}
        </Link>
      </div>
    );
  }

  const showingArt =
    (choice?.kind === "track" && Boolean(choice.hit.artworkUrl)) ||
    (choice === null && results.some((r) => r.artworkUrl));

  return (
    <div className={shell}>
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        {header}
        <span className="flex-none font-sans text-[11.5px] font-medium text-coral-ink">
          {t("songRequests.cta")}
        </span>
      </button>

      {expanded ? (
        <div className="mt-3.5 flex flex-col gap-2.5 border-t border-driftwood/[0.08] pt-3.5">
          {outcome ? (
            <>
              <p
                role="status"
                className={`font-sans text-[13px] ${
                  outcome === "sent" ? "text-palm" : "text-driftwood-soft"
                }`}
              >
                {outcome === "sent"
                  ? t("songRequests.sent")
                  : t("songRequests.alreadyRequested")}
              </p>
              <button
                type="button"
                onClick={reset}
                className="self-start rounded-pill border border-deeptide/40 px-4 py-2 font-sans text-[12.5px] font-medium text-deeptide"
              >
                {t("songRequests.another")}
              </button>
            </>
          ) : (
            <>
              {choice === null ? (
                <>
                  <input
                    type="search"
                    value={query}
                    onChange={(e) => onQueryChange(e.target.value)}
                    aria-label={t("songRequests.searchLabel")}
                    placeholder={t("songRequests.searchLabel")}
                    autoComplete="off"
                    className={INPUT_CLASS}
                  />

                  {trimmed.length >= 2 ? (
                    <>
                      {status === "searching" && results.length === 0 ? (
                        <p
                          role="status"
                          className="font-sans text-[12.5px] text-driftwood-faint"
                        >
                          {t("songRequests.searching")}
                        </p>
                      ) : null}
                      {status === "failed" ? (
                        <p
                          role="status"
                          className="font-sans text-[12.5px] text-driftwood-soft"
                        >
                          {t("songRequests.searchFailed")}
                        </p>
                      ) : null}
                      {status === "done" && results.length === 0 ? (
                        <p
                          role="status"
                          className="font-sans text-[12.5px] text-driftwood-soft"
                        >
                          {t("songRequests.noResults")}
                        </p>
                      ) : null}

                      {results.length > 0 ? (
                        <ul className="flex flex-col">
                          {results.map((hit) => (
                            <li
                              key={hit.trackId}
                              className="border-b border-driftwood/[0.07] last:border-b-0"
                            >
                              <button
                                type="button"
                                onClick={() => setChoice({ kind: "track", hit })}
                                className="flex w-full items-center gap-3 py-2 text-left"
                              >
                                <Artwork url={hit.artworkUrl} size={48} />
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate font-sans text-[14px] leading-[1.3] text-driftwood">
                                    {hit.title}
                                  </span>
                                  <span className="mt-0.5 block truncate font-sans text-[12px] text-driftwood-soft">
                                    {hit.album
                                      ? `${hit.artist} · ${hit.album}`
                                      : hit.artist}
                                  </span>
                                </span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      ) : null}

                      <button
                        type="button"
                        onClick={() => setChoice({ kind: "typed" })}
                        className="self-start text-left font-sans text-[12.5px] font-medium text-coral-ink"
                      >
                        {t("songRequests.asTyped", { query: trimmed })}
                      </button>
                    </>
                  ) : null}
                </>
              ) : choice.kind === "track" ? (
                <div className="flex items-center gap-3.5 rounded-card bg-card p-3">
                  <Artwork url={choice.hit.artworkUrl} size={72} />
                  <div className="min-w-0 flex-1">
                    <p className="font-sans text-[14.5px] font-medium leading-[1.3] text-driftwood">
                      {choice.hit.title}
                    </p>
                    <p className="mt-0.5 font-sans text-[12.5px] text-driftwood-soft">
                      {choice.hit.album
                        ? `${choice.hit.artist} · ${choice.hit.album}`
                        : choice.hit.artist}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setChoice(null)}
                    className="flex-none font-sans text-[11.5px] font-medium text-coral-ink"
                  >
                    {t("songRequests.change")}
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-3 rounded-card bg-card px-3.5 py-3">
                    <p className="min-w-0 flex-1 break-words font-sans text-[14px] text-driftwood">
                      {trimmed}
                    </p>
                    <button
                      type="button"
                      onClick={() => setChoice(null)}
                      className="flex-none font-sans text-[11.5px] font-medium text-coral-ink"
                    >
                      {t("songRequests.change")}
                    </button>
                  </div>
                  <input
                    value={artist}
                    onChange={(e) => setArtist(e.target.value)}
                    aria-label={t("songRequests.artistLabel")}
                    placeholder={t("songRequests.artistLabel")}
                    className={INPUT_CLASS}
                  />
                </>
              )}

              {choice !== null ? (
                <>
                  <input
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    aria-label={t("songRequests.noteLabel")}
                    placeholder={t("songRequests.noteLabel")}
                    className={INPUT_CLASS}
                  />
                  {error ? (
                    <p role="alert" className="font-sans text-[12.5px] text-coral-ink">
                      {error}
                    </p>
                  ) : null}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleSubmit()}
                    className="self-start rounded-pill bg-coral px-5 py-2.5 font-sans text-[13.5px] font-medium text-foam disabled:opacity-40"
                  >
                    {busy ? t("songRequests.submitting") : t("songRequests.submit")}
                  </button>
                </>
              ) : null}

              {showingArt ? (
                <p className="font-sans text-[10.5px] text-driftwood-faint">
                  {t("songRequests.artworkCredit")}
                </p>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
