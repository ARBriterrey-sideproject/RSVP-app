# Track A — `/today` Pre-Wedding Screen Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tighten the pre-wedding `/today` screen — drop the section that duplicates `/schedule`, drop the redundant "View schedule" link, promote "Leave a message" to just under the countdown as a morph-surface, and give "Getting there" the photo-card treatment the home screen already uses.

**Architecture:** All four changes live in one file, `src/components/today/UpcomingScreen.tsx`. Two supporting pieces come out of it: `LocationCard` is lifted out of `InviteLanding.tsx` into a shared component so both screens render one implementation, and a themed `MorphSurface` primitive is added under `src/components/ui/`. No data model, no server, no Firestore, no new route.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind v4 (CSS-first, tokens in `src/app/globals.css` `@theme`), `next-intl`, `@base-ui/react`, `motion` v13, shadcn CLI (`base-nova` style), Playwright.

**Spec:** [`shorelines/docs/additional features.md`](../../../shorelines/docs/additional%20features.md) — the `## Today page updates` section.

## Global Constraints

- **The screen in scope is `UpcomingScreen.tsx`, not `TodayScreen.tsx`.** The spec says "the today page"; `/today` renders `UpcomingScreen` before the wedding window opens and `TodayScreen` inside it. Every item in the spec (`your days with us`, the `View schedule` link, `Getting there`, `Leave a message`) is in `UpcomingScreen.tsx`. **Do not edit `TodayScreen.tsx` in this track.**
- **Four locales, always: `en`, `hi`, `kn`, `or`.** Any string added to `messages/en.json` must be added to all four. Never leave a key that renders as a bare path.
- **Editing a file in `messages/` requires a dev-server restart.** `src/i18n/request.ts` uses a dynamic `import()` bound to the module cached at boot. If a new key renders as its key path, restart `next dev` before debugging anything else.
- **Tailwind v4 is CSS-first. There is no `tailwind.config.js`.** Use only token names already defined in the `@theme` block of `src/app/globals.css`: `sand`, `sunbleach`, `deeptide`, `deeptide-deep`, `shallows`, `shallows-bright`, `coral`, `coral-deep`, `coral-ink`, `warmgold`, `palm`, `clay`, `horizon`, `tideline`, `dune`, `dune-deep`, `bark`, `card`, `card-hover`, `foam`, `driftwood`, `driftwood-soft`, `driftwood-faint`, `hairline`, `hairline-dashed`, `shell`; radii `rounded-card` (16px) and `rounded-pill`.
- **shadcn base tokens do not exist in this project.** Any component pulled from a registry that references `bg-background`, `text-foreground`, `text-muted-foreground`, `border-border`, `bg-primary`, `primary-foreground`, `bg-secondary`, `secondary-foreground`, `bg-accent`, `accent-foreground`, `bg-popover`, `bg-muted`, or `ring-ring` **must be re-tokenised** before it compiles usefully. See the mapping table in Task 2.
- **`motion` v13 is installed; `framer-motion` is not.** Rewrite any registry import of `framer-motion` to `motion/react`.
- **`cn` is a bare npm package.** Existing UI components import `{ cn } from "cn"`. `@/lib/utils` re-exports it. Either import is fine; match the neighbouring file.
- **`data-testid="upcoming-event"` on the event row is load-bearing** — the Playwright golden-path spec counts these to assert a declined event dropped out. Task 1 removes those rows; the spec must be updated in the same task or it will fail.
- **Verification gate for every task:** `npm run lint && npm run build` from `shorelines/` must both pass before the commit step.

## File Structure

| File | Change | Responsibility after this track |
|---|---|---|
| `shorelines/src/components/today/UpcomingScreen.tsx` | Modify | The pre-wedding `/today` screen. Loses `EventRow` + the attending section; gains a morph-surface message card under the hero and a photo location card. |
| `shorelines/src/components/invite/LocationCard.tsx` | **Create** | The photo + name + "Get directions" card. Lifted verbatim out of `InviteLanding.tsx` so the landing and `/today` share one implementation. |
| `shorelines/src/components/invite/InviteLanding.tsx` | Modify | Drops its local `LocationCard` definition, imports the shared one. No visual change. |
| `shorelines/src/components/ui/morph-surface.tsx` | **Create** | A themed collapse/expand surface. Sourced from `https://cult-ui.com/r/morph-surface.json`, re-tokenised to the Shorelines palette. |
| `shorelines/messages/{en,hi,kn,or}.json` | Modify | Adds `upcoming.gettingThere.subtitle`. Removes nothing (`upcoming.attending.*` stays — see Task 1 note). |
| `shorelines/e2e/*.spec.ts` | Modify | Whichever spec asserts on `upcoming-event` — updated for the removed section. |

