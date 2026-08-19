import { test, expect } from "@playwright/test";

/**
 * The golden path through screen 1c end to end, against the real emulators
 * (see playwright.config.ts) — no mocking, because there is nothing safe to
 * mock: Anonymous Auth, the `submitRsvp`/`recoverRsvp` callables and the
 * Firestore rules are exactly what CLAUDE.md's security model depends on.
 *
 * Selectors follow the components as written: `StepTitle` renders an `<h2>`,
 * every input carries an `aria-label` equal to its own visible copy (see
 * `TextField`), and event/dietary/transport buttons are matched by the start
 * of their accessible name — each button's full name is "title description"
 * concatenated (e.g. "Vegetarian No meat, fish or egg"), and a plain
 * substring match on "Vegetarian" would also match "Non-vegetarian".
 *
 * "Next" is matched with `exact: true` throughout: Next 16's dev-mode
 * floating widget has an accessible name of "Open Next.js Dev Tools", which
 * a plain substring match on "Next" also catches (it contains "Next.js").
 */

const GUEST_NAME = "Ariel Wavecrest";

test.describe("RSVP golden path", () => {
  test("a guest accepts, fills every step, and reaches the confirmation", async ({
    page,
  }) => {
    await page.goto("/?tier=f");

    await page.getByRole("link", { name: "RSVP for your family" }).click();
    await expect(page).toHaveURL(/\/rsvp\?tier=f/);

    // "loading" (silent anonymous sign-in) resolves into "days" — no stored
    // reply exists yet for a fresh emulator session.
    await expect(
      page.getByRole("heading", { name: "Which days?" })
    ).toBeVisible({ timeout: 15_000 });

    // Every event starts pre-selected (attending), so accepting needs no taps
    // here — advancing is the whole test of the default.
    await expect(
      page.getByRole("button", { name: "Next", exact: true })
    ).toBeEnabled();
    await page.getByRole("button", { name: "Next", exact: true }).click();

    // --- party -------------------------------------------------------------
    await expect(
      page.getByRole("heading", { name: "Who’s with you?" })
    ).toBeVisible();
    await page.getByLabel("Your full name").fill(GUEST_NAME);
    await page.getByLabel("Mobile number (optional)").fill("+919876543210");
    await page.getByRole("button", { name: "Next", exact: true }).click();

    // --- table ---------------------------------------------------------
    await expect(
      page.getByRole("heading", { name: "At the table" })
    ).toBeVisible();
    await page.getByRole("button", { name: /^Vegetarian\b/ }).click();
    await page.getByRole("button", { name: "Next", exact: true }).click();

    // --- travel --------------------------------------------------------
    await expect(
      page.getByRole("heading", { name: "Getting there" })
    ).toBeVisible();
    await page.getByLabel("Arrival date").fill("2026-12-28");
    await page.getByLabel("Departure date").fill("2026-12-31");
    await page.getByRole("button", { name: /^Airplane\b/ }).click();
    await page.getByLabel("Flight number").fill("6E 512");
    await page.getByRole("switch").click();
    await page.getByRole("button", { name: "Send RSVP" }).click();

    // --- done ------------------------------------------------------------
    await expect(
      page.getByRole("heading", { name: /See you in/ })
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("You’re on the list")).toBeVisible();
    await expect(page.getByText("1 guest")).toBeVisible();
    await expect(page.getByText("Airplane")).toBeVisible();
    await expect(page.getByText("Yes, please")).toBeVisible();

    await expect(page.getByText("Share with your family")).toBeVisible();
    await expect(page.getByText("Your way back in")).toBeVisible();
  });

  test("a guest who is attending nothing can decline in one step", async ({
    page,
  }) => {
    await page.goto("/rsvp?tier=w");

    await expect(
      page.getByRole("heading", { name: "Which days?" })
    ).toBeVisible({ timeout: 15_000 });

    // Turn every pre-selected event off so the party is declining outright —
    // `advance()` treats an empty attendance map as a complete answer and
    // submits immediately, skipping party/table/travel.
    const eventToggles = page.getByRole("button", { name: /\d{1,2}:\d{2}/ });
    const count = await eventToggles.count();
    for (let i = 0; i < count; i += 1) {
      await eventToggles.nth(i).click();
    }

    await page.getByRole("button", { name: "Send regrets" }).click();

    await expect(
      page.getByRole("heading", { name: "We’ll miss you" })
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Reply received")).toBeVisible();
    await expect(page.getByText("Not attending")).toBeVisible();

    // Declining still gets a way back in, but never a family QR — there is
    // nothing to forward onto "not attending".
    await expect(page.getByText("Your way back in")).toBeVisible();
    await expect(page.getByText("Share with your family")).not.toBeAttached();
  });
});

test.describe("recovery", () => {
  test("a guest can reopen their exact reply from a new browser via the saved link", async ({
    page,
    context,
    browser,
    baseURL,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"], {
      origin: baseURL,
    });

    await page.goto("/rsvp?tier=f");
    await expect(
      page.getByRole("heading", { name: "Which days?" })
    ).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "Next", exact: true }).click();

    await page.getByLabel("Your full name").fill(GUEST_NAME);
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByRole("button", { name: "Send RSVP" }).click();

    await expect(
      page.getByRole("heading", { name: /See you in/ })
    ).toBeVisible({ timeout: 15_000 });

    // The recovery card's button is a direct sibling of its own heading text,
    // so this stays scoped to that card even though "Copy the link" also
    // appears, verbatim, on the family-share card above it.
    await page
      .getByText("Your way back in", { exact: true })
      .locator("xpath=following-sibling::button")
      .click();
    await expect(page.getByText("Link copied")).toBeVisible();

    const recoveryUrl = await page.evaluate(() =>
      navigator.clipboard.readText()
    );
    expect(recoveryUrl).toContain("/rsvp?tier=f&recover=");

    // A fresh context has no session and no localStorage — the closest thing
    // to "a different device" Playwright can give us.
    const newDeviceContext = await browser.newContext();
    const newDevicePage = await newDeviceContext.newPage();

    try {
      await newDevicePage.goto(recoveryUrl);

      // recoverRsvp trades the code for a sign-in token bound to the same
      // uid, so this lands straight on "done" — never on "days".
      await expect(
        newDevicePage.getByRole("heading", { name: /See you in/ })
      ).toBeVisible({ timeout: 15_000 });
      await expect(
        newDevicePage.getByText("Your reply", { exact: true })
      ).toBeVisible();

      // Prove it's the *same* stored reply, not a blank one, by walking back
      // into the form and checking the name survived the round trip.
      await newDevicePage.getByRole("button", { name: "Change my reply" }).click();
      await newDevicePage.getByRole("button", { name: "Next", exact: true }).click();
      await expect(newDevicePage.getByLabel("Your full name")).toHaveValue(
        GUEST_NAME
      );
    } finally {
      await newDeviceContext.close();
    }
  });
});
