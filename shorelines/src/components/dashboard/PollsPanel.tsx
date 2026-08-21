"use client";

import { useEffect, useMemo, useState } from "react";
import { onSnapshot } from "firebase/firestore";
import { getFirebase } from "@/lib/firebase/client";
import {
  createPoll,
  pollFromDoc,
  pollVoteFromDoc,
  pollVotesQuery,
  pollsQuery,
  setPollStatus,
  type Poll,
  type PollOption,
  type PollVote,
} from "@/lib/firebase/polls";
import type { EventId, WeddingConfig } from "@/content/schema";
import { useStaffAuth } from "./StaffAuthProvider";
import { Field, PanelNote } from "./panelKit";

/**
 * Poll authoring writes straight to Firestore (see polls.ts) — there's no
 * invariant here a rule can't already enforce, unlike voting. This panel is
 * the couple's whole interface to that: a create form plus a live list.
 */

function eventName(eventId: EventId | null, config: WeddingConfig): string | null {
  if (!eventId) return null;
  return config.events.find((event) => event.id === eventId)?.name ?? eventId;
}

function PollResultRow({ label, count, total }: { label: string; count: number; total: number }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center justify-between font-sans text-[12px] text-driftwood">
        <span>{label}</span>
        <span className="text-driftwood-faint">
          {count} · {pct}%
        </span>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-driftwood/10">
        <div className="h-full rounded-full bg-deeptide/70" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function PollRow({
  poll,
  eventLabel,
  busy,
  onToggleStatus,
}: {
  poll: Poll;
  eventLabel: string | null;
  busy: boolean;
  onToggleStatus: () => void;
}) {
  const [votes, setVotes] = useState<PollVote[]>([]);

  useEffect(() => {
    const { db } = getFirebase();
    return onSnapshot(pollVotesQuery(db, poll.id), (snap) => {
      setVotes(snap.docs.map((d) => pollVoteFromDoc(d)));
    });
  }, [poll.id]);

  const total = votes.length;

  return (
    <div className="rounded-card bg-white p-3.5 ring-1 ring-hairline/50">
      <div className="flex items-baseline justify-between gap-2">
        <p className="font-sans text-[14px] font-medium leading-snug text-driftwood">
          {poll.question}
        </p>
        <span className="shrink-0 font-sans text-[10px] uppercase tracking-[0.14em] text-driftwood-faint">
          {poll.status}
        </span>
      </div>
      {eventLabel ? (
        <p className="mt-0.5 font-sans text-[11.5px] text-driftwood-faint">{eventLabel}</p>
      ) : null}

      <div className="mt-2.5 flex flex-col gap-2">
        {poll.options.map((option) => (
          <PollResultRow
            key={option.id}
            label={option.label}
            count={votes.filter((v) => v.optionId === option.id).length}
            total={total}
          />
        ))}
      </div>

      <div className="mt-2.5 flex items-center justify-between border-t border-hairline/60 pt-2">
        <p className="font-sans text-[11px] text-driftwood-faint">{total} votes</p>
        <button
          type="button"
          disabled={busy}
          onClick={onToggleStatus}
          className="font-sans text-[11.5px] font-medium text-coral-ink underline underline-offset-4 disabled:opacity-40"
        >
          {poll.status === "open" ? "Close" : "Reopen"}
        </button>
      </div>
    </div>
  );
}

export function PollsPanel({ config }: { config: WeddingConfig }) {
  const { state } = useStaffAuth();
  const [polls, setPolls] = useState<Poll[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [eventId, setEventId] = useState<EventId | "">("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const { db } = getFirebase();
    return onSnapshot(pollsQuery(db), (snap) => {
      setPolls(snap.docs.map((d) => pollFromDoc(d)));
    });
  }, []);

  const openPolls = useMemo(() => (polls ?? []).filter((p) => p.status === "open"), [polls]);
  const closedPolls = useMemo(() => (polls ?? []).filter((p) => p.status === "closed"), [polls]);


  const trimmedOptions = options.map((o) => o.trim()).filter(Boolean);
  const canCreate = question.trim().length > 0 && trimmedOptions.length >= 2;

  async function handleCreate() {
    if (!canCreate || creating || state.status !== "ready") return;
    setCreating(true);
    setError(null);
    try {
      const pollOptions: PollOption[] = trimmedOptions.map((label, i) => ({
        id: `option-${i}-${Date.now().toString(36)}`,
        label,
      }));
      await createPoll(question.trim(), pollOptions, eventId || null, state.user.uid);
      setQuestion("");
      setOptions(["", ""]);
      setEventId("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That didn't save.");
    } finally {
      setCreating(false);
    }
  }

  async function toggleStatus(poll: Poll) {
    setBusyId(poll.id);
    setError(null);
    try {
      await setPollStatus(poll.id, poll.status === "open" ? "closed" : "open");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That didn't save.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mt-3">
      <PanelNote>Guests see an open poll on the Today screen and can vote once.</PanelNote>

      {error ? (
        <p className="mt-3 font-sans text-[13px] text-coral-ink">{error}</p>
      ) : null}

      <div className="mt-4 rounded-card bg-white p-3.5 ring-1 ring-hairline/50">
        <p className="font-sans text-[10px] uppercase tracking-[0.16em] text-driftwood-faint">
          New poll
        </p>
        <div className="mt-2.5 flex flex-col gap-2.5">
          <Field label="Question" value={question} onChange={setQuestion} placeholder="What should we dance to first?" />

          <div className="flex flex-col gap-2">
            {options.map((option, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="flex-1">
                  <Field
                    label={`Option ${i + 1}`}
                    value={option}
                    onChange={(value) =>
                      setOptions((prev) => prev.map((o, idx) => (idx === i ? value : o)))
                    }
                  />
                </div>
                {options.length > 2 ? (
                  <button
                    type="button"
                    onClick={() => setOptions((prev) => prev.filter((_, idx) => idx !== i))}
                    className="shrink-0 font-sans text-[11px] text-driftwood-faint underline underline-offset-4"
                  >
                    Remove
                  </button>
                ) : null}
              </div>
            ))}
            <button
              type="button"
              onClick={() => setOptions((prev) => [...prev, ""])}
              className="self-start font-sans text-[12px] font-medium text-deeptide underline underline-offset-4"
            >
              Add option
            </button>
          </div>

          <label className="block rounded-card bg-card px-3.5 py-2.5">
            <span className="block font-sans text-[10px] uppercase tracking-[0.16em] text-driftwood-faint">
              Event (optional)
            </span>
            <select
              value={eventId}
              onChange={(event) => setEventId(event.target.value as EventId | "")}
              className="mt-1 w-full bg-transparent font-sans text-[15px] leading-snug text-driftwood outline-none"
            >
              <option value="">Not tied to an event</option>
              {config.events.map((event) => (
                <option key={event.id} value={event.id}>
                  {event.name}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            disabled={!canCreate || creating}
            onClick={() => void handleCreate()}
            className="self-start rounded-pill bg-coral px-5 py-2.5 font-sans text-[14px] font-medium text-foam transition-colors hover:bg-coral-deep disabled:opacity-40"
          >
            {creating ? "Creating…" : "Create poll"}
          </button>
        </div>
      </div>

      {polls === null ? (
        <p className="mt-4 font-sans text-[13px] text-driftwood-faint">Loading polls…</p>
      ) : (
        <div className="mt-4 flex flex-col gap-2.5">
          {openPolls.map((poll) => (
            <PollRow
              key={poll.id}
              poll={poll}
              eventLabel={eventName(poll.eventId, config)}
              busy={busyId === poll.id}
              onToggleStatus={() => void toggleStatus(poll)}
            />
          ))}
          {closedPolls.length > 0 ? (
            <>
              <p className="mt-1 font-sans text-[9.5px] font-semibold uppercase tracking-[0.28em] text-driftwood-faint">
                Closed
              </p>
              {closedPolls.map((poll) => (
                <PollRow
                  key={poll.id}
                  poll={poll}
                  eventLabel={eventName(poll.eventId, config)}
                  busy={busyId === poll.id}
                  onToggleStatus={() => void toggleStatus(poll)}
                />
              ))}
            </>
          ) : null}
          {polls.length === 0 ? (
            <p className="rounded-card border border-dashed border-hairline-dashed px-3.5 py-4 font-sans text-[13px] text-driftwood-faint">
              No polls yet.
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
