# Track C — Places to Visit Nearby Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give guests flying in for three days somewhere to go on the fourth — a `/places` page listing the sights within reach of Gopalpur, reachable from the landing's Travel & Stay block, the foot of the schedule, and the pre-wedding Today screen.

**Architecture:** Nearby places are a fact about *this* wedding's location, so they become a top-level `places: NearbyPlace[]` on `WeddingConfig`, alongside `events` and `schedule`. `NearbyPlace` carries the same `mapsQuery` + `mapsCid` pair the events use, so the existing `mapsUrl()` accepts one unchanged — it is structurally typed on `{ mapsQuery: string; mapsCid?: string }`. A new `/places` route follows `app/schedule/page.tsx`'s thin server-wrapper shape, with `PlacesScreen` mounting `AppShell` itself as `ScheduleScreen` does. Places is not a bottom-nav tab, so the `Tab` union gains a `"places"` member with no `TABS` entry — the bar renders with nothing highlighted. Three entry cards link into it.

**Tech Stack:** Next.js 16 App Router (server components), React 19, Tailwind v4 (CSS-first), `next-intl`, `next/image`.

**Spec:** [`shorelines/docs/additional features.md`](../../../shorelines/docs/additional%20features.md) — the `## places to visit near by` section.

## ⚠️ Two content gaps the user must close before Task 3

Both are named in Task 1, which **blocks on the user**. Do not invent your way past either.

1. **One of the five spec links is unresolvable from this network.** `https://share.google/Ea5MH71O20fWqRLM0` — `share.google` refuses connections here. The user must say which place it is, or re-send it as a `maps.app.goo.gl` link.
2. **The place descriptions in Task 3 are a draft, not approved copy.** The event copy in Track B went through four rounds of review with the user before it was written down. This prose has had none. It must get the same sign-off.

## Global Constraints

- **`wedding.config.ts` must stay pure data** — "no imports beyond the schema, no functions, no derived values", per its own doc comment.
- **A hardcoded fact in `wedding.ts` is a bug.** Every named export there derives from the config.
- **Never store a shortened Maps link.** `wedding.config.ts` says why: "a shortener is a redirect someone else can retire, while both of these are the place's own facts." Store the resolved address as `mapsQuery` and the numeric place id as `mapsCid`. `mapsCid` is optional; an address-only place still works, it just risks landing on a results list.
- **Places do NOT go in the runtime overlay (`config/live`).** Same reason as venue names and dress codes, stated in `schema.ts`: a string typed at runtime has no catalogue entry, so hi/kn/or fall back to English silently.
- **Four locales, always: `en`, `hi`, `kn`, `or`.**
- **`messages/en.json`'s `wedding` key is an empty object `{}` and that is correct.** English facts come from the config; `pick(t, key, fallback)` returns the config value when the catalogue lacks the key. A missing key is the designed path, not a bug.
- **Editing a file in `messages/` requires a dev-server restart.**
- **`AppShell` renders the bottom tab bar only when BOTH `tab` and `tier` are set** — `{tab && tier ? <BottomTabBar … /> : null}` at `AppShell.tsx:46`. Both props are optional, so omitting `tab` does not merely un-highlight the nav, it **removes the nav entirely** and strands the guest on `/places` with no way back. `/places` must pass both. See Task 5 Step 1 for how it passes a `tab` without lying about which tab is active.
- **The screen owns its `AppShell`, not the route.** `src/app/schedule/page.tsx` renders `<ScheduleScreen …>` directly and `ScheduleScreen` mounts `AppShell` internally, because it owns a fixed-height app viewport. `PlacesScreen` follows the same split.
- **No photographs of these places exist.** `public/images/` holds `couple.jpg`, `couple-desktop.jpg`, `resort.jpg` and nothing else. `NearbyPlace.image` is optional and every component must render correctly without it. **Do not invent image paths.**
- **Do not fabricate distances or drive times.** Task 2 has an explicit lookup step. Web search returned figures for Mahendragiri ranging from 51 km to 131 km depending on the source and reference point — read them off Maps directions from the resort, once, and write down what it says.
- **Verification gate for every task:** `npm run lint && npm run build` from `shorelines/` must both pass before the commit step.

## File Structure

