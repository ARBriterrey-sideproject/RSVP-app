# Core & Studio

How this app becomes a second couple's app.

This is a **product line**, not a SaaS. There is no tenant dimension, no shared
database, no `weddings/{id}/` prefix anywhere. Each couple gets their own build,
their own domain and their own Firebase project. The thing we're building is the
*structure* the builds come off, plus the tooling that produces one.

That distinction decides almost everything below. A SaaS would need every query
                                                            scoped by tenant, roles scoped per wedding, and od dract and a pipeline. The
second is a great deal less code, and the isolation is free rather than earned:
two couples can't leak into each other because they were never in the same
project.

Status: the config split described in "The three layers" is **built** (see
`shorelines/src/content/`). Everything under "Seams still to cut" and
"The studio" is design, not code.

---

## The three layers

```
┌─ core ──────────────────────────────────────────────┐
│  every component, route, rule, callable and helper  │  versioned package
│  compiles against WeddingConfig, knows no facts     │w 
└─────────────────────────────────────────────────────┘
                        ▲
                        │ @wedding/config
                        │
┌─ instance ──────────────────────────────────────────┐
│  one WeddingConfig literal, one theme token block,  │  one repo/dir per couple
│  four message catalogues, one .env, one domain      │
└─────────────────────────────────────────────────────┘
                        ▲
                        │ emits
                        │
┌─ studio ────────────────────────────────────────────┐
│  intake → config → provision → build → deploy       │  the builder's own app
└─────────────────────────────────────────────────────┘
```

**Core** is the app as it exists today, minus the facts. It ships as a package
and is versioned; an instance pins a version.

**Instance** is the smallest possible thing: a data file, a palette, prose, and
credentials. Nothing in an instance is code you have to read to understand what
it does.

**Studio** is the builder-facing tool that turns a conversation with a couple
into an instance and puts it on their domain. It is not a runtime — once a
wedding is deployed, the studio is not in the request path for anything.

### The rule that keeps core and instance apart

> If a value would differ between two couples, it belongs in the config literal.
> If it would be identical for every couple, it belongs in core.

`shorelines/src/content/schema.ts` states this in its header and is the contract.
`wedding.config.ts` is the only file in `src/` that knows whose wedding it is.
`wedding.ts` is the reading surface: it derives every named export the app uses
from the config, and a hardcoded fact in it is a bug.

### The injection seam

Core imports the config through the `@wedding/config` specifier, aliased in
`tsconfig.json`. That is the entire seam.

A React context provider was considered and rejected. There is exactly one
config per build — one couple, one domain, one process — so it is a *build-time
constant*, not runtime state. A provider would have been machinery for a value
that can never change while the process is alive, and in an App Router app it
would push the whole object across the RSC boundary into every client component
that renders a couple's name. An alias costs nothing at runtime and moves in one
line: `apps/<couple>/tsconfig.json` points the specifier at its own literal.

The corollary, and the one thing to police in review: **never import
`./wedding.config` by relative path.** That's the edge the alias exists to keep
swappable.

---

## What is config, what is core, what is runtime data

Three buckets, and the third is the one people get wrong.

**Build-time config** — structural, changes the shape of the app, needs a
rebuild. Events and their tiers, the number of days, which locales exist, the
theme tokens, the party cap, the RSVP flow's steps. This is `WeddingConfig` plus
the theme block.

**Runtime data** — the couple edits it from the dashboard, no rebuild. Event
times, venue names, dress codes, emergency contacts, and the private events the
couple authors along with who is invited to each. Today most of these still live
in the config literal, which is fine while nothing is launched; before launch
they move to Firestore with the literal as the seed and the offline fallback.
`wedding.config.ts` already says so in its header.

**Guest data** — RSVPs, memories, photos. Never config, never touched by the
studio.

Getting the first two lines right is what decides whether a couple asking "can
we move the Haldi to 11?" is a dashboard edit or a redeploy. It should be a
dashboard edit, and the fact that it isn't yet is the largest single gap.

---

## Seams still to cut

These are the places core still knows something an instance should own. Each is
a known, bounded piece of work — listed so nobody has to rediscover them.

