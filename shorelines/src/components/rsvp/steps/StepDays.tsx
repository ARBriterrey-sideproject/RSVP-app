import {
  ACCENT_BORDER,
  formatEventWhen,
  type WeddingEvent,
} from "@/content/wedding";
import { CheckCircle, StepIntro, StepTitle } from "../ui";

/**
 * Step 2 — "Which days?", straight from the mockup.
 *
 * The list is already filtered before it gets here — by tier, and by whichever
 * invitation-only events this guest has been flagged for — so a reception-only
 * guest simply never sees the other four. There is no greyed-out or locked
 * state to explain, and nothing on screen hints that a hidden event exists.
 */
export function StepDays({
  events,
  attending,
  onToggle,
}: {
  events: WeddingEvent[];
  attending: Record<string, boolean>;
  onToggle: (id: string) => void;
}) {
  return (
    <div className="animate-fade-in">
      <StepTitle>Which days?</StepTitle>
      <StepIntro>
        Tell us where to save you a seat. Nothing is compulsory — come to what
        you can.
      </StepIntro>

      <ul className="mt-[22px] flex flex-col gap-2.5">
        {events.map((event) => {
          const on = attending[event.id] ?? false;
          return (
            <li key={event.id}>
              <button
                type="button"
                onClick={() => onToggle(event.id)}
                aria-pressed={on}
                className={`flex w-full items-center gap-3.5 rounded-card border-l-[3px] bg-card px-4 py-[15px] text-left transition-colors hover:bg-card-hover ${ACCENT_BORDER[event.accent]}`}
              >
                <span className="flex-1">
                  <span className="flex items-center gap-2">
                    <span className="font-sans text-base font-medium leading-tight text-driftwood">
                      {event.name}
                    </span>
                    {/* The one place a guest is told an event is special — and
                        it only ever renders for someone already let in. */}
                    {event.invitationOnly && (
                      <span className="rounded-pill bg-deeptide/10 px-2 py-[3px] font-sans text-[9px] font-medium uppercase tracking-[0.16em] text-deeptide">
                        By invitation
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block font-sans text-xs leading-snug text-driftwood-soft">
                    {formatEventWhen(event.startsAt)}
                  </span>
                </span>
                <CheckCircle checked={on} />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
