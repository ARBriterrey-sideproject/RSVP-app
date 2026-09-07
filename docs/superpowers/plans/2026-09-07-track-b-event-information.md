# Track B — Event Information Popovers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every event card openable — a concise line plus a photo on the home screen, the full cultural and dress-code briefing on the schedule page — so a guest arriving from outside India knows what a Haldi is, what to wear, and what will happen.

**Architecture:** The English copy is a fact about *this* wedding, so it goes on each event in `wedding.config.ts` behind a new `EventInfo` type in `schema.ts`. Section headings ("What it is", "What to wear") are UI chrome, so they go in a new `eventInfo` message namespace and are translated once rather than six times. A new `eventInfoCopy(t, event)` accessor in `weddingCopy.ts` follows the existing catalogue-override pattern, so hi/kn/or can override any field and an absent override falls back to the English config rather than rendering a key path. Two presentation components consume it: a full briefing on `/schedule` and a concise popover on the landing.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind v4 (CSS-first), `next-intl`, `@base-ui/react` (already backing `src/components/ui/popover.tsx`), `motion` v13, shadcn CLI (`base-nova` style).

**Spec:** [`shorelines/docs/additional features.md`](../../../shorelines/docs/additional%20features.md) — the `## Event Information` section carries the exact approved copy for all six events. **Copy it verbatim. Do not paraphrase, re-summarise, or "improve" it** — it was written and revised with the user across several rounds.

## Global Constraints

- **`wedding.config.ts` must stay pure data** — "no imports beyond the schema, no functions, no derived values", per its own doc comment. The info copy is data; put it there and nothing else.
- **A hardcoded fact in `wedding.ts` is a bug.** Every named export there derives from the config. New accessors follow suit.
- **This copy must NOT go in the runtime overlay (`config/live`).** `schema.ts` explains why: a string typed into a dashboard is a string no catalogue knows, so hi/kn/or would silently fall back to English. Event info is compiled-in config, same as venue names and dress codes.
- **Four locales, always: `en`, `hi`, `kn`, `or`.**
- **`messages/en.json`'s `wedding` key is an empty object `{}`, and that is correct.** English wedding facts live in the config; `pick(t, key, fallback)` in `src/i18n/weddingCopy.ts` returns the config fallback when `!t.has(key)`. **A missing catalogue key is not a bug** — it is the designed path. Never "fix" it by copying English into `en.json`.
- **Editing a file in `messages/` requires a dev-server restart.** `src/i18n/request.ts` uses a dynamic `import()` bound to the module cached at boot.
- **`src/components/invite/InviteLanding.tsx` is a server component with exactly two client islands** (`LanguageSwitcher`, `InviteCta`) — its doc comment says "Keep the count at two". This track adds a third. **That is a deliberate, documented exception, not an oversight:** the new island is a leaf that wraps one card, the page stays server-rendered, and its curtain / staggered rises / scroll reveals stay pure CSS. **Update the doc comment to say three and why.** Do not add `"use client"` to `InviteLanding.tsx` itself.
- **shadcn base tokens do not exist in this project.** Any registry component referencing `bg-background`, `text-foreground`, `text-muted-foreground`, `border-border`, `bg-primary`, `primary-foreground`, `bg-secondary`, `bg-accent`, `bg-popover`, `bg-muted`, or `ring-ring` must be re-tokenised. `src/components/ui/popover.tsx` is the worked precedent — read it before adapting anything.
- **`motion` v13 is installed; `framer-motion` is not.** Rewrite `from "framer-motion"` to `from "motion/react"`.
- **No per-event images exist yet.** `public/images/` holds only `couple.jpg`, `couple-desktop.jpg`, `resort.jpg`. The `image` field is **optional** and every component must render correctly without it. **Do not invent image paths, do not generate images, do not reference files that aren't there.**
- **The ritual list under the wedding is unverified.** The spec says so explicitly: it's written from general Hindu convention and Odia customs may differ. Ship it, but surface the caveat to the user at the end (Task 8).
- **Verification gate for every task:** `npm run lint && npm run build` from `shorelines/` must both pass before the commit step.

## File Structure

| File | Change | Responsibility after this track |
|---|---|---|
| `shorelines/src/content/schema.ts` | Modify | Gains `EventInfo` and `EventInfoRitual` interfaces; `WeddingEvent` gains `info?: EventInfo`. |
| `shorelines/src/content/wedding.config.ts` | Modify | Each of the six events gains an `info` object carrying the approved English copy. |
| `shorelines/src/i18n/weddingCopy.ts` | Modify | Gains `EventInfoCopy` type and `eventInfoCopy(t, event)` accessor. |
| `shorelines/messages/en.json` | Modify | Gains the `eventInfo` namespace (section headings, the open/close labels). |
| `shorelines/messages/{hi,kn,or}.json` | Modify | Same `eventInfo` namespace, plus optional `wedding.events.*.info.*` body overrides. |
| `shorelines/src/components/event/EventInfoPanel.tsx` | **Create** | Renders a full `EventInfoCopy` — every section, in order, with its emoji and heading. Presentation only, no state. |
| `shorelines/src/components/event/EventInfoSheet.tsx` | **Create** | Client island. The expandable/collapsible wrapper used on `/schedule`; renders `EventInfoPanel` when open. |
| `shorelines/src/components/event/EventInfoPopover.tsx` | **Create** | Client island. The concise home-screen version — one line, optional image, built on the existing themed `Popover`. |
| `shorelines/src/components/schedule/ScheduleScreen.tsx` | Modify | `EventCard` and `WeddingCard` gain the info affordance. |
| `shorelines/src/components/invite/InviteLanding.tsx` | Modify | `DayCard` gains the concise popover. Doc comment updated to three islands. |

