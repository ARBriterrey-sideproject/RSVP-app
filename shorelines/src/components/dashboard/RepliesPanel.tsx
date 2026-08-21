"use client";

import { useEffect, useMemo, useState } from "react";
import { EVENTS, tierCode } from "@/content/wedding";
import type { EventId } from "@/content/wedding";
import { deleteResponse, flagResponse } from "@/lib/firebase/responses";
import { leadName, listRsvps, type RsvpRecord } from "@/lib/firebase/rsvps";
import { useStaffAuth } from "./StaffAuthProvider";
import { PanelNote } from "./panelKit";

/**
 * WHO'S COMING.
 *
 * Headcounts and the veg/non-veg split are read per event by summing whole
 * parties, not individual attendance — `perEventAttendance` is per-family, so
 * a party is treated as attending or not attending an event as a unit, same
 * as `mealsForEvents` assumes on the guest side.
 */

export function RepliesPanel() {
  const { allows } = useStaffAuth();
  const [records, setRecords] = useState<RsvpRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyUid, setBusyUid] = useState<string | null>(null);
  const [confirmDeleteUid, setConfirmDeleteUid] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [copiedUid, setCopiedUid] = useState<string | null>(null);

  const canFlag = allows("flagResponse");
  const canDelete = allows("deleteResponse");
  // Same rank as phone numbers and pickup requests — a recovery link lets
  // whoever holds it edit that family's reply, so it's contact-detail-grade,
  // not something every coordinator should see just for headcounts.
  const canViewRecovery = allows("viewContactDetails");

  useEffect(() => {
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        setRecords(await listRsvps());
      } catch (cause) {
        setError(
          cause instanceof Error && cause.message
            ? cause.message
            : "Couldn't load replies. Check your connection and try again."
        );
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const stats = useMemo(() => statsByEvent(records ?? []), [records]);

  const filtered = useMemo(() => {
    if (!records) return [];
    const needle = filter.trim().toLowerCase();
    if (!needle) return records;
    return records.filter((record) =>
      leadName(record).toLowerCase().includes(needle)
    );
  }, [records, filter]);

  async function toggleFlag(record: RsvpRecord) {
    setBusyUid(record.ownerUid);
    setError(null);
    try {
      await flagResponse(record.ownerUid, !record.flagged);
      setRecords((current) =>
        (current ?? []).map((entry) =>
          entry.ownerUid === record.ownerUid
            ? { ...entry, flagged: !entry.flagged }
            : entry
        )
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That didn't save.");
    } finally {
      setBusyUid(null);
    }
  }

  async function copyRecoveryLink(record: RsvpRecord) {
    if (!record.recoveryCode) return;
    const url = `${window.location.origin}/rsvp?tier=${tierCode(record.tier)}&recover=${record.recoveryCode}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedUid(record.ownerUid);
      setTimeout(() => setCopiedUid((current) => (current === record.ownerUid ? null : current)), 2000);
    } catch {
      // Clipboard is blocked outside a secure context; nothing to fall back to here.
    }
  }

  async function confirmDelete(record: RsvpRecord) {
    setBusyUid(record.ownerUid);
    setError(null);
    try {
      await deleteResponse(record.ownerUid);
      setRecords((current) =>
        (current ?? []).filter((entry) => entry.ownerUid !== record.ownerUid)
      );
      setConfirmDeleteUid(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That didn't delete.");
    } finally {
      setBusyUid(null);
    }
  }

  if (loading) {
    return (
      <p className="mt-3 font-sans text-[13px] text-driftwood-faint">
        Loading replies…
      </p>
    );
  }

  return (
    <div className="mt-3">
      <PanelNote>
        Headcounts count a whole party toward every event they said yes to.
        {canDelete ? " Flag a reply to keep an eye on it, or delete a bogus one." : ""}
      </PanelNote>

      {error ? (
        <p className="mt-3 font-sans text-[13px] text-coral-ink">{error}</p>
      ) : null}

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
        {EVENTS.map((event) => {
          const s = stats.get(event.id);
          return (
            <div
              key={event.id}
              className="rounded-card bg-white p-3 ring-1 ring-hairline/50"
            >
              <p className="font-sans text-[12px] font-medium text-driftwood">
                {event.name}
              </p>
              <p className="mt-1 font-serif text-[22px] leading-none text-driftwood">
                {s?.headcount ?? 0}
              </p>
              <p className="mt-1 font-sans text-[11px] text-driftwood-soft">
                {s?.veg ?? 0} veg · {s?.nonVeg ?? 0} non-veg
              </p>
              <p className="mt-0.5 font-sans text-[11px] text-driftwood-faint">
                {s?.parties ?? 0} parties
              </p>
            </div>
          );
        })}
      </div>

      <div className="mt-5">
        <input
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          placeholder="Search by name"
          className="w-full rounded-pill bg-card px-4 py-2 font-sans text-[13px] text-driftwood outline-none ring-1 ring-hairline/50 placeholder:text-driftwood-faint"
        />
      </div>

      <div className="mt-3 flex flex-col gap-2">
        {filtered.length === 0 ? (
          <p className="rounded-card border border-dashed border-hairline-dashed px-3.5 py-4 font-sans text-[13px] text-driftwood-faint">
            {records && records.length > 0
              ? "No reply matches that name."
              : "No replies yet."}
          </p>
        ) : null}

        {filtered.map((record) => (
          <div
            key={record.ownerUid}
            className="rounded-card bg-white p-3.5 ring-1 ring-hairline/50"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-sans text-[14px] font-medium text-driftwood">
                  {leadName(record)}
                  {record.flagged ? (
                    <span className="ml-2 rounded-pill bg-coral/15 px-2 py-0.5 font-sans text-[10px] font-medium text-coral-ink">
                      Flagged
                    </span>
                  ) : null}
                </p>
                <p className="mt-0.5 font-sans text-[12px] text-driftwood-soft">
                  {record.partySize} {record.partySize === 1 ? "person" : "people"} ·{" "}
                  {tierLabel(record.tier)}
                </p>
              </div>
            </div>

            <p className="mt-2 font-sans text-[12px] text-driftwood-soft">
              Attending: {attendingLabel(record.perEventAttendance)}
            </p>

            {record.notes ? (
              <p className="mt-1 font-sans text-[12px] italic text-driftwood-faint">
                &ldquo;{record.notes}&rdquo;
              </p>
            ) : null}

            {canFlag || canDelete || (canViewRecovery && record.recoveryCode) ? (
              <div className="mt-2.5 flex items-center gap-3 border-t border-hairline/60 pt-2.5">
                {canViewRecovery && record.recoveryCode ? (
                  <button
                    type="button"
                    onClick={() => void copyRecoveryLink(record)}
                    className="font-sans text-[12px] text-driftwood-soft underline underline-offset-4"
                  >
                    {copiedUid === record.ownerUid ? "Link copied" : "Copy recovery link"}
                  </button>
                ) : null}
                {canFlag ? (
                  <button
                    type="button"
                    disabled={busyUid === record.ownerUid}
                    onClick={() => void toggleFlag(record)}
                    className="font-sans text-[12px] text-driftwood-soft underline underline-offset-4 disabled:opacity-40"
                  >
                    {record.flagged ? "Unflag" : "Flag"}
                  </button>
                ) : null}
                {canDelete ? (
                  confirmDeleteUid === record.ownerUid ? (
                    <>
                      <span className="font-sans text-[12px] text-coral-ink">
                        Delete this reply?
                      </span>
                      <button
                        type="button"
                        disabled={busyUid === record.ownerUid}
                        onClick={() => void confirmDelete(record)}
                        className="font-sans text-[12px] font-medium text-coral-ink underline underline-offset-4 disabled:opacity-40"
                      >
                        Confirm
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteUid(null)}
                        className="font-sans text-[12px] text-driftwood-soft underline underline-offset-4"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteUid(record.ownerUid)}
                      className="font-sans text-[12px] text-driftwood-soft underline underline-offset-4"
                    >
                      Delete
                    </button>
                  )
                ) : null}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function tierLabel(tier: RsvpRecord["tier"]): string {
  if (tier === "wedding_only") return "Wedding only";
  if (tier === "reception_only") return "Reception only";
  return "Full invite";
}

function attendingLabel(attendance: RsvpRecord["perEventAttendance"]): string {
  const yes = EVENTS.filter((event) => attendance[event.id]).map(
    (event) => event.name
  );
  return yes.length > 0 ? yes.join(", ") : "Nothing yet";
}

interface EventStats {
  headcount: number;
  veg: number;
  nonVeg: number;
  parties: number;
}

function statsByEvent(records: RsvpRecord[]): Map<EventId, EventStats> {
  const stats = new Map<EventId, EventStats>();
  for (const event of EVENTS) {
    stats.set(event.id, { headcount: 0, veg: 0, nonVeg: 0, parties: 0 });
  }

  for (const record of records) {
    for (const event of EVENTS) {
      if (!record.perEventAttendance[event.id]) continue;
      const s = stats.get(event.id)!;
      s.headcount += record.partySize;
      s.parties += 1;
      for (const member of record.party) {
        if (member.dietary === "non_vegetarian") s.nonVeg += 1;
        else s.veg += 1;
      }
    }
  }

  return stats;
}
