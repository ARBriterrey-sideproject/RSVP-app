"use client";

import { useState } from "react";
import { ROLE_COPY } from "@/lib/auth/roles";
import { resendVerification } from "@/lib/firebase/staffAuth";
import { StaffSignIn } from "./StaffSignIn";
import { useStaffAuth } from "./StaffAuthProvider";

/**
 * Decides which of the five screens a visitor to /dashboard gets.
 *
 * This is a convenience gate, not the security boundary. Every one of these
 * states is trivially bypassable by editing client state — what actually stops
 * an unrostered account reading anything is the `role` claim, checked in
 * firestore.rules and in each callable. This just avoids showing someone an
 * empty dashboard that would fail every request.
 */
export function DashboardGate({ children }: { children: React.ReactNode }) {
  const { state } = useStaffAuth();

  switch (state.status) {
    case "loading":
      return (
        <Centered>
          <p className="font-sans text-sm text-driftwood-soft">One moment…</p>
        </Centered>
      );

    case "signed-out":
      return <StaffSignIn />;

    case "unverified":
      return <VerifyEmail />;

    case "unrostered":
      return <NoAccess email={state.user.email} />;

    case "ready":
      return <>{children}</>;
  }
}

function VerifyEmail() {
  const { state, refresh, signOut } = useStaffAuth();
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const user = state.status === "unverified" ? state.user : null;

  return (
    <Centered>
      <Heading>Check your inbox</Heading>
      <Body>
        We&apos;ve sent a confirmation link to{" "}
        <span className="text-driftwood">{user?.email}</span>. Open it, then come
        back here.
      </Body>
      {/*
        Not optional politeness — the role is only granted once the address is
        confirmed, because otherwise anyone who knows a roster address could
        register it first and inherit the access.
      */}
      <Body>
        Your access is switched on once the address is confirmed, so this step
        can&apos;t be skipped.
      </Body>

      <div className="mt-6 flex flex-col gap-2.5">
        <Primary
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await refresh();
            setBusy(false);
          }}
        >
          {busy ? "Checking…" : "I've confirmed it"}
        </Primary>
        <Secondary
          disabled={sent || !user}
          onClick={async () => {
            if (!user) return;
            await resendVerification(user);
            setSent(true);
          }}
        >
          {sent ? "Link sent" : "Send the link again"}
        </Secondary>
        <Secondary onClick={() => void signOut()}>Sign out</Secondary>
      </div>
    </Centered>
  );
}

function NoAccess({ email }: { email: string | null }) {
  const { signOut, refresh } = useStaffAuth();

  return (
    <Centered>
      <Heading>No access</Heading>
      <Body>
        <span className="text-driftwood">{email}</span> is signed in, but it
        isn&apos;t on the list for this dashboard.
      </Body>
      <Body>
        If you should be, ask {ROLE_COPY.couple.label.toLowerCase()} to add this
        exact address — then sign out and back in.
      </Body>

      <div className="mt-6 flex flex-col gap-2.5">
        <Primary onClick={() => void refresh()}>Check again</Primary>
        <Secondary onClick={() => void signOut()}>Sign out</Secondary>
      </div>
    </Centered>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[420px] flex-col justify-center px-6 py-12">
      {children}
    </main>
  );
}

function Heading({ children }: { children: React.ReactNode }) {
  return (
    <h1 className="font-display text-[38px] leading-[1.1] text-deeptide">
      {children}
    </h1>
  );
}

function Body({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-3 font-sans text-sm leading-relaxed text-driftwood-soft">
      {children}
    </p>
  );
}

function Primary({
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className="w-full rounded-pill bg-coral py-4 font-sans text-[15px] font-medium text-foam transition-colors hover:bg-coral-deep disabled:opacity-60"
    >
      {children}
    </button>
  );
}

function Secondary({
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className="w-full rounded-pill bg-card py-4 font-sans text-[15px] font-medium text-driftwood ring-1 ring-hairline transition-colors hover:bg-card-hover disabled:opacity-60"
    >
      {children}
    </button>
  );
}
