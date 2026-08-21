"use client";

import { useEffect, useState } from "react";
import { STAFF_ROLES, type StaffRole } from "@/lib/auth/roles";
import {
  decideStaffAccess,
  getStaffRoster,
  setStaffPhotoAccess,
  type StaffAccessRequest,
  type StaffRosterResult,
} from "@/lib/firebase/staffRoster";
import { PanelNote } from "./panelKit";

/**
 * WHO HAS ACCESS — and, for everyone but the break-glass admin, who decides.
 *
 * Two lists, and the split between them is the security model in miniature:
 *
 *  - **Requests.** Staff sign in, ask for access, and an admin picks their role
 *    here. This is the everyday path, and the only one that doesn't need a
 *    deploy. Rows are read-only once decided, but a decision can be changed —
 *    approving a denied row or demoting an approved one both work, and both
 *    take effect on that person's next dashboard load.
 *  - **The roster.** `STAFF_ROSTER` / `STAFF_PHONE_ROSTER` env vars, shown but
 *    not editable. They stay an env var so that granting the *first* admin
 *    never requires an admin to already exist, and so a compromised admin
 *    account can't demote the real one — `syncRole` checks them first and
 *    returns on a hit. Changing one is a Secret Manager command plus a
 *    redeploy; see Roles_and_Access.md.
 *
 * Photo access is a third thing again: a per-individual grant in
 * `staffPhotoAccess/{identity}`, flipped inline on any coordinator row from
 * either list. Couple and admin rows don't show the toggle — they already pass
 * by rank in `listEventPhotos`, so a grant for them would be written and never
 * read.
 */

const ROLE_LABEL: Record<string, string> = {
  admin: "Admin",
  couple: "Couple",
  coordinator: "Coordinator",
};

export function StaffAccessPanel() {
  const [roster, setRoster] = useState<StaffRosterResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      setRoster(await getStaffRoster());
    } catch (cause) {
      setError(
        cause instanceof Error && cause.message
          ? cause.message
          : "Couldn't load the roster. Check your connection and try again."
      );
    }
  }

  useEffect(() => {
    void (async () => {
      setLoading(true);
      await load();
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <p className="mt-3 font-sans text-[13px] text-driftwood-faint">
        Loading roster…
      </p>
    );
  }

  const requests = roster?.requests ?? [];
  const waiting = requests.filter((entry) => entry.status === "pending");
  const settled = requests.filter((entry) => entry.status !== "pending");

  const rosterRows = [
    ...(roster?.email.map((entry) => ({
      kind: "email" as const,
      identity: entry.email,
      role: entry.role,
    })) ?? []),
    ...(roster?.phone.map((entry) => ({
      kind: "phone" as const,
      identity: entry.phone,
      role: entry.role,
    })) ?? []),
  ];

  async function togglePhotoAccess(
    kind: "email" | "phone",
    identity: string,
    next: boolean
  ) {
    const key = `${kind}:${identity}`;
    setBusyKey(`photo:${key}`);
    try {
      await setStaffPhotoAccess(kind, identity, next);
      setRoster((current) =>
        current
          ? { ...current, photoAccess: { ...current.photoAccess, [key]: next } }
          : current
      );
    } catch (cause) {
      setError(
        cause instanceof Error && cause.message
          ? cause.message
          : "Couldn't update photo access. Try again."
      );
    } finally {
      setBusyKey(null);
    }
  }

  async function decide(identity: string, role: StaffRole | null) {
    setBusyKey(`decide:${identity}`);
    setError(null);
    try {
      await decideStaffAccess(identity, role);
      // Re-read rather than patching locally: the decision also stamps who and
      // when, and those come from the server.
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error && cause.message
          ? cause.message
          : "Couldn't save that decision. Try again."
      );
    } finally {
      setBusyKey(null);
    }
  }

  function photoToggle(kind: "email" | "phone", value: string, role: string) {
    if (role !== "coordinator") return null;
    const key = `${kind}:${value}`;
    const granted = roster?.photoAccess[key] === true;
    return (
      <div className="flex items-center justify-between gap-3 border-t border-hairline/50 pt-2.5">
        <p className="font-sans text-[12px] text-driftwood-soft">Photo access</p>
        <button
          type="button"
          disabled={busyKey === `photo:${key}`}
          onClick={() => void togglePhotoAccess(kind, value, !granted)}
          className={`shrink-0 rounded-pill px-3.5 py-1.5 font-sans text-[12px] font-medium transition-colors disabled:opacity-40 ${
            granted
              ? "bg-deeptide text-foam"
              : "border border-deeptide/30 text-deeptide"
          }`}
        >
          {granted ? "Granted" : "Not granted"}
        </button>
      </div>
    );
  }

  return (
    <div className="mt-3">
      {error ? (
        <p className="mt-3 font-sans text-[13px] text-coral-ink">{error}</p>
      ) : null}

      <SectionHeading>
        Requests
        {waiting.length > 0 ? (
          <span className="ml-2 rounded-pill bg-coral px-2 py-0.5 font-sans text-[11px] font-medium text-foam">
            {waiting.length} waiting
          </span>
        ) : null}
      </SectionHeading>
      <PanelNote>
        Anyone who signs in can ask for access. Nothing is granted until you
        pick a role here — and whoever you pick it for gets it the next time
        they open the dashboard.
      </PanelNote>

      <div className="mt-3 flex flex-col gap-2">
        {requests.length === 0 ? (
          <p className="rounded-card border border-dashed border-hairline-dashed px-3.5 py-4 font-sans text-[13px] text-driftwood-faint">
            No one has asked for access yet.
          </p>
        ) : null}

        {[...waiting, ...settled].map((entry) => (
          <RequestRow
            key={entry.identity}
            entry={entry}
            busy={busyKey === `decide:${entry.identity}`}
            onDecide={decide}
            photoToggle={photoToggle}
          />
        ))}
      </div>

      <SectionHeading className="mt-7">Fixed roster</SectionHeading>
      <PanelNote>
        These are set at deploy time and can&apos;t be changed from here — they
        exist so there is always a way back in if an admin account is lost. To
        add or remove one, update the roster secret and redeploy; see
        Roles_and_Access.md for the exact command.
      </PanelNote>

      <div className="mt-3 flex flex-col gap-2">
        {rosterRows.length === 0 ? (
          <p className="rounded-card border border-dashed border-hairline-dashed px-3.5 py-4 font-sans text-[13px] text-driftwood-faint">
            No roster entries found.
          </p>
        ) : null}

        {rosterRows.map((row) => (
          <div
            key={`${row.kind}:${row.identity}`}
            className="flex flex-col gap-2.5 rounded-card bg-white p-3.5 ring-1 ring-hairline/50"
          >
            <div className="flex items-center justify-between gap-3">
              <p className="font-sans text-[13px] text-driftwood">{row.identity}</p>
              <span className="rounded-pill bg-card px-3 py-1 font-sans text-[12px] font-medium text-driftwood-soft ring-1 ring-hairline/50">
                {ROLE_LABEL[row.role] ?? row.role}
              </span>
            </div>
            {photoToggle(row.kind, row.identity, row.role)}
          </div>
        ))}
      </div>
    </div>
  );
}

