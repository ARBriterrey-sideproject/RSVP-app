"use client";

import { useEffect, useState } from "react";
import {
  getStaffRoster,
  setStaffPhotoAccess,
  type StaffRosterResult,
} from "@/lib/firebase/staffRoster";
import { PanelNote } from "./panelKit";

/**
 * WHO HAS ACCESS, mostly READ ONLY — plus one thing that isn't.
 *
 * There is deliberately no edit UI for *role* — `STAFF_ROSTER` /
 * `STAFF_PHONE_ROSTER` are env vars precisely so that granting the first
 * admin never requires an admin to already exist. Editing a role means a CLI
 * command against Secret Manager, not a form; this panel exists so that
 * command isn't the only place the current roster is visible.
 *
 * Photo access is different on purpose: it's a per-individual grant stored in
 * Firestore (`staffPhotoAccess/{identity}`), not a roster entry, so there's no
 * bootstrap problem in letting an admin flip it here — see
 * `setStaffPhotoAccess` in functions/src/index.ts. A coordinator has none by
 * default; the couple/admin opts specific people in. Couple and admin rows
 * don't show the toggle at all — they already pass by rank in
 * `listEventPhotos`, so a grant for them would be accepted but never read.
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
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        setRoster(await getStaffRoster());
      } catch (cause) {
        setError(
          cause instanceof Error && cause.message
            ? cause.message
            : "Couldn't load the roster. Check your connection and try again."
        );
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <p className="mt-3 font-sans text-[13px] text-driftwood-faint">
        Loading roster…
      </p>
    );
  }

  const rows = [
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
    setPending(key);
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
      setPending(null);
    }
  }

  return (
    <div className="mt-3">
      <PanelNote>
        To add or remove someone from the roster itself, update the roster
        secret and redeploy. See Roles_and_Access.md for the exact command.
        Photo access below is different — it&apos;s a per-person grant you can
        flip right here.
      </PanelNote>

      {error ? (
        <p className="mt-3 font-sans text-[13px] text-coral-ink">{error}</p>
      ) : null}

      <div className="mt-4 flex flex-col gap-2">
        {rows.length === 0 ? (
          <p className="rounded-card border border-dashed border-hairline-dashed px-3.5 py-4 font-sans text-[13px] text-driftwood-faint">
            No roster entries found.
          </p>
        ) : null}

        {rows.map((row) => {
          const key = `${row.kind}:${row.identity}`;
          const granted = roster?.photoAccess[key] === true;
          const isCoordinator = row.role === "coordinator";

          return (
            <div
              key={key}
              className="flex flex-col gap-2.5 rounded-card bg-white p-3.5 ring-1 ring-hairline/50"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="font-sans text-[13px] text-driftwood">{row.identity}</p>
                <span className="rounded-pill bg-card px-3 py-1 font-sans text-[12px] font-medium text-driftwood-soft ring-1 ring-hairline/50">
                  {ROLE_LABEL[row.role] ?? row.role}
                </span>
              </div>

              {isCoordinator ? (
                <div className="flex items-center justify-between gap-3 border-t border-hairline/50 pt-2.5">
                  <p className="font-sans text-[12px] text-driftwood-soft">
                    Photo access
                  </p>
                  <button
                    type="button"
                    disabled={pending === key}
                    onClick={() => void togglePhotoAccess(row.kind, row.identity, !granted)}
                    className={`shrink-0 rounded-pill px-3.5 py-1.5 font-sans text-[12px] font-medium transition-colors disabled:opacity-40 ${
                      granted
                        ? "bg-deeptide text-foam"
                        : "border border-deeptide/30 text-deeptide"
                    }`}
                  >
                    {granted ? "Granted" : "Not granted"}
                  </button>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
