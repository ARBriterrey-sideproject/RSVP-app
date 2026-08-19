"use client";

import { FirebaseError } from "firebase/app";
import { useEffect, useState } from "react";
import type { ConfirmationResult } from "firebase/auth";
import { COUPLE } from "@/content/wedding";
import {
  applyPersistence,
  registerWithPassword,
  sendPasswordReset,
  signInWithGoogle,
  signInWithPassword,
} from "@/lib/firebase/staffAuth";
import { resetVerifier, sendOtp, toE164 } from "@/lib/firebase/auth";

const RECAPTCHA_CONTAINER_ID = "shorelines-staff-recaptcha";

type Mode = "signin" | "register" | "reset" | "phone";

const MODE_COPY: Record<Mode, { title: string; intro: string; action: string }> = {
  signin: {
    title: "Sign in",
    intro: "For the couple and their coordinators.",
    action: "Sign in",
  },
  register: {
    title: "Set a password",
    intro:
      "Use the address the couple listed you under — anything else signs in with no access.",
    action: "Create account",
  },
  reset: {
    title: "Reset password",
    intro: "We'll email you a link to set a new one.",
    action: "Send reset link",
  },
  phone: {
    title: "Sign in with phone",
    intro: "For staff who'd rather not keep a password.",
    action: "Send code",
  },
};

/**
 * The staff door. Guests never see this — it lives at /dashboard and nothing
 * in the invite flow links to it.
 *
 * Deliberately says nothing about whether an address is on the roster. "That
 * account has no access" is only ever shown *after* a successful sign-in, so
 * this form can't be used to test whether bride@… exists.
 */