## Task Ordering

Task 1 → 2 → 3 → 4 → 5. Task 3 depends on Task 2's component existing. Task 4 depends on Task 1 having freed the vertical space. No task here is *blocked* by Track B or Track C, but see the coupling note directly below before starting Task 1.

**The spec's first Today bullet is half of a swap, and the other half is Track C's.** It reads: *"the page has 'your days with us' section that shows all events this is already visible in the schedule so cant we have 'Places to visit and things to do' section in the schedule page instead and remove it from the today page?"* — one sentence asking for two changes.

- **This track owns the removal.** Task 1 deletes the section from `UpcomingScreen.tsx`. That is correct and complete for Track A; do not stop and try to build a places section.
- **Track C owns the addition.** Its Task 6 Step 3 adds the "Places to visit and things to do" section to `ScheduleScreen.tsx`.

So between this track landing and Track C landing, `/today` is missing a section and nothing has replaced it. That is an expected intermediate state, not a regression — but **do not report Track A as fully satisfying that bullet**, because on its own it doesn't. If Track A ships and Track C is abandoned, the swap should be revisited rather than left half-done.

**File overlap with the other tracks:** all three touch `InviteLanding.tsx`. Track A's Task 2 restructures it (lifting `LocationCard` out); Track B adds a popover to `DayCard`; Track C adds a card to `TravelAndStay`. Land in the order A → B → C and each is a clean apply; run them concurrently and expect to merge by hand.

---

### Task 1: Remove the duplicated events section and the redundant schedule link

The `attending` section lists the guest's events with dress codes — the same thing `/schedule` renders, one tab away. Its footer link to `/schedule` is doubly redundant since the bottom tab bar already carries a Schedule tab.

**Files:**
- Modify: `shorelines/src/components/today/UpcomingScreen.tsx` — delete `EventRow` (lines 44–82) and the `attending` `<section>` (lines 203–225)
- Modify: whichever e2e spec references `upcoming-event`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `UpcomingScreen` no longer imports `ACCENT_FILL`, `ACCENT_TINT`, `formatEventWhen`, `tierCode`, `type WeddingEvent`, or `eventCopy` for the row. **`attending` the variable stays** — `attending.length` still feeds `t("reply.done", { going: attending.length, ... })`, and `attending[0]` still computes `firstEvent`. Only the rendered section goes.

- [ ] **Step 1: Find every e2e assertion that depends on the section**

```bash
cd shorelines && grep -rn "upcoming-event" e2e/ src/
```

Expected: the `data-testid` in `UpcomingScreen.tsx:58` plus at least one `e2e/*.spec.ts` assertion. Record the exact spec file and line before deleting anything.

- [ ] **Step 2: Delete the `EventRow` component**

Remove `UpcomingScreen.tsx` lines 44–82 in their entirety — the whole `function EventRow({ event, locale, t }: {...}) { ... }` block.

- [ ] **Step 3: Delete the attending section**

Remove this whole block (lines 203–225), including the `View schedule` link inside it:

```tsx
{attending.length > 0 && (
  <section className="px-6 pt-5.5">
    <p className="font-sans text-[9.5px] font-semibold uppercase tracking-[0.28em] text-driftwood-faint">
      {hasReplied ? t("attending.title") : t("attending.eligibleTitle")}
    </p>
    <div className="mt-2.5 flex flex-col gap-2.5">
      {attending.map((event) => (
        <EventRow key={event.id} event={event} locale={locale} t={tWedding} />
      ))}
    </div>
    <Link
      href={`/schedule?tier=${tierCode(effectiveTier)}`}
      className="mt-3 inline-block font-sans text-[11.5px] font-medium text-coral-ink"
    >
      {tToday("viewSchedule")}
    </Link>
  </section>
)}
```

Leave the `attending` and `hasReplied` `useMemo`/derivations above untouched — the reply card and `firstEvent` both read them.

- [ ] **Step 4: Prune the now-unused imports**

