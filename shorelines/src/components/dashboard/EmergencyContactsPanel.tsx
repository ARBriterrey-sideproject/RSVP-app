"use client";

import { useMemo, useState } from "react";
import type { EmergencyContact } from "@/content/schema";
import { updateWeddingLive } from "@/lib/firebase/liveConfig";
import { Field, PanelNote, SaveBar } from "./panelKit";

/**
 * WHO TO CALL, EDITABLE AT THE VENUE.
 *
 * These live only in the overlay — there is no compiled fallback, deliberately.
 * A hardcoded emergency number that turns out to be the previous coordinator's
 * is worse than an empty list: the empty list sends a guest to the front desk,
 * the stale one sends them to a phone nobody answers.
 *
 * A coordinator can edit these, unlike the schedule. Arranging the doctor and
 * the hotel desk *is* the job they were hired for, and the couple should not
 * have to be reachable for it at 2am.
 */

const MAX_CONTACTS = 20;

interface Row extends EmergencyContact {
  /** Local only. Never sent — the server takes `id` as the stable key. */
  key: string;
}

export function EmergencyContactsPanel({
  contacts,
}: {
  contacts: EmergencyContact[];
}) {
  const initial = useMemo(() => contacts.map(toRow), [contacts]);
  const [rows, setRows] = useState<Row[]>(initial);
  const [saved, setSaved] = useState<Row[]>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const dirty = !sameList(rows, saved);
  const invalid = firstInvalid(rows);

  function update(key: string, patch: Partial<EmergencyContact>) {
    setDone(false);
    setError(null);
    setRows((current) =>
      current.map((row) => (row.key === key ? { ...row, ...patch } : row))
    );
  }

  async function save() {
    if (invalid) {
      setError(invalid);
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const cleaned = rows.map(trimmed);
      await updateWeddingLive({
        emergencyContacts: cleaned.map(({ id, name, role, phone }) => ({
          id,
          name,
          role,
          phone,
        })),
      });
      setRows(cleaned);
      setSaved(cleaned);
      setDone(true);
    } catch (cause) {
      setError(
        cause instanceof Error && cause.message
          ? cause.message
          : "That didn't save. Check your connection and try again."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3">
      <PanelNote>
        Shown to every guest on the Today screen. Keep it to people who will
        actually answer during the wedding.
      </PanelNote>

      <div className="mt-4 flex flex-col gap-3">
        {rows.map((row) => (
          <div
            key={row.key}
            className="rounded-card bg-white p-3.5 ring-1 ring-hairline/50"
          >
            <div className="flex flex-col gap-2">
              <Field
                label="Name"
                value={row.name}
                placeholder="Priya Nayak"
                onChange={(value) => update(row.key, { name: value })}
              />
              <div className="grid grid-cols-2 gap-2">
                <Field
                  label="Who they are"
                  value={row.role}
                  placeholder="Coordinator"
                  onChange={(value) => update(row.key, { role: value })}
                />
                <Field
                  label="Phone"
                  type="tel"
                  inputMode="tel"
                  value={row.phone}
                  placeholder="+91 98765 43210"
                  onChange={(value) => update(row.key, { phone: value })}
                />
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                setDone(false);
                setRows((current) =>
                  current.filter((entry) => entry.key !== row.key)
                );
              }}
              className="mt-2 font-sans text-[12px] text-driftwood-soft underline underline-offset-4"
            >
              Remove
            </button>
          </div>
        ))}

        {rows.length === 0 ? (
          <p className="rounded-card border border-dashed border-hairline-dashed px-3.5 py-4 font-sans text-[13px] text-driftwood-faint">
            Nobody listed yet. Guests will see nothing here until you add
            someone.
          </p>
        ) : null}
      </div>

      <button
        type="button"
        disabled={rows.length >= MAX_CONTACTS}
        onClick={() => {
          setDone(false);
          setRows((current) => [...current, blank()]);
        }}
        className="mt-3 rounded-pill bg-card px-4 py-2.5 font-sans text-[13px] font-medium text-driftwood ring-1 ring-hairline transition-colors hover:bg-card-hover disabled:opacity-40"
      >
        {rows.length >= MAX_CONTACTS
          ? `That's the limit of ${MAX_CONTACTS}`
          : "Add someone"}
      </button>

      <SaveBar
        dirty={dirty}
        busy={busy}
        error={error}
        saved={done}
        label="Save contacts"
        onSave={() => void save()}
        onDiscard={() => {
          setRows(saved);
          setError(null);
        }}
      />
    </div>
  );
}

function toRow(contact: EmergencyContact): Row {
  return { ...contact, key: contact.id };
}

/**
 * A new row's id is minted here and then never changes, so that renaming a
 * contact isn't a delete-and-create. The list is written wholesale, so the id
 * isn't doing addressing work today — it is there for the moment something
 * else (a Today-screen "called" state, an audit line) needs to point at a row
 * and find the same one tomorrow.
 */
function blank(): Row {
  const id = `contact-${Math.random().toString(36).slice(2, 10)}`;
  return { key: id, id, name: "", role: "", phone: "" };
}

function trimmed(row: Row): Row {
  return {
    ...row,
    name: row.name.trim(),
    role: row.role.trim(),
    phone: row.phone.trim(),
  };
}

/**
 * All three fields are required because the server requires them: `cleanString`
 * rejects an empty string, so a half-filled row fails the whole save rather
 * than storing a nameless number. Better to say so before the round trip.
 */
function firstInvalid(rows: Row[]): string | null {
  for (const row of rows) {
    const { name, role, phone } = trimmed(row);
    if (!name || !role || !phone) {
      return name
        ? `${name} needs both a description and a phone number.`
        : "Every contact needs a name, a description and a phone number.";
    }
  }
  return null;
}

function sameList(a: Row[], b: Row[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((row, index) => {
    const other = b[index];
    return (
      row.id === other.id &&
      row.name === other.name &&
      row.role === other.role &&
      row.phone === other.phone
    );
  });
}
