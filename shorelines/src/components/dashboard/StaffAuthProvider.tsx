"use client";

import { onAuthStateChanged, type User } from "firebase/auth";
import { FirebaseError } from "firebase/app";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type { Capability, StaffRole } from "@/lib/auth/roles";
import { can } from "@/lib/auth/roles";
import { getFirebase } from "@/lib/firebase/client";
import { readRoleFromToken, signOutStaff, syncRole } from "@/lib/firebase/staffAuth";

/**
 * Resolves "who is this and what may they do" in one place.
 *
 * The four non-ready states are all real and all reachable, which is why this
 * is a union rather than a `user` plus a `role` that might be null:
 *
 *  - signed-out  — nobody, or they signed out
 *  - unverified  — registered with a password, hasn't clicked the email link
 *  - unrostered  — a valid account that isn't on the staff roster (including a
 *                  curious guest who opened /dashboard while signed in by phone)
 *  - ready       — on the roster, claim in the token
 *
 * Collapsing unverified and unrostered into one "no access" state was tempting
 * and wrong: they need completely different instructions on screen.
 */
export type StaffAuthState =
  | { status: "loading" }
  | { status: "signed-out" }
  | { status: "unverified"; user: User }
  | { status: "unrostered"; user: User }
  | { status: "ready"; user: User; role: StaffRole };

interface StaffAuthContextValue {
  state: StaffAuthState;
  /** Convenience for the common `can(role, ...)` call; false unless ready. */
  allows: (capability: Capability) => boolean;
  /** Re-runs the roster check — used after verifying an email in another tab. */
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const StaffAuthContext = createContext<StaffAuthContextValue | null>(null);

export function StaffAuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<StaffAuthState>({ status: "loading" });

  /**
   * Auth state can change while a role check is still in flight (sign out
   * mid-request, or a fast account switch). Only the newest resolution is
   * allowed to write state, or a stale one lands on top and shows the previous
   * person's role.
   */
  const generation = useRef(0);

  const resolve = useCallback(async (user: User | null) => {
    const mine = ++generation.current;
    const commit = (next: StaffAuthState) => {
      if (generation.current === mine) setState(next);
    };

    if (!user) {
      commit({ status: "signed-out" });
      return;
    }

    try {
      await syncRole(user);
    } catch (error) {
      // The server refuses to grant a role to an unverified address. That's
      // not a failure to report as one — it's a state with its own screen.
      if (
        error instanceof FirebaseError &&
        error.code === "functions/failed-precondition"
      ) {
        commit({ status: "unverified", user });
        return;
      }
      // Anything else (offline, emulator down) shouldn't lock someone out who
      // already holds a valid claim — fall through and read the token.
      console.error("Could not sync staff role:", error);
    }

    const role = await readRoleFromToken(user);
    commit(role ? { status: "ready", user, role } : { status: "unrostered", user });
  }, []);

  useEffect(() => {
    const { auth } = getFirebase();
    return onAuthStateChanged(auth, (user) => {
      void resolve(user);
    });
  }, [resolve]);

  const refresh = useCallback(async () => {
    const { auth } = getFirebase();
    await resolve(auth.currentUser);
  }, [resolve]);

  const signOut = useCallback(async () => {
    await signOutStaff();
    // onAuthStateChanged will fire and set signed-out.
  }, []);

  const allows = useCallback(
    (capability: Capability) =>
      state.status === "ready" && can(state.role, capability),
    [state]
  );

  return (
    <StaffAuthContext.Provider value={{ state, allows, refresh, signOut }}>
      {children}
    </StaffAuthContext.Provider>
  );
}

export function useStaffAuth(): StaffAuthContextValue {
  const context = useContext(StaffAuthContext);
  if (!context) {
    throw new Error("useStaffAuth must be used inside <StaffAuthProvider>");
  }
  return context;
}
