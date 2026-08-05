"use client";

import { useState } from "react";
import { PARTY_SIZE_SOFT_CAP, rsvpDeadlineLabel } from "@/content/wedding";
import { makeMember, type PartyMember } from "../types";
import {
  Card,
  Eyebrow,
  StepIntro,
  StepTitle,
  Stepper,
  TextField,
  WaveRule,
} from "../ui";

/**
 * Step 3 — "Who's with you?".
 *
 * This is where the mockup and the written plan disagree, and the disagreement
 * is resolved rather than picked: the mockup counts adults and children with
 * steppers ("Names can come later"); the plan wants a named list. Counting is
 * kept as the primary gesture because it is genuinely faster, and the names are
 * offered underneath as optional fields. A guest who fills nothing still gives
 * the caterer a headcount; a guest who fills them in gives the couple a seating
 * plan. Only the first name is required.
 */
export function StepParty({
  phoneLabel,
  party,
  onChange,
}: {
  phoneLabel: string;
  party: PartyMember[];
  onChange: (next: PartyMember[]) => void;
}) {
  const [showNames, setShowNames] = useState(false);

  const [primary, ...others] = party;
  const extraAdults = others.filter((m) => m.ageGroup === "adult").length;
  const children = others.filter((m) => m.ageGroup === "child").length;

  /** Grows or shrinks one age group, always trimming from the end. */
  function setCount(ageGroup: "adult" | "child", next: number) {
    const current = others.filter((m) => m.ageGroup === ageGroup);
    if (next > current.length) {
      const added = Array.from({ length: next - current.length }, () =>
        makeMember(ageGroup)
      );
      onChange([...party, ...added]);
      return;
    }
    const doomed = new Set(current.slice(next).map((m) => m.id));
    onChange(party.filter((m) => !doomed.has(m.id)));
  }

  function setName(id: string, name: string) {
    onChange(party.map((m) => (m.id === id ? { ...m, name } : m)));
  }

  // Room left for one more person, so the steppers stop at the cap rather
  // than letting someone build a party the server will reject.
  const headroom = PARTY_SIZE_SOFT_CAP - party.length;

  return (
    <div className="animate-fade-in">
      <StepTitle>Who&apos;s with you?</StepTitle>
      <StepIntro>Add everyone travelling under your invitation.</StepIntro>

      <Card className="mt-[22px]">
        <Eyebrow>Primary guest</Eyebrow>
        <TextField
          label="Your full name"
          autoComplete="name"
          value={primary.name}
          onChange={(e) => setName(primary.id, e.target.value)}
          className="mt-2 bg-white/70 px-3 py-2.5"
        />
        <p className="mt-2 font-sans text-[12.5px] leading-snug text-driftwood-soft">
          {phoneLabel}
        </p>
      </Card>

      <CounterRow
        title="Adults joining you"
        hint="Names can come later"
        value={extraAdults}
        max={extraAdults + Math.max(headroom, 0)}
        onChange={(n) => setCount("adult", n)}
        label="adult"
      />

      <CounterRow
        title="Children under 12"
        hint="We'll arrange a kids' table"
        value={children}
        max={children + Math.max(headroom, 0)}
        onChange={(n) => setCount("child", n)}
        label="child"
      />

      {others.length > 0 && (
        <div className="mt-4">
          <button
            type="button"
            onClick={() => setShowNames((open) => !open)}
            aria-expanded={showNames}
            className="font-sans text-xs font-medium uppercase tracking-[0.14em] text-coral-ink"
          >
            {showNames ? "I'll add names later" : "Add their names now"}
          </button>

          {showNames && (
            <ul className="mt-3 flex flex-col gap-2">
              {others.map((member, i) => (
                <li key={member.id}>
                  <TextField
                    label={placeholderFor(others, i)}
                    autoComplete="off"
                    value={member.name}
                    onChange={(e) => setName(member.id, e.target.value)}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="mt-5 flex items-start gap-2.5 px-1 text-warmgold">
        <WaveRule />
        <p className="font-sans text-[12.5px] leading-[1.6] text-driftwood-faint">
          Party of {party.length}. You can change this until{" "}
          {rsvpDeadlineLabel()}.
        </p>
      </div>
    </div>
  );
}

function CounterRow({
  title,
  hint,
  value,
  max,
  onChange,
  label,
}: {
  title: string;
  hint: string;
  value: number;
  max: number;
  onChange: (next: number) => void;
  label: string;
}) {
  return (
    <Card className="mt-3 flex items-center gap-3.5">
      <div className="flex-1">
        <div className="font-sans text-[15px] font-medium leading-tight text-driftwood">
          {title}
        </div>
        <div className="mt-0.5 font-sans text-xs leading-snug text-driftwood-soft">
          {hint}
        </div>
      </div>
      <Stepper
        value={value}
        max={max}
        onChange={onChange}
        label={label}
      />
    </Card>
  );
}

/** "Adult 2", "Child 1" — numbered within their own group, primary is adult 1. */
function placeholderFor(others: PartyMember[], index: number): string {
  const member = others[index];
  const nth =
    others.slice(0, index + 1).filter((m) => m.ageGroup === member.ageGroup)
      .length + (member.ageGroup === "adult" ? 1 : 0);
  return member.ageGroup === "adult" ? `Adult ${nth}` : `Child ${nth}`;
}
