"use client";

import { useEffect, useMemo, useState } from "react";
import { SPEAKEASY } from "@/content/wedding";
import { setSpeakeasyInvite } from "@/lib/firebase/speakeasy";
import { leadName, listRsvps, type RsvpRecord } from "@/lib/firebase/rsvps";
import { PanelNote } from "./panelKit";

/**
 * THE SPEAKEASY GUEST LIST.
 *
 * `SPEAKEASY` carries no tier, so this is the only screen anywhere in the app
 * that can grant it — flipping `speakeasyInvited` on a guest's own document,
 * which `eventsForGuest` then splices into their schedule. Revoking also
 * clears any acceptance already recorded, per the callable's own contract.
 */

export function SpeakeasyPanel() {
  const [records, setRecords] = useState<RsvpRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyUid, setBusyUid] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

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
            : "Couldn't load the guest list. Check your connection and try again."
        );
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

  const invitedCount = useMemo(
    () => (records ?? []).filter((record) => record.speakeasyInvited).length,
    [records]
  );

  async function toggle(record: RsvpRecord) {
    const nextInvited = !record.speakeasyInvited;
    setBusyUid(record.ownerUid);
    setError(null);
    try {
      await setSpeakeasyInvite(record.ownerUid, nextInvited);
      setRecords((current) =>
        (current ?? []).map((entry) =>
          entry.ownerUid === record.ownerUid
            ? {
                ...entry,
                speakeasyInvited: nextInvited,
                perEventAttendance: nextInvited
                  ? entry.perEventAttendance
                  : { ...entry.perEventAttendance, speakeasy: false },
              }
            : entry
        )
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That didn't save.");
    } finally {
      setBusyUid(null);
    }
  }

  if (loading) {
    return (
      <p className="mt-3 font-sans text-[13px] text-driftwood-faint">
        Loading guest list…
      </p>
    );
  }

  return (
    <div className="mt-3">
      <PanelNote>
        {SPEAKEASY.name} reaches a guest only if you invite them here — no
        tier or link ever shows it on its own. {invitedCount}{" "}
        {invitedCount === 1 ? "party is" : "parties are"} invited so far.
      </PanelNote>

      {error ? (
        <p className="mt-3 font-sans text-[13px] text-coral-ink">{error}</p>
      ) : null}

      <div className="mt-4">
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

        {filtered.map((record) => {
          const accepted = record.perEventAttendance.speakeasy === true;
          return (
            <div
              key={record.ownerUid}
              className="flex items-center justify-between gap-3 rounded-card bg-white p-3.5 ring-1 ring-hairline/50"
            >
              <div>
                <p className="font-sans text-[14px] font-medium text-driftwood">
                  {leadName(record)}
                </p>
                <p className="mt-0.5 font-sans text-[12px] text-driftwood-soft">
                  {record.speakeasyInvited
                    ? accepted
                      ? "Invited · accepted"
                      : "Invited · no reply yet"
                    : "Not invited"}
                </p>
              </div>
              <button
                type="button"
                disabled={busyUid === record.ownerUid}
                onClick={() => void toggle(record)}
                className={`rounded-pill px-3.5 py-1.5 font-sans text-[12px] font-medium transition-colors disabled:opacity-40 ${
                  record.speakeasyInvited
                    ? "bg-card text-driftwood-soft ring-1 ring-hairline/50"
                    : "bg-deeptide text-foam"
                }`}
              >
                {record.speakeasyInvited ? "Revoke" : "Invite"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
