"use client";

import { useEffect, useMemo, useState } from "react";
import { onSnapshot } from "firebase/firestore";
import { getFirebase } from "@/lib/firebase/client";
import {
  allChatMessagesQuery,
  moderateChatMessage,
  roomIdOf,
  sendChatMessage,
  type ChatMessage,
} from "@/lib/firebase/chat";
import { useStaffAuth } from "./StaffAuthProvider";
import { PanelNote } from "./panelKit";

/**
 * STAFF SIDE OF CHAT — one listener (`allChatMessagesQuery`, a collectionGroup
 * across every `chats/{roomId}/messages`) covers the group room and every
 * guest's concierge thread at once, since a message doc doesn't carry its own
 * roomId — `roomIdOf` recovers it from the snapshot's ref path. Fine at this
 * app's guest-list scale; don't reach for per-room listeners here.
 */

type StaffMessage = ChatMessage & { roomId: string };

type Tab = "group" | "concierge";

export function LiveChatPanel() {
  const { state, allows } = useStaffAuth();
  const [messages, setMessages] = useState<StaffMessage[] | null>(null);
  const [tab, setTab] = useState<Tab>("group");
  const [openThread, setOpenThread] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);

  const canModerate = allows("moderateChat");
  const staffName =
    state.status === "ready"
      ? state.user.displayName || state.user.email || "Staff"
      : "Staff";

  useEffect(() => {
    const { db } = getFirebase();
    const unsubscribe = onSnapshot(allChatMessagesQuery(db), (snap) => {
      setMessages(
        snap.docs.map((docSnap) => ({
          id: docSnap.id,
          roomId: roomIdOf(docSnap),
          ...(docSnap.data() as Omit<ChatMessage, "id">),
        }))
      );
    });
    return unsubscribe;
  }, []);

  const groupMessages = useMemo(
    () => (messages ?? []).filter((m) => m.roomId === "group").reverse(),
    [messages]
  );

  const threads = useMemo(() => {
    const byRoom = new Map<string, StaffMessage[]>();
    for (const message of messages ?? []) {
      if (!message.roomId.startsWith("dm_")) continue;
      const list = byRoom.get(message.roomId) ?? [];
      list.push(message);
      byRoom.set(message.roomId, list);
    }
    return [...byRoom.entries()]
      .map(([roomId, list]) => {
        const last = list[list.length - 1];
        const guestName = [...list].reverse().find((m) => m.authorRole === "guest")?.name ?? "Guest";
        return { roomId, messages: list, last, guestName };
      })
      .sort((a, b) => tsMillis(b.last.createdAt) - tsMillis(a.last.createdAt));
  }, [messages]);

  const activeThread = threads.find((t) => t.roomId === openThread) ?? null;

  async function moderate(message: StaffMessage, action: "flag" | "unflag" | "delete") {
    setBusyId(message.id);
    setError(null);
    try {
      await moderateChatMessage(message.roomId, message.id, action);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That didn't save.");
    } finally {
      setBusyId(null);
    }
  }

  async function sendReply() {
    const trimmed = reply.trim();
    if (!trimmed || !openThread || sending) return;
    setSending(true);
    setError(null);
    try {
      await sendChatMessage(openThread, trimmed, staffName);
      setReply("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That didn't send.");
    } finally {
      setSending(false);
    }
  }

  if (messages === null) {
    return (
      <p className="mt-3 font-sans text-[13px] text-driftwood-faint">
        Loading chat…
      </p>
    );
  }

  return (
    <div className="mt-3">
      <PanelNote>
        Everyone sees the group room; each guest also has a private thread
        with you. {canModerate ? "Flag or delete anything out of line." : ""}
      </PanelNote>

      {error ? (
        <p className="mt-3 font-sans text-[13px] text-coral-ink">{error}</p>
      ) : null}

      <div className="mt-4 flex gap-2 rounded-full bg-driftwood/[0.06] p-1">
        <button
          type="button"
          onClick={() => {
            setTab("group");
            setOpenThread(null);
          }}
          className={`flex-1 rounded-full py-2 font-sans text-[13px] font-medium transition-colors ${
            tab === "group" ? "bg-white text-driftwood shadow-sm" : "text-driftwood-faint"
          }`}
        >
          Group room
        </button>
        <button
          type="button"
          onClick={() => setTab("concierge")}
          className={`flex-1 rounded-full py-2 font-sans text-[13px] font-medium transition-colors ${
            tab === "concierge" ? "bg-white text-driftwood shadow-sm" : "text-driftwood-faint"
          }`}
        >
          Concierge ({threads.length})
        </button>
      </div>

      {tab === "group" ? (
        <div className="mt-3 flex flex-col gap-2">
          {groupMessages.length === 0 ? (
            <p className="rounded-card border border-dashed border-hairline-dashed px-3.5 py-4 font-sans text-[13px] text-driftwood-faint">
              No messages yet.
            </p>
          ) : null}
          {groupMessages.map((message) => (
            <MessageRow
              key={message.id}
              message={message}
              canModerate={canModerate}
              busy={busyId === message.id}
              onModerate={(action) => void moderate(message, action)}
            />
          ))}
        </div>
      ) : activeThread ? (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setOpenThread(null)}
            className="mb-2 font-sans text-[12px] text-driftwood-soft underline underline-offset-4"
          >
            ← All threads
          </button>
          <p className="mb-2 font-sans text-[14px] font-medium text-driftwood">
            {activeThread.guestName}
          </p>
          <div className="flex flex-col gap-2">
            {activeThread.messages.map((message) => (
              <MessageRow
                key={message.id}
                message={message}
                canModerate={canModerate}
                busy={busyId === message.id}
                onModerate={(action) => void moderate(message, action)}
              />
            ))}
          </div>
          <div className="mt-3 flex items-end gap-2">
            <textarea
              value={reply}
              onChange={(event) => setReply(event.target.value)}
              rows={1}
              placeholder="Reply to this guest"
              className="max-h-24 flex-1 resize-none rounded-card bg-card px-3.5 py-2.5 font-sans text-[13px] text-driftwood outline-none placeholder:text-driftwood-faint"
            />
            <button
              type="button"
              disabled={sending || !reply.trim()}
              onClick={() => void sendReply()}
              className="rounded-pill bg-coral px-4 py-2.5 font-sans text-[13px] font-medium text-foam transition-colors hover:bg-coral-deep disabled:opacity-40"
            >
              {sending ? "Sending…" : "Send"}
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-col gap-2">
          {threads.length === 0 ? (
            <p className="rounded-card border border-dashed border-hairline-dashed px-3.5 py-4 font-sans text-[13px] text-driftwood-faint">
              No concierge threads yet.
            </p>
          ) : null}
          {threads.map((thread) => (
            <button
              key={thread.roomId}
              type="button"
              onClick={() => setOpenThread(thread.roomId)}
              className="rounded-card bg-white p-3.5 text-left ring-1 ring-hairline/50"
            >
              <p className="font-sans text-[14px] font-medium text-driftwood">
                {thread.guestName}
              </p>
              <p className="mt-0.5 truncate font-sans text-[12px] text-driftwood-soft">
                {thread.last.authorRole === "staff" ? "You: " : ""}
                {thread.last.text}
              </p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function MessageRow({
  message,
  canModerate,
  busy,
  onModerate,
}: {
  message: StaffMessage;
  canModerate: boolean;
  busy: boolean;
  onModerate: (action: "flag" | "unflag" | "delete") => void;
}) {
  return (
    <div
      className={`rounded-card p-3 ring-1 ${
        message.flagged ? "bg-coral/[0.08] ring-coral/30" : "bg-white ring-hairline/50"
      }`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <p className="font-sans text-[12.5px] font-medium text-driftwood">
          {message.name}
          {message.authorRole === "staff" ? (
            <span className="ml-1.5 font-sans text-[10px] uppercase tracking-[0.1em] text-driftwood-faint">
              staff
            </span>
          ) : null}
        </p>
        <p className="shrink-0 font-sans text-[11px] text-driftwood-faint">
          {formatTime(message.createdAt)}
        </p>
      </div>
      <p className="mt-1 whitespace-pre-wrap font-sans text-[13px] text-driftwood">
        {message.text}
      </p>
      {canModerate ? (
        <div className="mt-2 flex items-center gap-3 border-t border-hairline/60 pt-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => onModerate(message.flagged ? "unflag" : "flag")}
            className="font-sans text-[11.5px] text-driftwood-soft underline underline-offset-4 disabled:opacity-40"
          >
            {message.flagged ? "Unflag" : "Flag"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onModerate("delete")}
            className="font-sans text-[11.5px] text-coral-ink underline underline-offset-4 disabled:opacity-40"
          >
            Delete
          </button>
        </div>
      ) : null}
    </div>
  );
}

function tsMillis(value: ChatMessage["createdAt"]): number {
  return value ? value.toMillis() : 0;
}

function formatTime(value: ChatMessage["createdAt"]): string {
  if (!value) return "sending…";
  return value.toDate().toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
