"use client";

import { COUPLE } from "@/content/wedding";
import { ROLE_COPY, type Capability } from "@/lib/auth/roles";
import { useStaffAuth } from "./StaffAuthProvider";

/**
 * The shell the panels will hang off. Everything below is gated by capability
 * rather than by role name, so moving a panel between roles is an edit to
 * CAPABILITIES in src/lib/auth/roles.ts and nothing else.
 *
 * The panels themselves are unbuilt — this renders the real access decision for
 * each so the couple can see exactly what a coordinator's login would show
 * before anyone is handed one.
 */
const PANELS: {
  capability: Capability;
  title: string;
  description: string;
}[] = [
  {
    capability: "viewResponses",
    title: "Replies",
    description: "Who's coming, headcounts, veg and non-veg splits per event.",
  },
  {
    capability: "viewContactDetails",
    title: "Travel & pickups",
    description: "Arrivals, departures, flight and train numbers, car requests.",
  },
  {
    capability: "copyInviteLinks",
    title: "Invite links",
    description: "Copy the three tier links to paste into WhatsApp.",
  },
  {
    capability: "editEmergencyContacts",
    title: "Emergency contacts",
    description: "The numbers guests see on the Today screen.",
  },
  {
    capability: "grantSpeakeasy",
    title: "The speakeasy",
    description: "Choose who gets asked. Nobody sees it until you add them.",
  },
  {
    capability: "viewMemories",
    title: "Messages to you",
    description: "Notes and voice memos guests leave. Only the two of you.",
  },
  {
    capability: "editSchedule",
    title: "Schedule",
    description: "Times, venues and dress codes for the five days.",
  },
  {
    capability: "manageStaff",
    title: "Staff access",
    description: "Who can sign in here, and as what.",
  },
];

export function DashboardHome() {
  const { state, allows, signOut } = useStaffAuth();
  if (state.status !== "ready") return null;

  const { user, role } = state;
  const visible = PANELS.filter((panel) => allows(panel.capability));

  return (
    <main className="mx-auto w-full max-w-[560px] px-6 py-10">
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="font-sans text-[11px] uppercase tracking-[0.22em] text-driftwood-faint">
            {COUPLE.partnerA} &amp; {COUPLE.partnerB}
          </p>
          <h1 className="mt-1.5 font-display text-[40px] leading-[1.05] text-deeptide">
            Dashboard
          </h1>
        </div>
        <button
          type="button"
          onClick={() => void signOut()}
          className="mt-2 shrink-0 font-sans text-[13px] font-medium text-coral-ink underline underline-offset-4"
        >
          Sign out
        </button>
      </header>

      <div className="mt-5 rounded-card bg-card px-4 py-3.5">
        <p className="font-sans text-[15px] font-medium leading-tight text-driftwood">
          {user.displayName || user.email}
        </p>
        <p className="mt-1 font-sans text-xs leading-snug text-driftwood-soft">
          {ROLE_COPY[role].label} — {ROLE_COPY[role].description}
        </p>
      </div>

      <ul className="mt-6 flex flex-col gap-2.5">
        {visible.map((panel) => (
          <li
            key={panel.capability}
            className="rounded-card border border-dashed border-hairline-dashed bg-white p-4"
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-sans text-[15.5px] font-medium leading-tight text-driftwood">
                {panel.title}
              </span>
              <span className="shrink-0 font-sans text-[10px] uppercase tracking-[0.16em] text-driftwood-faint">
                Coming next
              </span>
            </div>
            <p className="mt-1 font-sans text-xs leading-snug text-driftwood-soft">
              {panel.description}
            </p>
          </li>
        ))}
      </ul>

      <p className="mt-6 font-sans text-xs leading-relaxed text-driftwood-faint">
        You&apos;re seeing {visible.length} of {PANELS.length} sections. The rest
        are for other roles.
      </p>
    </main>
  );
}
