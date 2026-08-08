# Roles and access

Who can sign in to the Shorelines dashboard, what each role can do, and exactly which rule enforces it.

This is the companion to [Tech_Stack.md](Tech_Stack.md) for the access-control half of the system. If this file and the code disagree, the code wins — but say so, because one of them is a bug.

---

## The shape of it

There are **two entirely separate populations**, and nothing crosses between them.

| | Guests | Staff |
|---|---|---|
| Identity | Phone number (Firebase Phone Auth, OTP) | Email account (password or Google) |
| Role claim | none, ever | `role` custom claim |
| How they arrive | a tier link pasted into WhatsApp | typing `/dashboard` |
| What they can read | their own RSVP, and nothing else | depends on rank, below |

A guest never carries a `role`, so every staff rule evaluates to false for them without a special case. That's the reason roles are a claim rather than a field on a document: a claim rides inside the ID token, so the rules can check it without a read.

## Three roles, ranked

Roles **nest** — they do not overlap. Everything a coordinator may do, the couple may do; everything the couple may do, an admin may do.

| Role | Rank | Who holds it |
|---|---|---|
| `admin` | 3 | Whoever maintains the app |
| `couple` | 2 | Bride and groom |
| `coordinator` | 1 | Wedding planner, logistics helpers |
| *(absent or unrecognised)* | 0 | A signed-in stranger — no access to anything |

Ranking rather than a permission matrix means every rule is a single `>=` comparison instead of a list of role names to keep aligned across four files. It also matches the real hierarchy: nobody hires a coordinator who is trusted with things the bride isn't.

**Bride and groom share one role on purpose.** There is no capability one should have and the other shouldn't, so splitting them would create two identical rows that can silently drift apart. They get separate *accounts* — that's what gives an audit trail — but the same role.

> **Where the ranks live.** The table above is duplicated in four places: [`src/lib/auth/roles.ts`](shorelines/src/lib/auth/roles.ts), [`functions/src/index.ts`](shorelines/functions/src/index.ts), [`firestore.rules`](shorelines/firestore.rules) and [`storage.rules`](shorelines/storage.rules). Firestore rules cannot import TypeScript, so this is unavoidable. All four carry a comment pointing at the others — **change them together.**

---

## Capabilities

Defined in `CAPABILITIES` in [roles.ts](shorelines/src/lib/auth/roles.ts). UI asks `can(role, "grantSpeakeasy")`; it never compares role names itself, so moving a capability between roles is a one-line edit in that file.

| Capability | Min rank | Coordinator | Couple | Admin | Dashboard panel |
|---|---|:---:|:---:|:---:|---|
| `viewResponses` | coordinator | ✅ | ✅ | ✅ | Replies |
| `viewContactDetails` | coordinator | ✅ | ✅ | ✅ | Travel & pickups |
| `copyInviteLinks` | coordinator | ✅ | ✅ | ✅ | Invite links |
| `editEmergencyContacts` | coordinator | ✅ | ✅ | ✅ | Emergency contacts |
| `viewMemories` | couple | ❌ | ✅ | ✅ | Messages to you |
| `grantSpeakeasy` | couple | ❌ | ✅ | ✅ | The speakeasy |
| `editSchedule` | couple | ❌ | ✅ | ✅ | Schedule |
| `flagResponse` | couple | ❌ | ✅ | ✅ | *(within Replies)* |
| `deleteResponse` | couple | ❌ | ✅ | ✅ | *(within Replies)* |
| `manageStaff` | admin | ❌ | ❌ | ✅ | Staff access |

A coordinator therefore sees **4 of the 8** panels; the couple see 7; an admin sees 8.

### Why the four non-obvious lines sit where they do

**`viewContactDetails` — coordinator.** They need phone numbers and arrival times to arrange cars. Withholding them would mean the couple hand-relaying every pickup, which is exactly the work a coordinator is hired to absorb.

**`viewMemories` — couple, never coordinator.** `memories/` is a private one-way inbox: guests write these believing they are writing to the two people getting married. A logistics hire reading them would break that promise silently, and the guest would never know.

**`deleteResponse` — couple, not admin-only.** Access to the invite is open by design, so junk replies are expected. The couple clearing one at 11pm shouldn't depend on reaching a developer. Coordinators are excluded because there is no undo and the guest is never notified — one mistaken delete just loses a real family's reply.