function RequestRow({
  entry,
  busy,
  onDecide,
  photoToggle,
}: {
  entry: StaffAccessRequest;
  busy: boolean;
  onDecide: (identity: string, role: StaffRole | null) => Promise<void>;
  photoToggle: (
    kind: "email" | "phone",
    value: string,
    role: string
  ) => React.ReactNode;
}) {
  // Defaults to the least access that's useful. Admin is in the list but has to
  // be chosen deliberately — it's the one role that can grant more admins.
  const [choice, setChoice] = useState<StaffRole>(entry.role ?? "coordinator");
  const decided = entry.status !== "pending";

  return (
    <div className="flex flex-col gap-2.5 rounded-card bg-white p-3.5 ring-1 ring-hairline/50">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-sans text-[13px] text-driftwood">
            {entry.value}
          </p>
          {entry.displayName ? (
            <p className="font-sans text-[12px] text-driftwood-faint">
              {entry.displayName}
            </p>
          ) : null}
        </div>
        <StatusPill entry={entry} />
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-hairline/50 pt-2.5">
        <select
          value={choice}
          disabled={busy}
          onChange={(event) => setChoice(event.target.value as StaffRole)}
          className="rounded-pill bg-card px-3 py-1.5 font-sans text-[12px] text-driftwood ring-1 ring-hairline/50 disabled:opacity-40"
        >
          {STAFF_ROLES.map((role) => (
            <option key={role} value={role}>
              {ROLE_LABEL[role] ?? role}
            </option>
          ))}
        </select>

        <button
          type="button"
          disabled={busy}
          onClick={() => void onDecide(entry.identity, choice)}
          className="rounded-pill bg-deeptide px-3.5 py-1.5 font-sans text-[12px] font-medium text-foam transition-colors disabled:opacity-40"
        >
          {busy ? "Saving…" : decided ? "Change role" : "Approve"}
        </button>

        {entry.status === "denied" ? null : (
          <button
            type="button"
            disabled={busy}
            onClick={() => void onDecide(entry.identity, null)}
            className="rounded-pill border border-coral/40 px-3.5 py-1.5 font-sans text-[12px] font-medium text-coral-ink transition-colors disabled:opacity-40"
          >
            {entry.status === "approved" ? "Revoke" : "Deny"}
          </button>
        )}
      </div>

      {entry.status === "approved" && entry.role
        ? photoToggle(entry.kind, entry.value, entry.role)
        : null}
    </div>
  );
}

function StatusPill({ entry }: { entry: StaffAccessRequest }) {
  const label =
    entry.status === "pending"
      ? "Waiting"
      : entry.status === "denied"
        ? "Denied"
        : (ROLE_LABEL[entry.role ?? ""] ?? "Approved");

  const tone =
    entry.status === "pending"
      ? "bg-coral/10 text-coral-ink ring-coral/25"
      : entry.status === "denied"
        ? "bg-card text-driftwood-faint ring-hairline/50"
        : "bg-deeptide/10 text-deeptide ring-deeptide/20";

  return (
    <span
      className={`shrink-0 rounded-pill px-3 py-1 font-sans text-[12px] font-medium ring-1 ${tone}`}
    >
      {label}
    </span>
  );
}

function SectionHeading({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <h3
      className={`mb-2 flex items-center font-sans text-[13px] font-medium text-driftwood ${className}`}
    >
      {children}
    </h3>
  );
}
