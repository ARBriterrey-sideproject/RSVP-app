/**
 * THE FACTS FOR ONE WEDDING — Shubham & Amruta, Gopalpur-on-Sea.
 *
 * This is the only file in `src/` that knows whose wedding this is. Everything
 * else compiles against `schema.ts` and reads its values through `wedding.ts`.
 * Swap this literal and the same code builds a different couple's app — that is
 * the entire point of the split, and the reason it must stay pure data: no
 * imports beyond the schema, no functions, no derived values.
 *
 * Every value marked PLACEHOLDER was invented by the design tool that produced
 * the identity file — it is NOT confirmed by the couple.
 *
 * Event dates/times move to Firestore before launch (admins need to edit them
 * without a redeploy). This file stays the seed + the local-dev fallback.
 */

import type { WeddingConfig } from "./schema";

export const weddingConfig: WeddingConfig = {
  configVersion: 1,
  slug: "shubham-amruta",

  /** The instance's own name. Untranslated — it's a proper noun in all four. */
  appName: "Shorelines",

  /** PLACEHOLDER — "Shubham" matches the repo path; confirm both. */
  couple: {
    partnerA: "Shubham",
    partnerB: "Amruta",
  },

  /**
   * CONFIRMED by the couple: 28–30 December 2026, three days.
   *
   * The RSVP deadline is still a PLACEHOLDER — 1 December gives four weeks to
   * chase stragglers and settle catering numbers, but nobody has agreed it.
   */
  dates: {
    firstDay: "2026-12-28",
    lastDay: "2026-12-30",
    rsvpDeadline: "2026-12-01",
    timeZone: "Asia/Kolkata",
  },

  /** CONFIRMED by the couple. Gopalpur-on-Sea, in Ganjam district. */
  destination: {
    label: "Gopalpur, Odisha, India",
    shortLabel: "Gopalpur · Odisha",
    region: "Gopalpur",
  },

  /**
   * The airport and station are real geography — Bhubaneswar (BBI) is the
   * nearest airport at roughly 170km, and Brahmapur is the nearest railhead at
   * roughly 16km, which is why the transport picker offers train as a
   * first-class option rather than an afterthought. Distances are approximate.
   * The shuttle and the room block are PLACEHOLDERS: neither is arranged yet.
   */
  logistics: {
    airport: {
      code: "BBI",
      name: "Bhubaneswar",
      distanceKm: 170,
      driveHours: "3½",
    },
    station: {
      name: "Brahmapur (BAM)",
      distanceKm: 16,
    },
    shuttle: {
      title: "Pickup from airport or station",
      description: "Tell us your arrival and we'll send a car",
    },
    stay: {
      description:
        "Held under your name until 15 December. Sea-facing on request.",
    },
  },

  /**
   * The couple's own schedule, 28–30 December 2026. Times are CONFIRMED.
   *
   * Venue names and dress codes are still PLACEHOLDERS — the couple gave times
   * and ceremonies, not rooms or what to wear. `mapsQuery` points at the town
   * until there's a named property to point at.
   *
   * Tier visibility is the real logic here:
   *   full            → all five ceremonies
   *   wedding_only    → the wedding
   *   reception_only  → the reception
   *
   * Order is chronological and load-bearing.
   */
  events: [
    {
      id: "mehendi",
      name: "Mehendi",
      startsAt: "2026-12-28T19:00:00+05:30",
      endsAt: "2026-12-28T21:00:00+05:30",
      venue: "Courtyard",
      venueShort: "Courtyard",
      mapsQuery: "Gopalpur-on-Sea, Odisha",
      dressCode: "Linen & green",
      daypart: "Evening",
      tiers: ["full"],
      accent: "palm",
    },
    {
      id: "haldi",
      name: "Haldi",
      startsAt: "2026-12-29T10:00:00+05:30",
      endsAt: "2026-12-29T14:00:00+05:30",
      venue: "Garden lawn",
      venueShort: "Garden lawn",
      mapsQuery: "Gopalpur-on-Sea, Odisha",
      dressCode: "Wear yellow · barefoot",
      daypart: "Morning",
      tiers: ["full"],
      accent: "warmgold",
    },
    {
      id: "sangeet",
      name: "Sangeet",
      startsAt: "2026-12-29T18:00:00+05:30",
      endsAt: "2026-12-29T21:00:00+05:30",
      venue: "Banquet lawn",
      venueShort: "Banquet lawn",
      mapsQuery: "Gopalpur-on-Sea, Odisha",
      dressCode: "Dance-ready",
      daypart: "Evening",
      tiers: ["full"],
      accent: "coral",
    },
    {
      id: "wedding",
      name: "Wedding",
      startsAt: "2026-12-30T10:00:00+05:30",
      endsAt: "2026-12-30T14:00:00+05:30",
      venue: "Shoreline mandap",
      venueShort: "Shoreline mandap",
      mapsQuery: "Gopalpur-on-Sea, Odisha",
      dressCode: "Formal ivory",
      daypart: "Morning",
      tiers: ["full", "wedding_only"],
      accent: "deeptide",
      highlight: { label: "Muhurat", at: "2026-12-30T11:28:00+05:30" },
    },
    {
      id: "reception",
      name: "Reception",
      startsAt: "2026-12-30T18:30:00+05:30",
      endsAt: "2026-12-30T21:00:00+05:30",
      venue: "Terrace",
      venueShort: "Terrace",
      mapsQuery: "Gopalpur-on-Sea, Odisha",
      dressCode: "Formal",
      daypart: "Evening",
      tiers: ["full", "reception_only"],
      accent: "clay",
    },
  ],

  /**
   * The couple's private gathering between the public events.
   *
   * Carries no tier, and lives in its own array so that no tier filter can
   * reach it. It is revealed only to guests the couple has individually flagged
   * in the dashboard. Time and venue are PLACEHOLDERS.
   *
   * SECURITY: the reveal is enforced in the callable and in Firestore rules,
   * not here. Treat this as copy, not as an access decision — never render it
   * without first checking the guest's own `speakeasyInvited` flag.
   */
  invitationOnlyEvents: [
    {
      id: "speakeasy",
      name: "The Speakeasy",
      startsAt: "2026-12-29T22:00:00+05:30",
      endsAt: "2026-12-30T01:00:00+05:30",
      venue: "Told to you on the night",
      venueShort: "Told to you on the night",
      mapsQuery: "Gopalpur-on-Sea, Odisha",
      dressCode: "Whatever you danced in",
      daypart: "Late",
      tiers: [],
      accent: "deeptide",
      invitationOnly: true,
    },
  ],

  /**
   * Meals and other fixed points. Merged with events by time on the timeline.
   *
   * The 28th's dinner has no separate slot in the couple's schedule — it reads
   * "7 to 9 pm - Mehandi, and Dinner", one thing, so it stays a note on the
   * Mehendi rather than a second line at the same hour.
   */
  schedule: [
    { id: "breakfast-29", name: "Breakfast", startsAt: "2026-12-29T08:00:00+05:30" },
    { id: "lunch-29", name: "Lunch", startsAt: "2026-12-29T13:00:00+05:30" },
    {
      id: "dinner-29",
      name: "Dinner",
      startsAt: "2026-12-29T20:00:00+05:30",
      note: "Served during the Sangeet",
    },
    { id: "breakfast-30", name: "Breakfast", startsAt: "2026-12-30T07:00:00+05:30" },
    { id: "lunch-30", name: "Lunch", startsAt: "2026-12-30T13:00:00+05:30" },
  ],

  /**
   * Soft cap on party size per submission. The plan flags this as an open item;
   * 15 is a starting guess, not a decision. Enforced server-side in the callable
   * Function — this value is only for inline validation feedback.
   */
  party: { softCap: 15 },
};
