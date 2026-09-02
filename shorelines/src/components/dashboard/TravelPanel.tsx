"use client";

import { useEffect, useMemo, useState } from "react";
import { TRANSPORT_COPY } from "@/content/wedding";
import type { TransportMode } from "@/content/wedding";
import { leadName, listRsvps, type RsvpRecord } from "@/lib/firebase/rsvps";
import { PanelNote } from "./panelKit";

/**
 * WHO ARRIVES WHEN, AND HOW.
 *
 * Sorted by arrival date so the coordinator can read it the way an arrivals
 * board reads — earliest first, no-arrival-date replies last.
 *
 * There used to be a "Wants pickup" filter, a "Needs pickup" badge and a
 * flight/train number row. The couple withdrew the airport pickup and asked
 * for the service number to go with it, so the RSVP form no longer collects
 * either — see `StepTravel`. Both fields survive on the record (the callable
 * still accepts them, and a handful of trial replies still carry a value), but
 * showing a staff member a pickup request that nothing is going to honour is
 * worse than not showing it, so this panel deliberately doesn't read them.
 */

const MODE_FILTERS: { value: TransportMode | "all"; label: string }[] = [
  { value: "all", label: "Everyone" },
  { value: "airplane", label: "Flying" },
  { value: "train", label: "Train" },
  { value: "self", label: "Driving" },
];

export function TravelPanel() {
  const [records, setRecords] = useState<RsvpRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<TransportMode | "all">("all");

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
            : "Couldn't load travel details. Check your connection and try again."
        );
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const withTravel = useMemo(
    () => (records ?? []).filter((record) => hasTravelInfo(record)),
    [records]
  );

  const filtered = useMemo(() => {
    const list =
      filter === "all"
        ? withTravel
        : withTravel.filter((record) => record.travel.mode === filter);

    return [...list].sort((a, b) => {
      const dateA = a.travel.arrivalOn ?? "";
      const dateB = b.travel.arrivalOn ?? "";
      if (!dateA && !dateB) return 0;
      if (!dateA) return 1;
      if (!dateB) return -1;
      return dateA.localeCompare(dateB);
    });
  }, [withTravel, filter]);

  if (loading) {
    return (
      <p className="mt-3 font-sans text-[13px] text-driftwood-faint">
        Loading travel details…
      </p>
    );
  }

  return (
    <div className="mt-3">
      <PanelNote>
        Arrival and departure details from every reply that gave one.
      </PanelNote>

      {error ? (
        <p className="mt-3 font-sans text-[13px] text-coral-ink">{error}</p>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        {MODE_FILTERS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setFilter(option.value)}
            className={`rounded-pill px-3.5 py-1.5 font-sans text-[12px] font-medium transition-colors ${
              filter === option.value
                ? "bg-deeptide text-foam"
                : "bg-card text-driftwood-soft ring-1 ring-hairline/50"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="mt-4 flex flex-col gap-2">
        {filtered.length === 0 ? (
          <p className="rounded-card border border-dashed border-hairline-dashed px-3.5 py-4 font-sans text-[13px] text-driftwood-faint">
            No matching travel details yet.
          </p>
        ) : null}

        {filtered.map((record) => (
          <div
            key={record.ownerUid}
            className="rounded-card bg-white p-3.5 ring-1 ring-hairline/50"
          >
            <p className="font-sans text-[14px] font-medium text-driftwood">
              {leadName(record)}
            </p>

            <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 font-sans text-[12px] text-driftwood-soft">
              <span>Arriving</span>
              <span className="text-right text-driftwood">
                {record.travel.arrivalOn ?? "Not given"}
              </span>
              <span>Departing</span>
              <span className="text-right text-driftwood">
                {record.travel.departureOn ?? "Not given"}
              </span>
              <span>Mode</span>
              <span className="text-right text-driftwood">
                {record.travel.mode ? TRANSPORT_COPY[record.travel.mode].label : "Not given"}
              </span>
            </div>

            {record.submittedByPhone || record.verifiedPhone ? (
              <div className="mt-2 border-t border-hairline/60 pt-2 font-sans text-[12px] text-driftwood-faint">
                <p>{record.submittedByPhone ?? record.verifiedPhone}</p>
                {/* Only when they disagree. The contact field is seeded from the
                    verified number, so printing both would repeat one string on
                    almost every card — the case worth seeing is the guest who
                    changed it, where the number to ring isn't the number the
                    reply is tied to. */}
                {record.verifiedPhone &&
                record.submittedByPhone &&
                record.verifiedPhone !== record.submittedByPhone ? (
                  <p className="mt-0.5">
                    Verified as {record.verifiedPhone}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function hasTravelInfo(record: RsvpRecord): boolean {
  const { arrivalOn, departureOn, mode } = record.travel;
  return Boolean(arrivalOn || departureOn || mode);
}
