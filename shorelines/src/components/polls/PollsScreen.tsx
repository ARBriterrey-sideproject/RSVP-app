"use client";

/**
 * Guest-facing polls list — reached by tapping the "Ongoing polls" card on
 * the Today screen, not a bottom tab (same nav treatment as /memories).
 * Vote tallies are computed client-side from a live `pollVotes` listener per
 * poll, same "fine at this guest-list scale" call the plan makes for chat.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { onAuthStateChanged, signInAnonymously } from "firebase/auth";
import { onSnapshot } from "firebase/firestore";
import { AppShell } from "@/components/layout/AppShell";
import { getFirebase } from "@/lib/firebase/client";
import {
  castVote,
  pollFromDoc,
  pollsQuery,
  pollVoteFromDoc,
  pollVotesQuery,
  type Poll,
  type PollVote,
} from "@/lib/firebase/polls";
import { tierCode, type Tier } from "@/content/wedding";

// Module-level, not component state, so React Strict Mode's double-invoke
// can't fire signInAnonymously twice — same guard MemoriesComposer.tsx uses.
let signInStarted = false;

function PollOptionBar({
  label,
  count,
  total,
  mine,
}: {
  label: string;
  count: number;
  total: number;
  mine: boolean;
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between font-sans text-[12.5px] text-driftwood">
        <span className={mine ? "font-medium text-deeptide" : ""}>{label}</span>
        <span className="text-driftwood-soft">{pct}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-driftwood/10">
        <div
          className={`h-full rounded-full ${mine ? "bg-deeptide" : "bg-driftwood/30"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function PollCard({ poll, uid }: { poll: Poll; uid: string | null }) {
  const t = useTranslations("polls");
  const [votes, setVotes] = useState<PollVote[]>([]);
  const [voting, setVoting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const { db } = getFirebase();
    return onSnapshot(pollVotesQuery(db, poll.id), (snap) => {
      setVotes(snap.docs.map((d) => pollVoteFromDoc(d)));
    });
  }, [poll.id]);

  const total = votes.length;
  const mine = uid ? votes.find((v) => v.ownerUid === uid) : undefined;
  const showResults = poll.status === "closed" || Boolean(mine);

  async function handleVote(optionId: string) {
    if (!uid || voting || mine) return;
    setVoting(true);
    setError(null);
    try {
      await castVote(poll.id, optionId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("voteFailed"));
    } finally {
      setVoting(false);
    }
  }

  return (
    <div className="rounded-card border border-driftwood/[0.08] bg-foam px-5 py-4.5">
      <div className="flex items-baseline justify-between gap-2">
        <p className="font-sans text-[14.5px] font-medium leading-snug text-driftwood">
          {poll.question}
        </p>
        {poll.status === "closed" && (
          <span className="flex-none font-sans text-[10px] uppercase tracking-[0.14em] text-driftwood-faint">
            {t("closed")}
          </span>
        )}
      </div>

      {error ? (
        <p className="mt-2 font-sans text-[12px] text-coral-ink">{error}</p>
      ) : null}

      {showResults ? (
        <div className="mt-3 flex flex-col gap-2.5">
          {poll.options.map((option) => (
            <PollOptionBar
              key={option.id}
              label={option.label}
              count={votes.filter((v) => v.optionId === option.id).length}
              total={total}
              mine={mine?.optionId === option.id}
            />
          ))}
          <p className="mt-0.5 font-sans text-[11px] text-driftwood-faint">
            {t("voteCount", { count: total })}
          </p>
        </div>
      ) : (
        <div className="mt-3 flex flex-col gap-2">
          {poll.options.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => void handleVote(option.id)}
              disabled={voting || !uid}
              className="rounded-pill border border-deeptide/30 px-3.5 py-2.5 text-left font-sans text-[13px] font-medium text-deeptide disabled:opacity-40"
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function PollsScreen({ tier }: { tier: Tier }) {
  const t = useTranslations("polls");
  const [uid, setUid] = useState<string | null>(null);
  const [polls, setPolls] = useState<Poll[]>([]);

  useEffect(() => {
    const { auth } = getFirebase();
    if (!auth.currentUser && !signInStarted) {
      signInStarted = true;
      void signInAnonymously(auth);
    }
    return onAuthStateChanged(auth, (user) => setUid(user?.uid ?? null));
  }, []);

  useEffect(() => {
    const { db } = getFirebase();
    return onSnapshot(pollsQuery(db), (snap) => {
      setPolls(snap.docs.map((d) => pollFromDoc(d)));
    });
  }, []);

  const openPolls = useMemo(() => polls.filter((p) => p.status === "open"), [polls]);
  const closedPolls = useMemo(
    () => polls.filter((p) => p.status === "closed"),
    [polls]
  );

  return (
    <AppShell>
      <header className="flex-none px-6 pt-8 pb-3">
        <Link
          href={`/?tier=${tierCode(tier)}`}
          className="font-sans text-[12.5px] font-medium text-driftwood-faint"
        >
          {t("back")}
        </Link>
        <h1 className="mt-2 font-serif text-2xl text-deeptide">{t("title")}</h1>
      </header>

      <div className="flex-1 overflow-y-auto px-6 pb-8">
        {polls.length === 0 ? (
          <p className="pt-8 text-center font-sans text-sm text-driftwood-faint">
            {t("empty")}
          </p>
        ) : null}

        {openPolls.length > 0 && (
          <div className="flex flex-col gap-3">
            {openPolls.map((poll) => (
              <PollCard key={poll.id} poll={poll} uid={uid} />
            ))}
          </div>
        )}

        {closedPolls.length > 0 && (
          <div className="mt-6 flex flex-col gap-3">
            <p className="font-sans text-[9.5px] font-semibold uppercase tracking-[0.28em] text-driftwood-faint">
              {t("closedSection")}
            </p>
            {closedPolls.map((poll) => (
              <PollCard key={poll.id} poll={poll} uid={uid} />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
