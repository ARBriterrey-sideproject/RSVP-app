"use client";

import {
  RecaptchaVerifier,
  signInWithPhoneNumber,
  type ConfirmationResult,
} from "firebase/auth";
import { getFirebase } from "./client";

/**
 * Phone OTP sign-in.
 *
 * Firebase requires a reCAPTCHA verifier for web phone auth. In "invisible"
 * mode it resolves silently for most users and only challenges suspicious
 * traffic — which is also part of the abuse story for an open-access invite.
 */

let verifier: RecaptchaVerifier | null = null;

/**
 * The verifier binds to a DOM node and cannot be re-created against the same
 * node without clearing first, so it is cached per page-load.
 */
function getVerifier(containerId: string): RecaptchaVerifier {
  const { auth } = getFirebase();
  if (verifier) return verifier;

  verifier = new RecaptchaVerifier(auth, containerId, {
    size: "invisible",
  });
  return verifier;
}

/** Call when the flow unmounts or the user backs out, so a retry can rebuild. */
export function resetVerifier() {
  verifier?.clear();
  verifier = null;
}

export async function sendOtp(
  e164Phone: string,
  containerId: string
): Promise<ConfirmationResult> {
  const { auth } = getFirebase();
  // Keeps the OTP SMS in the guest's language where the carrier supports it.
  auth.useDeviceLanguage();

  try {
    return await signInWithPhoneNumber(
      auth,
      e164Phone,
      getVerifier(containerId)
    );
  } catch (error) {
    // A failed send leaves the verifier in a state that rejects reuse.
    resetVerifier();
    throw error;
  }
}

/**
 * Indian mobile numbers are the common case, so a bare 10-digit entry is
 * assumed to be +91. Anything already starting with + is left alone, since
 * plenty of guests will be dialling in from abroad.
 */
export function toE164(input: string, defaultCountryCode = "+91"): string | null {
  const raw = input.trim().replace(/[\s()-]/g, "");

  if (raw.startsWith("+")) {
    return /^\+[1-9]\d{7,14}$/.test(raw) ? raw : null;
  }

  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `${defaultCountryCode}${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;

  return null;
}
