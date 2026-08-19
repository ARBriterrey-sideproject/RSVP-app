"use client";

import { useEffect, useState } from "react";
import { collection, getDocs, type Timestamp } from "firebase/firestore";
import { getFirebase } from "@/lib/firebase/client";
import { PanelNote } from "./panelKit";

/**
 * THE PRIVATE INBOX — guests write, the couple reads, nothing round-trips
 * back to a guest. The reader stays defensive (every field coerced, nothing
 * assumed) since a direct client write means nothing here is server-validated
 * beyond `ownerUid`.
 */

interface Memory {
  id: string;
  ownerUid: string;
  message: string;
  createdAt: Timestamp | null;
}

export function MemoriesPanel() {
  const [memories, setMemories] = useState<Memory[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const { db } = getFirebase();
        const snap = await getDocs(collection(db, "memories"));
        setMemories(
          snap.docs.map((doc) => {
            const data = doc.data();
            return {
              id: doc.id,
              ownerUid: typeof data.ownerUid === "string" ? data.ownerUid : "",
              message: typeof data.message === "string" ? data.message : "",
              createdAt: data.createdAt ?? null,
            } satisfies Memory;
          })
        );
      } catch (cause) {
        setError(
          cause instanceof Error && cause.message
            ? cause.message
            : "Couldn't load messages. Check your connection and try again."
        );
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <p className="mt-3 font-sans text-[13px] text-driftwood-faint">
        Loading messages…
      </p>
    );
  }

  return (
    <div className="mt-3">
      <PanelNote>
        A private one-way inbox — nothing here is shared beyond the two of
        you, and a guest can&apos;t see their own message once it&apos;s sent.
      </PanelNote>

      {error ? (
        <p className="mt-3 font-sans text-[13px] text-coral-ink">{error}</p>
      ) : null}

      {memories && memories.length > 0 ? (
        <div className="mt-4 flex flex-col gap-2">
          {memories.map((memory) => (
            <div
              key={memory.id}
              className="rounded-card bg-white p-3.5 ring-1 ring-hairline/50"
            >
              <p className="font-sans text-[13px] text-driftwood">
                {memory.message || "(no message)"}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-4 rounded-card border border-dashed border-hairline-dashed px-3.5 py-4 font-sans text-[13px] text-driftwood-faint">
          No messages yet.
        </p>
      )}
    </div>
  );
}