export function StaffSignIn() {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [staySignedIn, setStaySignedIn] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [confirmation, setConfirmation] = useState<ConfirmationResult | null>(
    null
  );

  // Leaving the verifier attached across an unmount fails any later retry
  // with a stale-widget error — same reasoning as the guest flow.
  useEffect(() => resetVerifier, []);

  const copy = MODE_COPY[mode];

  async function run(work: () => Promise<void>) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await work();
    } catch (caught) {
      setError(humanError(caught));
    } finally {
      setBusy(false);
    }
  }

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;

    void run(async () => {
      if (mode === "reset") {
        await sendPasswordReset(email);
        // Same message whether or not the address exists — see the note above.
        setNotice("If that address has an account, a reset link is on its way.");
        return;
      }
      if (mode === "register") {
        await registerWithPassword(email, password, staySignedIn);
        return; // The provider takes over and shows the "verify" screen.
      }
      if (mode === "phone") {
        if (!confirmation) {
          const e164 = toE164(phone);
          if (!e164) {
            setError("That doesn't look like a phone number.");
            return;
          }
          await applyPersistence(staySignedIn);
          setConfirmation(await sendOtp(e164, RECAPTCHA_CONTAINER_ID));
          return;
        }
        await confirmation.confirm(code.trim());
        return; // onAuthStateChanged upstream (StaffAuthProvider) takes it from here.
      }
      await signInWithPassword(email, password, staySignedIn);
    });
  };

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setNotice(null);
    if (next !== "phone") {
      resetVerifier();
      setConfirmation(null);
      setPhone("");
      setCode("");
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[420px] flex-col justify-center px-6 py-12">
      <p className="font-sans text-[11px] uppercase tracking-[0.22em] text-driftwood-faint">
        {COUPLE.partnerA} &amp; {COUPLE.partnerB}
      </p>
      <h1 className="mt-2 font-display text-[38px] leading-[1.1] text-deeptide">
        {copy.title}
      </h1>
      <p className="mt-2 font-sans text-sm leading-relaxed text-driftwood-soft">
        {copy.intro}
      </p>

      <form onSubmit={onSubmit} className="mt-7 flex flex-col gap-2.5">
        {mode !== "phone" && (
          <Field
            label="Email"
            type="email"
            value={email}
            onChange={setEmail}
            autoComplete="email"
            required
          />
        )}

        {mode !== "reset" && mode !== "phone" && (
          <Field
            label="Password"
            type="password"
            value={password}
            onChange={setPassword}
            autoComplete={
              mode === "register" ? "new-password" : "current-password"
            }
            required
            minLength={mode === "register" ? 8 : undefined}
          />
        )}

        {mode === "phone" && !confirmation && (
          <Field
            label="Mobile number"
            type="tel"
            value={phone}
            onChange={setPhone}
            autoComplete="tel"
            placeholder="98765 43210"
            required
          />
        )}

        {mode === "phone" && confirmation && (
          <Field
            label="Code"
            type="text"
            inputMode="numeric"
            value={code}
            onChange={setCode}
            autoComplete="one-time-code"
            required
          />
        )}

        {mode !== "reset" && (
          <label className="mt-1 flex items-center gap-3 px-1 font-sans text-sm text-driftwood-soft">
            <input
              type="checkbox"
              checked={staySignedIn}
              onChange={(e) => setStaySignedIn(e.target.checked)}
              className="size-4 accent-deeptide"
            />
            Keep me signed in on this device
          </label>
        )}

        {error && (
          <p role="alert" className="px-1 font-sans text-sm text-coral-ink">
            {error}
          </p>
        )}
        {notice && (
          <p className="px-1 font-sans text-sm text-deeptide">{notice}</p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="mt-3 w-full rounded-pill bg-coral py-4 font-sans text-[15px] font-medium text-foam transition-colors hover:bg-coral-deep disabled:opacity-60"
        >
          {busy
            ? "One moment…"
            : mode === "phone" && confirmation
              ? "Verify code"
              : copy.action}
        </button>

        {/* Invisible reCAPTCHA mounts here. Must exist before sendOtp runs. */}
        <div id={RECAPTCHA_CONTAINER_ID} />
      </form>

      {mode !== "reset" && mode !== "phone" && (
        <>
          <div className="my-5 flex items-center gap-3">
            <span className="h-px flex-1 bg-hairline" />
            <span className="font-sans text-[11px] uppercase tracking-[0.18em] text-driftwood-faint">
              or
            </span>
            <span className="h-px flex-1 bg-hairline" />
          </div>

          {/*
            The genuinely one-tap path, and the one that skips the verification
            wait entirely: Google vouches for the address, so the role is granted
            on first sign-in.
          */}
          <button
            type="button"
            disabled={busy}
            onClick={() => void run(async () => { await signInWithGoogle(staySignedIn); })}
            className="w-full rounded-pill bg-card py-4 font-sans text-[15px] font-medium text-driftwood ring-1 ring-hairline transition-colors hover:bg-card-hover disabled:opacity-60"
          >
            Continue with Google
          </button>
        </>
      )}

      <div className="mt-7 flex flex-col gap-2 font-sans text-[13px] text-driftwood-soft">
        {mode !== "signin" && (
          <TextLink onClick={() => switchMode("signin")}>
            Back to sign in
          </TextLink>
        )}
        {mode === "signin" && (
          <>
            <TextLink onClick={() => switchMode("phone")}>
              Sign in with phone instead
            </TextLink>
            <TextLink onClick={() => switchMode("register")}>
              First time here? Set a password
            </TextLink>
            <TextLink onClick={() => switchMode("reset")}>
              Forgotten your password?
            </TextLink>
          </>
        )}
      </div>
    </main>
  );
}

function Field({
  label,
  value,
  onChange,
  ...input
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  return (
    <label className="block rounded-card bg-card px-4 py-3.5">
      <span className="block font-sans text-[11px] uppercase tracking-[0.16em] text-driftwood-faint">
        {label}
      </span>
      <input
        {...input}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1.5 w-full bg-transparent font-sans text-base leading-snug text-driftwood outline-none placeholder:text-driftwood-faint"
      />
    </label>
  );
}

function TextLink({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="self-start font-medium text-coral-ink underline underline-offset-4"
    >
      {children}
    </button>
  );
}

/**
 * Firebase's messages are written for developers ("auth/invalid-credential").
 * Note that wrong-password and unknown-account deliberately share one message —
 * distinguishing them tells an attacker which addresses are real.
 */
function humanError(caught: unknown): string {
  if (!(caught instanceof FirebaseError)) {
    return "Something went wrong. Try again in a moment.";
  }
  switch (caught.code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "That email and password don't match.";
    case "auth/invalid-email":
      return "That doesn't look like an email address.";
    case "auth/email-already-in-use":
      return "There's already an account for that address — sign in instead.";
    case "auth/weak-password":
      return "Use at least 8 characters.";
    case "auth/too-many-requests":
      return "Too many attempts. Wait a few minutes and try again.";
    case "auth/popup-closed-by-user":
    case "auth/cancelled-popup-request":
      return "Google sign-in was closed before it finished.";
    case "auth/network-request-failed":
      return "No connection. Check your network and try again.";
    case "auth/invalid-phone-number":
      return "That doesn't look like a phone number.";
    case "auth/invalid-verification-code":
      return "That code didn't match. Check it and try again.";
    case "auth/code-expired":
      return "That code has expired — send a new one.";
    default:
      return "Couldn't sign you in. Try again in a moment.";
  }
}
