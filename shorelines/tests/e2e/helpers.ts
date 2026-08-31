import { expect, type Page } from "@playwright/test";

/**
 * Shared by every e2e spec: there is exactly one way into this app, and it is
 * a real phone verification against the Auth emulator (see CLAUDE.md's guest
 * identity section). Any spec that needs a guest with a stored reply has to
 * walk the same gate, so the walk lives here rather than being copied.
 */

export const AUTH_EMULATOR = "http://127.0.0.1:9099";
export const PROJECT_ID = "demo-shorelines";

/**
 * A number no earlier run has verified.
 *
 * One number is one uid is one reply, so a fixed number would land the second
 * run of a spec on the first run's "done" screen instead of the wizard —
 * `emulators:start` keeps its Auth users between runs.
 */
export function freshPhone(): string {
  return `+9199${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`;
}

/**
 * Walks the gate that stands in front of the wizard.
 *
 * The Auth emulator sends no SMS and accepts any app verifier, so the code is
 * read back off its own endpoint — the same mechanism CLAUDE.md documents for
 * staff phone sign-in.
 */
export async function verifyPhone(page: Page, phone: string): Promise<void> {
  await expect(
    page.getByRole("heading", { name: "Your mobile number" })
  ).toBeVisible({ timeout: 15_000 });

  await page.getByLabel("Mobile number").fill(phone);
  await page.getByRole("button", { name: "Send code" }).click();

  await expect(page.getByRole("heading", { name: "Enter the code" })).toBeVisible(
    { timeout: 15_000 }
  );

  const res = await page.request.get(
    `${AUTH_EMULATOR}/emulator/v1/projects/${PROJECT_ID}/verificationCodes`
  );
  const { verificationCodes } = (await res.json()) as {
    verificationCodes: { phoneNumber: string; code: string }[];
  };
  // Last, not first: the endpoint returns every code the emulator has ever
  // minted, oldest first, and a resend would leave a stale one ahead of ours.
  const code = verificationCodes
    .filter((c) => c.phoneNumber === phone)
    .at(-1)?.code;
  expect(code, `no emulator OTP for ${phone}`).toBeTruthy();

  await page.getByLabel("6-digit code").fill(code!);
  await page.getByRole("button", { name: "Verify" }).click();
}
