"use client";

/**
 * Shown in place of Chat/Photos/Memories/Polls before the wedding goes live —
 * see the "RSVP mode vs Event mode" split. Those four routes have nothing to
 * show a guest until `isWeddingLive` flips true, so the page gates on that
 * server-side and renders this instead of the real screen.
 *
 * `activeTab` is only set by the two routes that actually live in the tab bar
 * (chat, photos) — that renders `BottomTabBar` underneath, trimmed to the
 * always-open tabs via `live={false}`, so a guest who lands here can still get
 * to Today/Schedule/RSVP. Memories and Polls aren't tab-bar routes even once
 * live (they're reached from links on TodayScreen), so they get a plain "back
 * to Today" link instead, matching those screens' own back-link style.
 */

import Link from "next/link";
import { useTranslations } from "next-intl";
import { AppShell } from "@/components/layout/AppShell";
import { BOTTOM_TAB_BAR_HEIGHT, type Tab } from "./BottomTabBar";
import { tierCode, type Tier } from "@/content/wedding";

export function EventModeLocked({
  tier,
  activeTab,
}: {
  tier: Tier;
  activeTab?: Extract<Tab, "chat" | "photos">;
}) {
  const t = useTranslations("eventLocked");

  return (
    <AppShell tab={activeTab} tier={tier} live={false}>
      <div
        className="flex flex-1 flex-col items-center justify-center px-8 text-center"
        style={{
          paddingBottom: activeTab ? BOTTOM_TAB_BAR_HEIGHT : undefined,
        }}
      >
        <h1 className="font-serif text-2xl text-deeptide">{t("title")}</h1>
        <p className="mt-2 font-sans text-[13.5px] leading-snug text-driftwood-soft">
          {t("body")}
        </p>
        <Link
          href={`/?tier=${tierCode(tier)}`}
          className="mt-6 font-sans text-[13px] font-medium text-deeptide"
        >
          {t("cta")}
        </Link>
      </div>
    </AppShell>
  );
}