| File | Change | Responsibility after this track |
|---|---|---|
| `shorelines/src/content/schema.ts` | Modify | Gains `NearbyPlace`; `WeddingConfig` gains `places: NearbyPlace[]`. |
| `shorelines/src/content/wedding.config.ts` | Modify | Gains the `places` array. |
| `shorelines/src/content/wedding.ts` | Modify | Gains the `PLACES` named export, derived from the config. |
| `shorelines/src/i18n/weddingCopy.ts` | Modify | Gains `placeCopy(t, place)`. |
| `shorelines/messages/en.json` | Modify | Gains the `places` namespace (page chrome, card labels). |
| `shorelines/messages/{hi,kn,or}.json` | Modify | Same namespace, plus optional `wedding.places.*` body overrides. |
| `shorelines/src/app/places/page.tsx` | **Create** | Thin server wrapper: resolves tier, renders `PlacesScreen` in `AppShell`. |
| `shorelines/src/components/places/PlacesScreen.tsx` | **Create** | The page — intro, then a `PlaceCard` per place. |
| `shorelines/src/components/places/PlaceCard.tsx` | **Create** | One place: name, tagline, distance, description, directions link, optional read-more link. |
| `shorelines/src/components/places/PlacesEntryCard.tsx` | **Create** | The shared "Places to visit" teaser linking to `/places`. Used on the landing, the schedule and `/today`. |
| `shorelines/src/components/invite/InviteLanding.tsx` | Modify | `TravelAndStay` gains the entry card. |
| `shorelines/src/components/schedule/ScheduleScreen.tsx` | Modify | Gains a "Places to visit and things to do" section. |
| `shorelines/src/components/today/UpcomingScreen.tsx` | Modify | Gains the entry card. **Track A rewrites this file — land Track A first.** |
| `shorelines/src/components/nav/BottomTabBar.tsx` | Modify | `Tab` union gains `"places"`. No new `TABS` entry. |

## Task Ordering

1 → 2 → 3 → 4 → 5 → 6 → 7 → 8. **Task 1 blocks on the user.**

**Coordination with Tracks A and B:** all three touch `InviteLanding.tsx`; B and C both touch `schema.ts`, `wedding.config.ts`, `weddingCopy.ts`, `ScheduleScreen.tsx` and all four catalogues. **Land this track last.** B appends `info` *inside* each event object and C appends a separate top-level `places` array, so the config conflict is mechanical, but the catalogues and `ScheduleScreen` will need a real merge if these run concurrently.

**The Today-page connection:** the spec's first Today bullet asks for "Places to visit and things to do" on the schedule page *instead of* the "your days with us" section on Today. **Track A removes that section; this track adds it to the schedule** (Task 6 Step 3). Neither track does both halves, so neither can claim that bullet alone. Separately, spec line 170 asks for a places *card* on Today — that is Task 6 Step 4, and it is a different thing from the section.

---

### Task 1: Resolve the five places

**Files:** none — this task produces facts, not code.

**Interfaces:**
- Consumes: `docs/additional features.md` lines 160–166.
- Produces: a confirmed name, resolved address, and CID for each place, used verbatim in Task 3.

**Already resolved.** Two of the four Maps links were expanded and their CIDs converted from the `!1s0x<FID>:0x<CID>` pair. Use these exactly:

| Place | `mapsQuery` (resolved address) | CID hex | `mapsCid` (decimal) |
|---|---|---|---|
| Jiranga Buddhist Monastery | `Jiranga Buddhist Monastery, Jeerango, Odisha 761017, India` | `0x49ff08adea827d9c` | `5331990026886741404` |
| Shree Jagannatha Temple, Puri | `Shree Jagannatha Temple Puri, Puri, Odisha 752001, India` | `0x8f052c84639c7d48` | `10305692269425753416` |

**Identified but without a CID.** Both are unambiguous places; they simply weren't given as Maps links.

- **Mahendragiri** — named in the spec. The second-highest peak of the Eastern Ghats, in Gajapati district.
- **Udayagiri & Khandagiri Caves** — given as an odishatourism.gov.in URL, not a Maps link. Jain rock-cut caves on the edge of Bhubaneswar.

- [ ] **Step 1: Ask the user for the fifth link**

`https://share.google/Ea5MH71O20fWqRLM0` cannot be resolved — `share.google` refuses connections from this network. Ask the user: *"Which place is this, or can you re-send it as a `maps.app.goo.gl` link?"* Then resolve it the same way as Step 2.

**Do not guess, and do not drop it silently.** If the user would rather ship four places than wait, that is their call to make explicitly.

- [ ] **Step 2: Resolve any outstanding link to an address and CID**

```bash
curl -s -o /dev/null -w '%{url_effective}\n' -L 'https://maps.app.goo.gl/<code>'
```

If `curl` is blocked, use WebFetch — it reports the redirect target without following it, which is all that's needed. Read two things out of the resulting URL:

- the address, from the `/maps/place/<address>/` path segment (URL-decoded);
- the CID, from `data=!4m2!3m1!1s0x<FID>:0x<CID>` — the **second** hex value.

Convert it:

```bash
python3 -c "print(int('0x<CID>', 16))"
```

- [ ] **Step 3: Get a CID for Mahendragiri and for Udayagiri & Khandagiri, if you can**

Open each in Google Maps, copy the resulting place URL, and read the CID out of it as in Step 2. If you can't, leave `mapsCid` off — it is optional, and `mapsUrl` falls back to `?q=<address>`. Note that the couple reported exactly this fallback opening a *results* page rather than the place, so prefer a CID where one is obtainable.

- [ ] **Step 4: Look up the road distance and drive time from the resort**

For each place, get driving directions **from** `Gopalpur Resort, near Gopalpur Light House, Gopalpur, Brahmapur, Odisha 761002, India` and write down the kilometres and the duration Maps reports.

Round the distance to a whole number for `distanceKm`. Write `driveTime` the way `logistics.airport.driveHours` is written — `"3½"`, not `"3.5"` — because, per `schema.ts`, that character is typography `Intl.NumberFormat` will not produce.

