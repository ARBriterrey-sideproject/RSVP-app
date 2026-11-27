"use client";

/**
 * GUEST CHAT — one open group room everyone attending (plus staff) can read,
 * and one private concierge thread per guest talking to the coordinators.
 * No guest-to-guest DMs: the room a guest may address is either "group" or
 * their own `dm_{uid}`, enforced server-side in sendChatMessage — this screen
 * only ever renders those two.
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, onSnapshot } from "firebase/firestore";
import { BOTTOM_TAB_BAR_HEIGHT } from "@/components/nav/BottomTabBar";
import { AppShell } from "@/components/layout/AppShell";
import { getFirebase } from "@/lib/firebase/client";
import {
  chatMessagesQuery,
  conciergeRoomId,
  sendChatMessage,
  type ChatMessage,
} from "@/lib/firebase/chat";
import type { Tier } from "@/content/wedding";

type RoomTab = "group" | "concierge";

export function ChatScreen({ tier }: { tier: Tier }) {
  const t = useTranslations("chat");

  const [uid, setUid] = useState<string | null>(null);
  // Chat no longer signs anyone in on its own: a guest arrives here from the
  // venue QR (`/join`) already signed in, or is sent there. `authReady` keeps
  // the sign-in card from flashing before the persisted session is read back.
  const [authReady, setAuthReady] = useState(false);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<RoomTab>("group");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const { auth, db } = getFirebase();
    return onAuthStateChanged(auth, async (user) => {
      setAuthReady(true);
      if (!user) {
        setUid(null);
        setDisplayName(null);
        return;
      }
      setUid(user.uid);
      // Name chain: the RSVP's first party member, then the Google profile
      // name, then nothing (the callable falls back to "Guest"). A Google
      // guest has no `rsvps/{uid}` doc, and an anonymous one has neither.
      let name: unknown;
      try {
        const snap = await getDoc(doc(db, "rsvps", user.uid));
        name = snap.exists() ? snap.data().party?.[0]?.name : undefined;
      } catch {
        name = undefined;
      }
      const fromRsvp = typeof name === "string" ? name.trim() : "";
      const fromProfile = user.displayName?.trim() ?? "";
      setDisplayName(fromRsvp || fromProfile || null);
    });
  }, []);

  const roomId = activeTab === "group" ? "group" : uid ? conciergeRoomId(uid) : null;

  async function handleSend() {
    const trimmed = text.trim();
    if (!trimmed || !roomId || sending) return;
    setSending(true);
    setError(null);
    try {
      await sendChatMessage(roomId, trimmed, displayName ?? undefined);
      setText("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("sendFailed"));
    } finally {
      setSending(false);
    }
  }

  if (authReady && !uid) {
    return (
      <AppShell tab="chat" tier={tier}>
        <header className="flex-none px-6 pt-8 pb-3">
          <h1 className="font-serif text-2xl text-deeptide">{t("title")}</h1>
        </header>
        <div
          className="flex flex-1 items-start justify-center px-6 pt-6"
          style={{ paddingBottom: BOTTOM_TAB_BAR_HEIGHT + 24 }}
        >
          <div className="w-full max-w-sm rounded-card bg-card p-5 text-center">
            <h2 className="font-serif text-xl text-deeptide">
              {t("signInTitle")}
            </h2>
            <p className="mt-2 font-sans text-sm leading-[1.6] text-driftwood-soft">
              {t("signInBody")}
            </p>
            <Link
              href="/join?next=/chat"
              className="mt-5 block rounded-pill bg-coral py-3.5 font-sans text-[15px] font-medium text-foam transition-colors hover:bg-coral-deep"
            >
              {t("signInCta")}
            </Link>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell tab="chat" tier={tier}>
      <header className="flex-none px-6 pt-8 pb-3">
        <h1 className="font-serif text-2xl text-deeptide">{t("title")}</h1>
        <div className="mt-4 flex gap-2 rounded-full bg-driftwood/[0.06] p-1">
          <button
            type="button"
            onClick={() => setActiveTab("group")}
            className={`flex-1 rounded-full py-2 text-sm font-medium transition-colors ${
              activeTab === "group"
                ? "bg-sand text-deeptide shadow-sm"
                : "text-driftwood-faint"
            }`}
          >
            {t("tabEveryone")}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("concierge")}
            className={`flex-1 rounded-full py-2 text-sm font-medium transition-colors ${
              activeTab === "concierge"
                ? "bg-sand text-deeptide shadow-sm"
                : "text-driftwood-faint"
            }`}
          >
            {t("tabConcierge")}
          </button>
        </div>
      </header>

      {roomId ? (
        <ChatMessageList
          key={roomId}
          roomId={roomId}
          uid={uid}
          emptyLabel={activeTab === "group" ? t("emptyGroup") : t("emptyConcierge")}
          staffLabel={t("staffBadge")}
        />
      ) : (
        <div
          className="flex-1"
          style={{ paddingBottom: BOTTOM_TAB_BAR_HEIGHT + 24 }}
        />
      )}

      <div
        className="fixed inset-x-0 z-30 mx-auto w-full max-w-content bg-sand/[0.96] px-4 pt-2 backdrop-blur-md"
        style={{
          bottom: BOTTOM_TAB_BAR_HEIGHT,
          paddingBottom: "max(8px, env(safe-area-inset-bottom))",
        }}
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
            placeholder={
              activeTab === "group" ? t("placeholderGroup") : t("placeholderConcierge")
            }
            className="max-h-24 flex-1 resize-none rounded-2xl border border-driftwood/[0.14] bg-sand px-4 py-2.5 text-sm text-driftwood outline-none focus:border-deeptide/40"
          />
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={sending || !text.trim() || !roomId}
            className="rounded-full bg-deeptide px-4 py-2.5 text-sm font-medium text-sand disabled:opacity-40"
          >
            {t("send")}
          </button>
        </div>
      </div>
    </AppShell>
  );
}

function ChatMessageList({
  roomId,
  uid,
  emptyLabel,
  staffLabel,
}: {
  roomId: string;
  uid: string | null;
  emptyLabel: string;
  staffLabel: string;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const { db } = getFirebase();
    const unsubscribe = onSnapshot(chatMessagesQuery(db, roomId), (snap) => {
      setMessages(
        snap.docs.map((docSnap) => ({
          id: docSnap.id,
          ...(docSnap.data() as Omit<ChatMessage, "id">),
        }))
      );
    });
    return unsubscribe;
  }, [roomId]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages]);

  return (
    <div
      ref={listRef}
      className="flex-1 space-y-3 overflow-y-auto px-6 pt-1"
      style={{ paddingBottom: BOTTOM_TAB_BAR_HEIGHT + 24 }}
    >
      {messages.length === 0 ? (
        <p className="pt-8 text-center text-sm text-driftwood-faint">{emptyLabel}</p>
      ) : null}
      {messages.map((message) => {
        const mine = message.ownerUid === uid && message.authorRole === "guest";
        return (
          <div
            key={message.id}
            className={`flex ${mine ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm md:max-w-sm ${
                mine
                  ? "bg-deeptide text-sand"
                  : message.authorRole === "staff"
                    ? "bg-coral/[0.16] text-driftwood"
                    : "bg-driftwood/[0.08] text-driftwood"
              }`}
            >
              {!mine ? (
                <p className="mb-0.5 text-[11px] font-medium tracking-wide text-driftwood-faint">
                  {message.name}
                  {message.authorRole === "staff" ? ` · ${staffLabel}` : ""}
                </p>
              ) : null}
              <p className="whitespace-pre-wrap">{message.text}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
