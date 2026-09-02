"use client";

import { useTranslations } from "next-intl";
import {
  TRANSPORT_MODES,
  WEDDING_DATES,
  type TransportMode,
} from "@/content/wedding";
import { transportCopy } from "@/i18n/weddingCopy";
import type { Travel } from "../types";
import { Card, Eyebrow, RadioDot, StepIntro, StepTitle } from "../ui";

/**
 * Step 4 — "Getting there".
 *
 * Everything here is optional. A guest driving down should be able to hit Send
 * RSVP without touching a single field, so nothing on this step ever blocks
 * submission — it exists to tell the couple who is around when, not to
 * interrogate.
 *
 * Stay is deliberately absent: nothing here books a room, so a card about one
 * mid-form reads as a booking step the guest has to deal with.
 *
 * It used to ask two more things — a flight/train number and a "send a car"
 * toggle. Both went at the couple's request: no pickup is being arranged, and
 * they book their own relatives' train tickets, so a service number had nobody
 * on the other side of it waiting to meet anyone. Dates and mode are what's
 * left, and all three are still enough to plan a weekend around.
 */
export function StepTravel({
  travel,
  onChange,
}: {
  travel: Travel;
  onChange: (next: Travel) => void;
}) {
  const t = useTranslations("rsvp.travel");
  const tWedding = useTranslations("wedding");

  const set = <K extends keyof Travel>(key: K, value: Travel[K]) =>
    onChange({ ...travel, [key]: value });

  return (
    <div className="animate-fade-in">
      <StepTitle>{t("title")}</StepTitle>
      <StepIntro>{t("intro")}</StepIntro>

      <div className="mt-[22px] flex gap-2.5">
        <DateCard
          label={t("arriving")}
          fieldLabel={t("arrivingDate")}
          value={travel.arrivalOn}
          onChange={(v) => set("arrivalOn", v)}
        />
        <DateCard
          label={t("leaving")}
          fieldLabel={t("leavingDate")}
          value={travel.departureOn}
          onChange={(v) => set("departureOn", v)}
        />
      </div>

      <Eyebrow className="mt-[22px] mb-2.5">{t("comingBy")}</Eyebrow>
      <ul className="flex flex-col gap-2.5">
        {TRANSPORT_MODES.map((mode) => {
          const copy = transportCopy(tWedding, mode);
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
                    {copy.title}
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
    </div>
  );

  /**
   * `serviceNumber` and `wantsPickup` are no longer collected anywhere, but
   * both still exist on `Travel` and are still validated by the callable, so
   * they are cleared here rather than left to whatever a resumed draft or a
   * returning guest's stored reply happens to hold. Nothing reads them; this
   * is so nothing can start.
   */
  function selectMode(mode: TransportMode) {
    onChange({ ...travel, mode, serviceNumber: "", wantsPickup: false });
  }
}

/**
 * Date only, not datetime. Bounded to the fortnight around the wedding so the
 * native picker opens on the right month instead of today, and a mistyped year
 * can't sail through.
 */
function DateCard({
  label,
  fieldLabel,
  value,
  onChange,
}: {
  /** The eyebrow above the field — "Arriving". */
  label: string;
  /** What a screen reader announces — "Arrival date", a full noun phrase. */
  fieldLabel: string;
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
        aria-label={fieldLabel}
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
