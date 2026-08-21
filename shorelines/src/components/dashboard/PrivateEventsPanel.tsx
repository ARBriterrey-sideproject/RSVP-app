"use client";

import { useEffect, useMemo, useState } from "react";
import type { PrivateEvent } from "@/content/schema";
import { getWeddingConfig } from "@/content/wedding";
import {
  deletePrivateEvent,
  listPrivateEvents,
  savePrivateEvent,
  setPrivateEventInvite,
} from "@/lib/firebase/privateEvents";
import { leadName, listRsvps, type RsvpRecord } from "@/lib/firebase/rsvps";
import { joinInstant, splitInstant } from "@/lib/wedding/instant";
import { Field, PanelNote, SaveBar } from "./panelKit";

/**
 * PRIVATE EVENTS — the couple's own guest list, for a gathering nobody else
 * hears about.
 *
 * This is the only screen anywhere that can create one or name a guest for it.
 * A private event carries no tier and no link: `getMyPrivateEvents` is the only
 * path a guest has to one, and it answers from `invitedPrivateEventIds` on that
 * guest's own reply. Taking someone off the list here removes it from their
 * schedule; deleting the event removes it from everyone's at once.
 *
 * There is no RSVP. The couple has already decided who is coming — the app's
 * job is to tell those guests where and when, not to ask them again — so the
 * guest side of this is a reveal, and there is no acceptance to report back.
 *
 * The offset rule from lib/wedding/instant.ts applies here exactly as it does on
 * the Schedule panel: an existing event's offset is carried across from the
 * value being edited, and a brand-new one borrows the wedding's own rather than
 * the browser's, so a couple booking a late dinner from an airport lounge in
 * another country doesn't write it in that country's time.
 */

interface Draft {
  name: string;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  venue: string;
  mapsQuery: string;
  dressCode: string;
  note: string;
}

/** The wedding's own offset, for an event that has no previous value to take one from. */
function weddingOffset(): string {
  const first = getWeddingConfig().events[0];
  return (first && splitInstant(first.startsAt)?.offset) || "+05:30";
}

function blankDraft(): Draft {
  return {
    name: "",
    startDate: "",
    startTime: "",
    endDate: "",
    endTime: "",
    venue: "",
    mapsQuery: "",
    dressCode: "",
    note: "",
  };
}

function draftOf(event: PrivateEvent): Draft {
  const start = splitInstant(event.startsAt);
  const end = splitInstant(event.endsAt);
  return {
    name: event.name,
    startDate: start?.date ?? "",
    startTime: start?.time ?? "",
    endDate: end?.date ?? start?.date ?? "",
    endTime: end?.time ?? start?.time ?? "",
    venue: event.venue,
    mapsQuery: event.mapsQuery,
    dressCode: event.dressCode,
    note: event.note,
  };
}