From the `@/content/wedding` import block, remove `ACCENT_FILL`, `ACCENT_TINT`, `formatEventWhen`, and `type WeddingEvent`. Keep `tierCode` (the memories link and the "See the invitation" link both still use it). Keep `eventCopy` (the Getting there card uses it) and `type Lookup` only if still referenced — after `EventRow` goes, `Lookup` is unused, so remove it from the `@/i18n/weddingCopy` import.

Leave `upcoming.attending.title` / `upcoming.attending.eligibleTitle` in all four message catalogues. They cost nothing, and deleting translated strings the couple may want back is a worse trade than an unused key.

- [ ] **Step 5: Update the e2e spec**

Open the spec found in Step 1. The assertion counts `upcoming-event` elements to prove a declined event stopped rendering on `/today`. That signal now lives on `/schedule`. Either move the assertion to navigate to `/schedule` and count the schedule's event cards, or delete the assertion if the same coverage already exists in the schedule leg of the spec. Read the surrounding test before choosing — do not delete coverage that has no equivalent elsewhere.

- [ ] **Step 6: Verify**

```bash
cd shorelines && npm run lint && npm run build
```

Expected: both pass, with no "declared but never read" TypeScript errors.

- [ ] **Step 7: Commit**

```bash
git add shorelines/src/components/today/UpcomingScreen.tsx shorelines/e2e
git commit -m "refactor(today): drop the events list and schedule link that duplicate /schedule"
```

---

### Task 2: Add a themed `MorphSurface` primitive

**Files:**
- Create: `shorelines/src/components/ui/morph-surface.tsx`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: a default-collapsed expand/collapse surface consumed by Task 3. Whatever the registry names its exports, this file must end up exporting a component usable as:
  ```tsx
  <MorphSurface trigger={<>…collapsed content…</>}>
    …expanded content…
  </MorphSurface>
  ```
  If the registry's API differs, wrap it in this shape rather than changing Task 3.

- [ ] **Step 1: Pull the registry component**

```bash
cd shorelines && npx shadcn@latest add https://cult-ui.com/r/morph-surface.json
```

Expected: a new file under `src/components/ui/`. If the CLI prompts to overwrite `src/lib/utils.ts` or `components.json`, decline — both are already correct for this project.

- [ ] **Step 2: Read what it actually wrote**

```bash
cd shorelines && git status --short && cat src/components/ui/morph-surface.tsx
```

Note every import and every Tailwind class. Do not skip this — the whole point of the next step is what you find here.

- [ ] **Step 3: Re-tokenise to the Shorelines palette**

Apply this mapping to every occurrence:

| Registry token | Shorelines replacement |
|---|---|
| `bg-background` | `bg-sand` |
| `bg-popover`, `bg-muted` | `bg-card` |
| `text-foreground` | `text-driftwood` |
| `text-muted-foreground` | `text-driftwood-soft` |
| `border-border`, bare `border` used for colour | `border-hairline` |
| `bg-primary` | `bg-deeptide` |
| `text-primary-foreground` | `text-foam` |
| `bg-secondary` | `bg-shell` |
| `bg-accent` | `bg-sunbleach` |
| `ring-ring` | `ring-deeptide` |
| `rounded-lg` / `rounded-xl` / `rounded-md` on a card surface | `rounded-card` |
| `from "framer-motion"` | `from "motion/react"` |

Font: this project has no default sans on `body` that matches the design; every text element in the app carries an explicit `font-sans` / `font-display` / `font-serif`. Add `font-sans` to the component's text-bearing elements.

- [ ] **Step 4: Verify no unmapped tokens survive**

```bash
cd shorelines && grep -rnE 'bg-background|text-foreground|muted-foreground|border-border|bg-primary|primary-foreground|bg-secondary|secondary-foreground|bg-accent|accent-foreground|bg-popover|bg-muted|ring-ring|framer-motion' src/components/ui/morph-surface.tsx
```

Expected: no output (exit 1). If anything matches, map it and re-run.

- [ ] **Step 5: Verify it compiles**

```bash
cd shorelines && npm run lint && npm run build
```

Expected: both pass.

**Fallback if the registry component is unusable.** If `shadcn add` fails, or the pulled component drags in dependencies not in `package.json`, or it is fundamentally a drag/layout primitive rather than an expand/collapse one: **do not install new dependencies to make it fit.** Write `src/components/ui/morph-surface.tsx` by hand instead, using the already-installed `motion/react`:

