"use client";

import { useMemo, useState } from "react";
import type { WeddingConfig } from "@/content/schema";
import { getWeddingConfig } from "@/content/wedding";
import { updateWeddingLive } from "@/lib/firebase/liveConfig";
import { joinInstant, splitInstant } from "@/lib/wedding/instant";
import { Field, PanelNote, SaveBar } from "./panelKit";

/**
 * MOVING A TIME WITHOUT A REBUILD.
 *
 * The one thing a wedding actually does in its last fortnight. Everything
 * structural — which events exist, which tiers see them, how many days there
 * are — stays compiled in and needs a deploy; times don't, because they change
 * from a phone, at a venue, by someone who has never opened a terminal.
 *
 * Two config values are in play on this screen and confusing them is the whole
 * risk. The **printed** time is what is compiled into the app. The **live**
 * time is what guests are being shown right now: printed, with whatever the
 * couple last saved merged on top. A row is "moved" when those differ, and
 * setting a row back to its printed time doesn't write that time — it deletes
 * the override, so the row goes back to tracking the build.
 */

interface Row {
  kind: "event" | "schedule";
  id: string;
  name: string;
  /** Meals are a point in the day; ceremonies are a window. */
  hasEnd: boolean;
  live: { startsAt: string; endsAt?: string };
  printed: { startsAt: string; endsAt?: string };
  note?: string;
}

interface Draft {
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
}