export function PrivateEventsPanel() {
  const [events, setEvents] = useState<PrivateEvent[] | null>(null);
  const [records, setRecords] = useState<RsvpRecord[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /** Which event's form is open — an id, or "new" for the one being added. */
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(blankDraft);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  /** Which event's guest list is open, and who is mid-toggle inside it. */
  const [guestsFor, setGuestsFor] = useState<string | null>(null);
  const [busyUid, setBusyUid] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const [loadedEvents, loadedRecords] = await Promise.all([
          listPrivateEvents(),
          listRsvps(),
        ]);
        setEvents(loadedEvents);
        setRecords(loadedRecords);
      } catch (cause) {
        setError(messageOf(cause, "Couldn't load your private events."));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    if (!records) return [];
    const needle = filter.trim().toLowerCase();
    if (!needle) return records;
    return records.filter((record) =>
      leadName(record).toLowerCase().includes(needle)
    );
  }, [records, filter]);

  function openForm(event: PrivateEvent | null) {
    setEditing(event ? event.id : "new");
    setDraft(event ? draftOf(event) : blankDraft());
    setGuestsFor(null);
    setError(null);
    setSaved(false);
  }

  function edit(patch: Partial<Draft>) {
    setSaved(false);
    setError(null);
    setDraft((current) => ({ ...current, ...patch }));
  }

  async function save() {
    if (!editing) return;

    const existing = events?.find((event) => event.id === editing) ?? null;
    const offset =
      (existing && splitInstant(existing.startsAt)?.offset) || weddingOffset();
    const startsAt = joinInstant({
      date: draft.startDate,
      time: draft.startTime,
      offset,
    });
    const endsAt = joinInstant({
      date: draft.endDate,
      time: draft.endTime,
      offset,
    });

    const complaint = firstInvalid(draft, startsAt, endsAt);
    if (complaint) {
      setError(complaint);
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const id = await savePrivateEvent({
        ...(existing ? { id: existing.id } : {}),
        name: draft.name.trim(),
        startsAt,
        endsAt,
        venue: draft.venue.trim(),
        mapsQuery: draft.mapsQuery.trim(),
        dressCode: draft.dressCode.trim(),
        note: draft.note.trim(),
      });
      const next: PrivateEvent = {
        id,
        name: draft.name.trim(),
        startsAt,
        endsAt,
        venue: draft.venue.trim(),
        mapsQuery: draft.mapsQuery.trim(),
        dressCode: draft.dressCode.trim(),
        note: draft.note.trim(),
      };
      setEvents((current) => {
        const rest = (current ?? []).filter((event) => event.id !== id);
        return [...rest, next].sort((a, b) =>
          a.startsAt.localeCompare(b.startsAt)
        );
      });
      setEditing(null);
      setSaved(true);
    } catch (cause) {
      setError(messageOf(cause, "That didn't save."));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    setError(null);
    try {
      const revoked = await deletePrivateEvent(id);
      setEvents((current) => (current ?? []).filter((event) => event.id !== id));
      setRecords((current) =>
        (current ?? []).map((record) => ({
          ...record,
          invitedPrivateEventIds: record.invitedPrivateEventIds.filter(
            (eventId) => eventId !== id
          ),
        }))
      );
      setConfirmDelete(null);
      if (editing === id) setEditing(null);
      if (guestsFor === id) setGuestsFor(null);
      if (revoked > 0) {
        setError(
          `Deleted. ${revoked} ${revoked === 1 ? "guest" : "guests"} no longer ` +
            "see it on their schedule."
        );
      }
    } catch (cause) {
      setError(messageOf(cause, "That didn't delete."));
    } finally {
      setBusy(false);
    }
  }

  async function toggleGuest(eventId: string, record: RsvpRecord) {
    const invited = !record.invitedPrivateEventIds.includes(eventId);
    setBusyUid(record.ownerUid);
    setError(null);
    try {
      await setPrivateEventInvite(eventId, record.ownerUid, invited);
      setRecords((current) =>
        (current ?? []).map((entry) =>
          entry.ownerUid === record.ownerUid
            ? {
                ...entry,
                invitedPrivateEventIds: invited
                  ? [...entry.invitedPrivateEventIds, eventId]
                  : entry.invitedPrivateEventIds.filter((id) => id !== eventId),
              }
            : entry
        )
      );
    } catch (cause) {
      setError(messageOf(cause, "That didn't save."));
    } finally {
      setBusyUid(null);
    }
  }

  if (loading) {
    return (
      <p className="mt-3 font-sans text-[13px] text-driftwood-faint">
        Loading…
      </p>
    );
  }

  return (
    <div className="mt-3">
      <PanelNote>
        A private event reaches a guest only if you name them here — no tier and
        no link ever shows one on its own. There is nothing for them to reply to;
        it simply appears at the bottom of their schedule.
      </PanelNote>

      {error ? (
        <p className="mt-3 font-sans text-[13px] leading-snug text-coral-ink">
          {error}
        </p>
      ) : null}
      {saved && !editing ? (
        <p className="mt-3 font-sans text-[13px] text-palm">Saved.</p>
      ) : null}

      <div className="mt-4 flex flex-col gap-2.5">
        {(events ?? []).length === 0 && editing !== "new" ? (
          <p className="rounded-card border border-dashed border-hairline-dashed px-3.5 py-4 font-sans text-[13px] text-driftwood-faint">
            No private events yet.
          </p>
        ) : null}

        {(events ?? []).map((event) => {
          const invitedCount = (records ?? []).filter((record) =>
            record.invitedPrivateEventIds.includes(event.id)
          ).length;

          return (
            <div
              key={event.id}
              className="rounded-card bg-white p-3.5 ring-1 ring-hairline/50"
            >
              <p className="font-sans text-[15px] font-medium leading-tight text-driftwood">
                {event.name}
              </p>
              <p className="mt-0.5 font-sans text-xs text-driftwood-soft">
                {whenLabel(event)}
                {event.venue ? ` · ${event.venue}` : ""}
              </p>
              <p className="mt-0.5 font-sans text-xs text-driftwood-faint">
                {invitedCount === 0
                  ? "Nobody invited yet"
                  : `${invitedCount} ${invitedCount === 1 ? "party" : "parties"} invited`}
              </p>

              <div className="mt-2.5 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() =>
                    editing === event.id ? setEditing(null) : openForm(event)
                  }
                  className="font-sans text-[12px] text-driftwood-soft underline underline-offset-4"
                >
                  {editing === event.id ? "Close" : "Edit details"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setGuestsFor(guestsFor === event.id ? null : event.id);
                    setEditing(null);
                  }}
                  className="font-sans text-[12px] text-driftwood-soft underline underline-offset-4"
                >
                  {guestsFor === event.id ? "Close" : "Who's invited"}
                </button>
                {confirmDelete === event.id ? (
                  <>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void remove(event.id)}
                      className="font-sans text-[12px] font-medium text-coral-ink underline underline-offset-4 disabled:opacity-40"
                    >
                      Delete for good
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(null)}
                      className="font-sans text-[12px] text-driftwood-faint underline underline-offset-4"
                    >
                      Keep it
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(event.id)}
                    className="font-sans text-[12px] text-coral-ink underline underline-offset-4"
                  >
                    Delete
                  </button>
                )}
              </div>

              {editing === event.id ? (
                <EventForm
                  draft={draft}
                  busy={busy}
                  error={null}
                  onEdit={edit}
                  onSave={() => void save()}
                  onDiscard={() => setDraft(draftOf(event))}
                  label="Save changes"
                />
              ) : null}

              {guestsFor === event.id ? (
                <div className="mt-3 border-t border-hairline/60 pt-3">
                  <input
                    value={filter}
                    onChange={(input) => setFilter(input.target.value)}
                    placeholder="Search by name"
                    className="w-full rounded-pill bg-card px-4 py-2 font-sans text-[13px] text-driftwood outline-none ring-1 ring-hairline/50 placeholder:text-driftwood-faint"
                  />

                  <div className="mt-2.5 flex flex-col gap-2">
                    {filtered.length === 0 ? (
                      <p className="font-sans text-[13px] text-driftwood-faint">
                        {records && records.length > 0
                          ? "No reply matches that name."
                          : "No replies yet — there's nobody to invite until guests RSVP."}
                      </p>
                    ) : null}

                    {filtered.map((record) => {
                      const invited = record.invitedPrivateEventIds.includes(
                        event.id
                      );
                      return (
                        <div
                          key={record.ownerUid}
                          className="flex items-center justify-between gap-3 rounded-card bg-card px-3.5 py-2.5"
                        >
                          <div>
                            <p className="font-sans text-[14px] font-medium text-driftwood">
                              {leadName(record)}
                            </p>
                            <p className="mt-0.5 font-sans text-[12px] text-driftwood-soft">
                              {invited ? "Invited" : "Not invited"}
                            </p>
                          </div>
                          <button
                            type="button"
                            disabled={busyUid === record.ownerUid}
                            onClick={() => void toggleGuest(event.id, record)}
                            className={`rounded-pill px-3.5 py-1.5 font-sans text-[12px] font-medium transition-colors disabled:opacity-40 ${
                              invited
                                ? "bg-white text-driftwood-soft ring-1 ring-hairline/50"
                                : "bg-deeptide text-foam"
                            }`}
                          >
                            {invited ? "Remove" : "Invite"}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {editing === "new" ? (
        <div className="mt-2.5 rounded-card bg-white p-3.5 ring-1 ring-hairline/50">
          <p className="font-sans text-[15px] font-medium leading-tight text-driftwood">
            New private event
          </p>
          <EventForm
            draft={draft}
            busy={busy}
            error={null}
            onEdit={edit}
            onSave={() => void save()}
            onDiscard={() => setEditing(null)}
            label="Add it"
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => openForm(null)}
          className="mt-3 rounded-pill bg-coral px-5 py-2.5 font-sans text-[14px] font-medium text-foam transition-colors hover:bg-coral-deep"
        >
          Add a private event
        </button>
      )}
    </div>
  );
}

function EventForm({
  draft,
  busy,
  error,
  onEdit,
  onSave,
  onDiscard,
  label,
}: {
  draft: Draft;
  busy: boolean;
  error: string | null;
  onEdit: (patch: Partial<Draft>) => void;
  onSave: () => void;
  onDiscard: () => void;
  label: string;
}) {
  return (
    <div className="mt-3 border-t border-hairline/60 pt-3">
      <div className="flex flex-col gap-2">
        <Field
          label="What is it called"
          value={draft.name}
          placeholder="Late dinner on the terrace"
          onChange={(value) => onEdit({ name: value })}
        />

        <div className="grid grid-cols-2 gap-2">
          <Field
            label="Starts"
            type="date"
            value={draft.startDate}
            onChange={(value) =>
              onEdit({
                startDate: value,
                // Almost every private event ends the day it starts; filling
                // the end date once saves typing it, and it stays editable.
                endDate: draft.endDate || value,
              })
            }
          />
          <Field
            label="At"
            type="time"
            value={draft.startTime}
            onChange={(value) => onEdit({ startTime: value })}
          />
          <Field
            label="Ends"
            type="date"
            value={draft.endDate}
            onChange={(value) => onEdit({ endDate: value })}
          />
          <Field
            label="At"
            type="time"
            value={draft.endTime}
            onChange={(value) => onEdit({ endTime: value })}
          />
        </div>

        <Field
          label="Where"
          value={draft.venue}
          placeholder="The old lighthouse"
          onChange={(value) => onEdit({ venue: value })}
        />
        <Field
          label="Address for the map link (optional)"
          value={draft.mapsQuery}
          placeholder="Gopalpur Lighthouse, Odisha"
          onChange={(value) => onEdit({ mapsQuery: value })}
        />
        <Field
          label="Dress code (optional)"
          value={draft.dressCode}
          placeholder="Whatever you're already wearing"
          onChange={(value) => onEdit({ dressCode: value })}
        />
        <Field
          label="Anything else they should know (optional)"
          value={draft.note}
          placeholder="Please keep this one between us."
          onChange={(value) => onEdit({ note: value })}
        />
      </div>

      <SaveBar
        dirty
        busy={busy}
        error={error}
        saved={false}
        label={label}
        onSave={onSave}
        onDiscard={onDiscard}
      />
    </div>
  );
}

/**
 * The three failures a person can produce by typing. The callable rejects all of
 * them too — this is here so the answer arrives before the round trip, not
 * instead of it.
 */
function firstInvalid(
  draft: Draft,
  startsAt: string,
  endsAt: string
): string | null {
  if (!draft.name.trim()) return "Give it a name.";
  if (Number.isNaN(Date.parse(startsAt))) return "It needs a start date and time.";
  if (Number.isNaN(Date.parse(endsAt))) return "It needs an end date and time.";
  if (Date.parse(endsAt) < Date.parse(startsAt)) {
    return "It would end before it starts.";
  }
  return null;
}

/**
 * "Sun 27 Dec, 10:00 pm" — staff-facing, so English, and read back in the
 * event's own offset rather than the reader's. A couple checking the list from
 * an airport in another country must see the time they typed.
 */
function whenLabel(event: PrivateEvent): string {
  const parsed = Date.parse(event.startsAt);
  if (Number.isNaN(parsed)) return "Time not set";
  const offset = splitInstant(event.startsAt)?.offset ?? "Z";
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: offset === "Z" ? "UTC" : offset,
  }).format(new Date(parsed));
}

function messageOf(cause: unknown, fallback: string): string {
  if (cause instanceof Error && cause.message) return cause.message;
  return fallback;
}
