"use client";

import { useEffect, useMemo, useState } from "react";
import type { EventId, WeddingConfig, WeddingOverlay } from "@/content/schema";
import { updateWeddingLive } from "@/lib/firebase/liveConfig";
import { listSongRequests, type SongRequest } from "@/lib/firebase/songRequests";
import { useStaffAuth } from "./StaffAuthProvider";
import { PanelNote } from "./panelKit";

/**
 * Read-only queue, grouped by event — the DJ works from this screen, nobody
 * edits a request from here. The 1-hour cutoff itself is enforced server-side
 * (`submitSongRequest`); the override toggle below is the only lever staff
 * have on it, and it's admin-only even though the queue itself is visible to
 * any coordinator.
 */

function eventName(eventId: EventId, config: WeddingConfig): string {
  return config.events.find((event) => event.id === eventId)?.name ?? eventId;
}

function SongRow({ request }: { request: SongRequest }) {
  return (
    <div className="rounded-card bg-white p-3.5 ring-1 ring-hairline/50">
      <p className="font-sans text-[14px] font-medium leading-snug text-driftwood">
        {request.title}
      </p>
      {request.artist ? (
        <p className="mt-0.5 font-sans text-[12.5px] text-driftwood-soft">
          {request.artist}
        </p>
      ) : null}
      {request.note ? (
        <p className="mt-1 font-sans text-[12px] leading-snug text-driftwood-faint">
          {request.note}
        </p>
      ) : null}
    </div>
  );
}

export function SongRequestsPanel({
  config,
  overlay,
}: {
  config: WeddingConfig;
  overlay: WeddingOverlay | null;
}) {
  const { allows } = useStaffAuth();
  const canOverride = allows("overrideSongDeadline");

  const [requests, setRequests] = useState<SongRequest[] | null>(null);
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
        if (!cancelled) setRequests(loaded);
      })
      .catch((cause) => {
        if (!cancelled) {
          setLoadError(cause instanceof Error ? cause.message : "Couldn't load requests.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const grouped = useMemo(() => {
    if (!requests) return [];
    return config.events
      .map((event) => ({
        event,
        requests: requests.filter((r) => r.eventId === event.id),
      }))
      .filter((group) => group.requests.length > 0);
  }, [requests, config]);

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
        Requests close an hour before each event unless you lift it below.
      </PanelNote>

      {canOverride ? (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-card bg-white p-3.5 ring-1 ring-hairline/50">
          <div>
            <p className="font-sans text-[13.5px] font-medium leading-snug text-driftwood">
              {override ? "Cutoff lifted" : "Cutoff enforced"}
            </p>
            <p className="mt-0.5 font-sans text-[11.5px] leading-snug text-driftwood-faint">
              {override
                ? "Guests can request songs right up to any event."
                : "Requests close an hour before each event starts."}
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

      {loadError ? (
        <p className="mt-3 font-sans text-[13px] text-coral-ink">{loadError}</p>
      ) : requests === null ? (
        <p className="mt-4 font-sans text-[13px] text-driftwood-faint">Loading requests…</p>
      ) : grouped.length === 0 ? (
        <p className="mt-4 rounded-card border border-dashed border-hairline-dashed px-3.5 py-4 font-sans text-[13px] text-driftwood-faint">
          No requests yet.
        </p>
      ) : (
        <div className="mt-4 flex flex-col gap-4">
          {grouped.map(({ event, requests: eventRequests }) => (
            <div key={event.id}>
              <p className="font-sans text-[9.5px] font-semibold uppercase tracking-[0.28em] text-driftwood-faint">
                {eventName(event.id, config)} · {eventRequests.length}
              </p>
              <div className="mt-2 flex flex-col gap-2">
                {eventRequests.map((request) => (
                  <SongRow key={request.id} request={request} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