**These are the numbers a guest uses to decide whether a day trip is possible. Do not estimate them.**

- [ ] **Step 5: Record what you found**

Write the confirmed table into this task in the plan file before moving on, so Task 3 has exact values to copy and a later reader can see where they came from.

---

### Task 2: Add the `NearbyPlace` contract

**Files:**
- Modify: `shorelines/src/content/schema.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  ```ts
  export interface NearbyPlace {
    id: string;
    name: string;
    tagline: string;
    description: string;
    mapsQuery: string;
    mapsCid?: string;
    distanceKm: number;
    driveTime: string;
    infoUrl?: string;
    image?: string;
  }
  ```
  and `WeddingConfig` gains `places: NearbyPlace[]`.

- [ ] **Step 1: Add the interface after `ScheduleItem`**

```ts
/**
 * SOMEWHERE TO GO ON THE FOURTH DAY.
 *
 * Guests flying in for a three-day wedding often have a spare day at one end,
 * and the ones travelling furthest are the least equipped to find anything.
 * This is the couple's shortlist, not a directory — keep it to places worth a
 * trip, in the order they'd recommend them.
 *
 * `id` is a free string rather than a union, unlike `EventId`. Event ids are a
 * union because they key `perEventAttendance` on every guest's stored reply, so
 * a typo must fail the build. Nothing stores a place id, so the same rigidity
 * would only make adding a place a two-file edit.
 *
 * The maps pair works exactly as it does on an event: `mapsCid` names one
 * listing and is preferred, `mapsQuery` is the resolved address and is the
 * fallback. `mapsUrl` in wedding.ts is structurally typed and accepts either
 * shape unchanged. Never store a maps.app.goo.gl or share.google link here.
 */
export interface NearbyPlace {
  id: string;
  name: string;
  /** One short line under the name — what kind of place this is. */
  tagline: string;
  /** A paragraph: what it is and why it's worth the drive. */
  description: string;
  mapsQuery: string;
  mapsCid?: string;
  /** Road distance from the resort, whole kilometres. */
  distanceKm: number;
  /**
   * Driving time as prose — "3½", "1", "2¼". A string, matching
   * `AirportPoint.driveHours`, because the vulgar fractions are typography
   * `Intl.NumberFormat` won't produce.
   */
  driveTime: string;
  /** An official page a guest can read more on. Optional. */
  infoUrl?: string;
  /**
   * Path under `/public`. OPTIONAL and currently unset for every place: no
   * photographs exist. Every consumer must render text-only without it.
   */
  image?: string;
}
```

- [ ] **Step 2: Add the field to `WeddingConfig`**

After the `schedule: ScheduleItem[];` line:

```ts
  /**
   * Day trips from the venue. May be empty — a couple marrying in a city their
   * guests already know needs no such list, and `/places` renders its empty
   * state rather than breaking.
   */
  places: NearbyPlace[];