## Task Ordering

1 → 2 → 3 → 4 → 5 → 6 → 7 → 8. Tasks 4–5 both depend on 3. Task 6 (locales) is deliberately last because English works without it.

**Coordination with Track C:** both tracks edit `wedding.config.ts`, `schema.ts`, `weddingCopy.ts`, `ScheduleScreen.tsx`, `InviteLanding.tsx`, and all four catalogues. This track appends `info` *inside* each event object; Track C appends a separate top-level `places` array. Different regions of the same files, but **land this track before Track C merges**, or expect a manual merge in `wedding.config.ts` and `en.json`.

---

### Task 1: Add the `EventInfo` contract to the schema

**Files:**
- Modify: `shorelines/src/content/schema.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  ```ts
  export interface EventInfoRitual { name: string; body: string }
  export interface EventInfo {
    emoji: string;
    summary: string;
    about: string;
    dress: string;
    expect: string;
    tip?: string;
    timing?: string;
    rituals?: EventInfoRitual[];
    etiquette?: string;
    image?: string;
  }
  ```
  and `WeddingEvent` gains `info?: EventInfo`.

- [ ] **Step 1: Add the interfaces above `WeddingEvent`**

Insert after the `EventAccent` type and before `export interface WeddingEvent`:

```ts
/**
 * One named ritual inside a ceremony — "Saptapadi", and what a guest is
 * watching when it happens.
 *
 * A list rather than more named fields because the count genuinely varies by
 * ceremony: the wedding has four worth calling out and the Haldi has none.
 * Translated by index (`events.wedding.info.rituals.0.name`), which is safe
 * only because the list is fixed at build time — it is config, not runtime
 * data, so an index can't shift under a catalogue.
 */
export interface EventInfoRitual {
  name: string;
  body: string;
}

/**
 * WHAT THIS CEREMONY IS, for a guest who has never been to one.
 *
 * Optional on every event, and every field but the first four is optional
 * again, because the six ceremonies genuinely differ in how much a stranger
 * needs told: the Reception explains itself in two lines, the wedding needs
 * the muhurat, four rituals and a note about shoes.
 *
 * Fixed named fields rather than a `sections: {heading, body}[]` array, even
 * though an array would be shorter here. The headings are UI chrome that reads
 * identically for all six events ("What to wear" every time), so they belong
 * in the message catalogue where they're translated once — and a catalogue
 * can only key off a stable field name, not an array position whose meaning
 * changes per event.
 *
 * `emoji` is the one per-event glyph (💍 for the engagement, 🕉️ for the
 * wedding); the section glyphs are constants in the component, for the same
 * translate-once reason.
 */
export interface EventInfo {
  /** Leads the "what it is" heading. One glyph, chosen per event. */
  emoji: string;
  /**
   * ONE line for the home screen card. Deliberately drops both the leading
   * emoji and the event's own name — the card already renders both, and a
   * popover that opens to repeat its own trigger reads as a bug.
   */
  summary: string;
  /** The full "what it is" paragraph, for the schedule page. */
  about: string;
  /** What to wear. */
  dress: string;
  /** What to expect on the day. */
  expect: string;
  /** A practical warning — henna and jewellery, turmeric and good clothes. */
  tip?: string;
  /** Why the start time matters. Only the wedding has a muhurat. */
  timing?: string;
  /** Named moments worth watching for. */
  rituals?: EventInfoRitual[];
  /** Shoes, photography — things a guest can get wrong without meaning to. */
  etiquette?: string;
  /**
   * Path under `/public`, e.g. "/images/mehendi.jpg". OPTIONAL and currently
   * unset for every event: no per-event photographs exist yet. Every consumer
   * must render text-only without it — do not invent a path to fill this.
   */
  image?: string;
}
```

- [ ] **Step 2: Add the field to `WeddingEvent`**

Immediately after the `highlight?: { label: string; at: string };` line, inside `WeddingEvent`:

```ts
  /**
   * The cultural briefing behind this event's card. Optional: an event with no
   * `info` simply renders no info affordance, which is the correct behaviour
   * for a couple whose app doesn't need one.
   */
  info?: EventInfo;
