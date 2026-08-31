"use client";

/**
 * "Leave a message" — a one-way write to the couple's private inbox.
 * Guests never read memories back, not even their own (CLAUDE.md), so what's
 * shown here is local component state for this session only: reopening the
 * app later starts from an empty composer again, not history.
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { onAuthStateChanged, signInAnonymously } from "firebase/auth";
import { AppShell } from "@/components/layout/AppShell";
import { getFirebase } from "@/lib/firebase/client";
import { sendMemory } from "@/lib/firebase/memories";
import { tierCode, type Tier } from "@/content/wedding";

// Module-level, not component state, so React Strict Mode's double-invoke
// can't fire signInAnonymously twice — same guard PollsScreen.tsx uses. The
// `!auth.currentUser` check in front of it is what lets a guest who already
// verified a phone number on /rsvp keep that identity here instead of being
// handed a second, anonymous one.
let signInStarted = false;

interface SentMessage {
  id: string;
  text: string;
}

export function MemoriesComposer({ tier }: { tier: Tier }) {
  const t = useTranslations("memories");

  const [uid, setUid] = useState<string | null>(null);
  const [sent, setSent] = useState<SentMessage[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const { auth } = getFirebase();
    if (!auth.currentUser && !signInStarted) {
      signInStarted = true;
      void signInAnonymously(auth);
    }
    return onAuthStateChanged(auth, (user) => setUid(user?.uid ?? null));
  }, []);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [sent]);

  async function handleSend() {
    const trimmed = text.trim();
    if (!trimmed || !uid || sending) return;
    setSending(true);
    setError(null);
    try {
      await sendMemory(uid, trimmed);
      setSent((prev) => [...prev, { id: `${Date.now()}`, text: trimmed }]);
      setText("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("sendFailed"));
    } finally {
      setSending(false);
    }
  }

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
        <p className="mt-1.5 font-sans text-[13px] leading-[1.5] text-driftwood-soft">
          {t("intro")}
        </p>
      </header>

      <div
        ref={listRef}
        className="flex-1 space-y-3 overflow-y-auto px-6 pt-1 pb-6"
      >
        {sent.length === 0 ? (
          <p className="pt-8 text-center text-sm text-driftwood-faint">
            {t("empty")}
          </p>
        ) : null}
        {sent.map((message) => (
          <div key={message.id} className="flex justify-end">
            <div className="max-w-[80%] rounded-2xl bg-deeptide px-4 py-2 text-sm text-sand md:max-w-sm">
              <p className="whitespace-pre-wrap">{message.text}</p>
            </div>
          </div>
        ))}
      </div>

      <div
        className="flex-none bg-sand/[0.96] px-4 pt-2 backdrop-blur-md"
        style={{ paddingBottom: "max(16px, env(safe-area-inset-bottom))" }}
      >
        {error ? <p className="mb-1.5 px-1 text-xs text-coral-ink">{error}</p> : null}
        <div className="flex items-end gap-2 pb-2">
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void handleSend();
              }
            }}
            rows={1}
            placeholder={t("placeholder")}
            className="max-h-24 flex-1 resize-none rounded-2xl border border-driftwood/[0.14] bg-sand px-4 py-2.5 text-sm text-driftwood outline-none focus:border-deeptide/40"
          />
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={sending || !text.trim() || !uid}
            className="rounded-full bg-deeptide px-4 py-2.5 text-sm font-medium text-sand disabled:opacity-40"
          >
            {t("send")}
          </button>
        </div>
      </div>
    </AppShell>
  );
}