```

Required, not optional: an empty array says "we considered this and there's nothing", while a missing key says nothing at all, and this is the config contract every future instance compiles against.

- [ ] **Step 3: Verify — expect a failure**

```bash
cd shorelines && npm run build
```

Expected: **fails**, because `wedding.config.ts` has no `places` key. That failure is the contract doing its job. Task 3 fixes it.

- [ ] **Step 4: Commit**

```bash
git add shorelines/src/content/schema.ts
git commit -m "feat(content): add the NearbyPlace contract"
```

Committing a red build is acceptable here only because Task 3 follows immediately and the two are one logical change split for review. If you are stopping between tasks, do Tasks 2 and 3 together instead.

---

### Task 3: Write the places into the config

**Files:**
- Modify: `shorelines/src/content/wedding.config.ts`

**Interfaces:**
- Consumes: `NearbyPlace` from Task 2; the confirmed facts from Task 1.
- Produces: `weddingConfig.places`.

**The prose below is a DRAFT.** It has not been reviewed by the user, unlike Track B's event copy which went through four rounds. Show it to them before or immediately after writing it, and expect edits. The `distanceKm` and `driveTime` values below are written as `0` and `""` **deliberately** — fill them from Task 1 Step 4 and do not ship the zeros.

- [ ] **Step 1: Add the `places` array after `schedule`**

```ts
  /**
   * The couple's shortlist for guests with a spare day, nearest first.
   *
   * Two of these carry CIDs read off the couple's own shared links; the other
   * two are given by address because no Maps link was shared for them. See
   * `mapsCid` in schema.ts for what a CID is and why it's preferred.
   *
   * Distances and drive times are road figures from the resort. Published
   * sources disagree wildly on Mahendragiri in particular — these came from
   * Maps directions, not from a search result.
   */
  places: [
    {
      id: "mahendragiri",
      name: "Mahendragiri",
      tagline: "The second-highest peak of the Eastern Ghats",
      description:
        "A forested peak in Gajapati district, with ancient stone temples near the summit that local tradition ties to the Mahabharata. The drive up is the point as much as the top is — winding road, deep green, and views back across the hills. Go early; it cools and clouds over by afternoon.",
      mapsQuery: "Mahendragiri, Gajapati, Odisha, India",
      distanceKm: 0,
      driveTime: "",
    },
    {
      id: "jiranga-monastery",
      name: "Jiranga Buddhist Monastery",
      tagline: "A Tibetan monastery in the Odisha hills",
      description:
        "A large Tibetan Buddhist monastery at Jeerango, at the centre of a settlement founded by Tibetan refugees. Gold roofs, prayer flags and painted halls, in the middle of Odishan farmland — an unexpected thing to find an hour inland, and quiet enough to sit in for a while.",
      mapsQuery: "Jiranga Buddhist Monastery, Jeerango, Odisha 761017, India",
      mapsCid: "5331990026886741404",
      distanceKm: 0,
      driveTime: "",
    },
    {
      id: "puri-jagannath",
      name: "Shree Jagannatha Temple, Puri",
      tagline: "One of India's four holiest pilgrimage sites",
      description:
        "The 12th-century temple at the heart of Puri, and one of the four Char Dham pilgrimage sites. It is a working temple, not a monument: the town around it moves to its rhythm, and the beach is a few minutes' walk away. Note that entry to the temple itself is restricted to Hindus — the surrounding town and the outer precinct are open to everyone.",
      mapsQuery: "Shree Jagannatha Temple Puri, Puri, Odisha 752001, India",
      mapsCid: "10305692269425753416",
      distanceKm: 0,
      driveTime: "",
    },
    {
      id: "udayagiri-khandagiri",
      name: "Udayagiri & Khandagiri Caves",
      tagline: "Jain rock-cut caves, carved in the 2nd century BCE",
      description:
        "Two facing hills on the edge of Bhubaneswar, honeycombed with cells cut for Jain monks over two thousand years ago, and carved with friezes of processions, hunts and dancers. Udayagiri carries the Hathigumpha inscription, one of the most important records of early Indian history. Easy to combine with a flight out of Bhubaneswar.",
      mapsQuery: "Udayagiri and Khandagiri Caves, Bhubaneswar, Odisha 751030, India",
      infoUrl:
        "https://odishatourism.gov.in/content/tourism/en/discover/attractions/temples-monuments/udaygiri-and-amp-khandagiri-caves-temple.html",
      distanceKm: 0,
      driveTime: "",
    },
  ],
```

The note about temple entry in the Puri description is there deliberately — a guest flying in from abroad who drives three hours and is then turned away at the door has been failed by this page. If the user cuts it, that is their call; do not cut it for brevity.

- [ ] **Step 2: Add the fifth place, if Task 1 Step 1 produced one**

Same shape. Insert in distance order.

- [ ] **Step 3: Fill in every `distanceKm` and `driveTime`**

From Task 1 Step 4. Then grep to prove none was missed:

```bash
cd shorelines && grep -n 'distanceKm: 0\|driveTime: ""' src/content/wedding.config.ts
```

Expected: no output.

- [ ] **Step 4: Verify**

```bash
cd shorelines && npm run lint && npm run build
```

Expected: both pass — Task 2's deliberate failure is now resolved.

- [ ] **Step 5: Commit**

```bash
git add shorelines/src/content/wedding.config.ts
git commit -m "content: add the nearby places the couple recommends"
```

---

### Task 4: Expose places through the reading surface

**Files:**
- Modify: `shorelines/src/content/wedding.ts`
- Modify: `shorelines/src/i18n/weddingCopy.ts`
- Modify: `shorelines/messages/en.json`

**Interfaces:**
- Consumes: `NearbyPlace`, `weddingConfig.places`.
- Produces:
  ```ts
  // wedding.ts
  export const PLACES: NearbyPlace[]

  // weddingCopy.ts
  export interface PlaceCopy { name: string; tagline: string; description: string }
  export function placeCopy(t: Lookup, place: NearbyPlace): PlaceCopy
  ```

- [ ] **Step 1: Add the `PLACES` export**

In `wedding.ts`, immediately after `SCHEDULE_ITEMS` (currently line 121), matching the form its neighbours already take — annotated, not `as const`, not wrapped:

```ts
/** The couple's day-trip shortlist. Derived, like everything else here. */
export const PLACES: NearbyPlace[] = weddingConfig.places;
```

Two import edits in the same file:

- add `NearbyPlace` to the **value-side type import** from `./schema` at the top (the block containing `EventAccent`, `ScheduleItem`, `Tier`, `WeddingConfig`, `WeddingEvent`), so the annotation resolves;
- add `NearbyPlace` to the **`export type { … } from "./schema"` re-export block** (line ~47, containing `EmergencyContact`, `EventAccent`, `EventId`, `ScheduleItem`, …), alphabetically. Components import wedding types through `@/content/wedding`, not from `schema.ts` directly — that re-export is what makes `wedding.ts` the single reading surface, and skipping it would force `PlaceCard` to reach past it into the schema.

- [ ] **Step 2: Add `placeCopy`**

In `weddingCopy.ts`, after `scheduleCopy`:

```ts
/** The localised form of a place. Distances and URLs are language-neutral. */
export interface PlaceCopy {
  name: string;
  tagline: string;
  description: string;
}

