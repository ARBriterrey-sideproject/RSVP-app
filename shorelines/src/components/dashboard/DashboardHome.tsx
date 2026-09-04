"use client";

import { useState } from "react";
import { COUPLE } from "@/content/wedding";
import type { WeddingConfig, WeddingOverlay } from "@/content/schema";
import { ROLE_COPY, type Capability } from "@/lib/auth/roles";
import { EmergencyContactsPanel } from "./EmergencyContactsPanel";
import { InviteLinksPanel } from "./InviteLinksPanel";
import { LiveChatPanel } from "./LiveChatPanel";
import { MemoriesPanel } from "./MemoriesPanel";
import { PhotoAlbumsPanel } from "./PhotoAlbumsPanel";
import { PollsPanel } from "./PollsPanel";
import { PrivateEventsPanel } from "./PrivateEventsPanel";
import { RepliesPanel } from "./RepliesPanel";
import { SchedulePanel } from "./SchedulePanel";
import { SongRequestsPanel } from "./SongRequestsPanel";
import { StaffAccessPanel } from "./StaffAccessPanel";
import { useStaffAuth } from "./StaffAuthProvider";
import { TravelPanel } from "./TravelPanel";

/**
 * The shell the panels hang off. Everything below is gated by capability rather
 * than by role name, so moving a panel between roles is an edit to CAPABILITIES
 * in src/lib/auth/roles.ts and nothing else.
 *
 * Panels without a `render` are unbuilt, and say so. Keeping them listed is
 * deliberate: the couple can see exactly what a coordinator's login would show
 * before anyone is handed one, and what is still coming.
 */

interface PanelContext {
  config: WeddingConfig;
  overlay: WeddingOverlay | null;
}

/**
 * Groups exist purely to help a staffer scan twelve panels at a glance —
 * they carry no capability logic of their own. Order here is the order
 * sections render in; a group with nothing visible in it is skipped.
 */
const GROUP_ORDER = [
  "Guests",
  "Event details",
  "Live & engagement",
  "Access",
] as const;
type PanelGroup = (typeof GROUP_ORDER)[number];

const PANELS = [
  {
    capability: "viewResponses",
    title: "Replies",
    description: "Who's coming, headcounts, veg and non-veg splits per event.",
    group: "Guests",
    render: () => <RepliesPanel />,
  },
  {
    capability: "viewContactDetails",
    title: "Travel & pickups",
    description: "Arrivals, departures, flight and train numbers, car requests.",
    group: "Guests",
    render: () => <TravelPanel />,
  },
  {
    capability: "copyInviteLinks",
    title: "Invite links",
    description: "Copy the three tier links to paste into WhatsApp.",
    group: "Guests",
    render: () => <InviteLinksPanel />,
  },
  {
    capability: "editSchedule",
    title: "Schedule",
    description: "Move a ceremony or a meal. Takes effect without a new build.",
    group: "Event details",
    render: ({ config }) => <SchedulePanel config={config} />,
  },
  {
    capability: "editEmergencyContacts",
    title: "Emergency contacts",
    description: "The numbers guests see on the Today screen.",
    group: "Event details",
    render: ({ overlay }) => (
      <EmergencyContactsPanel contacts={overlay?.emergencyContacts ?? []} />
    ),
  },
  {
    capability: "managePrivateEvents",
    title: "Private events",
    description: "A gathering only the guests you name ever hear about.",
    group: "Event details",
    render: () => <PrivateEventsPanel />,
  },
  {
    capability: "viewMemories",
    title: "Messages to you",
    description: "Notes guests leave. Only the two of you.",
    group: "Live & engagement",
    render: () => <MemoriesPanel />,
  },
  {
    capability: "moderateChat",
    title: "Live chat",
    description: "The group room, plus every guest's private thread with you.",
    group: "Live & engagement",
    render: () => <LiveChatPanel />,
  },
  {
    capability: "managePolls",
    title: "Polls",
    description: "Ask the room something. Watch the answers come in live.",
    group: "Live & engagement",
    render: ({ config }) => <PollsPanel config={config} />,
  },
  {
    capability: "viewSongRequests",
    title: "Song requests",
    description: "What the DJ's been asked to play, grouped by event.",
    group: "Live & engagement",
    render: ({ config, overlay }) => (
      <SongRequestsPanel config={config} overlay={overlay} />
    ),
  },
  {
    capability: "manageAlbums",
    title: "Photo albums",
    description: "Toggle shared vs. private per event, and browse uploads.",
    group: "Live & engagement",
    render: ({ config }) => <PhotoAlbumsPanel config={config} canManage />,
  },
  {
    capability: "manageStaff",
    title: "Staff access",
    description: "Who can sign in here, and as what.",
    group: "Access",
    render: () => <StaffAccessPanel />,
  },
] satisfies {
  capability: Capability;
  title: string;
  description: string;
  group: PanelGroup;
  render?: (context: PanelContext) => React.ReactNode;
}[];

/**
 * One small line icon per panel, hand-drawn to the identity's stroke weight
 * rather than pulling in an icon package for twelve glyphs. Keyed by
 * capability so the read-only "Photo albums" variant (see below) picks up
 * the same icon as the manageAlbums entry without repeating the markup.
 */