**`manageStaff` — admin only.** This is the single capability that widens access itself. Keeping it above `couple` means a phished couple account still cannot mint more admins.

---

## How a role is granted

**From a server-side roster, not the database.** `STAFF_ROSTER` is a JSON environment variable mapping email → role:

```json
{"andhanrahul@gmail.com":"admin","shubham@example.com":"couple","coordinator@example.com":"coordinator"}
```

- Emulator: [`functions/.env.local`](shorelines/functions/.env.local) (gitignored via `*.local`).
- Production: `firebase functions:secrets:set STAFF_ROSTER`.

A Firestore collection was rejected for this: granting the *first* admin would itself require an admin. An env var has no bootstrap problem. Malformed JSON **fails closed** — it logs and yields an empty roster, so a typo locks everyone out rather than letting everyone in.

### The `syncRole` callable

Custom claims can only be written by the Admin SDK, so the client calls `syncRole` (no arguments) after signing in. Three properties are load-bearing:

1. **It refuses an unverified email** (`failed-precondition`). Without this, anyone who knows a roster address could register it first with their own password and inherit the role. This is the single most important check in the file.
2. **It overwrites; it does not merge.** Whatever the incoming token claims, the stored claim becomes the roster's answer — or is cleared entirely if the address isn't listed.
3. **It reads the address from the token, never from an argument.** There is no parameter a caller could use to nominate someone else.

### Token refresh

Custom claims **do not propagate to already-issued ID tokens.** [`staffAuth.ts`](shorelines/src/lib/firebase/staffAuth.ts) forces a refresh twice, and both are needed:

- **before** the call, so the server evaluates a current `email_verified`;
- **after**, when the claim changed, so the rules see the new role.

Skip the second and the dashboard renders correctly while every Firestore read fails — the confusing failure this exists to prevent.

### Sign-in states

`StaffAuthProvider` resolves to one of five, and `DashboardGate` renders one screen per state:

| State | Meaning | Screen |
|---|---|---|
| `loading` | resolving | "One moment…" |
| `signed-out` | nobody signed in | Sign-in form |
| `unverified` | signed in, email not confirmed | "Check your inbox" |
| `unrostered` | verified, but not on the roster | "No access" |
| `ready` | has a role | The dashboard |

If `syncRole` fails for any reason *other* than `failed-precondition`, the provider logs it and falls back to reading the existing token claim — so a network blip doesn't lock out someone who already holds a valid role.

> **`DashboardGate` is a convenience gate, not the security boundary.** Every one of those states is bypassable from the browser console. What actually stops an unrostered account reading anything is the claim check in the rules and in each callable. The gate exists so that someone without access sees an explanation instead of a dashboard where every request fails.

### Sessions

"Keep me signed in on this device" selects `browserLocalPersistence` (IndexedDB-backed, survives a reboot) over `browserSessionPersistence` (cleared with the tab). Persistence must be set **before** the sign-in call or it doesn't apply to that session.

---

## Every rule, by collection

### Firestore — [firestore.rules](shorelines/firestore.rules)

| Path | Operation | Rule | Effect |
|---|---|---|---|
| `rsvps/{ownerUid}` | `get` | `isOwner(ownerUid) \|\| isStaff()` | Guest reads own; any staff role reads any |
| | `list` | `isStaff()` | Guests cannot enumerate |
| | `create/update/delete` | `false` | **No client writes at all, not even admin** — everything goes through `submitRsvp` |
| `invites/{shareCode}` | `get` | `true` | Deliberately public: a QR scanner has no account. The unguessable code *is* the credential |
| | `list` | `false` | Enumeration would hand over every family's code at once |
| | `write` | `false` | Only the callable populates it |
| `events/{eventId}` | `read` | `true` | The timeline and Today screen need these before sign-in |
| | `write` | `isCouple()` | Moving a ceremony reshapes every guest's schedule |
| `polls/{pollId}` | `read` | `isSignedIn()` | |
| | `write` | `isCouple()` | |
| `pollVotes/{voteId}` | `read` | `isSignedIn()` | Results render for guests |
| | `write` | `false` | One vote per phone enforced by the callable + compound doc id |
| `songRequests/{id}` | `read` | `isStaff()` | Whoever is running the music, coordinator included |
| | `write` | `false` | Cutoff checked server-side against the event's real start time |
| `memories/{id}` | `read` | `isCouple()` | **Never coordinator** |
| | `create` | `isSignedIn() && request.resource.data.ownerUid == request.auth.uid` | Guests write only as themselves |
| | `update/delete` | `isCouple()` | |
| `aggregates/{docId}` | `read` | `isStaff()` | |
| | `write` | `false` | Written by Functions only |
| `{document=**}` | `read/write` | `false` | Anything unmatched is denied |

