"use client";

import { useEffect, useMemo, useState } from "react";
import { TRANSPORT_COPY } from "@/content/wedding";
import type { TransportMode } from "@/content/wedding";
import { leadName, listRsvps, type RsvpRecord } from "@/lib/firebase/rsvps";
import { PanelNote } from "./panelKit";

/**
 * WHO NEEDS PICKING UP, AND WHEN.
 *
 * Sorted by arrival date so the coordinator can read this the way a shuttle
 * schedule reads — earliest arrivals first, no-arrival-date replies last.
 */

const MODE_FILTERS: { value: TransportMode | "all" | "pickup"; label: string }[] = [
  { value: "all", label: "Everyone" },
  { value: "pickup", label: "Wants pickup" },
  { value: "airplane", label: "Flying" },
  { value: "train", label: "Train" },
  { value: "self", label: "Driving" },
];

export function TravelPanel() {
  const [records, setRecords] = useState<RsvpRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<TransportMode | "all" | "pickup">("all");

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
        : filter === "pickup"
          ? withTravel.filter((record) => record.travel.wantsPickup)
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

  const pickupCount = useMemo(
    () => withTravel.filter((record) => record.travel.wantsPickup).length,
    [withTravel]
  );

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
        {pickupCount > 0
          ? `${pickupCount} ${pickupCount === 1 ? "party has" : "parties have"} asked for a pickup.`
          : "Arrival and departure details from every reply that gave one."}
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
            <div className="flex items-start justify-between gap-2">
              <p className="font-sans text-[14px] font-medium text-driftwood">
                {leadName(record)}
              </p>
              {record.travel.wantsPickup ? (
                <span className="rounded-pill bg-palm/15 px-2 py-0.5 font-sans text-[10px] font-medium text-palm">
                  Needs pickup
                </span>
              ) : null}
            </div>

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
              {record.travel.serviceNumber ? (
                <>
                  <span>
                    {record.travel.mode
                      ? TRANSPORT_COPY[record.travel.mode].serviceLabel ?? "Service"
                      : "Service"}
                  </span>
                  <span className="text-right text-driftwood">
                    {record.travel.serviceNumber}
                  </span>
                </>
              ) : null}
            </div>

            {record.submittedByPhone ? (
              <p className="mt-2 border-t border-hairline/60 pt-2 font-sans text-[12px] text-driftwood-faint">
                {record.submittedByPhone}
              </p>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function hasTravelInfo(record: RsvpRecord): boolean {
  const { arrivalOn, departureOn, mode, wantsPickup } = record.travel;
  return Boolean(arrivalOn || departureOn || mode || wantsPickup);
}