**1. Cloud Functions duplicate the config.** `functions/src/index.ts` hardcodes
`TIERS`, `EVENT_IDS`, `INVITE_ONLY_EVENT_IDS` and `PARTY_SIZE_SOFT_CAP`, with a
comment asking you to keep the cap in sync by hand. Functions are a separate npm
package and can't import from `../src`. **Fix:** the build emits
`functions/src/wedding.generated.json` from the same literal, and the callable
reads it. Generation, not duplication — the sync comment goes away.

**2. Firestore and Storage rules duplicate the role ranks.** Same shape of
problem, already documented in CLAUDE.md and `Roles_and_Access.md`. Rules can't
import TypeScript, so the ranks live in four places. **Fix:** generate the rules
files too, or accept it and keep the four comments. Roles are core, not
per-couple, so this is lower priority than (1).

**3. The locale list is core.** `src/i18n/locales.ts` fixes en/hi/kn/or and
`en-IN` formatting. A Tamil wedding in Chennai needs a different list.
**Fix:** `WeddingConfig.locales`, with the catalogue files and the `next/font`
Noto subsets driven off it. The font wiring in `app/layout.tsx` is the awkward
part — `next/font` needs static calls, so this becomes a generated file.

**4. The RSVP flow shape is hardcoded.** `STEPS = ["days","party","table","travel"]`
in `src/components/rsvp/types.ts`. A couple with no travel to arrange wants that
step gone. **Fix:** `WeddingConfig.rsvpSteps`, with each step's component looked
up from a core registry.

**5. `EventId` is a hand-written union.** Deliberate, and documented in
`schema.ts`: it buys real safety today (a typo in a `perEventAttendance` key
fails to compile). At extraction it becomes `string` with runtime validation
against the config. Don't weaken it before then.