```tsx
"use client";

import { useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "cn";

/**
 * A card that expands in place rather than navigating away.
 *
 * Hand-written rather than pulled from cult-ui: that registry's components
 * assume shadcn's base token set (`bg-background`, `text-muted-foreground`),
 * which this project's `@theme` deliberately does not define — see the
 * palette note in globals.css.
 */
export function MorphSurface({
  trigger,
  children,
  className,
  defaultOpen = false,
}: {
  trigger: ReactNode;
  children: ReactNode;
  className?: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <motion.div
      layout
      className={cn(
        "overflow-hidden rounded-card border border-driftwood/[0.08] bg-foam",
        className
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full px-5 py-4.5 text-left font-sans"
      >
        {trigger}
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
          >
            <div className="px-5 pb-4.5 font-sans">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
```

Take this path without hesitation if the registry fights you — matching the existing palette is the user's stated constraint, and the component is 40 lines.

- [ ] **Step 6: Commit**

```bash
git add shorelines/src/components/ui/morph-surface.tsx shorelines/package.json shorelines/package-lock.json
git commit -m "feat(ui): add a morph-surface expand card themed to the Shorelines palette"
```

---

### Task 3: Move "Leave a message" up under the countdown

**Files:**
- Modify: `shorelines/src/components/today/UpcomingScreen.tsx` — delete the memories `<section>` at its current position (was lines 250–267, shifted up by Task 1) and re-render it directly after the `</header>`, above the reply card.

**Interfaces:**
- Consumes: `MorphSurface` from Task 2.
- Produces: no exports.

- [ ] **Step 1: Delete the memories section from its current position**

Remove the whole block, comment included:

```tsx
{/* Memories is the one live-wedding feature open before the weekend —
    a note to the couple doesn't need the wedding to have started. */}
<section className="px-6 pt-5.5">
  <Link href={`/memories?tier=${tierCode(effectiveTier)}`} className="...">
    …
  </Link>
</section>
```

- [ ] **Step 2: Insert the morph-surface version immediately after `</header>`**

It goes above the `{loaded && (` reply card, so the order becomes: hero → leave a message → your reply → getting there → see the invitation.

```tsx
{/* Promoted to just under the countdown at the couple's request. A morph
    surface rather than a plain link: the collapsed state is a one-line
    invitation, and opening it in place keeps the guest on the screen they
    just landed on instead of pushing them into a route they may not have
    meant to open. */}
<section className="px-6 pt-4.5">
  <MorphSurface
    trigger={
      <>
        <p className="text-[9.5px] font-semibold uppercase tracking-[0.28em] text-driftwood-faint">
          {tToday("memories.title")}
        </p>
        <p className="mt-1.5 text-[13px] leading-[1.5] text-driftwood-soft">
          {tToday("memories.body")}
        </p>
      </>
    }
  >
    <Link
      href={`/memories?tier=${tierCode(effectiveTier)}`}
      className="inline-block rounded-pill bg-deeptide px-4 py-2.5 text-[12.5px] font-medium text-foam"
    >
      {tToday("memories.cta")}
    </Link>
  </MorphSurface>
</section>
```

- [ ] **Step 3: Add the import**

```tsx
import { MorphSurface } from "@/components/ui/morph-surface";
```

Place it with the other `@/components` imports, after `AppShell`.

- [ ] **Step 4: Note the client-boundary consequence**

`UpcomingScreen.tsx` already has `"use client"` at line 1, so `MorphSurface`'s own `"use client"` costs nothing here. No change needed — this step is a check, not an edit.

- [ ] **Step 5: Verify**

```bash
cd shorelines && npm run lint && npm run build
```

Then, with the emulators running in another shell (`firebase emulators:start`):

```bash
cd shorelines && npm run dev
```

Open `http://localhost:3000/today?tier=f`. Confirm: the "Leave a message" card sits directly under the teal countdown header; tapping it expands in place to reveal "Write one"; tapping again collapses; the reply card sits below it; no events list appears anywhere on the screen.

- [ ] **Step 6: Commit**

```bash
git add shorelines/src/components/today/UpcomingScreen.tsx
git commit -m "feat(today): promote 'leave a message' to under the countdown as a morph surface"
```

---