export function SchedulePanel({ config }: { config: WeddingConfig }) {
  /*
   * The printed config is imported, not passed down. It is a compile-time
   * constant sitting in this bundle already — asking the server to send a copy
   * of something the client is holding would be the more complicated option,
   * not the safer one.
   */
  const printed = getWeddingConfig();

  /*
   * Rows are state, not a memo of the prop. After a save the server's copy has
   * moved on and this page hasn't re-rendered — the panel has to be able to
   * adopt what was just accepted as the new "live", or it goes on offering to
   * save a change it already saved.
   */
  const [rows, setRows] = useState<Row[]>(() => buildRows(config, printed));
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() =>
    initialDrafts(buildRows(config, printed))
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const changes = useMemo(() => collectChanges(rows, drafts), [rows, drafts]);
  const invalid = useMemo(() => firstInvalid(rows, drafts), [rows, drafts]);
  const dirty = changes.events.size > 0 || changes.schedule.size > 0;

  function edit(id: string, patch: Partial<Draft>) {
    setSaved(false);
    setError(null);
    setDrafts((current) => ({ ...current, [id]: { ...current[id], ...patch } }));
  }

  async function save() {
    if (invalid) {
      setError(invalid);
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await updateWeddingLive({
        ...(changes.events.size
          ? { events: Object.fromEntries(changes.events) }
          : {}),
        ...(changes.schedule.size
          ? { schedule: Object.fromEntries(changes.schedule) }
          : {}),
      });
      /*
       * The page won't re-render with the new server state — this is a client
       * component holding a snapshot taken before the write. Rebasing the rows
       * onto what was just accepted is what makes the panel stop reporting
       * unsaved changes, and it is safe precisely because the callable either
       * accepted all of it or threw.
       */
      const rebased = rebase(rows, drafts);
      setRows(rebased);
      setDrafts(initialDrafts(rebased));
      setSaved(true);
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  }

  const ceremonies = rows.filter((row) => row.kind === "event");
  const meals = rows.filter((row) => row.kind === "schedule");

  return (
    <div className="mt-3">
      <PanelNote>
        Times only. Venues, dress codes and which days exist are part of the
        build — ask for those to be changed.
      </PanelNote>

      <Group title="Ceremonies">
        {ceremonies.map((row) => (
          <RowEditor key={row.id} row={row} draft={drafts[row.id]} onEdit={edit} />
        ))}
      </Group>

      <Group title="Meals">
        {meals.map((row) => (
          <RowEditor key={row.id} row={row} draft={drafts[row.id]} onEdit={edit} />
        ))}
      </Group>

      <SaveBar
        dirty={dirty}
        busy={busy}
        error={error}
        saved={saved}
        label="Save times"
        onSave={() => void save()}
        onDiscard={() => {
          setDrafts(initialDrafts(rows));
          setError(null);
        }}
      />
    </div>
  );
}

function Group({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-5">
      <h3 className="font-sans text-[10px] uppercase tracking-[0.2em] text-driftwood-faint">
        {title}
      </h3>
      <div className="mt-2.5 flex flex-col gap-3">{children}</div>
    </section>
  );
}

function RowEditor({
  row,
  draft,
  onEdit,
}: {
  row: Row;
  draft: Draft;
  onEdit: (id: string, patch: Partial<Draft>) => void;
}) {
  const moved = isMoved(row);
  const back = splitInstant(row.printed.startsAt);
  const backEnd = row.printed.endsAt
    ? splitInstant(row.printed.endsAt)
    : undefined;

  return (
    <div className="rounded-card bg-white p-3.5 ring-1 ring-hairline/50">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-sans text-[15px] font-medium leading-tight text-driftwood">
          {row.name}
        </span>
        {moved ? (
          <span className="shrink-0 font-sans text-[10px] uppercase tracking-[0.16em] text-coral-ink">
            Moved
          </span>
        ) : null}
      </div>
      {row.note ? (
        <p className="mt-0.5 font-sans text-xs text-driftwood-faint">{row.note}</p>
      ) : null}

      <div className="mt-2.5 grid grid-cols-2 gap-2">
        <Field
          label={row.hasEnd ? "Starts" : "Date"}
          type="date"
          value={draft.startDate}
          onChange={(value) => onEdit(row.id, { startDate: value })}
        />
        <Field
          label={row.hasEnd ? "At" : "Time"}
          type="time"
          value={draft.startTime}
          onChange={(value) => onEdit(row.id, { startTime: value })}
        />
        {row.hasEnd ? (
          <>
            <Field
              label="Ends"
              type="date"
              value={draft.endDate}
              onChange={(value) => onEdit(row.id, { endDate: value })}
            />
            <Field
              label="At"
              type="time"
              value={draft.endTime}
              onChange={(value) => onEdit(row.id, { endTime: value })}
            />
          </>
        ) : null}
      </div>

      {moved && back ? (
        <button
          type="button"
          onClick={() =>
            onEdit(row.id, {
              startDate: back.date,
              startTime: back.time,
              endDate: backEnd?.date ?? back.date,
              endTime: backEnd?.time ?? back.time,
            })
          }
          className="mt-2 font-sans text-[12px] text-driftwood-soft underline underline-offset-4"
        >
          Put back the printed time
        </button>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------
 * Rows, drafts and the diff.
 * ---------------------------------------------------------------------- */

function buildRows(live: WeddingConfig, printed: WeddingConfig): Row[] {
  /*
   * The speakeasy is editable here even though no tier can see it. It is a real
   * event at a real time, and the couple moving it is exactly as ordinary as
   * moving the Sangeet — the invitation-only rule governs who is told, not
   * whether it exists.
   */
  const liveEvents = [...live.events, ...live.invitationOnlyEvents];
  const printedEvents = [...printed.events, ...printed.invitationOnlyEvents];

  const events: Row[] = liveEvents.flatMap((event) => {
    const source = printedEvents.find((candidate) => candidate.id === event.id);
    if (!source) return [];
    return [
      {
        kind: "event",
        id: event.id,
        name: event.name,
        hasEnd: true,
        live: { startsAt: event.startsAt, endsAt: event.endsAt },
        printed: { startsAt: source.startsAt, endsAt: source.endsAt },
      },
    ];
  });

  const meals: Row[] = live.schedule.flatMap((item) => {
    const source = printed.schedule.find(
      (candidate) => candidate.id === item.id
    );
    if (!source) return [];
    return [
      {
        kind: "schedule",
        id: item.id,
        name: item.name,
        hasEnd: false,
        live: { startsAt: item.startsAt },
        printed: { startsAt: source.startsAt },
        note: item.note,
      },
    ];
  });

  return [...events, ...meals];
}

function initialDrafts(rows: Row[]): Record<string, Draft> {
  const out: Record<string, Draft> = {};
  for (const row of rows) {
    const start = splitInstant(row.live.startsAt);
    const end = row.live.endsAt ? splitInstant(row.live.endsAt) : null;
    out[row.id] = {
      startDate: start?.date ?? "",
      startTime: start?.time ?? "",
      endDate: end?.date ?? start?.date ?? "",
      endTime: end?.time ?? start?.time ?? "",
    };
  }
  return out;
}

function isMoved(row: Row): boolean {
  return (
    row.live.startsAt !== row.printed.startsAt ||
    row.live.endsAt !== row.printed.endsAt
  );
}

/**
 * The offset is always the printed value's own, never the browser's — see the
 * note in lib/wedding/instant.ts. A dashboard opened from another country must
 * not be able to shift a ceremony by doing nothing.
 */
function instants(row: Row, draft: Draft): { startsAt: string; endsAt?: string } {
  const offset = splitInstant(row.printed.startsAt)?.offset ?? "Z";
  return {
    startsAt: joinInstant({
      date: draft.startDate,
      time: draft.startTime,
      offset,
    }),
    endsAt: row.hasEnd
      ? joinInstant({ date: draft.endDate, time: draft.endTime, offset })
      : undefined,
  };
}

/**
 * What to send: only rows whose value differs from what is live.
 *
 * A row edited back to its printed time sends `null` rather than that time.
 * Writing it would leave an override that happens to agree with the build
 * today and silently disagrees with it the moment the build changes — which is
 * precisely the drift the overlay exists to avoid.
 */
function collectChanges(
  rows: Row[],
  drafts: Record<string, Draft>
): {
  events: Map<string, { startsAt: string; endsAt: string } | null>;
  schedule: Map<string, { startsAt: string } | null>;
} {
  const events = new Map<string, { startsAt: string; endsAt: string } | null>();
  const schedule = new Map<string, { startsAt: string } | null>();

  for (const row of rows) {
    const draft = drafts[row.id];
    if (!draft) continue;

    const next = instants(row, draft);
    if (
      next.startsAt === row.live.startsAt &&
      next.endsAt === row.live.endsAt
    ) {
      continue;
    }

    const backToPrinted =
      next.startsAt === row.printed.startsAt &&
      next.endsAt === row.printed.endsAt;

    if (row.kind === "event") {
      events.set(
        row.id,
        backToPrinted ? null : { startsAt: next.startsAt, endsAt: next.endsAt! }
      );
    } else {
      schedule.set(row.id, backToPrinted ? null : { startsAt: next.startsAt });
    }
  }

  return { events, schedule };
}

/**
 * Client-side checks for the two failures a person can produce by typing. The
 * callable rejects both as well — this is here so the answer arrives before the
 * round trip, not instead of it.
 */
function firstInvalid(
  rows: Row[],
  drafts: Record<string, Draft>
): string | null {
  for (const row of rows) {
    const draft = drafts[row.id];
    if (!draft) continue;

    const next = instants(row, draft);
    if (Number.isNaN(Date.parse(next.startsAt))) {
      return `${row.name} needs a date and a time.`;
    }
    if (next.endsAt !== undefined) {
      if (Number.isNaN(Date.parse(next.endsAt))) {
        return `${row.name} needs an end date and time.`;
      }
      if (Date.parse(next.endsAt) < Date.parse(next.startsAt)) {
        return `${row.name} would end before it starts.`;
      }
    }
  }
  return null;
}

/** Applies what the server just accepted to the rows we're holding. */
function rebase(rows: Row[], drafts: Record<string, Draft>): Row[] {
  return rows.map((row) => {
    const draft = drafts[row.id];
    if (!draft) return row;
    const next = instants(row, draft);
    return { ...row, live: { startsAt: next.startsAt, endsAt: next.endsAt } };
  });
}

function messageOf(cause: unknown): string {
  if (cause instanceof Error && cause.message) return cause.message;
  return "That didn't save. Check your connection and try again.";
}
