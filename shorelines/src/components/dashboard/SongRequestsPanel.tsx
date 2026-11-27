"use client";

import { useEffect, useMemo, useState } from "react";
import type { WeddingConfig, WeddingOverlay } from "@/content/schema";
import { updateWeddingLive } from "@/lib/firebase/liveConfig";
import {
  listSongRequests,
  type SongRequestRecord,
} from "@/lib/firebase/songRequests";
import { useStaffAuth } from "./StaffAuthProvider";
import { PanelNote } from "./panelKit";

/**
 * The DJ's view: one row per song, however many guests asked for it. Requests
 * are grouped by `songKey` (a normalised title + artist, written server-side),
 * so "Tum Hi Ho" typed three ways is still one row with a count of distinct
 * guests. Read-only — nobody edits a request from here. The cutoff itself is
 * enforced server-side (`submitSongRequest`); the override toggle below is the
 * only lever staff have on it, and it's admin-only even though the queue is
 * visible to any coordinator.
 */

interface SongGroup {
  key: string;
  title: string;
  artist: string;
  album: string | null;
  artworkUrl: string | null;
  matched: boolean;
  /** Distinct guests (ownerUid), not documents. */
  count: number;
  latest: Date | null;
  notes: { note: string; at: Date | null }[];
}

function groupBySong(requests: SongRequestRecord[]): SongGroup[] {
  const byKey = new Map<string, { group: SongGroup; owners: Set<string> }>();
  // Newest first, so the first record seen for a song supplies its display text.
  const sorted = [...requests].sort(
    (a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0)
  );
  for (const r of sorted) {
    const key = r.songKey || `${r.title}|${r.artist}`.toLowerCase();
    let entry = byKey.get(key);
    if (!entry) {
      entry = {
        owners: new Set(),
        group: {
          key,
          title: r.title,
          artist: r.artist,
          album: r.album,
          artworkUrl: r.artworkUrl,
          matched: r.matched,
          count: 0,
          latest: r.createdAt,
          notes: [],
        },
      };
      byKey.set(key, entry);
    }
    const { group, owners } = entry;
    owners.add(r.ownerUid);
    group.count = owners.size;
    if (!group.artworkUrl && r.artworkUrl) group.artworkUrl = r.artworkUrl;
    if (r.matched) group.matched = true;
    if (r.note) group.notes.push({ note: r.note, at: r.createdAt });
  }
  return [...byKey.values()]
    .map((e) => e.group)
    .sort(
      (a, b) =>
        b.count - a.count || (b.latest?.getTime() ?? 0) - (a.latest?.getTime() ?? 0)
    );
}

