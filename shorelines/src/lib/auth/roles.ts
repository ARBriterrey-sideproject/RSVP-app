/**
 * Staff roles — the couple and whoever they let behind the dashboard.
 *
 * Entirely separate from guests. A guest's identity is a phone number with no
 * claim on it at all; staff sign in with an email account carrying a `role`
 * custom claim. Nothing here ever applies to a guest.
 *
 * Bride and groom share one role on purpose. There is no capability one should
 * have and the other shouldn't, so splitting them would mean two identical rows
 * that can silently drift apart. They get separate *accounts* — that's what
 * gives an audit trail — but the same role.
 *
 * Keep the ranks in sync with roleRank() in firestore.rules / storage.rules and
 * RANK in functions/src/index.ts. Three copies is the cost of Firestore rules
 * not being able to import TypeScript.
 */

export const STAFF_ROLES = ["coordinator", "couple", "admin"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

/**
 * Roles nest rather than overlap: everything a coordinator may do, the couple
 * may do. That keeps the rules to a single `>=` comparison instead of a matrix,
 * and it matches the real hierarchy — nobody hires a coordinator who is trusted
 * with things the bride isn't.
 */
const RANK: Record<StaffRole, number> = {
  coordinator: 1,
  couple: 2,
  admin: 3,
};

/**
 * Capabilities, each pinned to the lowest rank that holds it. Components ask
 * `can(role, "managePrivateEvents")` rather than comparing roles themselves, so
 * moving a capability between roles is a one-line edit here.
 */
const CAPABILITIES = {
  /** The response list and the headcount/dietary aggregates. */
  viewResponses: RANK.coordinator,
  /** Phone numbers, arrival times, pickup requests — needed to arrange cars. */
  viewContactDetails: RANK.coordinator,
  /** The three tier links, for pasting into WhatsApp. */
  copyInviteLinks: RANK.coordinator,
  editEmergencyContacts: RANK.coordinator,

  /**
   * Deliberately above coordinator: `memories/` is a private one-way inbox to
   * the couple, not a staff feed.
   */
  viewMemories: RANK.couple,
  /**
   * Creating a private event and naming who may see it. The couple's invitation
   * to extend, not logistics — a coordinator arranging cars has no business
   * knowing a gathering exists, let alone adding themselves to it.
   */
  managePrivateEvents: RANK.couple,
  flagResponse: RANK.couple,
  editSchedule: RANK.couple,
  /**
   * Access to the invite is open by design, so junk replies are expected. The
   * couple clearing one at 11pm shouldn't depend on reaching a developer.
   * Coordinators are excluded because there is no undo and the guest is never
   * told — a mistaken delete just loses a real family's reply.
   */
  deleteResponse: RANK.couple,

  /**
   * Admin-only: this is the one capability that widens access itself, so a
   * phished couple account still can't mint more admins.
   */
  manageStaff: RANK.admin,

  /** Flag/delete group chat messages, and read+answer concierge threads. */
  moderateChat: RANK.coordinator,
  /** The song-request queue — read-only for logistics. */
  viewSongRequests: RANK.coordinator,
  /** Past the 1-hour cutoff, for every event, not just logistics. */
  overrideSongDeadline: RANK.admin,
  /** Poll authoring writes `polls/` directly — the couple's call, like the guest list itself. */
  managePolls: RANK.couple,
  /** Per-event shared/private toggle and browsing/deleting uploaded photos. */
  manageAlbums: RANK.admin,
} as const;

export type Capability = keyof typeof CAPABILITIES;

/** `null` means signed in but unrostered — no capabilities at all. */
export function can(role: StaffRole | null, capability: Capability): boolean {
  if (role === null) return false;
  return RANK[role] >= CAPABILITIES[capability];
}

export function isStaffRole(value: unknown): value is StaffRole {
  return (
    typeof value === "string" && (STAFF_ROLES as readonly string[]).includes(value)
  );
}

/** How a role is named to the person holding it. */
export const ROLE_COPY: Record<StaffRole, { label: string; description: string }> =
  {
    admin: {
      label: "Administrator",
      description: "Full access, including staff accounts.",
    },
    couple: {
      label: "The couple",
      description: "Everything about your wedding and your guests.",
    },
    coordinator: {
      label: "Coordinator",
      description: "Guest numbers, travel and logistics.",
    },
  };