**6. Prose is still per-instance but lives in core's catalogue files.** The
landing's lede, blurb and sign-off are this couple's voice in four languages,
sitting in `messages/*.json` next to strings like "Back" and "One moment…" that
every couple shares. **Fix:** split each catalogue into `core.json` (UI chrome,
shipped with core) and `wedding.json` (the couple's own words, per instance),
merged at boot. Until then, an instance forks all four files.

**What is already clean:** Firebase is entirely env-driven
(`NEXT_PUBLIC_FIREBASE_*`), so a per-couple project needs zero code change.
Theming is pure CSS custom properties in the `@theme` block of `globals.css`, so
a palette is a generated file rather than a refactor — with one constraint:
`EventAccent` must stay a **token-name enum**, never a hex value, because
Tailwind v4 scans source for whole class names and `border-${accent}` can never
work. A config names a swatch the theme defines; it cannot invent a colour.

---

## What an instance actually is

```
apps/shubham-amruta/
  wedding.config.ts       the facts             ← the studio emits this
  theme.css               the @theme block      ← the studio emits this
  messages/{en,hi,kn,or}.json   their words     ← the studio emits this
  .env.local              their Firebase project
  tsconfig.json           @wedding/config → ./wedding.config.ts
  package.json            depends on @shorelines/core@1.4.2
```

Six files. No components, no routes, no rules. If an instance ever grows a
`.tsx`, that's a signal core is missing an option — fix core, don't fork.

Version pinning matters more than it looks. Weddings are booked a year out and
live for one weekend; you will have five instances on four different core
versions at once. `configVersion` in the schema exists so a literal written
against core 1.x can be told apart from one that merely omits a field, and
migrated forward mechanically.

---

## The studio

Five stages. Only the first is interesting.

1. **Intake** — the couple's answers become a `WeddingConfig` draft plus a
   palette and their prose.
2. **Validate** — the draft is parsed against the schema. Fails loudly and
   early, before anything is provisioned.
3. **Provision** — create the Firebase project, enable Auth/Firestore/Storage,
   set the staff roster secret, deploy rules and functions.
4. **Build & deploy** — scaffold `apps/<slug>/`, build against pinned core, push
   to a hosting project, attach their domain.
5. **Hand over** — dashboard credentials to the couple, DNS instructions,
   the three tier links.

Stages 2–5 are deterministic. They should be scripts and CI jobs, idempotent and
rerunnable, because "rerun stage 4" is what you'll want at 11pm the night before
a wedding.

A note on cost, since it's per-couple and real: each wedding needs its own
billed Firebase project (Phone Auth SMS isn't on the free tier), and India's
TRAI/DLT regime applies to each. CLAUDE.md flags an unverified assumption that
Google absorbs DLT registration — settle that with one real SMS before selling
this to anybody, because if it doesn't hold, every couple inherits an entity and
template registration, and that is a product-level problem, not a build step.

---

## "Can the builder be a set of bots?"

Yes — but not the way the question implies, and the difference is what makes it
work or not.

**The build process should not be agents.** Stages 2–5 above are deterministic
transformations: config in, deployed app out. Running those through an LLM makes
them non-deterministic, slower, more expensive, and unauditable — you lose the
one property you need most, which is that rerunning a stage produces the same
result. When a wedding is in 14 hours you want a script you can rerun, not a
model you have to re-prompt. Write them as scripts.

**Agents earn their keep where judgement lives**, and that's the front of the
pipeline — the part that's currently "the couple fills in a form", which is the
worst part of the plan. A `WeddingConfig` has around sixty fields. Nobody fills
in sixty fields well, and the ones they fill in badly are the ones you can't
validate: dress codes, the tone of the lede, what to call each event.

So the honest shape is: **a conversation at the front, a pipeline behind it.**

Four agents, in the order they're worth building:

**Copy & translation** — highest value first, because it's the most work per
couple by a wide margin: roughly 120 strings × 4 languages, in a specific voice.
An agent drafts the couple's `en.json` from their answers, then a per-locale
translator produces the other three. Gate it on native review before publish;
CLAUDE.md already notes three of four catalogues await it. This one pays for
itself on the second wedding.

**Intake** — a conversation that asks about the wedding the way a planner would
and emits a config draft plus a list of what it couldn't determine. The
constraint that makes it safe: its output is parsed against the schema (add Zod
alongside the TypeScript types — the compiler can't check a generated file), so
it physically cannot emit something that doesn't compile. An unanswered field
comes back as a question, never as an invention. Note that today's config is
full of values marked PLACEHOLDER for exactly this reason; an agent that
silently fills those in is worse than a blank form.

**Theme** — a mood board or three colour references become a `@theme` token
block. Heavily constrained: it may only assign values to the token names core
already uses (`sand`, `deeptide`, `coral`, `driftwood`, `warmgold`, `palm`,
`clay`), and it must pass a contrast check. It cannot add a token, because
adding one means editing core.

**Review** — screenshots the built instance at three breakpoints in every
locale, flags overflow, clipped Devanagari, contrast failures. This is the one
that catches the class of bug nobody tests for: a Kannada string 40% longer than
its English source breaking a fixed-height card.

Four rules keep this from becoming a liability:

1. **Every agent output passes a schema validator and a human gate before it
   reaches a build.** Agents propose; the pipeline disposes.
2. **Agents write files. The pipeline builds files.** The build itself never
   invokes a model — a deploy must be reproducible from the repo alone.
3. **No agent holds deploy or Firebase credentials.** They emit into a working
   directory; a separate job with credentials picks it up after approval.
4. **No agent touches security code** — Firestore rules, the callables, the
   staff roster. Those are core, they're identical for every couple, and they're
   where a plausible-looking wrong answer costs you a guest list.

**Sequencing.** Build the pipeline first, with a plain form on the front. It's
the part that's load-bearing, it's maybe two weeks, and it's what makes the
second wedding cheap. Then add the copy agent, which is where the per-couple
hours actually go. Intake, theme and review are improvements to a thing that
already works — and each is much easier to build once there's a schema to
validate against and a pipeline to hand off to, both of which the first step
gives you.

The short answer to the question as asked: the bots are worth it, they belong at
the intake and copy end rather than the build end, and the config schema is the
interface that lets you swap a bot for a form and back without core noticing.
