"use client";

/**
 * The one read of the guest's own `rsvps/{uid}` document that both Today
 * screens need.
 *
 * The stored tier, the guest's name, their party size and which events they
 * actually said yes to can only come from that document — never from the link
 * they arrived on, which a guest can edit. `TodayScreen` and `UpcomingScreen`
 * were doing the same `onAuthStateChanged` → `getDoc` dance for the same four
 * fields, so it lives here once.
 *
 * `loaded` is not the same as "has a reply": it flips true once the lookup has
 * settled either way, so a caller can hold back the "you haven't replied yet"
 * card rather than flashing it at a guest who has. A signed-out visitor settles
 * to `loaded: true` with no reply — see the comment on that branch. A guest who
 * has replied holds a phone session, and `/polls`, `/memories` and `/photos`
 * each sign in anonymously on mount, so whichever session exists is the one
 * this resolves against.
 */

import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { getFirebase } from "@/lib/firebase/client";
import { isTier, type Tier } from "@/content/wedding";

export type GuestRsvp = {
  storedTier: Tier | null;
  guestName: string | null;
  partySize: number | null;
  perEventAttendance: Record<string, boolean> | null;
  /** The lookup has settled — `perEventAttendance` being null now means "no reply", not "not yet read". */
  loaded: boolean;
};

const EMPTY: GuestRsvp = {
  storedTier: null,
  guestName: null,
  partySize: null,
  perEventAttendance: null,
  loaded: false,
};

export function useGuestRsvp(): GuestRsvp {
  const [state, setState] = useState<GuestRsvp>(EMPTY);

  useEffect(() => {
    const { auth, db } = getFirebase();
    return onAuthStateChanged(auth, async (user) => {
      // No session is an answer, not a gap: Firebase only reports null after
      // it has finished restoring persistence, so this is a guest who has
      // never replied on this device. Leaving `loaded` false here would hide
      // UpcomingScreen's "you haven't replied yet" card from exactly the guest
      // it's for, since nothing on that screen signs in.
      if (!user) {
        setState({ ...EMPTY, loaded: true });
        return;
      }
      const snap = await getDoc(doc(db, "rsvps", user.uid));
      if (!snap.exists()) {
        setState({ ...EMPTY, loaded: true });
        return;
      }
      const stored = snap.data();
      const party = stored.party;
      const firstName =
        Array.isArray(party) && typeof party[0]?.name === "string"
          ? party[0].name.trim()
          : "";
      setState({
        storedTier: isTier(stored.tier) ? stored.tier : null,
        guestName: firstName || null,
        partySize: Array.isArray(party) ? party.length : null,
        perEventAttendance:
          stored.perEventAttendance && typeof stored.perEventAttendance === "object"
            ? (stored.perEventAttendance as Record<string, boolean>)
            : null,
        loaded: true,
      });
    });
  }, []);

  return state;
}
