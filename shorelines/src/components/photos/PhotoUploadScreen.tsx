"use client";

/**
 * Guest-facing photo upload — reached from the "photos" tab, not the Today
 * screen, since it's a destination in its own right (CLAUDE.md's nav
 * decision reversing the old "no dead-end tabs" rule for exactly this
 * reason). Upload-only this round: storage.rules denies guests read/list on
 * `photos/`, so there is nothing to browse back — see the "N shared" count
 * below, which is local session state, not a Firestore read, same as
 * MemoriesComposer's `sent` list.
 *
 * Which events a guest may upload to is re-derived from their own `rsvps/{uid}`
 * document (tier, perEventAttendance) exactly the way TodayScreen does it —
 * never trusted from the URL or a prop default.
 */

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { onAuthStateChanged, signInAnonymously } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import {
  BOTTOM_TAB_BAR_HEIGHT,
  BottomTabBar,
} from "@/components/nav/BottomTabBar";
import { getFirebase } from "@/lib/firebase/client";
import { uploadPhoto } from "@/lib/firebase/photos";
import { eventsForTier, isTier, type Tier } from "@/content/wedding";
import { eventCopy } from "@/i18n/weddingCopy";
import type { WeddingEvent } from "@/content/schema";

let signInStarted = false;

type UploadState = { fraction: number } | "done" | "error" | null;

export function PhotoUploadScreen({ tier }: { tier: Tier }) {
  const t = useTranslations("photos");
  const tWedding = useTranslations("wedding");

  const [uid, setUid] = useState<string | null>(null);
  const [storedTier, setStoredTier] = useState<Tier | null>(null);
  const [perEventAttendance, setPerEventAttendance] = useState<Record<
    string,
    boolean
  > | null>(null);

  const effectiveTier = storedTier ?? tier;

  useEffect(() => {
    const { auth } = getFirebase();
    if (!auth.currentUser && !signInStarted) {
      signInStarted = true;
      void signInAnonymously(auth);
    }
    return onAuthStateChanged(auth, async (user) => {
      setUid(user?.uid ?? null);
      if (!user) return;
      const { db } = getFirebase();
      const snap = await getDoc(doc(db, "rsvps", user.uid));
      if (!snap.exists()) return;
      const stored = snap.data();
      if (isTier(stored.tier)) setStoredTier(stored.tier);
      if (stored.perEventAttendance && typeof stored.perEventAttendance === "object") {
        setPerEventAttendance(stored.perEventAttendance as Record<string, boolean>);
      }
    });
  }, []);

  const eligible = useMemo(
    () => eventsForTier(effectiveTier),
    [effectiveTier]
  );
  const attending = useMemo(
    () =>
      perEventAttendance
        ? eligible.filter((event) => perEventAttendance[event.id] === true)
        : eligible,
    [eligible, perEventAttendance]
  );

  const [selected, setSelected] = useState<WeddingEvent | null>(null);
  const active = selected ?? attending[0] ?? null;

  const [upload, setUpload] = useState<UploadState>(null);
  const [sharedCount, setSharedCount] = useState(0);

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || !uid || !active) return;
    const files = Array.from(fileList);
    if (files.length === 0) return;
    setUpload({ fraction: 0 });
    let succeeded = 0;
    let failed = false;
    for (const file of files) {
      try {
        await uploadPhoto(active.id, uid, file, (fraction) =>
          setUpload({ fraction })
        );
        succeeded += 1;
      } catch {
        failed = true;
      }
    }
    setSharedCount((count) => count + succeeded);
    setUpload(failed ? "error" : "done");
  }

  return (
    <div className="relative mx-auto flex h-dvh w-full max-w-md flex-col overflow-hidden bg-sand">
      <header className="flex-none px-6 pt-8 pb-3">
        <h1 className="font-serif text-2xl text-deeptide">{t("title")}</h1>
        <p className="mt-1 font-sans text-[13px] leading-snug text-driftwood-soft">
          {t("intro")}
        </p>
      </header>

      <div
        className="flex-1 overflow-y-auto px-6"
        style={{ paddingBottom: BOTTOM_TAB_BAR_HEIGHT + 24 }}
      >
        {attending.length === 0 ? (
          <p className="pt-8 text-center font-sans text-sm text-driftwood-faint">
            {t("noEvents")}
          </p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              {attending.map((event) => (
                <button
                  key={event.id}
                  type="button"
                  onClick={() => {
                    setSelected(event);
                    setUpload(null);
                  }}
                  className={`rounded-pill px-3.5 py-2 font-sans text-[13px] font-medium transition-colors ${
                    active?.id === event.id
                      ? "bg-deeptide text-foam"
                      : "border border-deeptide/30 text-deeptide"
                  }`}
                >
                  {eventCopy(tWedding, event).name}
                </button>
              ))}
            </div>

            {active ? (
              <div className="mt-6 rounded-card border border-driftwood/[0.08] bg-foam px-5 py-5">
                <p className="font-sans text-[13.5px] font-medium leading-snug text-driftwood">
                  {t("uploadFor", { event: eventCopy(tWedding, active).name })}
                </p>

                <label className="mt-4 flex cursor-pointer flex-col items-center justify-center rounded-card border border-dashed border-hairline-dashed px-4 py-8 text-center">
                  <span className="font-sans text-[13px] font-medium text-deeptide">
                    {t("choosePhoto")}
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(event) => void handleFiles(event.target.files)}
                  />
                </label>

                {upload && typeof upload === "object" ? (
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-driftwood/10">
                    <div
                      className="h-full rounded-full bg-deeptide transition-[width]"
                      style={{ width: `${Math.round(upload.fraction * 100)}%` }}
                    />
                  </div>
                ) : null}
                {upload === "done" ? (
                  <p className="mt-3 font-sans text-[13px] text-palm">{t("sent")}</p>
                ) : null}
                {upload === "error" ? (
                  <p className="mt-3 font-sans text-[13px] text-coral-ink">
                    {t("sendFailed")}
                  </p>
                ) : null}
              </div>
            ) : null}

            {sharedCount > 0 ? (
              <p className="mt-5 text-center font-sans text-[12.5px] text-driftwood-faint">
                {t("sharedCount", { count: sharedCount })}
              </p>
            ) : null}
          </>
        )}
      </div>

      <BottomTabBar active="photos" tier={effectiveTier} />
    </div>
  );
}