```

- [ ] **Step 3: Verify**

```bash
cd shorelines && npm run lint && npm run build
```

Expected: both pass. `info` is optional, so no existing literal breaks.

- [ ] **Step 4: Commit**

```bash
git add shorelines/src/content/schema.ts
git commit -m "feat(content): add the EventInfo contract for per-event cultural briefings"
```

---

### Task 2: Write the approved copy into the config

**Files:**
- Modify: `shorelines/src/content/wedding.config.ts`

**Interfaces:**
- Consumes: `EventInfo` from Task 1.
- Produces: `weddingConfig.events[n].info` populated for all six events.

**Read `docs/additional features.md` lines 11–144 before starting.** The prose below is transcribed from it; where this plan and the spec differ, the spec wins.

- [ ] **Step 1: Add `info` to the `engagement` event**

Inside the `engagement` object, after `accent: "warmgold",`:

```ts
      info: {
        emoji: "💍",
        summary: "A ring exchange marking the start of the celebrations. Smart, festive attire.",
        about:
          "A ring exchange ceremony marking the formal start of the wedding celebrations — more Western in format than the other events, with the couple exchanging rings in front of family and friends.",
        dress:
          "Smart and festive rather than playful — think elegant Indian wear or cocktail-style outfits.",
        expect:
          "A short formal moment (the ring exchange), followed by mingling and dinner.",
      },
```

- [ ] **Step 2: Add `info` to the `mehendi` event**

After `accent: "palm",`:

```ts
      info: {
        emoji: "🌼",
        summary: "An evening of henna, music & dance. Wear bright, comfortable colors.",
        about:
          "A joyful, music-filled evening held a day or two before the wedding, traditionally hosted by the bride's family. She sits for intricate henna patterns on her hands and feet — a tradition believed to bring good luck, with the saying that the darker the stain, the stronger the marriage. Henna itself has been used for body art for thousands of years across South Asia, the Middle East, and Africa. Guests are welcome to get a small design done too.",
        dress:
          "This is the most colorful, playful event of the wedding — bright festive colors like mustard, coral, turquoise, and fuchsia all work well. A kurta set, Indo-western separates, or a lighter lehenga are all good options; anything you can sit on the floor and dance in comfortably. Lightweight fabrics (cotton, georgette, chanderi) hold up best if it's warm.",
        tip: "Wear sleeves you can roll up easily, and skip rings, bangles, and bracelets until the henna's dried — wet henna can stain jewelry and clothes.",
        expect:
          "Music, choreographed dances, festive food, and a relaxed, social atmosphere — guests come and go throughout, so there's no strict schedule to follow.",
      },
```

- [ ] **Step 3: Add `info` to the `haldi` event**

After `accent: "warmgold",`:

```ts
      info: {
        emoji: "🌼",
        summary:
          "Turmeric, music & laughter. Wear yellow, and something you don't mind staining.",
        about:
          "Turmeric paste is applied to the bride and groom by family and friends — said to bless them with a glow and ward off bad luck before the wedding. It's playful, hands-on, and gets messy.",
        dress:
          "Yellow tones are traditional. Wear something you don't mind staining — this is not the day for your best outfit.",
        expect: "Laughter, turmeric everywhere, and a relaxed, informal mood.",
      },
```

- [ ] **Step 4: Add `info` to the `sangeet` event**

After `accent: "coral",`:

```ts
      info: {
        emoji: "🎶",
        summary: "A night of performances and dancing. Dress glamorous and dance-ready.",
        about:
          'A night of music and dance — family and friends perform choreographed numbers for the couple, followed by open dancing. Sangeet literally means "sung together."',
        dress:
          "Glamorous and dance-friendly — sequins, sharara sets, gowns, or Indo-western all work.",
        expect: "Performances, a DJ, and dancing late into the night.",
      },
```

Note the outer single quotes: the string contains a double-quoted phrase.

- [ ] **Step 5: Add `info` to the `wedding` event**

After `highlight: { label: "Muhurat", at: "2026-12-30T11:28:00+05:30" },`:

```ts
      /**
       * The rituals list is written from general Hindu wedding convention.
       * Odia customs may differ or add steps, and it is the part of this app a
       * guest has no way to independently check — have the couple or the
       * priest read it before launch.
       */
      info: {
        emoji: "🕉️",
        summary:
          "A traditional Hindu ceremony around a sacred fire. Traditional Indian formalwear; avoid solid black or all-white.",
        about:
          "The main event — Shubham and Amruta will be married in a traditional Hindu ceremony conducted by a priest around a sacred fire (the agni), which stands as witness to the marriage. Hindu weddings are ritual-rich and can run several hours; seating is comfortable and guests are welcome to come and go.",
        timing:
          "The ceremony begins at the muhurat — an astrologically chosen auspicious moment — believed to bless the marriage with good fortune. Several of the most significant rituals happen right around this time, so it's worth being seated a little early.",
        rituals: [
          {
            name: "Baraat",
            body: "The groom's arrival, often with music and dancing, welcomed by the bride's family.",
          },
          {
            name: "Kanyadaan",
            body: "The bride's father formally giving her hand in marriage.",
          },
          {
            name: "Saptapadi",
            body: "The couple takes seven steps together around the sacred fire, each step a shared vow for married life; traditionally, this is the moment the marriage becomes complete.",
          },
          {
            name: "Sindoor & Mangalsutra",
            body: "The groom marks the bride's hairline with vermilion and ties a sacred necklace around her neck, both traditional signs of a married Hindu woman.",
          },
        ],
        dress:
          "Traditional Indian formalwear — sarees, lehengas, suits, or sherwanis in festive colors. Solid black or all-white are usually avoided at Hindu weddings, but otherwise there's no strict dress code.",
        etiquette:
          "You may be asked to remove your shoes near the mandap (ceremony stage). Photography is welcome, but try not to block the professional photographer during key rituals near the fire.",
        expect:
          "A long, ritual-filled, and meaningful ceremony, followed by celebration, food, and photos with the couple.",
      },