function formatWhen(date: Date | null): string {
  if (!date) return "";
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function SongRow({ group }: { group: SongGroup }) {
  const [showNotes, setShowNotes] = useState(false);
  return (
    <div className="rounded-card bg-white p-3.5 ring-1 ring-hairline/50">
      <div className="flex items-center gap-3">
        {group.artworkUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- remote mzstatic hot-link; no next/image domain config
          <img
            src={group.artworkUrl}
            alt=""
            width={48}
            height={48}
            loading="lazy"
            className="size-12 flex-none rounded-[10px] bg-driftwood/10 object-cover"
          />
        ) : (
          <span
            aria-hidden="true"
            className="flex size-12 flex-none items-center justify-center rounded-[10px] bg-driftwood/10 font-sans text-[18px] text-driftwood-faint"
          >
            ♪
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="font-sans text-[14px] font-medium leading-snug text-driftwood">
            {group.title}
          </p>
          {group.artist ? (
            <p className="mt-0.5 font-sans text-[12.5px] text-driftwood-soft">
              {group.artist}
            </p>
          ) : null}
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 font-sans text-[11.5px] text-driftwood-faint">
            {!group.matched ? (
              <span className="rounded-pill bg-driftwood/10 px-2 py-0.5 text-[10.5px] font-medium text-driftwood-soft">
                No match
              </span>
            ) : null}
            {group.latest ? <span>Last asked {formatWhen(group.latest)}</span> : null}
          </p>
        </div>
        <span
          aria-label={`${group.count} ${group.count === 1 ? "guest" : "guests"}`}
          className="flex-none rounded-pill bg-coral px-2.5 py-1 font-sans text-[12.5px] font-semibold text-foam"
        >
          ×{group.count}
        </span>
      </div>
      {group.notes.length > 0 ? (
        <div className="mt-2.5">
          <button
            type="button"
            aria-expanded={showNotes}
            onClick={() => setShowNotes((v) => !v)}
            className="font-sans text-[12px] font-medium text-coral-ink"
          >
            {showNotes ? "Hide" : "Show"} {group.notes.length}{" "}
            {group.notes.length === 1 ? "note" : "notes"}
          </button>
          {showNotes ? (
            <ul className="mt-1.5 flex flex-col gap-1.5">
              {group.notes.map((n, i) => (
                <li
                  key={i}
                  className="font-sans text-[12px] leading-snug text-driftwood-soft"
                >
                  {n.note}
                  {n.at ? (
                    <span className="text-driftwood-faint"> · {formatWhen(n.at)}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function SongRequestsPanel({
  overlay,
}: {
  config: WeddingConfig;
  overlay: WeddingOverlay | null;
}) {
  const { allows } = useStaffAuth();
  const canOverride = allows("overrideSongDeadline");

  const [requests, setRequests] = useState<SongRequestRecord[] | null>(null);
  const [reloadTick, setReloadTick] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const overlayOverride = overlay?.songRequestsOverride === true;
  const [override, setOverride] = useState(overlayOverride);
  const [syncedOverride, setSyncedOverride] = useState(overlayOverride);
  const [toggling, setToggling] = useState(false);
  const [toggleError, setToggleError] = useState<string | null>(null);

  // Adjust local override state during render when the overlay's value
  // changes underneath us (React's documented alternative to a sync effect).
  if (overlayOverride !== syncedOverride) {
    setSyncedOverride(overlayOverride);
    setOverride(overlayOverride);
  }

  useEffect(() => {
    let cancelled = false;
    listSongRequests()
      .then((loaded) => {
        if (cancelled) return;
        setRequests(loaded);
        setLoadError(null);
      })
      .catch((cause) => {
        if (!cancelled) {
          setLoadError(cause instanceof Error ? cause.message : "Couldn't load requests.");
        }
      })
      .finally(() => {
        if (!cancelled) setRefreshing(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadTick]);

  const songs = useMemo(() => (requests ? groupBySong(requests) : []), [requests]);

  async function toggleOverride() {
    if (toggling) return;
    setToggling(true);
    setToggleError(null);
    const next = !override;
    try {
      await updateWeddingLive({ songRequestsOverride: next });
      setOverride(next);
    } catch (cause) {
      setToggleError(cause instanceof Error ? cause.message : "That didn't save.");
    } finally {
      setToggling(false);
    }
  }

  return (
    <div className="mt-3">
      <PanelNote>
        Requests are for the Sangeet and close an hour before it starts unless you lift it below.
      </PanelNote>

      {canOverride ? (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-card bg-white p-3.5 ring-1 ring-hairline/50">
          <div>
            <p className="font-sans text-[13.5px] font-medium leading-snug text-driftwood">
              {override ? "Cutoff lifted" : "Cutoff enforced"}
            </p>
            <p className="mt-0.5 font-sans text-[11.5px] leading-snug text-driftwood-faint">
              {override
                ? "Guests can request songs right up to the Sangeet."
                : "Requests close an hour before the Sangeet starts."}
            </p>
          </div>
          <button
            type="button"
            disabled={toggling}
            onClick={() => void toggleOverride()}
            className="shrink-0 rounded-pill bg-coral px-4 py-2 font-sans text-[13px] font-medium text-foam transition-colors hover:bg-coral-deep disabled:opacity-40"
          >
            {toggling ? "Saving…" : override ? "Restore cutoff" : "Lift cutoff"}
          </button>
        </div>
      ) : null}
      {toggleError ? (
        <p className="mt-2 font-sans text-[13px] text-coral-ink">{toggleError}</p>
      ) : null}

      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="font-sans text-[9.5px] font-semibold uppercase tracking-[0.28em] text-driftwood-faint">
          {requests
            ? `${songs.length} ${songs.length === 1 ? "song" : "songs"} · ${requests.length} ${requests.length === 1 ? "request" : "requests"}`
            : "Requests"}
        </p>
        <button
          type="button"
          disabled={refreshing}
          onClick={() => {
            setRefreshing(true);
            setReloadTick((n) => n + 1);
          }}
          className="font-sans text-[12px] font-medium text-coral-ink disabled:opacity-40"
        >
          {refreshing ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {loadError ? (
        <p className="mt-3 font-sans text-[13px] text-coral-ink">{loadError}</p>
      ) : requests === null ? (
        <p className="mt-3 font-sans text-[13px] text-driftwood-faint">Loading requests…</p>
      ) : songs.length === 0 ? (
        <p className="mt-3 rounded-card border border-dashed border-hairline-dashed px-3.5 py-4 font-sans text-[13px] text-driftwood-faint">
          No requests yet.
        </p>
      ) : (
        <div className="mt-3 flex flex-col gap-2">
          {songs.map((group) => (
            <SongRow key={group.key} group={group} />
          ))}
        </div>
      )}
    </div>
  );
}
