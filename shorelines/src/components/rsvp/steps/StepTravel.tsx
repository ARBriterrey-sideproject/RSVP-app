"use client";

import {
  LOGISTICS,
  TRANSPORT_COPY,
  TRANSPORT_MODES,
  WEDDING_DATES,
  type TransportMode,
} from "@/content/wedding";
import type { Travel } from "../types";
import { Card, Eyebrow, RadioDot, StepIntro, StepTitle, Toggle } from "../ui";

/**
 * Step 4 — "Getting there".
 *
 * Everything here is optional. A guest driving down should be able to hit Send
 * RSVP without touching a single field, so nothing on this step ever blocks
 * submission — it exists to help the couple arrange cars, not to interrogate.
 *
 * The room block is informational and PLACEHOLDER; it isn't booked.
 */
export function StepTravel({
  travel,
  onChange,
}: {
  travel: Travel;
  onChange: (next: Travel) => void;
}) {
  const set = <K extends keyof Travel>(key: K, value: Travel[K]) =>
    onChange({ ...travel, [key]: value });

  const serviceLabel = travel.mode
    ? TRANSPORT_COPY[travel.mode].serviceLabel
    : undefined;

  return (
    <div className="animate-fade-in">
      <StepTitle>Getting there</StepTitle>
      <StepIntro>
        So we can send a car and hold a room. Skip anything you haven&apos;t
        booked yet.
      </StepIntro>

      <div className="mt-[22px] flex gap-2.5">
        <DateCard
          label="Arriving"
          value={travel.arrivalOn}
          onChange={(v) => set("arrivalOn", v)}
        />
        <DateCard
          label="Leaving"
          value={travel.departureOn}
          onChange={(v) => set("departureOn", v)}
        />
      </div>

      <Eyebrow className="mt-[22px] mb-2.5">Coming by</Eyebrow>
      <ul className="flex flex-col gap-2.5">
        {TRANSPORT_MODES.map((mode) => {
          const copy = TRANSPORT_COPY[mode];
          const selected = travel.mode === mode;
          return (
            <li key={mode}>
              <button
                type="button"
                onClick={() => selectMode(mode)}
                aria-pressed={selected}
                className="flex w-full items-center gap-3.5 rounded-card bg-card p-4 text-left transition-colors hover:bg-card-hover"
              >
                <RadioDot selected={selected} />
                <span>
                  <span className="block font-sans text-[15.5px] font-medium leading-tight text-driftwood">
                    {copy.label}
                  </span>
                  <span className="mt-0.5 block font-sans text-xs leading-snug text-driftwood-soft">
                    {copy.description}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {/*
        Only shown once a mode is picked, and never for "self" — there is no
        service number for a car. Asking for a flight number before knowing
        whether they're flying is the mockup's mistake, not one to reproduce.
      */}
      {serviceLabel && (
        <Card className="mt-2.5 px-4 py-3.5">
          <Eyebrow>{serviceLabel}</Eyebrow>
          <input
            value={travel.serviceNumber}
            onChange={(e) =>
              set("serviceNumber", e.target.value.toUpperCase().slice(0, 24))
            }
            aria-label={serviceLabel}
            placeholder={travel.mode === "train" ? "12703 Falaknuma" : "6E 512"}
            autoComplete="off"
            className="mt-2 w-full bg-transparent font-sans text-base leading-snug text-driftwood outline-none placeholder:text-driftwood-faint"
          />
        </Card>
      )}

      {/* Same rule as the service number: there is nothing to send a car for
          until we know they're arriving somewhere a car can meet them. */}
      {travel.mode && travel.mode !== "self" && (
        <Card className="mt-2.5 flex items-center gap-3.5">
          <div className="flex-1">
            <div className="font-sans text-[15px] font-medium leading-tight text-driftwood">
              {LOGISTICS.shuttle.title}
            </div>
            <div className="mt-0.5 font-sans text-xs leading-snug text-driftwood-soft">
              {LOGISTICS.shuttle.description}
            </div>
          </div>
          <Toggle
            checked={travel.wantsPickup}
            onChange={(v) => set("wantsPickup", v)}
            label={LOGISTICS.shuttle.title}
          />
        </Card>
      )}

      {/* Informational only — the room block isn't something a guest picks. */}
      <Card className="mt-2.5 px-4 py-3.5">
        <Eyebrow>Staying at</Eyebrow>
        <div className="mt-2 font-sans text-base leading-snug text-driftwood">
          {LOGISTICS.stay.title}
        </div>
        <p className="mt-1 font-sans text-[12.5px] leading-[1.5] text-driftwood-soft">
          {LOGISTICS.stay.description}
        </p>
      </Card>
    </div>
  );

  /**
   * Switching to "self" clears the pickup request and any service number.
   * Leaving a stale "yes, send a car" behind a hidden toggle would have the
   * couple meeting a train that nobody is on.
   */
  function selectMode(mode: TransportMode) {
    onChange(
      mode === "self"
        ? { ...travel, mode, serviceNumber: "", wantsPickup: false }
        : { ...travel, mode }
    );
  }
}

/**
 * Date only, not datetime. Bounded to the fortnight around the wedding so the
 * native picker opens on the right month instead of today, and a mistyped year
 * can't sail through.
 */
function DateCard({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Card className="min-w-0 flex-1 px-4 py-3.5">
      <Eyebrow>{label}</Eyebrow>
      <input
        type="date"
        value={value}
        min={TRAVEL_WINDOW.from}
        max={TRAVEL_WINDOW.to}
        onChange={(e) => onChange(e.target.value)}
        aria-label={`${label} date`}
        className="mt-2 w-full bg-transparent font-sans text-[15px] leading-snug text-driftwood outline-none [color-scheme:light]"
      />
    </Card>
  );
}

/** A week either side of the celebration — generous, but not unbounded. */
const TRAVEL_WINDOW = {
  from: shiftDays(WEDDING_DATES.firstDay, -7),
  to: shiftDays(WEDDING_DATES.lastDay, 7),
};

function shiftDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
