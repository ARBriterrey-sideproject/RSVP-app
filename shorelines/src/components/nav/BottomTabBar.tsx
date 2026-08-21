"use client";

/**
 * THE POST-RSVP TAB BAR — screens 1d (schedule) and 1e (today), plus the v2
 * live-wedding additions (chat and photos).
 *
 * The identity file's mockup draws a fourth tab, "Info", pointing at a screen
 * that was never in the plan and still isn't built — that one stays cut. Chat
 * and photos are different: they lead somewhere real, so the "no dead-end
 * tabs" reasoning doesn't argue against them.
 *
 * Fixed to the viewport rather than `RsvpFlow`'s `flex-none` footer: those
 * screens are a single fixed-height card with nothing to scroll underneath the
 * CTA, while the schedule is a long list that has to keep flowing under a
 * translucent bar exactly like the mockup's `backdrop-filter: blur(12px)`.
 * Callers must reserve the same height at the bottom of their scroll content
 * (see `BOTTOM_TAB_BAR_HEIGHT`) or the last list item ends up hidden behind it.
 */

import Link from "next/link";
import { useTranslations } from "next-intl";
import { tierCode, type Tier } from "@/content/wedding";

export const BOTTOM_TAB_BAR_HEIGHT = 76;

export type Tab = "today" | "schedule" | "rsvp" | "chat" | "photos";

function SunIcon({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="mx-auto h-5 w-5">
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth={active ? 1.6 : 1.3}
        strokeLinecap="round"
      >
        <circle cx="12" cy="12" r="4.5" />
        <path d="M12 2.5v2.5M12 19v2.5M21.5 12H19M5 12H2.5M18.5 5.5l-1.8 1.8M7.3 16.7l-1.8 1.8M18.5 18.5l-1.8-1.8M7.3 7.3 5.5 5.5" />
      </g>
    </svg>
  );
}

function ScheduleIcon({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="mx-auto h-5 w-5">
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth={active ? 1.6 : 1.3}
        strokeLinecap="round"
      >
        <rect x="3.5" y="4.5" width="17" height="16" rx="2.5" />
        <path d="M3.5 9.5h17M8 3v3M16 3v3M7.5 13.5h3M7.5 17h6" />
      </g>
    </svg>
  );
}

function RsvpIcon({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="mx-auto h-5 w-5">
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth={active ? 1.6 : 1.3}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="8.5" />
        <path d="M8.2 12.3l2.6 2.6 5-5.2" />
      </g>
    </svg>
  );
}

function ChatIcon({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="mx-auto h-5 w-5">
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth={active ? 1.6 : 1.3}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M4 5.5h16v10.5H9.5L5.5 19.5V16H4V5.5Z" />
      </g>
    </svg>
  );
}

function PhotosIcon({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="mx-auto h-5 w-5">
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth={active ? 1.6 : 1.3}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="3.5" y="5.5" width="17" height="13" rx="2.5" />
        <circle cx="8.5" cy="10.5" r="1.6" />
        <path d="M4 16.5l5-4.5 3.5 3 3-2.5L20 16" />
      </g>
    </svg>
  );
}

const TABS: {
  id: Tab;
  Icon: typeof SunIcon;
  href: (tier: Tier) => string;
  eventOnly?: boolean;
}[] = [
  { id: "today", Icon: SunIcon, href: (tier) => `/?tier=${tierCode(tier)}` },
  {
    id: "schedule",
    Icon: ScheduleIcon,
    href: (tier) => `/schedule?tier=${tierCode(tier)}`,
  },
  {
    id: "rsvp",
    Icon: RsvpIcon,
    href: (tier) => `/rsvp?tier=${tierCode(tier)}`,
  },
  {
    id: "chat",
    Icon: ChatIcon,
    href: (tier) => `/chat?tier=${tierCode(tier)}`,
    eventOnly: true,
  },
  {
    id: "photos",
    Icon: PhotosIcon,
    href: (tier) => `/photos?tier=${tierCode(tier)}`,
    eventOnly: true,
  },
];

/**
 * `live` is the RSVP-mode/Event-mode switch — default `true` so the call
 * sites that only ever render once the wedding is confirmed live (TodayScreen,
 * ChatScreen, PhotoUploadScreen) need no change. RsvpFlow and ScheduleScreen
 * render in both modes, so they pass the computed value through explicitly.
 */
export function BottomTabBar({
  active,
  tier,
  live = true,
}: {
  active: Tab;
  tier: Tier;
  live?: boolean;
}) {
  const t = useTranslations("nav");
  const visibleTabs = TABS.filter((tab) => live || !tab.eventOnly);
  const label = visibleTabs.map(({ id }) => t(id)).join(" / ");

  return (
    <>
      {/* Desktop: a slim top nav in normal flow, not fixed — AppShell places
          this ahead of `children` so it lands at the top of the column. */}
      <nav
        aria-label={label}
        className="hidden flex-none items-center justify-center gap-1 border-b border-driftwood/[0.08] bg-sand px-4 py-3 md:flex"
      >
        {visibleTabs.map(({ id, Icon, href }) => {
          const isActive = id === active;
          return (
            <Link
              key={id}
              href={href(tier)}
              aria-current={isActive ? "page" : undefined}
              className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 font-sans text-[12px] font-medium tracking-[0.08em] uppercase transition-colors ${
                isActive
                  ? "bg-deeptide/[0.08] text-deeptide"
                  : "text-driftwood-faint hover:text-driftwood"
              }`}
            >
              <Icon active={isActive} />
              <span>{t(id)}</span>
            </Link>
          );
        })}
      </nav>

      {/* Mobile: the original fixed-to-viewport bottom bar, unchanged. */}
      <nav
        aria-label={label}
        className="fixed inset-x-0 bottom-0 z-20 mx-auto flex w-full max-w-md items-center border-t border-driftwood/[0.08] bg-sand/[0.94] px-2 pt-2 backdrop-blur-md md:hidden"
        style={{
          height: BOTTOM_TAB_BAR_HEIGHT,
          paddingBottom: "max(12px, env(safe-area-inset-bottom))",
        }}
      >
        {visibleTabs.map(({ id, Icon, href }) => {
          const isActive = id === active;
          return (
            <Link
              key={id}
              href={href(tier)}
              aria-current={isActive ? "page" : undefined}
              className={`flex-1 text-center font-sans text-[10.5px] leading-[1.6] font-medium tracking-[0.1em] uppercase transition-colors ${
                isActive ? "text-deeptide" : "text-driftwood-faint"
              }`}
            >
              <Icon active={isActive} />
              {t(id)}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
