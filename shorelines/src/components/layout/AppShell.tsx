"use client";

/**
 * The outer wrapper every guest screen past the landing page uses: a
 * viewport-locked card (`h-dvh`, `overflow-hidden`) rather than a normal
 * scrolling document, because each screen manages its own internal scroll
 * region (and, on `RsvpFlow`/`ChatScreen`/`MemoriesComposer`, a sticky
 * footer). `InviteLanding` is a real scrolling document with no tab bar, so
 * it doesn't use this — see its own full-bleed `<main>`.
 *
 * Screens keep full control of their own header/content/footer markup as
 * `children`; this component only owns the outer shell class string (one
 * copy instead of eight) and the `BottomTabBar` render, since every call
 * site was hand-computing the same `tab`/`tier`/`live` wiring anyway. Pass
 * no `tab` for the two screens reached by link rather than tab (Polls,
 * Memories) and nothing renders.
 *
 * The outer div is full-bleed (no max-width) so background and the
 * desktop top-nav run edge-to-edge; a separate inner wrapper caps
 * `children` at `max-w-content` so prose/forms/lists stay readable on wide
 * viewports. A screen with genuine full-bleed content of its own (only
 * TodayScreen's hero, today) has to explicitly break back out of that cap.
 */

import type { ReactNode } from "react";
import { BottomTabBar, type Tab } from "@/components/nav/BottomTabBar";
import type { Tier } from "@/content/wedding";

export function AppShell({
  children,
  tab,
  tier,
  live,
}: {
  children: ReactNode;
  tab?: Tab;
  tier?: Tier;
  live?: boolean;
}) {
  return (
    <div className="relative flex h-dvh w-full flex-col overflow-hidden bg-sand">
      {/* Ahead of the capped wrapper: BottomTabBar's mobile nav is `fixed`, so
          DOM order doesn't affect it, but its desktop nav is a normal-flow
          top bar and needs to be the first flex child to land at the top,
          full-bleed rather than capped to the reading column below. */}
      {tab && tier ? <BottomTabBar active={tab} tier={tier} live={live} /> : null}
      <div className="mx-auto flex min-h-0 w-full max-w-content flex-1 flex-col">
        {children}
      </div>
    </div>
  );
}