```

The couple's names appear in `about` as literal text. That is a deliberate exception to "no derived values" — this file is the one place that knows whose wedding it is, so a name in its own copy is a fact, not a leak.

- [ ] **Step 6: Add `info` to the `reception` event**

After `accent: "clay",`:

```ts
      info: {
        emoji: "🥂",
        summary: "A formal celebration dinner. Formal eveningwear.",
        about:
          "A formal dinner celebrating the newly married couple, introducing them to a wider circle of family, friends, and colleagues.",
        dress:
          "Formal eveningwear — elegant Indian formal or Western black-tie-adjacent.",
        expect: "Dinner, speeches, photos with the couple, and dancing.",
      },
```

- [ ] **Step 7: Verify the copy matches the spec exactly**

```bash
cd shorelines && npm run lint && npm run build
```

Then re-read `docs/additional features.md` lines 11–144 alongside your diff. Every sentence must match. This is the step where paraphrase creeps in — check it deliberately.

- [ ] **Step 8: Commit**

```bash
git add shorelines/src/content/wedding.config.ts
git commit -m "content: add the approved cultural briefing copy for all six events"
```

---

### Task 3: Add the `eventInfoCopy` accessor and the `eventInfo` headings

**Files:**
- Modify: `shorelines/src/i18n/weddingCopy.ts`
- Modify: `shorelines/messages/en.json`

**Interfaces:**
- Consumes: `EventInfo` from Task 1.
- Produces:
  ```ts
  export interface EventInfoCopy {
    emoji: string;
    summary: string;
    about: string;
    dress: string;
    expect: string;
    tip?: string;
    timing?: string;
    rituals?: { name: string; body: string }[];
    etiquette?: string;
    image?: string;
  }
  export function eventInfoCopy(t: Lookup, event: WeddingEvent): EventInfoCopy | null
  ```
  Returns `null` when the event has no `info`.

- [ ] **Step 1: Read the existing accessor pattern**

```bash
cd shorelines && cat src/i18n/weddingCopy.ts
```

Note how `eventCopy` calls `pick(t, \`events.${event.id}.name\`, event.name)` — one `pick` per field, config value as the fallback. The new accessor is the same shape with more fields and two optional branches.

- [ ] **Step 2: Add the type and accessor**

Append to `src/i18n/weddingCopy.ts`, after `eventCopy`:

```ts
/** The localised form of `EventInfo`. Same shape; every string resolved. */
export interface EventInfoCopy {
  emoji: string;
  summary: string;
  about: string;
  dress: string;
  expect: string;
  tip?: string;
  timing?: string;
  rituals?: { name: string; body: string }[];
  etiquette?: string;
  image?: string;
}

/**
 * The cultural briefing for one event, in the reader's language.
 *
 * Returns `null` — not an empty object — when the event carries no `info`, so
 * a caller renders no affordance at all rather than an expander that opens on
 * nothing.
 *
 * `emoji` and `image` are deliberately NOT run through `pick`: a glyph and a
 * file path are the same in every language, and routing them through the
 * catalogue would invite a translator to "localise" one.
 *
 * Rituals are keyed by index. Safe here and nowhere else: the list comes from
 * the compiled config, so a position can't shift under a catalogue between
 * build and read.
 */
export function eventInfoCopy(t: Lookup, event: WeddingEvent): EventInfoCopy | null {
  const info = event.info;
  if (!info) return null;

  const base = `events.${event.id}.info`;

  return {
    emoji: info.emoji,
    image: info.image,
    summary: pick(t, `${base}.summary`, info.summary),
    about: pick(t, `${base}.about`, info.about),
    dress: pick(t, `${base}.dress`, info.dress),
    expect: pick(t, `${base}.expect`, info.expect),
    tip: info.tip === undefined ? undefined : pick(t, `${base}.tip`, info.tip),
    timing:
      info.timing === undefined ? undefined : pick(t, `${base}.timing`, info.timing),
    etiquette:
      info.etiquette === undefined
        ? undefined
        : pick(t, `${base}.etiquette`, info.etiquette),
    rituals: info.rituals?.map((ritual, i) => ({
      name: pick(t, `${base}.rituals.${i}.name`, ritual.name),
      body: pick(t, `${base}.rituals.${i}.body`, ritual.body),
    })),
  };
}
```

Ensure `WeddingEvent` is imported at the top of the file — `eventCopy` already takes one, so it will be.

- [ ] **Step 3: Add the `eventInfo` namespace to `messages/en.json`**

At the top level, alongside `landing`, `today`, `schedule`:

```json
"eventInfo": {
  "learnMore": "About this event",
  "close": "Close",
  "about": "What it is",
  "dress": "What to wear",
  "expect": "What to expect",
  "tip": "A tip",
  "timing": "Why the timing matters",
  "rituals": "Rituals to watch for",
  "etiquette": "A couple of etiquette notes"
}
```

These are the headings for all six events, which is exactly why they live here and not in the config — one translation each, not six.

- [ ] **Step 4: Verify**

```bash
cd shorelines && npm run lint && npm run build
```

- [ ] **Step 5: Commit**

```bash
git add shorelines/src/i18n/weddingCopy.ts shorelines/messages/en.json
git commit -m "feat(i18n): add the eventInfoCopy accessor and shared section headings"
```

---

### Task 4: Build the presentation components

**Files:**
- Create: `shorelines/src/components/event/EventInfoPanel.tsx`
- Create: `shorelines/src/components/event/EventInfoSheet.tsx`
- Create: `shorelines/src/components/event/EventInfoPopover.tsx`

**Interfaces:**
- Consumes: `EventInfoCopy`, `eventInfoCopy` from Task 3.
- Produces:
  ```ts
  // EventInfoPanel.tsx — presentation only, no state, no "use client"
  export function EventInfoPanel(props: { info: EventInfoCopy; eventName: string }): JSX.Element

  // EventInfoSheet.tsx — "use client"
  export function EventInfoSheet(props: { event: WeddingEvent; label: string }): JSX.Element | null

  // EventInfoPopover.tsx — "use client"
  export function EventInfoPopover(props: { event: WeddingEvent; label: string }): JSX.Element | null
  ```
  Both `Sheet` and `Popover` return `null` when `eventInfoCopy` returns `null`, so a call site needs no conditional of its own.

- [ ] **Step 1: Try the registry components the spec names**

```bash
cd shorelines && npx shadcn@latest add https://cult-ui.com/r/expandable.json
```

Then inspect what landed:

```bash
cd shorelines && git status --short && ls src/components/ui/
```

Decline any prompt to overwrite `src/lib/utils.ts` or `components.json`.

**Decision point.** Read the pulled component. Adopt it **only if** it needs no new dependency and re-tokenises cleanly (Step 2). Otherwise delete it and use the hand-written implementations in Steps 4–5 — this project already ships a themed `Popover` and has `motion` installed, so the registry buys convenience, not capability. The second URL in the spec (`registry.watermelon.sh/r/expandable-event-card.json`) is an opinionated *card* that assumes its own layout and data shape; try it only if the first fails and you think it fits. **Do not install new dependencies to make either fit.**

- [ ] **Step 2: If adopting a registry component, re-tokenise it**

| Registry token | Shorelines replacement |
|---|---|
| `bg-background` | `bg-sand` |
| `bg-popover`, `bg-muted`, `bg-card` (shadcn's) | `bg-card` (ours — same name, different value; verify it reads correctly) |
| `text-foreground` | `text-driftwood` |
| `text-muted-foreground` | `text-driftwood-soft` |
| `border-border` | `border-hairline` |
| `bg-primary` | `bg-deeptide` |
| `text-primary-foreground` | `text-foam` |
| `bg-secondary` | `bg-shell` |
| `bg-accent` | `bg-sunbleach` |
| `ring-ring` | `ring-deeptide` |
| `rounded-lg`/`rounded-xl`/`rounded-md` on a surface | `rounded-card` |
| `from "framer-motion"` | `from "motion/react"` |

Then confirm nothing survived:

```bash
cd shorelines && grep -rnE 'bg-background|text-foreground|muted-foreground|border-border|bg-primary|primary-foreground|bg-secondary|secondary-foreground|bg-accent|accent-foreground|bg-popover|bg-muted|ring-ring|framer-motion' src/
```

Expected: no output.

- [ ] **Step 3: Write `EventInfoPanel.tsx`**

```tsx
import type { EventInfoCopy } from "@/i18n/weddingCopy";
import { useTranslations } from "next-intl";

/**
 * One event's briefing, rendered in full.
 *
 * Presentation only — no state, no open/close. Both the schedule sheet and any
 * future surface render this, so the section order and the glyphs are decided
 * once here rather than per call site.
 *
 * The section glyphs are constants rather than config: they read identically
 * for all six events ("what to wear" is always 👗), so putting them on each
 * event would be six chances to drift. The per-event glyph — 💍, 🕉️ — is the
 * one that varies, and that one is config.
 */
const GLYPH = {
  timing: "⏰",
  rituals: "🪔",
  dress: "👗",
  etiquette: "🙏",
  tip: "✋",
  expect: "🎉",
} as const;

export function EventInfoPanel({
  info,
  eventName,
}: {
  info: EventInfoCopy;
  eventName: string;
}) {
  const t = useTranslations("eventInfo");

  return (
    <div className="flex flex-col gap-4">
      <Section glyph={info.emoji} heading={t("about")} body={info.about} />
      {info.timing && (
        <Section glyph={GLYPH.timing} heading={t("timing")} body={info.timing} />
      )}
      {info.rituals && info.rituals.length > 0 && (
        <div>
          <Heading glyph={GLYPH.rituals} text={t("rituals")} />
          <ul className="mt-1.5 flex flex-col gap-2">
            {info.rituals.map((ritual) => (
              <li
                key={ritual.name}
                className="font-sans text-[13px] leading-[1.6] text-driftwood-soft"
              >
                <span className="font-medium text-driftwood">{ritual.name}</span>
                {" — "}
                {ritual.body}
              </li>
            ))}
          </ul>
        </div>
      )}
      <Section glyph={GLYPH.dress} heading={t("dress")} body={info.dress} />
      {info.tip && <Section glyph={GLYPH.tip} heading={t("tip")} body={info.tip} />}
      {info.etiquette && (
        <Section glyph={GLYPH.etiquette} heading={t("etiquette")} body={info.etiquette} />
      )}
      <Section glyph={GLYPH.expect} heading={t("expect")} body={info.expect} />
      <span className="sr-only">{eventName}</span>
    </div>
  );
}

function Heading({ glyph, text }: { glyph: string; text: string }) {
  return (
    <p className="font-sans text-[10px] font-semibold uppercase tracking-[0.22em] text-driftwood-faint">
      <span aria-hidden className="mr-1.5 text-[12px]">
        {glyph}
      </span>
      {text}
    </p>
  );
}

function Section({
  glyph,
  heading,
  body,
}: {
  glyph: string;
  heading: string;
  body: string;
}) {
  return (
    <div>
      <Heading glyph={glyph} text={heading} />
      <p className="mt-1.5 font-sans text-[13px] leading-[1.6] text-driftwood-soft">
        {body}
      </p>
    </div>
  );
}
```

The `sr-only` event name gives a screen-reader user the context a sighted user gets from the card the panel opened out of.

- [ ] **Step 4: Write `EventInfoSheet.tsx`**

```tsx
"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useTranslations } from "next-intl";

import { EventInfoPanel } from "@/components/event/EventInfoPanel";
import { eventInfoCopy } from "@/i18n/weddingCopy";
import type { WeddingEvent } from "@/content/wedding";

/**
 * The full briefing, expanding in place under an event card on /schedule.
 *
 * In place rather than a modal: the schedule is a vertical timeline a guest
 * scrolls, and a dialog would tear them out of it to read three paragraphs.
 * Expanding keeps the day around the answer.
 */
export function EventInfoSheet({ event, label }: { event: WeddingEvent; label: string }) {
  const t = useTranslations("wedding");
  const tInfo = useTranslations("eventInfo");
  const [open, setOpen] = useState(false);

  const info = eventInfoCopy(t, event);
  if (!info) return null;

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="font-sans text-[11.5px] font-medium text-coral-ink underline underline-offset-2"
      >
        {open ? tInfo("close") : label}
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.24, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden"
          >
            <div className="mt-3 border-t border-hairline pt-3.5">
              <EventInfoPanel info={info} eventName={event.name} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
```

**No cast on `t`, deliberately.** `Lookup` in `weddingCopy.ts` is written as the structural subset (callable plus `.has`) that `useTranslations`' return type already satisfies, so it is directly assignable. `ScheduleScreen.tsx` proves it: `tWedding` is declared at line 374, passed bare as `t={tWedding}` at line 515 into props typed `t: Lookup` (lines 98, 142, 178, 286), with no cast anywhere in the file. If TypeScript objects here, the fault is in the import or in `Lookup` — fix that rather than silencing it with `as never`.

Note the `WeddingEvent` type import comes from `@/content/wedding`, not `@/content/schema`. `wedding.ts` carries an `export type { … } from "./schema"` re-export block (line ~47) precisely so it stays the single reading surface; components go through it.

- [ ] **Step 5: Write `EventInfoPopover.tsx`**

```tsx
"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { eventInfoCopy } from "@/i18n/weddingCopy";
import type { WeddingEvent } from "@/content/wedding";

/**
 * The one-line version, for the landing's day cards.
 *
 * A popover rather than the schedule's in-place expander: the landing's day
 * list is a tight five-row block with staggered scroll reveals, and pushing
 * rows apart mid-animation looks broken. It also keeps this a leaf client
 * island — the landing itself stays a server component.
 *
 * The image is optional and currently unset for every event. When photographs
 * arrive, set `info.image` in the config and it appears here with no code
 * change.
 */
export function EventInfoPopover({
  event,
  label,
}: {
  event: WeddingEvent;
  label: string;
}) {
  const t = useTranslations("wedding");
  const info = eventInfoCopy(t, event);
  if (!info) return null;

  return (
    <Popover>
      <PopoverTrigger
        aria-label={label}
        className="flex-none rounded-pill px-2 py-1 font-sans text-[11px] font-medium text-deeptide underline underline-offset-2"
      >
        {label}
      </PopoverTrigger>
      <PopoverContent className="w-[19rem]">
        {info.image && (
          <div className="relative -m-2.5 mb-0 w-[calc(100%+1.25rem)] overflow-hidden rounded-t-card" style={{ height: 116 }}>
            <Image
              src={info.image}
              alt=""
              fill
              sizes="304px"
              className="object-cover"
            />
          </div>
        )}
        <p className="font-sans text-[13px] leading-[1.6] text-driftwood-soft">
          <span aria-hidden className="mr-1.5">
            {info.emoji}
          </span>
          {info.summary}
        </p>
      </PopoverContent>
    </Popover>
  );
}
```

- [ ] **Step 6: Verify**

```bash
cd shorelines && npm run lint && npm run build
```

Expected: both pass. The components aren't mounted yet, so this only proves they compile.

- [ ] **Step 7: Commit**

```bash
git add shorelines/src/components/event shorelines/src/components/ui shorelines/package.json shorelines/package-lock.json
git commit -m "feat(event): add the info panel, schedule sheet and landing popover"
```

---

### Task 5: Mount them on the schedule and the landing

**Files:**
- Modify: `shorelines/src/components/schedule/ScheduleScreen.tsx` — `EventCard` (~108–131) and `WeddingCard` (~152–175)
- Modify: `shorelines/src/components/invite/InviteLanding.tsx` — `DayCard` (~319–343) and the file's doc comment

**Interfaces:**
- Consumes: `EventInfoSheet`, `EventInfoPopover` from Task 4.
- Produces: no exports.

- [ ] **Step 1: Add the sheet to `EventCard`**

In `ScheduleScreen.tsx`, inside `EventCard`, after the dress-code pill and before the card's closing tag:

```tsx
<EventInfoSheet event={event} label={tInfo("learnMore")} />
```

`EventCard` is a sub-component of an already-`"use client"` file, so it can call `useTranslations("eventInfo")` directly — add `const tInfo = useTranslations("eventInfo");` alongside its existing hooks, or thread it from the parent to match how `EventCard` already receives `t`. **Read the component's current props before choosing** — if it takes `t` as a prop rather than calling the hook, thread `tInfo` the same way rather than introducing a second convention.

- [ ] **Step 2: Add the sheet to `WeddingCard`**

Same insertion inside `WeddingCard`. Note its surface is the teal→gold gradient with `text-foam`, so the trigger's `text-coral-ink` will be illegible there. Pass a variant or override the class:

```tsx
<div className="[&_button]:text-foam [&_button]:opacity-90">
  <EventInfoSheet event={event} label={tInfo("learnMore")} />
</div>
```

The expanded panel inside it also renders `text-driftwood-soft` on a dark ground. Wrap the panel region so it sits on its own light surface:

```tsx
<div className="mt-3 rounded-card bg-foam/95 p-3.5 text-driftwood">
```

Apply this by giving `EventInfoSheet` an optional `tone?: "light" | "onDark"` prop rather than fighting it with descendant selectors at the call site if the selector approach looks fragile once you see it rendered. Either is acceptable; pick one and use it in both places.

- [ ] **Step 3: Add the popover to `DayCard`**

In `InviteLanding.tsx`, `DayCard` is currently a flex row: accent circle, then a text column. Add the popover as a third, `flex-none` child at the end of the row:

```tsx
<EventInfoPopover event={event} label={tInfo("learnMore")} />
```

`InviteLanding` is a **server component**. `useTranslations` works in server components in next-intl, so resolve the label in the server parent and pass it down — `EventInfoPopover` reads the event copy itself on the client. Get `tInfo` where the other translators are resolved in the parent and thread the label through `DayCard`'s props alongside `copy`.

The label must be short here — it sits at the end of a tight row. If `"About this event"` wraps on a narrow screen, use a distinct shorter key rather than shortening the shared one: add `"learnMoreShort": "Info"` to the `eventInfo` namespace in all four catalogues and use that for the landing only.

- [ ] **Step 4: Update the doc comment about client islands**

`InviteLanding.tsx`'s doc comment says there are exactly two islands and to "Keep the count at two." Rewrite that passage:

```
 * There are three client islands: `LanguageSwitcher`, `InviteCta`, and the
 * `EventInfoPopover` on each day card. Keep the count at three. Each is a leaf
 * that owns one control — the page itself stays server-rendered, which is what
 * lets the curtain, the staggered rises and the scroll reveals stay pure CSS.
```

- [ ] **Step 5: Verify in the browser, all six events**

Restart the dev server (the `messages/` edit in Task 3 requires it):

```bash
cd shorelines && npm run dev
```

- `http://localhost:3000/?tier=f&invite=1` — five day cards each open a popover with the right one-line summary and the right emoji. No image renders (none is configured), and the popover looks correct without one.
- `http://localhost:3000/schedule?tier=f` — every event card has "About this event"; opening one expands the full briefing; the wedding card shows the muhurat timing paragraph and all four rituals, legibly, on the gradient.
- Only one detail: confirm `/schedule?tier=r` shows the reception's briefing and nothing else.

- [ ] **Step 6: Verify**

```bash
cd shorelines && npm run lint && npm run build
```

- [ ] **Step 7: Commit**

```bash
git add shorelines/src/components/schedule/ScheduleScreen.tsx shorelines/src/components/invite/InviteLanding.tsx shorelines/messages
git commit -m "feat(events): open a cultural briefing from every event card"
```

---

### Task 6: Translate into hi, kn and or

**Files:**
- Modify: `shorelines/messages/{hi,kn,or}.json`

**Interfaces:**
- Consumes: the key paths established in Tasks 2–3.
- Produces: nothing importable.

**Read before starting:** an absent key here is **not a bug**. `pick` falls back to the English config, so a partially-translated catalogue renders English for the untranslated fields and the correct language for the rest. Ship what you can translate well; leave out what you can't.

- [ ] **Step 1: Add the `eventInfo` headings to all three catalogues**

These are eight short strings and are the highest-value translation in the track — they're the labels a guest scans. Add to each of `hi.json`, `kn.json`, `or.json` at the top level, matching the English keys exactly: `learnMore`, `close`, `about`, `dress`, `expect`, `tip`, `timing`, `rituals`, `etiquette` (plus `learnMoreShort` if Task 5 Step 3 added it).

- [ ] **Step 2: Add the body overrides under the existing `wedding` key**

Each catalogue already has a `wedding.events.<id>` object carrying `name`, `venue`, `dressCode` and so on. Add an `info` object inside it:

```json
"wedding": {
  "events": {
    "haldi": {
      "name": "…",
      "info": {
        "summary": "…",
        "about": "…",
        "dress": "…",
        "expect": "…"
      }
    }
  }
}
```

Key paths, exactly: `wedding.events.<id>.info.{summary,about,dress,expect,tip,timing,etiquette}` and `wedding.events.wedding.info.rituals.<n>.{name,body}` for n in 0–3.

Translate meaning, not words. Ritual names (`Baraat`, `Kanyadaan`, `Saptapadi`, `Sindoor & Mangalsutra`) are proper nouns — render them in the target script rather than translating them, since a Hindi reader knows the word and would not recognise a paraphrase.

- [ ] **Step 3: Restart the dev server and check each locale**

```bash
cd shorelines && npm run dev
```

Mandatory restart. Then open `/schedule?tier=f` in each of hi, kn, or. Confirm: no bare key paths anywhere; untranslated fields show English prose (correct); translated fields show the target script.

- [ ] **Step 4: Verify**

```bash
cd shorelines && npm run lint && npm run build
```

- [ ] **Step 5: Commit**

```bash
git add shorelines/messages
git commit -m "i18n: translate the event briefings for hi/kn/or"
```

---

### Task 7: Full verification pass

**Files:** none, unless a defect turns up.

- [ ] **Step 1: Run the suites**

Emulators in one shell (`cd shorelines && firebase emulators:start`), then:

```bash
cd shorelines && npm run test:emulators && npm run test:e2e
```

An Odia date hydration failure in `test:e2e` is the documented Playwright Chromium ICU artifact — confirm the failure names `or` and a date before dismissing it.

- [ ] **Step 2: Check the tier gates**

`/schedule?tier=w` shows only the wedding's briefing. `/schedule?tier=r` shows only the reception's. Neither leaks an event the guest isn't invited to — the info panel renders inside the existing event card, so this should follow automatically, but confirm it rather than assume.

- [ ] **Step 3: Check keyboard and screen-reader behaviour**

Tab to the schedule's "About this event" trigger and press Enter — it expands, and `aria-expanded` flips. Tab to a landing day card's popover trigger and press Enter — the popover opens and focus moves into it (Base UI's `Popover` handles this; confirm it actually does).

- [ ] **Step 4: Commit any fixes**

```bash
git add -A shorelines
git commit -m "fix(events): <what the verification pass turned up>"
```

Skip if nothing needed fixing.

---

### Task 8: Report the two open items to the user

**Files:** none.

- [ ] **Step 1: Surface both, plainly, in the final summary**

1. **The wedding's ritual list is unverified.** It is written from general Hindu wedding convention; Odia customs may differ or add steps. It is also the section a guest has no way to check independently. The couple or the priest should read `wedding.config.ts`'s `events[wedding].info.rituals` before launch.
2. **Six per-event photographs are needed.** Every `info.image` is unset, so the landing popovers are text-only. The field exists and is wired — dropping files into `public/images/` and setting `image: "/images/mehendi.jpg"` on each event is the whole change, no code.

Do not present either as done or as blocking. They are the user's calls.

---

## Notes for the reviewer

- **Why the copy is in `wedding.config.ts` and not the message catalogues.** The catalogue-override pattern this codebase already uses puts English wedding facts in the config and treats `messages/*.json` as the override layer — `en.json`'s `wedding` key is `{}` by design. Putting English event copy in `en.json` would invert that for one feature and break the "one file knows whose wedding this is" property that `Core_and_Studio.md` is built on.
- **Why not the runtime overlay.** `schema.ts` states the rule directly: text typed at runtime has no catalogue entry, so hi/kn/or fall back to English silently. If the couple later wants to edit this copy from the dashboard, that needs the per-locale editor decision named in `Core_and_Studio.md` first — it is not a small addition to this track.
- **Why a third client island on the landing was accepted.** The invariant the doc comment protects is that the *page* stays server-rendered so its CSS animations survive. A leaf popover doesn't threaten that. The comment is updated rather than quietly violated.