Note `memories` has **no read rule for guests at all** — not even for their own. It is a one-way inbox by design, not a feed.

### Storage — [storage.rules](shorelines/storage.rules)

| Path | Operation | Rule |
|---|---|---|
| `photos/{eventId}/{ownerUid}/{fileId}` | `read` | `isSignedIn()` |
| | `write` | own `ownerUid` + under 15 MB + `image/*` |
| | `delete` | `isCouple()` |
| `memories/{ownerUid}/{fileId}` | `read` | `isCouple()` |
| | `write` | own `ownerUid` + under 25 MB + `audio/*` |
| `{allPaths=**}` | `read/write` | `false` |

The `{ownerUid}` path segment is what stops guests overwriting each other's uploads.

### Callables — [functions/src/index.ts](shorelines/functions/src/index.ts)

| Callable | Who may call it | Notes |
|---|---|---|
| `submitRsvp` | any signed-in user | Writes only `rsvps/{request.auth.uid}`. Enforces the party-size cap, tier immutability, string limits, and strips invitation-only events a guest wasn't flagged for |
| `setSpeakeasyInvite` | rank ≥ `couple` | A coordinator gets `permission-denied`. Revoking also deletes the stored acceptance |
| `syncRole` | any signed-in user | Requires a verified email. Grants only what the roster says, for the caller's own address |

---

## Verified, not assumed

Run against the emulator suite. The forged-token rows use an unsigned `alg:none` JWT, which the Functions and Firestore emulators accept — that is a test affordance, not a real attack path, since Google signs tokens in production. The point is that even *given* a forged claim, the server overrides it.

| Test | Expected | Result |
|---|---|---|
| Admin signs in | 8 panels | ✅ 8 of 8 |
| Coordinator signs in | 4 panels | ✅ 4 of 8 |
| Rostered address, email unverified | no role | ✅ `failed-precondition` |
| Coordinator calls `setSpeakeasyInvite` | denied | ✅ `PERMISSION_DENIED` |
| Real coordinator, token forged to `admin` | overwritten | ✅ → `coordinator` |
| Off-roster account, token forged to `admin` | cleared | ✅ → `{}` |
| Coordinator reads `rsvps` / `memories` | 200 / 403 | ✅ |
| Couple reads `rsvps` / `memories` | 200 / 200 | ✅ |
| Guest reads own RSVP | 200 | ✅ |
| Guest reads another's RSVP | 403 | ✅ |
| Guest lists all RSVPs | 403 | ✅ |

Reproduce with the recipes in [CLAUDE.md](CLAUDE.md) — the owner-token REST bypass for rules, and the unsigned JWT for callables.

---

## Adding or removing someone

1. Edit `STAFF_ROSTER` — `.env.local` for the emulator, `firebase functions:secrets:set STAFF_ROSTER` for production.
2. Restart the emulator, or redeploy functions.
3. They sign in and confirm their email. `syncRole` runs on load and grants it.

**Removing someone requires them to re-sync**, because the claim is already in their token. Removing an address from the roster does not eject an open session — their next `syncRole` clears it, and their token expires within the hour regardless. To eject immediately, revoke their refresh tokens with the Admin SDK.

The **Staff access** panel that would do all this from the UI is not built. Until it is, the roster is the mechanism.

---

## Open questions

- Nobody is on the production roster yet — there is no production project.
- Whether coordinators should have a **time-limited** role that expires after the wedding. Currently a role lasts until the roster is edited.
- Whether vendors (caterer, photographer, DJ) ever need logins. **Decided: no** — they get exports, not accounts. Revisit only if the DJ wants the v2 song-request queue live on the night, which is the one case with a real argument for it.