const PANEL_ICON_PATHS: Record<(typeof PANELS)[number]["capability"], string> = {
  viewResponses:
    "M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm8 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM2 20c0-3.3 2.7-6 6-6s6 2.7 6 6M14 14c3.3 0 6 2.7 6 6",
  viewContactDetails: "M3 5.5 8 3l3 5-2 2c1 2.3 2.7 4 5 5l2-2 5 3-2.5 5c-8 0-14.5-6.5-14.5-14.5Z",
  copyInviteLinks:
    "m9.5 14.5 5-5M9 7H6a4 4 0 0 0 0 8h1m8-8h1a4 4 0 0 1 0 8h-1",
  editSchedule:
    "M4 5h16M7 3v4m10-4v4M4 9h16v11H4V9Zm3 4h3v3H7v-3Z",
  editEmergencyContacts:
    "M3 5.5 8 3l3 5-2 2c1 2.3 2.7 4 5 5l2-2 5 3-2.5 5c-8 0-14.5-6.5-14.5-14.5Z",
  managePrivateEvents:
    "M6 11V8a6 6 0 0 1 12 0v3m-14 0h16v10H4V11Zm8 5v2",
  viewMemories:
    "M4 5h16v14H4V5Zm0 0 8 7 8-7",
  moderateChat:
    "M4 4h16v11H8l-4 4V4Z",
  managePolls: "M5 20V10m6 10V4m6 16v-7",
  viewSongRequests:
    "M9 18V6l11-2v12M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm11-2a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z",
  manageAlbums:
    "M4 8h3l1.5-2h7L17 8h3v11H4V8Zm8 8a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z",
  manageStaff:
    "M12 3l7 3v5c0 4.5-3 7.7-7 10-4-2.3-7-5.5-7-10V6l7-3Z",
};

function PanelIcon({
  capability,
}: {
  capability: (typeof PANELS)[number]["capability"];
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-[18px] w-[18px]"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PANEL_ICON_PATHS[capability]} />
    </svg>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`h-4 w-4 shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function DashboardHome({ config, overlay }: PanelContext) {
  const { state, allows, signOut } = useStaffAuth();
  const [open, setOpen] = useState<Capability | null>(null);

  if (state.status !== "ready") return null;

  const { user, role, photoAccess } = state;
  const visible = PANELS.filter((panel) => allows(panel.capability));

  // A coordinator with no `manageAlbums` rank still gets a read-only "Photo
  // albums" entry when the admin has granted them individual photo access
  // (see setStaffPhotoAccess) — manageAlbums stays admin-only for the
  // toggle/delete controls, this is a separate per-individual grant with its
  // own view-only panel.
  const panels =
    !allows("manageAlbums") && photoAccess
      ? [
          ...visible,
          {
            capability: "manageAlbums" as const,
            title: "Photo albums",
            description: "Browse what guests have uploaded, per event.",
            group: "Live & engagement" as const,
            render: ({ config }: PanelContext) => (
              <PhotoAlbumsPanel config={config} canManage={false} />
            ),
          },
        ]
      : visible;

  const sections = GROUP_ORDER.map((group) => ({
    group,
    panels: panels.filter((panel) => panel.group === group),
  })).filter((section) => section.panels.length > 0);

  const initials = (user.displayName || user.email || "?")
    .trim()
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <main className="mx-auto w-full max-w-[560px] px-6 py-10 md:max-w-dashboard-wide">
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

      <div className="mt-5 flex items-center gap-3 rounded-card bg-card px-4 py-3.5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-deeptide font-sans text-[13px] font-medium text-foam">
          {initials}
        </span>
        <div className="min-w-0">
          <p className="truncate font-sans text-[15px] font-medium leading-tight text-driftwood">
            {user.displayName || user.email}
          </p>
          <p className="mt-1 flex items-center gap-1.5 font-sans text-xs leading-snug text-driftwood-soft">
            <span className="rounded-pill bg-sunbleach px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em] text-deeptide">
              {ROLE_COPY[role].label}
            </span>
            <span className="truncate">{ROLE_COPY[role].description}</span>
          </p>
        </div>
      </div>

      {sections.map((section) => (
        <section key={section.group} className="mt-8 first:mt-6">
          <h2 className="mb-2.5 px-1 font-sans text-[11px] font-medium uppercase tracking-[0.22em] text-driftwood-faint">
            {section.group}
          </h2>
          <ul className="flex flex-col gap-2.5">
            {section.panels.map((panel) => {
              const expanded = open === panel.capability;
              const built = Boolean(panel.render);

              return (
                <li
                  key={panel.capability}
                  className={
                    built
                      ? `rounded-card bg-card p-4 transition-shadow ${
                          expanded ? "ring-1 ring-deeptide/25" : ""
                        }`
                      : "rounded-card border border-dashed border-hairline-dashed bg-white p-4"
                  }
                >
                  <button
                    type="button"
                    disabled={!built}
                    aria-expanded={built ? expanded : undefined}
                    onClick={() =>
                      setOpen(expanded ? null : panel.capability)
                    }
                    className="flex w-full items-start gap-3 text-left disabled:cursor-default"
                  >
                    <span
                      className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                        expanded
                          ? "bg-deeptide text-foam"
                          : "bg-shell text-driftwood-soft"
                      }`}
                    >
                      <PanelIcon capability={panel.capability} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-3">
                        <span className="font-sans text-[15.5px] font-medium leading-tight text-driftwood">
                          {panel.title}
                        </span>
                        {built ? (
                          <ChevronIcon open={expanded} />
                        ) : (
                          <span className="shrink-0 font-sans text-[10px] uppercase tracking-[0.16em] text-driftwood-faint">
                            Coming next
                          </span>
                        )}
                      </span>
                      <span className="mt-1 block font-sans text-xs leading-snug text-driftwood-soft">
                        {panel.description}
                      </span>
                    </span>
                  </button>

                  {expanded ? (
                    <div className="pl-11">
                      {panel.render?.({ config, overlay })}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      <p className="mt-8 font-sans text-xs leading-relaxed text-driftwood-faint">
        You&apos;re seeing {panels.length} of {PANELS.length} sections. The rest
        are for other roles.
      </p>
    </main>
  );
}