/**
 * One place, in the reader's language.
 *
 * Only the three prose fields go through `pick` — a distance, a maps query and
 * a URL read the same in every language, and routing them through the
 * catalogue would invite a translator to "localise" an address.
 */
export function placeCopy(t: Lookup, place: NearbyPlace): PlaceCopy {
  return {
    name: pick(t, `places.${place.id}.name`, place.name),
    tagline: pick(t, `places.${place.id}.tagline`, place.tagline),
    description: pick(t, `places.${place.id}.description`, place.description),
  };
}
```

Import `NearbyPlace` from `@/content/schema`, matching how `WeddingEvent` is imported in the same file.

- [ ] **Step 3: Add the `places` namespace to `messages/en.json`**

Top level, alongside `landing`, `today`, `schedule`:

```json
"places": {
  "title": "Places to visit",
  "intro": "If you have a spare day at either end of the wedding, here is what the two of us would send you to see.",
  "entryTitle": "Places to visit nearby",
  "entryBody": "Somewhere to go if you have a spare day",
  "away": "{km} km away · about {hours} hours by road",
  "awayOne": "{km} km away · about an hour by road",
  "directions": "Get directions",
  "readMore": "Read more",
  "empty": "We'll add our recommendations here closer to the wedding."
}
```

`awayOne` exists because "about 1 hours" is wrong in English and the fix belongs in the catalogue, not in a component. Choose between them on `place.driveTime === "1"` at the call site.

- [ ] **Step 4: Verify**

```bash
cd shorelines && npm run lint && npm run build
```

- [ ] **Step 5: Commit**

```bash
git add shorelines/src/content/wedding.ts shorelines/src/i18n/weddingCopy.ts shorelines/messages/en.json
git commit -m "feat(places): expose nearby places through the reading surface"
```

---

### Task 5: Build the page

**Files:**
- Create: `shorelines/src/app/places/page.tsx`
- Create: `shorelines/src/components/places/PlacesScreen.tsx`
- Create: `shorelines/src/components/places/PlaceCard.tsx`
- Modify: `shorelines/src/components/nav/BottomTabBar.tsx:26`

**Interfaces:**
- Consumes: `PLACES`, `placeCopy`, `mapsUrl`, `resolveTier`, `resolveAsOf`, `getLiveWeddingConfig`, `isWeddingLive`, `AppShell`.
- Produces:
  ```ts
  export function PlacesScreen(props: { tier: Tier; live: boolean }): JSX.Element
  export function PlaceCard(props: { place: NearbyPlace }): JSX.Element
  export type Tab = "today" | "schedule" | "rsvp" | "chat" | "photos" | "places"
  ```

- [ ] **Step 1: Add `"places"` to the `Tab` union**

`src/components/nav/BottomTabBar.tsx:26`:

```ts
export type Tab = "today" | "schedule" | "rsvp" | "chat" | "photos" | "places";
```

**Add nothing to the `TABS` array.** Places is a destination, not a tab. `BottomTabBar` computes `const isActive = id === active` per tab, so an `active` value with no matching entry simply highlights none of them — which is exactly right for a page reached by link. The `aria-label` is built from `visibleTabs`, so it is unaffected too.

This is the alternative to passing `tab="schedule"` and highlighting a tab the guest is not on. If a reviewer prefers that lie to an unused union member, it is a defensible call — but do not simply omit `tab`, which removes the whole nav.

- [ ] **Step 2: Write `src/app/places/page.tsx`**

`schedule/page.tsx` is the template — a thin `async` server component using Next 16's `PageProps` route-typed helper, awaiting `searchParams`:

```tsx
import { PlacesScreen } from "@/components/places/PlacesScreen";
import { isWeddingLive, resolveTier } from "@/content/wedding";
import { resolveAsOf } from "@/lib/wedding/asOf";
import { getLiveWeddingConfig } from "@/lib/wedding/live";

/**
 * Somewhere to go on a spare day. Reached from the landing's Travel & Stay
 * block and from the foot of the schedule, never from the tab bar — so it
 * carries the tier code forward like every other guest route, and renders
 * the nav with nothing highlighted.
 *
 * Thin, like `schedule/page.tsx`: PlacesScreen mounts its own AppShell.
 */
export default async function PlacesPage({
  searchParams,
}: PageProps<"/places">) {
  const params = await searchParams;
  const config = await getLiveWeddingConfig();

  return (
    <PlacesScreen
      tier={resolveTier(params.tier)}
      live={isWeddingLive(config, resolveAsOf(params.asOf))}
    />
  );
}
```

`live` is threaded purely so the tab bar trims Chat and Photos before the wedding, exactly as `ScheduleScreen` does. Places aren't tier-gated — every guest sees the same list — but the tier must travel so the nav hrefs keep the guest on their own invite.

`PageProps<"/places">` is generated from the route directory; it resolves only once `src/app/places/page.tsx` exists, so a red squiggle before the first build is expected.

- [ ] **Step 3: Write `PlaceCard.tsx`**

```tsx
import Image from "next/image";
import { useTranslations } from "next-intl";

