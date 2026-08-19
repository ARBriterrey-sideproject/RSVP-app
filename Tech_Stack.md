# Wedding RSVP App — Tech Stack & Architecture

Internal build reference. Companion to `Wedding_RSVP_App_Plan.docx` (the product plan shared with the couple).

## Frontend

- **Framework:** Next.js (React), mobile-first.
- **Styling:** Tailwind CSS + shadcn/ui components — lets us ship a polished UI fast without hand-building a design system in the available window.
- **Animation:** Framer Motion.
- **PWA:** hand-rolled, no framework dependency (`next-pwa`/Serwist were considered and dropped) — a per-guest manifest route plus a static `public/sw.js` service worker for install-to-home-screen and offline caching of schedule, venue, and emergency-contact data.
- **i18n:** `next-intl` for English (default), Hindi, Kannada, Odia.
- **Credit mark:** a discreet "Made by ARBriterrey" line in the app footer / about screen.

## Backend & Data — Firebase

- **Firestore** — guest/family records, RSVP responses, dietary data, poll votes, chat, song requests.
- **Storage** — event photo albums, voice-note memories.
- **Auth** — Anonymous Auth for guests (no passwords); real Auth (email or Google) + custom claims for admin/coordinator accounts.
- **Cloud Functions (callable)** — the only write path for anything sensitive (RSVP submission, poll votes, song requests, dashboard aggregates). Client never writes these directly.
- **App Check** — attached to Firestore, Storage, and Functions to block traffic that isn't coming from the real app.

## Hosting

Firebase Hosting (or Vercel if the Next.js/Firebase split favors it) — CDN, HTTPS by default, custom domain for the invite link.

## Guest Identity & Invite Model

**Stale — superseded by the Anonymous Auth + recovery-code design; CLAUDE.md's "Identity = Firebase Anonymous Auth" section is the source of truth.** Kept below for history; don't build against it.

Revised: no pre-loaded guest database, no per-family personalized tokens. Prepping ~200+ individual invite records before launch was too much manual work for the 10-day window, so the model is now self-serve.

1. **Three static links, not one per family.** One each for Full Wedding (all 5 events), Wedding Only, and Reception Only. The route/query param on the link (e.g. `/rsvp?tier=full`) sets which events, dress code, and RSVP options that visitor sees — nothing per-guest to generate.
2. **Home page is the RSVP form.** ~~A short animated header, then straight into the form — no separate landing/marketing step.~~ Also superseded: the built app has a full `/` invite landing (see CLAUDE.md's "Three routes" note) with `/rsvp` as a separate step.
3. ~~**Guest identity = phone number, verified via Firebase Phone Auth (OTP).**~~ Superseded — see above. Phone OTP is now staff-only, reused on `/dashboard` as a third sign-in option.
4. **The "family" is built at RSVP time, not before.** The verified guest lists everyone in their party by name plus dietary needs in a single submission. There's no pre-defined family record to match against. (Still current.)
5. **Access is fully open by design** (couple's call, not gated by an allowlist): anyone with a link can sign in anonymously and submit an RSVP. This trades some control over the exact guest list for a much lighter launch — no guest data entry required from the couple/coordinators at all before sending the links. (Still current; the sign-in mechanism changed, not the openness.)
6. ~~Returning to the same phone number signs back into the *same* RSVP record.~~ Superseded — an anonymous session doesn't survive a cleared cache or new device, so return access now goes through a `recoveryCode` bearer link instead. See CLAUDE.md.

## Security Architecture

- **Firestore Security Rules** — a guest can only read/write the RSVP document tied to their own authenticated UID (`request.auth.uid == resource.data.ownerUid`), regardless of whether that session is anonymous or came back via a recovery-code custom token. They cannot read or edit anyone else's response. Staff collections require a `role` custom claim, set on real Firebase Auth (email/Google/phone) accounts for the couple/coordinators — see Roles_and_Access.md for the full rank model.
- **Server-side validation via Cloud Functions** — party-size sanity caps, one poll vote per verified phone per poll, string length/content limits, song-request cutoff enforced against each event's start time (not left to the client). RSVP tier is set once at creation from the link the guest arrived on, and is immutable after that — a client can't rewrite which tier they belong to.
- **Abuse mitigation, given open access** — Firebase App Check on Firestore/Storage/Functions to block non-app traffic; a soft cap on party size per submission (configurable) to keep any single fake entry from skewing headcounts. There's no OTP throttling to lean on for guests now that identity is Anonymous Auth rather than Phone Auth (see Guest Identity section). Since access isn't gated by an allowlist, the dashboard lets admins/couple delete/flag obviously bogus entries.
- **Storage rules** — uploads restricted by file type, size, and path (`photos/{eventId}/{ownerUid}/{fileId}`) so guests can't overwrite each other's files.
- **Secrets** — weather API key, and any future WhatsApp BSP key, live in Cloud Functions config / Secret Manager, never in client code.
- **Transport/XSS** — HTTPS by default via Firebase Hosting; CSP headers on the app shell.

## Third-Party Integrations

- **Navigation** — plain Google Maps deep links (`https://maps.google.com/?q=...`); no SDK, no cost.
- **Weather** — OpenWeatherMap free tier.
- **WhatsApp** —
  - *v1:* manual distribution of the 3 static links — the couple pastes the right link into each family's chat or group. No API, no approval wait, zero cost.
  - *v2 (optional):* WhatsApp Business Cloud API via a BSP (Gupshup / Interakt / AiSensy) for automated reminders. Template approval typically within hours; ~$0.01/message in India; new business numbers are capped at 250 unique recipients/24h until Meta raises the quality tier. Worth starting the BSP/approval process in parallel now if automated reminders matter for v2.

## Rough Data Model

```
rsvps/{ownerUid}                 // ownerUid = Firebase Auth uid (anonymous, or recovery custom token)
  tier (full | wedding_only | reception_only)  // set once at creation, immutable
  submittedByPhone (optional contact number), language
  party: [{ name, ageGroup, dietary }]
  perEventAttendance{}
  shareCode, recoveryCode
  createdAt, updatedAt

events/{eventId}
  name, date, venue, dressCode

polls/{pollId}
pollVotes/{ownerUid_pollId}

songRequests/{requestId}
  ownerUid, title, artist, submittedAt   // cutoff enforced by Cloud Function

memories/{memoryId}
  ownerUid, type (voice | text), content/url, createdAt
  // write-only for guests, read-only for admin

photos/{eventId}/{ownerUid}/{fileId}
  // visibility flag (shared | private) set per event by admin
```

## Build Priority

**v1 (target: Aug 15 send)** — invite + RSVP across the 3 tiers, dietary capture, event timeline, bride/groom dashboard with copy-to-clipboard WhatsApp flow, PWA install, offline caching, 4-language UI.

**v2 (before the wedding, once the final date is locked)** — digital memories, live polls, DJ song requests, per-event photo albums (shared/private), in-app chat, optional WhatsApp Business API reminders.

## Open Items

- Lock final wedding date → populate real event dates in Firestore.
- Set a party-size soft cap for RSVP submissions (e.g. max N per entry) to keep open access from skewing headcounts.
- Decide whether to pursue WhatsApp Business API for v2 reminders (start BSP onboarding early if so).
- Confirm a domain name for the invite link.