### Task 4: Give "Getting there" the home screen's photo card

The landing page's Travel & stay section leads with `LocationCard` — a resort photo, the venue name, and a "Get directions" link. `/today`'s "Getting there" card is the same information rendered as plain text. Share the component.

**Files:**
- Create: `shorelines/src/components/invite/LocationCard.tsx`
- Modify: `shorelines/src/components/invite/InviteLanding.tsx` — delete the local `LocationCard` (lines 454–495) and its now-unused `Image` import if nothing else uses it (`PhotoBand` does, so **keep the `Image` import**)
- Modify: `shorelines/src/components/today/UpcomingScreen.tsx` — replace the Getting there card body
- Modify: `shorelines/messages/{en,hi,kn,or}.json` — add `upcoming.gettingThere.subtitle`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  ```ts
  export function LocationCard(props: {
    href: string;
    name: string;
    directionsLabel: string;
    /** Path under /public. Defaults to "/images/resort.jpg". */
    image?: string;
    /** Optional line under the name — the full postal address on /today. */
    subtitle?: string;
  }): JSX.Element
  ```

- [ ] **Step 1: Create the shared component**

`shorelines/src/components/invite/LocationCard.tsx`:

```tsx
import Image from "next/image";

/**
 * A venue as a photo card: the image, the name, and one tap to Google Maps.
 *
 * Lives here rather than inside `InviteLanding` because `/today`'s "Getting
 * there" card renders the same thing — the couple asked for the two to match,
 * and two copies of a card is two places to fix a crop.
 *
 * `href` is always built by `mapsUrl()`, never by hand: it prefers the place's
 * CID over its address, which is what stops "Get directions" opening a search
 * results page instead of the resort.
 */
export function LocationCard({
  href,
  name,
  directionsLabel,
  image = "/images/resort.jpg",
  subtitle,
}: {
  href: string;
  name: string;
  directionsLabel: string;
  image?: string;
  subtitle?: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="group block overflow-hidden rounded-card bg-card"
    >
      <div className="relative w-full" style={{ height: 140 }}>
        <Image
          src={image}
          alt={name}
          fill
          sizes="(min-width: 480px) 420px, 100vw"
          className="object-cover"
        />
      </div>
      <div className="flex items-center justify-between gap-3 px-4 py-3.5">
        <div className="min-w-0">
          <p className="font-sans text-[14.5px] font-medium leading-tight text-driftwood">
            {name}
          </p>
          {subtitle && (
            <p className="mt-1 font-sans text-xs leading-[1.5] text-driftwood-soft">
              {subtitle}
            </p>
          )}
        </div>
        <span className="flex-none font-sans text-xs font-medium text-deeptide underline underline-offset-2 group-hover:no-underline">
          {directionsLabel}
        </span>
      </div>
    </a>
  );
}
```

- [ ] **Step 2: Point `InviteLanding` at it**

Delete lines 454–495 of `InviteLanding.tsx` (the doc comment and the local `function LocationCard`). Add to the imports:

```tsx
import { LocationCard } from "@/components/invite/LocationCard";
```

The call site inside `TravelAndStay` is unchanged — it already passes exactly `href` / `name` / `directionsLabel`, and `image` now defaults to the same `/images/resort.jpg` it hardcoded. Keep the `import Image from "next/image"` at the top: `PhotoBand` still uses it.

- [ ] **Step 3: Verify the landing is byte-identical in the browser**

```bash
cd shorelines && npm run build && npm run dev
```

Open `http://localhost:3000/?tier=f&invite=1`, scroll to Travel & stay. The resort card must look exactly as before. This is a refactor — any visual change here is a bug.

- [ ] **Step 4: Add the subtitle string to all four catalogues**

In `messages/en.json`, under `upcoming.gettingThere`, alongside the existing `"title": "Getting there"`:

```json
"subtitle": "Where your first event is"
```

Add the equivalent to `hi.json`, `kn.json`, and `or.json` under the same path. Translate the meaning, not the words:
- `hi`: `"आपका पहला कार्यक्रम यहाँ है"`
- `kn`: `"ನಿಮ್ಮ ಮೊದಲ ಕಾರ್ಯಕ್ರಮ ಇಲ್ಲಿದೆ"`
- `or`: `"ଆପଣଙ୍କର ପ୍ରଥମ କାର୍ଯ୍ୟକ୍ରମ ଏଠାରେ"`

