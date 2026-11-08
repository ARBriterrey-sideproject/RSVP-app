# v2 build: chat, memories, polls, song requests, photo albums

> **Superseded — kept as a record of the build, not as current status.** All five
> features shipped, frontend included, and the dashboard is now twelve panels.
> The "Frontend: not started" list below was true when written and is wrong now;
> so is the panel inventory in it (the Speakeasy panel it names was replaced by
> `PrivateEventsPanel.tsx` when the speakeasy was generalized into
> couple-authored private events). `CLAUDE.md` and `Roles_and_Access.md` are the
> current references.

Full plan: `/Users/andhan/.claude/plans/mighty-doodling-pillow.md` (read that for design rationale — this file is just status + pointers).

## Status

**Backend: done.** All rules, capabilities, and callables from the plan are already in `main`:

- `firestore.rules` — `chats/`, `polls/`, `pollVotes/`, `songRequests/`, `albumSettings/`, `memories/` all present with the access rules the plan specifies.
- `storage.rules` — `photos/{eventId}/{ownerUid}/{fileId}` (staff read+list, owner write, couple delete), `memories/{ownerUid}/{fileId}`.
- `functions/src/index.ts` callables (line numbers as of last check): `sendChatMessage` (900), `moderateChatMessage` (972), `castVote` (1021), `submitSongRequest` (1075), `setAlbumVisibility` (1135), plus `updateWeddingLive` (1223) extended for `songRequestsOverride`.
- `src/lib/auth/roles.ts` — `moderateChat` (coordinator), `viewSongRequests` (coordinator), `overrideSongDeadline` (admin), `managePolls` (couple), `manageAlbums` (admin) all in `CAPABILITIES`.
- `src/content/schema.ts` / `overlay.ts` — `WeddingOverlay.songRequestsOverride` wired through.

**Frontend: not started.** Confirmed missing as of this check:
- No `src/lib/firebase/chat.ts` (or polls/songs/photos client wrappers) — `responses.ts` and `rsvps.ts` are the existing reference pattern to copy.
- No new routes: `src/app/chat/`, `src/app/photos/`, `src/app/polls/` don't exist. (`src/app/` currently only has `schedule/`, `manifest/`, `i/`, `dashboard/`, `rsvp/`.)
- `BottomTabBar.tsx` still has `type Tab = "today" | "schedule" | "rsvp"` — the two new tabs (chat, photos) aren't added yet.
- No new dashboard panels (`LiveChatPanel.tsx`, `SongRequestsPanel.tsx`, `PollsPanel.tsx`, `PhotoAlbumsPanel.tsx`) — `src/components/dashboard/` only has the original 9 (Replies, Travel, InviteLinks, Speakeasy, Memories, StaffAccess, Schedule, EmergencyContacts + kit/gate/auth files). Not registered in `DashboardHome.tsx`.
- `MemoriesPanel.tsx` still needs its "no write path yet" copy removed once the guest composer ships.
- No i18n entries yet for chat/polls/songs/photos namespaces in `messages/{en,hi,kn,or}.json`.
- `Roles_and_Access.md` table not yet updated with the 5 new capability rows (code has them, doc doesn't).

## Build order (per the plan)

1. **Chat first**: `src/lib/firebase/chat.ts` → `/chat` guest route (thin server page + `ChatScreen` client component, two-tab group/concierge, `onSnapshot`) → `LiveChatPanel.tsx` → `BottomTabBar` nav wiring → `DashboardHome.tsx` registration → i18n.
2. Then repeat the same cycle for: polls, song requests, photo albums, memories (memories is smallest — just a composer screen + dropping the MemoriesPanel placeholder copy).

## Patterns to copy (already in the codebase)

- Thin server-page wrapper: `src/app/rsvp/page.tsx`
- Fixed-viewport client screen + `BottomTabBar`: `ScheduleScreen.tsx`
- Callable client wrapper style: `src/lib/firebase/responses.ts`
- Dashboard panel shape (`capability`, `title`, `description`, `render`): any entry in `DashboardHome.tsx`'s `PANELS` array

## Non-obvious constraints (from the plan, worth re-reading before writing UI)

- **No guest-to-guest DMs.** Chat is one open `group` room + one `dm_{ownerUid}` concierge thread per guest talking to staff.
- **Memories stay one-way.** Guests write, never read back — even their own composed messages are session-only local state, not fetched from Firestore. Don't add a read path without asking.
- **Photo albums are upload-only this round** — no in-app gallery. `albumSettings` visibility toggle exists only for future-proofing the dashboard/staff view.
- **Song request cutoff** is computed server-side against real (overlay-aware) event start times — client UI should mirror it for display but the server re-checks.
- Chat spam guard: `chatCooldowns/{authorUid}` cooldown (~3s) inside `sendChatMessage`, staff exempt.