import { mapsUrl } from "@/content/wedding";
import { placeCopy } from "@/i18n/weddingCopy";
import type { NearbyPlace } from "@/content/wedding";

/**
 * One place, on /places.
 *
 * The image is optional and currently unset for all of them — the card is laid
 * out so the text-only form is the normal one rather than a degraded one.
 */
export function PlaceCard({ place }: { place: NearbyPlace }) {
  const t = useTranslations("places");
  const tWedding = useTranslations("wedding");
  const copy = placeCopy(tWedding, place);

  return (
    <article className="overflow-hidden rounded-card border border-hairline bg-foam">
      {place.image && (
        <div className="relative h-40 w-full">
          <Image
            src={place.image}
            alt=""
            fill
            sizes="(min-width: 42rem) 42rem, 100vw"
            className="object-cover"
          />
        </div>
      )}
      <div className="p-5">
        <h2 className="font-serif text-[20px] leading-tight text-driftwood">
          {copy.name}
        </h2>
        <p className="mt-1 font-sans text-[12.5px] text-driftwood-soft">
          {copy.tagline}
        </p>
        <p className="mt-1.5 font-sans text-[11px] uppercase tracking-[0.16em] text-driftwood-faint">
          {place.driveTime === "1"
            ? t("awayOne", { km: place.distanceKm })
            : t("away", { km: place.distanceKm, hours: place.driveTime })}
        </p>
        <p className="mt-3 font-sans text-[13px] leading-[1.65] text-driftwood-soft">
          {copy.description}
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
          <a
            href={mapsUrl(place)}
            target="_blank"
            rel="noreferrer"
            className="font-sans text-[12.5px] font-medium text-deeptide underline underline-offset-2"
          >
            {t("directions")}
          </a>
          {place.infoUrl && (
            <a
              href={place.infoUrl}
              target="_blank"
              rel="noreferrer"
              className="font-sans text-[12.5px] text-driftwood-soft underline underline-offset-2"
            >
              {t("readMore")}
            </a>
          )}
        </div>
      </div>
    </article>
  );
}
```

**No cast on `tWedding`, deliberately.** `Lookup` in `weddingCopy.ts` is written as the structural subset that `useTranslations`' return type already satisfies, so it is directly assignable — `ScheduleScreen.tsx:515` passes `t={tWedding}` bare into a `t: Lookup` prop with no cast anywhere in the file. If TypeScript complains here, the bug is in the import or in `Lookup`, not something to silence with `as never`.

Note the `NearbyPlace` type import comes from `@/content/wedding`, not `@/content/schema`. `wedding.ts` has an `export type { … } from "./schema"` re-export block and components import through it — Task 4 Step 1 must add `NearbyPlace` to that block, alphabetically, alongside `EventId` and `ScheduleItem`.

- [ ] **Step 4: Write `PlacesScreen.tsx`**

A server component — no `"use client"`. There is no state on this page.

```tsx
import { useTranslations } from "next-intl";

import { PlaceCard } from "@/components/places/PlaceCard";
import { AppShell } from "@/components/layout/AppShell";
import { PLACES } from "@/content/wedding";
import type { Tier } from "@/content/wedding";