- [ ] **Step 5: Swap the Getting there card**

In `UpcomingScreen.tsx`, replace the whole `{firstEvent && ( ... )}` section body. Before:

```tsx
<div className="rounded-card border border-driftwood/[0.08] bg-foam px-5 py-4.5">
  <p className="font-sans text-[9.5px] ...">{t("gettingThere.title")}</p>
  <p className="mt-2 font-sans text-[13px] ...">{eventCopy(tWedding, firstEvent).venue}</p>
  <a href={mapsUrl(firstEvent)} ...>{tToday("getDirections")}</a>
</div>
```

After:

```tsx
{firstEvent && (
  <section className="px-6 pt-5.5">
    <p className="mb-2.5 font-sans text-[9.5px] font-semibold uppercase tracking-[0.28em] text-driftwood-faint">
      {t("gettingThere.title")}
    </p>
    <LocationCard
      href={mapsUrl(firstEvent)}
      name={eventCopy(tWedding, firstEvent).venueShort}
      subtitle={t("gettingThere.subtitle")}
      directionsLabel={tToday("getDirections")}
    />
  </section>
)}
```

Note the switch from `.venue` to `.venueShort`: the card's name line is a heading, and the full postal address is what the map link is for.

Add the import:

```tsx
import { LocationCard } from "@/components/invite/LocationCard";
```

- [ ] **Step 6: Restart the dev server and check all four locales**

```bash
cd shorelines && npm run dev
```

The restart is mandatory — `messages/` edits do not hot-reload. Open `http://localhost:3000/today?tier=f` and switch language from the landing's switcher for each of `hi`, `kn`, `or`. Confirm the subtitle renders as translated prose, never as `upcoming.gettingThere.subtitle`.

- [ ] **Step 7: Verify**

```bash
cd shorelines && npm run lint && npm run build
```

- [ ] **Step 8: Commit**

```bash
git add shorelines/src/components/invite/LocationCard.tsx \
        shorelines/src/components/invite/InviteLanding.tsx \
        shorelines/src/components/today/UpcomingScreen.tsx \
        shorelines/messages
git commit -m "feat(today): render Getting there as the home screen's photo location card"
```

---

### Task 5: Full-screen verification pass

**Files:** none modified unless a defect is found.

**Interfaces:** none.

- [ ] **Step 1: Run the full local suite**

In one shell:

```bash
cd shorelines && firebase emulators:start
```

In another:

```bash
cd shorelines && npm run test:emulators && npm run test:e2e
```

Expected: all pass. If `test:e2e` fails on an Odia date hydration mismatch, that is the documented Playwright Chromium ICU artifact — confirm the failure names `or` and a date string before dismissing it, and do not "fix" it by changing date formatting.

- [ ] **Step 2: Walk the screen at three tiers**

With `npm run dev` running, open each of `/today?tier=f`, `/today?tier=w`, `/today?tier=r`. For each confirm the final order top to bottom: teal countdown hero → Leave a message (collapsed) → Your reply → Getting there photo card → See the invitation → sign-off. No events list. No "View schedule" link anywhere.

- [ ] **Step 3: Check the empty and replied states**

A guest with no reply shows `reply.pending` with the "Reply now" button. A guest who has replied shows `reply.done`. The Getting there card must still render for both — it reads `firstEvent`, which falls back to `eligible[0]` when there is no reply.

- [ ] **Step 4: Commit any fixes**

```bash
git add -A shorelines
git commit -m "fix(today): <what the verification pass turned up>"
```

Skip this step if nothing needed fixing.

---

## Notes for the reviewer

- **`upcoming.attending.*` message keys are deliberately left in place** after their only consumer is deleted. They are four short strings across four catalogues; deleting translated copy the couple may ask to restore is the more expensive mistake.
- **`LocationCard` moved to `src/components/invite/` rather than `src/components/ui/`** because `src/components/ui/` is the shadcn registry target directory — hand-written app components have not been mixed into it, and putting one there invites a future `shadcn add` to overwrite it.
- **`/today` inside the wedding window is untouched.** `TodayScreen` keeps its own "View schedule" button, its own memories card at the foot, and its own directions link. The couple asked about the screen they see today, months out. If they later want the same treatment applied during the weekend, that is a separate change against a screen with different constraints (it is a live companion, not a countdown).
