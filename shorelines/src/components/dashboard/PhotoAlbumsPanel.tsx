"use client";

/**
 * Per-event visibility toggle plus a grid of what's been uploaded so far.
 * Visibility has no guest-facing effect yet — no gallery ships this round
 * (see the plan's "upload-only this round" scope note) — it only exists so a
 * later gallery viewer doesn't need a migration. `manageAlbums` is admin-only.
 *
 * A coordinator can also land here with `canManage={false}` — the couple
 * granted them individual photo-view access (see setStaffPhotoAccess). The
 * toggle/delete buttons are hidden for them: `setAlbumVisibility` and
 * `deletePhoto` are already refused server-side for anyone below admin/couple
 * rank, so this is purely to not show a control that would just fail.
 */

import { useEffect, useState } from "react";
import type { EventId, WeddingConfig } from "@/content/schema";
import {
  deletePhoto,
  listAlbumSettings,
  listEventPhotos,
  setAlbumVisibility,
  type AlbumSetting,
  type AlbumVisibility,
  type EventPhoto,
} from "@/lib/firebase/photos";
import { PanelNote } from "./panelKit";

function eventName(eventId: EventId, config: WeddingConfig): string {
  return config.events.find((event) => event.id === eventId)?.name ?? eventId;
}

function EventAlbum({
  eventId,
  label,
  visibility,
  onToggle,
  canManage,
}: {
  eventId: EventId;
  label: string;
  visibility: AlbumVisibility;
  onToggle: (next: AlbumVisibility) => Promise<void>;
  canManage: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [photos, setPhotos] = useState<EventPhoto[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [toggling, setToggling] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    if (!open || photos !== null) return;
    listEventPhotos(eventId)
      .then(setPhotos)
      .catch((cause) =>
        setLoadError(cause instanceof Error ? cause.message : "Couldn't load photos.")
      );
  }, [open, photos, eventId]);

  async function handleToggle() {
    if (toggling) return;
    setToggling(true);
    try {
      await onToggle(visibility === "shared" ? "private" : "shared");
    } finally {
      setToggling(false);
    }
  }

  async function handleDelete(photo: EventPhoto) {
    setDeleting(photo.fullPath);
    try {
      await deletePhoto(photo.fullPath);
      setPhotos((current) =>
        current ? current.filter((p) => p.fullPath !== photo.fullPath) : current
      );
    } catch {
      // Leaves the photo in the grid; the button stays enabled to retry.
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="rounded-card bg-white p-3.5 ring-1 ring-hairline/50">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="font-sans text-[13.5px] font-medium leading-snug text-driftwood"
        >
          {label}
        </button>
        {canManage ? (
          <button
            type="button"
            disabled={toggling}
            onClick={() => void handleToggle()}
            className={`shrink-0 rounded-pill px-3.5 py-1.5 font-sans text-[12px] font-medium transition-colors disabled:opacity-40 ${
              visibility === "shared"
                ? "bg-deeptide text-foam"
                : "border border-deeptide/30 text-deeptide"
            }`}
          >
            {visibility === "shared" ? "Shared" : "Private"}
          </button>
        ) : (
          <span
            className={`shrink-0 rounded-pill px-3.5 py-1.5 font-sans text-[12px] font-medium ${
              visibility === "shared"
                ? "bg-deeptide text-foam"
                : "border border-deeptide/30 text-deeptide"
            }`}
          >
            {visibility === "shared" ? "Shared" : "Private"}
          </span>
        )}
      </div>

      {open ? (
        loadError ? (
          <p className="mt-3 font-sans text-[12.5px] text-coral-ink">{loadError}</p>
        ) : photos === null ? (
          <p className="mt-3 font-sans text-[12.5px] text-driftwood-faint">
            Loading photos…
          </p>
        ) : photos.length === 0 ? (
          <p className="mt-3 font-sans text-[12.5px] text-driftwood-faint">
            No uploads yet.
          </p>
        ) : (
          <div className="mt-3 grid grid-cols-3 gap-2">
            {photos.map((photo) => (
              <div key={photo.fullPath} className="group relative aspect-square">
                <a href={photo.url} target="_blank" rel="noreferrer">
                  <img
                    src={photo.url}
                    alt=""
                    className="h-full w-full rounded-md object-cover"
                  />
                </a>
                {canManage ? (
                  <button
                    type="button"
                    disabled={deleting === photo.fullPath}
                    onClick={() => void handleDelete(photo)}
                    className="absolute right-1 top-1 rounded-full bg-driftwood/70 px-1.5 py-0.5 font-sans text-[10px] text-foam disabled:opacity-40"
                  >
                    ×
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        )
      ) : null}
    </div>
  );
}

export function PhotoAlbumsPanel({
  config,
  canManage,
}: {
  config: WeddingConfig;
  canManage: boolean;
}) {
  const [settings, setSettings] = useState<AlbumSetting[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listAlbumSettings()
      .then((loaded) => {
        if (!cancelled) setSettings(loaded);
      })
      .catch((cause) => {
        if (!cancelled) {
          setLoadError(cause instanceof Error ? cause.message : "Couldn't load albums.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleToggle(eventId: EventId, next: AlbumVisibility) {
    const result = await setAlbumVisibility(eventId, next);
    setSettings((current) => {
      const rest = (current ?? []).filter((s) => s.eventId !== eventId);
      return [
        ...rest,
        { eventId, visibility: result.visibility, updatedAt: null, updatedBy: null },
      ];
    });
  }


  return (
    <div className="mt-3">
      <PanelNote>
        {canManage
          ? "Toggling an album to shared has no guest-facing effect yet — it just primes a future gallery viewer."
          : "You have view access to these uploads. Only an admin can toggle visibility or remove a photo."}
      </PanelNote>

      {loadError ? (
        <p className="mt-3 font-sans text-[13px] text-coral-ink">{loadError}</p>
      ) : settings === null ? (
        <p className="mt-4 font-sans text-[13px] text-driftwood-faint">
          Loading albums…
        </p>
      ) : (
        <div className="mt-4 flex flex-col gap-2">
          {config.events.map((event) => (
            <EventAlbum
              key={event.id}
              eventId={event.id}
              label={eventName(event.id, config)}
              visibility={
                settings.find((s) => s.eventId === event.id)?.visibility ?? "private"
              }
              onToggle={(next) => handleToggle(event.id, next)}
              canManage={canManage}
            />
          ))}
        </div>
      )}
    </div>
  );
}