export function PlacesScreen({ tier, live }: { tier: Tier; live: boolean }) {
  const t = useTranslations("places");

  return (
    <AppShell tab="places" tier={tier} live={live}>
      <div className="mx-auto w-full max-w-content px-5 pb-16 pt-8">
        <h1 className="font-display text-[34px] leading-none text-deeptide">
          {t("title")}
        </h1>
        {PLACES.length === 0 ? (
          <p className="mt-4 font-sans text-[13.5px] leading-[1.7] text-driftwood-soft">
            {t("empty")}
          </p>
        ) : (
          <>
            <p className="mt-3 font-sans text-[13.5px] leading-[1.7] text-driftwood-soft">
              {t("intro")}
            </p>
            <div className="mt-7 flex flex-col gap-4">
              {PLACES.map((place) => (
                <PlaceCard key={place.id} place={place} />
              ))}
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
```

**Before writing this, open `ScheduleScreen.tsx` and look at how it lays out inside `AppShell`.** Its doc comment says it "owns a fixed-height app viewport of its own" — if it wraps its children in a scroll container (there is one around lines 505–508), `/places` needs the equivalent or the page will not scroll on a phone. The markup above assumes ordinary document flow; reconcile it with what `ScheduleScreen` actually does rather than shipping the first thing that renders on a desktop viewport.

Check the heading sizes and paddings against `ScheduleScreen`'s own header too — this page should look like it was always there, and the classes above are a starting point, not a measurement.

`max-w-content` resolves to `--container-content: 42rem` in the `@theme` block; it is a real token, not invented.

- [ ] **Step 5: Look at it**

Restart the dev server (Task 4 edited `messages/`):

```bash
cd shorelines && npm run dev
```

Open `http://localhost:3000/places?tier=f`. Check:

- every place renders, and the distance line reads naturally;
- "Get directions" opens the right listing for both CID places and both address-only ones;
- **the bottom nav is present**, with no tab highlighted — this is the specific thing Step 1 exists to protect, and its absence is the failure mode. Tap Schedule and confirm it navigates and carries `tier=f`;
- the page scrolls on a 375px-tall-ish viewport and nothing overflows horizontally at 375px wide;
- open `/places?tier=f&asOf=2026-12-29T12:00:00%2B05:30` and confirm Chat and Photos appear in the nav — that proves `live` is threaded, not hardcoded.

- [ ] **Step 6: Verify**

```bash
cd shorelines && npm run lint && npm run build
```

- [ ] **Step 7: Commit**

```bash
git add shorelines/src/app/places shorelines/src/components/places \
        shorelines/src/components/nav/BottomTabBar.tsx
git commit -m "feat(places): add the /places page"
```

---

### Task 6: Add the two entry points

**Files:**
- Create: `shorelines/src/components/places/PlacesEntryCard.tsx`
- Modify: `shorelines/src/components/invite/InviteLanding.tsx` — `TravelAndStay` (~368–433)
- Modify: `shorelines/src/components/schedule/ScheduleScreen.tsx`
- Modify: `shorelines/src/components/today/UpcomingScreen.tsx` — **also Track A's file; land Track A first**

**Interfaces:**
- Consumes: the `places` message namespace from Task 4.
- Produces:
  ```ts
  export function PlacesEntryCard(props: { tier: Tier }): JSX.Element
  ```

- [ ] **Step 1: Write `PlacesEntryCard.tsx`**

```tsx
import Link from "next/link";
import { useTranslations } from "next-intl";

import { tierCode } from "@/content/wedding";
import type { Tier } from "@/content/schema";

/**
 * The teaser that links into /places. One component for both entry points —
 * the landing's Travel & Stay block and the schedule — because two copies of
 * the same card is two places for the copy to drift.
 *
 * Server component: it is a link, not a control.
 */
export function PlacesEntryCard({ tier }: { tier: Tier }) {
  const t = useTranslations("places");

  return (
    <Link
      href={`/places?tier=${tierCode(tier)}`}
      className="flex items-center justify-between gap-4 rounded-card border border-hairline bg-foam px-5 py-4"
    >
      <span className="min-w-0">
        <span className="block font-sans text-[14px] font-medium text-driftwood">
          {t("entryTitle")}
        </span>
        <span className="mt-0.5 block font-sans text-[12.5px] text-driftwood-soft">
          {t("entryBody")}
        </span>
      </span>
      <span aria-hidden className="flex-none text-[16px] text-deeptide">
        →
      </span>
    </Link>
  );
}
```

`tierCode` is what maps `full` → `f`; the URL must carry the letter, never the spelled-out tier. Confirm the import path and name in `wedding.ts` before writing.

- [ ] **Step 2: Add it to the landing's Travel & Stay block**

In `InviteLanding.tsx`, inside `TravelAndStay`, after the existing airport/station/stay rows. **Read the block first** — it renders rows in a particular wrapper with particular spacing, and the entry card must sit inside that rhythm, not bolted under it.

`InviteLanding` is a server component and `PlacesEntryCard` is too, so this adds no client island. **Do not add `"use client"` anywhere.** Thread `tier` from whatever `TravelAndStay` already receives; if it doesn't receive one, add it to its props from the page-level tier rather than reaching for a hook.

- [ ] **Step 3: Add the section to the schedule**

`ScheduleScreen`'s `PrivateEventsSection` (~197–272) is the pattern for a titled section on that page — heading, spacing, container. Copy its outer shape and put `PlacesEntryCard` inside, at the bottom of the timeline.

Give it the heading the spec asks for. Add to the `places` namespace in `en.json`:

```json
"scheduleSectionTitle": "Places to visit and things to do"
```

`ScheduleScreen` is `"use client"`, so `PlacesEntryCard` — a server component with no `"use client"` — becomes a client component when imported there. That is fine: it has no server-only dependency. Confirm the build agrees rather than assuming.

- [ ] **Step 4: Add the card to `/today`**

The spec asks for this twice over, in two places that look contradictory until you line them up:

- line 170 — *"another link will be present within the today section as a card and will redirect to the same page"*;
- line 174 — *"can't we have 'Places to visit and things to do' section in the schedule page instead"*.

These are not in conflict. Line 174 is about *the events list* moving off Today; line 170 asks for a places **card** on Today. Both are in scope: Step 3 does the schedule section, this step does the Today card.

Add `PlacesEntryCard` to `src/components/today/UpcomingScreen.tsx`, the pre-wedding screen — that is where a guest is planning their trip and the card earns its place. Thread `tier` from what `UpcomingScreen` already receives.

**Do not add it to `TodayScreen.tsx` without asking.** That screen is dense during the wedding itself and its job is the next few hours, not a day trip. The spec's "today section" is genuinely ambiguous between the two; the pre-wedding screen is the defensible reading, and the other is a question for the couple, not a guess.

**Overlap with Track A:** Track A rewrites this same file — removing the events section and the "View schedule" link, and promoting "Leave a message" under the countdown. **Land Track A first.** If both are in flight, add this card after Track A's Task 4, so the vertical order is settled before another card joins it.

- [ ] **Step 5: Check all three entry points**

Restart the dev server. Then:

- `http://localhost:3000/?tier=f&invite=1` → scroll to Travel & Stay → the card is there and lands on `/places?tier=f`.
- `http://localhost:3000/schedule?tier=r` → the section is at the bottom and lands on `/places?tier=r`. **The tier letter must survive the hop** — check the address bar, not just that the page loaded.
- `http://localhost:3000/today?tier=w` → the card is there and lands on `/places?tier=w`.

The tier check is not busywork: a card that drops the letter silently widens a wedding-only guest's invite to the full one on the next page they open.

- [ ] **Step 6: Verify**

```bash
cd shorelines && npm run lint && npm run build
```

- [ ] **Step 7: Commit**

```bash
git add shorelines/src/components shorelines/messages/en.json
git commit -m "feat(places): link to nearby places from the landing, schedule and today"
```

---

### Task 7: Translate into hi, kn and or

**Files:**
- Modify: `shorelines/messages/{hi,kn,or}.json`

**Interfaces:**
- Consumes: the key paths from Tasks 4 and 6.
- Produces: nothing importable.

An absent key here is **not a bug** — `pick` falls back to the English config, so a partial catalogue renders English for what's untranslated and the target language for the rest.

- [ ] **Step 1: Add the `places` namespace to all three**

Top level, matching the English keys exactly: `title`, `intro`, `entryTitle`, `entryBody`, `away`, `awayOne`, `directions`, `readMore`, `empty`, `scheduleSectionTitle`.

Keep the `{km}` and `{hours}` placeholders intact in `away` and `awayOne` — they are ICU argument names, not words, and translating one silently breaks the string.

- [ ] **Step 2: Add the body overrides under the existing `wedding` key**

Key paths, exactly: `wedding.places.<id>.{name,tagline,description}` for each place id.

Place names are proper nouns — render them in the target script rather than translating them. "Shree Jagannatha Temple" is a name a Hindi or Odia reader knows; a semantic translation would be unrecognisable. Odia in particular: Puri and Udayagiri are local landmarks and a translated name would read as an error.

- [ ] **Step 3: Restart the dev server and check each locale**

Mandatory restart. Open `/places` in hi, kn and or. Confirm no bare key paths, and that the `{km}`/`{hours}` substitution still works in each.

- [ ] **Step 4: Verify**

```bash
cd shorelines && npm run lint && npm run build
```

- [ ] **Step 5: Commit**

```bash
git add shorelines/messages
git commit -m "i18n: translate the nearby places for hi/kn/or"
```

---

### Task 8: Full verification pass

**Files:** none, unless a defect turns up.

- [ ] **Step 1: Run the suites**

Emulators in one shell (`cd shorelines && firebase emulators:start`), then:

```bash
cd shorelines && npm run test:emulators && npm run test:e2e
```

An Odia date hydration failure in `test:e2e` is the documented Playwright Chromium ICU artifact — confirm the failure names `or` and a date before dismissing it. Nothing in this track touches dates, so a *new* hydration failure elsewhere is real.

- [ ] **Step 2: Check every maps link actually lands on the place**

Open `mapsUrl()`'s output for all five. This is the exact failure the couple already reported once — `?q=` opening a results list instead of the venue. Any place that lands on a list rather than a listing needs its CID found (Task 1 Step 3) before launch, and if you can't find one, say so rather than leaving it.

- [ ] **Step 3: Check the offline path**

`public/sw.js` is network-first with cache fallback for same-origin routes. Load `/places`, then go offline in DevTools and reload. It should serve from cache. Offline caching is a stated hard requirement for venue Wi-Fi, and a new route inherits it only if nothing on the page breaks without the network — the maps links are external and will fail, which is correct and expected.

- [ ] **Step 4: Commit any fixes**

```bash
git add -A shorelines
git commit -m "fix(places): <what the verification pass turned up>"
```

Skip if nothing needed fixing.

---

## Notes for the reviewer

- **Why `places` is a required key on `WeddingConfig`, not optional.** An empty array is a statement ("we looked, there's nothing near us"); an absent key is silence. This is the contract every future instance compiles against, and the schema's own rule is that structure lives here while values differ per couple.
- **Why `NearbyPlace.id` is a plain string when `EventId` is a union.** Event ids key `perEventAttendance` on stored guest replies, so a typo has to fail the build. No stored document references a place id, so the same rigidity would only tax adding a place.
- **Why the page is entirely server-rendered.** Nothing on it is interactive — it's prose and outbound links. Keeping it server-side means it costs no hydration and inherits the service worker's cache-fallback behaviour cleanly.
- **Why places aren't tier-gated.** A reception-only guest driving up from Bhubaneswar has the same spare afternoon as anyone else. The tier still travels in the URL because `AppShell` builds the nav from it.
- **The two things this plan could not resolve, restated:** the fifth spec link (`share.google` is unreachable from this network) and user sign-off on the draft place descriptions. Both are Task 1. Neither should be worked around.
