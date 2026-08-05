# Wedding RSVP App — Tech Stack & Architecture

Internal build reference. Companion to `Wedding_RSVP_App_Plan.docx` (the product plan shared with the couple).

## Frontend

- **Framework:** Next.js (React), mobile-first.
- **Styling:** Tailwind CSS + shadcn/ui components — lets us ship a polished UI fast without hand-building a design system in the available window.
- **Animation:** Framer Motion.
- **PWA:** `next-pwa` / Serwist for install-to-home-screen, service worker, and offline caching of schedule, venue, and emergency-contact data.
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

Revised: no pre-loaded guest database, no per-family personalized tokens. Prepping ~200+ individual invite records before launch was too much manual work for the 10-day window, so the model is now self-serve.

1. **Three static links, not one per family.** One each for Full Wedding (all 5 events), Wedding Only, and Reception Only. The route/query param on the link (e.g. `/rsvp?tier=full`) sets which events, dress code, and RSVP options that visitor sees — nothing per-guest to generate.
2. **Home page is the RSVP form.** A short animated header, then straight into the form — no separate landing/marketing step.
3. **Guest identity = phone number, verified via Firebase Phone Auth (OTP).** No passwords, no pre-loaded accounts. Whoever opens the link — often a younger relative rather than the elder actually invited — enters a phone number, receives an SMS OTP, and that becomes their identity for this RSVP and for editing it later.
4. **The "family" is built at RSVP time, not before.** The verified guest lists everyone in their party by name plus dietary needs in a single submission. There's no pre-defined family record to match against.
5. **Access is fully open by design** (couple's call, not gated by an allowlist): anyone with a link can verify by OTP and submit an RSVP. This trades some control over the exact guest list for a much lighter launch — no guest data entry required from the couple/coordinators at all before sending the links.
6. Returning to the same phone number signs back into the *same* RSVP record (Firebase Auth handles this natively), so re-opening the link updates their existing response rather than creating a duplicate.

## Security Architecture

- **Firestore Security Rules** — a guest can only read/write the RSVP document tied to their own authenticated phone UID (`request.auth.uid == resource.data.ownerUid`). They cannot read or edit anyone else's response. Admin-only collections (aggregate dietary counts, dashboard views, full response list) require a `role: admin` claim, set on real Firebase Auth (email/Google) accounts for the couple/coordinators.
- **Server-side validation via Cloud Functions** — party-size sanity caps, one poll vote per verified phone per poll, string length/content limits, song-request cutoff enforced against each event's start time (not left to the client). RSVP tier is set once at creation from the link the guest arrived on, and is immutable after that — a client can't rewrite which tier they belong to.
- **Abuse mitigation, given open access** — Firebase App Check on Firestore/Storage/Functions to block non-app traffic; Firebase Phone Auth's built-in OTP throttling/reCAPTCHA to curb spam sign-ups; a soft cap on party size per submission (configurable) to keep any single fake entry from skewing headcounts. Since access isn't gated by an allowlist, the dashboard should let admins delete/flag obviously bogus entries.
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
rsvps/{ownerUid}                 // ownerUid = Firebase Phone Auth uid
  tier (full | wedding_only | reception_only)  // set once at creation, immutable
  submittedByPhone, language
  party: [{ name, ageGroup, dietary }]
  perEventAttendance{}
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
