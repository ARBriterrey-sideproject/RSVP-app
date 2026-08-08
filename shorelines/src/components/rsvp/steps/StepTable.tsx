"use client";

import { useState } from "react";
import {
  DIETARY_COPY,
  DIETARY_OPTIONS,
  type DietaryOption,
} from "@/content/wedding";
import type { PartyMember } from "../types";
import { Eyebrow, RadioDot, StepIntro, StepTitle } from "../ui";

const MAX_NOTE_LEN = 500;

/**
 * Step 4 — "At the table".
 *
 * The mockup offers one menu for the whole party. That is right for the common
 * case and wrong for the one that actually happens: a party routinely splits.
 * So the party-wide picker is the default and stays one tap, and per-person
 * overrides sit behind a disclosure most guests will never open.
 *
 * With only two options the per-person control is now a pair of choices in a
 * `select`, which is more chrome than it deserves — but it still beats making
 * a family of six send two RSVPs to record one vegetarian.
 */
export function StepTable({
  party,
  eventCount,
  onDefaultDietary,
  onMemberDietary,
  notes,
  onNotesChange,
}: {
  party: PartyMember[];
  eventCount: number;
  onDefaultDietary: (option: DietaryOption) => void;
  onMemberDietary: (id: string, option: DietaryOption) => void;
  notes: string;
  onNotesChange: (value: string) => void;
}) {
  const [showPerPerson, setShowPerPerson] = useState(false);

  // Only meaningful when the whole party agrees; otherwise no row is filled in
  // and the per-person list is the source of truth.
  const shared = party.every((m) => m.dietary === party[0].dietary)
    ? party[0].dietary
    : null;

  return (
    <div className="animate-fade-in">
      <StepTitle>At the table</StepTitle>
      <StepIntro>
        Meals across{" "}
        {eventCount === 1 ? "the evening" : `all ${eventCount} events`}. Pick
        what suits your party — the details go below.
      </StepIntro>

      <ul className="mt-[22px] flex flex-col gap-2.5">
        {DIETARY_OPTIONS.map((option) => {
          const copy = DIETARY_COPY[option];
          return (
            <li key={option}>
              <button
                type="button"
                onClick={() => onDefaultDietary(option)}
                aria-pressed={shared === option}
                className="flex w-full items-center gap-3.5 rounded-card bg-card p-4 text-left transition-colors hover:bg-card-hover"
              >
                <RadioDot selected={shared === option} />
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

      {party.length > 1 && (
        <div className="mt-4">
          <button
            type="button"
            onClick={() => setShowPerPerson((open) => !open)}
            aria-expanded={showPerPerson}
            className="font-sans text-xs font-medium uppercase tracking-[0.14em] text-coral-ink"
          >
            {showPerPerson ? "Same for everyone" : "Someone eats differently?"}
          </button>

          {showPerPerson && (
            <ul className="mt-3 flex flex-col gap-2">
              {party.map((member, i) => (
                <li
                  key={member.id}
                  className="flex items-center gap-3 rounded-card bg-card px-4 py-3"
                >
                  <span className="flex-1 truncate font-sans text-sm text-driftwood">
                    {member.name.trim() ||
                      (i === 0 ? "You" : `Guest ${i + 1}`)}
                  </span>
                  <select
                    value={member.dietary}
                    onChange={(e) =>
                      onMemberDietary(
                        member.id,
                        e.target.value as DietaryOption
                      )
                    }
                    aria-label={`Menu for ${member.name.trim() || `guest ${i + 1}`}`}
                    className="min-w-0 flex-none rounded-pill bg-white px-3 py-1.5 font-sans text-xs text-driftwood outline-none ring-1 ring-hairline focus:ring-deeptide"
                  >
                    {DIETARY_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {DIETARY_COPY[option].label}
                      </option>
                    ))}
                  </select>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/*
        This field carries the weight the six-option list used to. Veg/non-veg
        is a coarse split, so the placeholder names the kinds of thing people
        would otherwise look for as buttons, to make clear they belong here
        rather than being unsupported.
      */}
      <div className="mt-[18px] rounded-card border border-dashed border-hairline-dashed bg-white p-4">
        <Eyebrow>Dietary restrictions</Eyebrow>
        <textarea
          value={notes}
          onChange={(e) => onNotesChange(e.target.value.slice(0, MAX_NOTE_LEN))}
          rows={3}
          aria-label="Dietary restrictions"
          placeholder="Vegan, allergies — anything the kitchen should know"
          className="mt-2.5 w-full resize-none bg-transparent font-sans text-sm leading-[1.5] text-driftwood outline-none placeholder:text-driftwood-faint"
        />
      </div>
    </div>
  );
}
