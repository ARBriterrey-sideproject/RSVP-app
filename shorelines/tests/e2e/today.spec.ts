import { test, expect } from "@playwright/test";
import { freshPhone, verifyPhone } from "./helpers";

/**
 * `/today` before the wedding weekend opens.
 *
 * The bug this covers: the Today tab was rendered all year but pointed at `/`,
 * so tapping it returned the guest to the invite landing they'd just left.
 * Test one is that round trip, and it runs under both Playwright projects —
 * the desktop top nav and the mobile bottom bar are two separate `<nav>`s in
 * the same DOM, one `display:none` at any width, so the role query resolves to
 * whichever one this viewport actually exposes.
 *
 * Everything else here asserts the light screen's two states, which differ by
 * one thing only: whether the guest's `rsvps/{uid}` document exists.
 */

const GUEST_NAME = "Marin Tideward";

test.describe("the Today tab before the wedding", () => {
  test("lands on the pre-wedding screen, not the invite landing", async ({
    page,
  }) => {
    // From /schedule, not /rsvp: AppShell only renders the tab bar for screens
    // that pass a `tab`, and the RSVP wizard deliberately passes none until
    // its "done" screen.
    await page.goto("/schedule?tier=f");

    await page.getByRole("link", { name: "Today" }).click();

    await expect(page).toHaveURL(/\/today\?tier=f/);
    await expect(page.getByText(/days to go|One day to go|It begins today/)).toBeVisible();
    // The old behaviour: `/`'s primary CTA. Its absence is the fix.
    await expect(
      page.getByRole("link", { name: "RSVP for your family" })
    ).not.toBeAttached();
  });

  test("a guest who has not replied is shown every eligible day and a nudge", async ({
    page,
  }) => {
    await page.goto("/today?tier=f");

    await expect(page.getByText("We haven't heard from you yet.")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText("Your days with us")).toBeVisible();
    await expect(page.getByTestId("upcoming-event")).toHaveCount(5);

    await page.getByRole("link", { name: "Reply now" }).click();
    await expect(page).toHaveURL(/\/rsvp\?tier=f/);
    await expect(
      page.getByRole("heading", { name: "Your mobile number" })
    ).toBeVisible({ timeout: 15_000 });
  });

  test("the reception-only tier sees one day", async ({ page }) => {
    await page.goto("/today?tier=r");

    await expect(page.getByTestId("upcoming-event")).toHaveCount(1);
  });

  test("a guest who replied sees their own days, and the declined one is gone", async ({
    page,
  }) => {
    await page.goto("/rsvp?tier=f");
    await verifyPhone(page, freshPhone());

    await expect(page.getByRole("heading", { name: "Which days?" })).toBeVisible({
      timeout: 15_000,
    });

    // Every event starts on; turning the first one off is the whole point —
    // the pre-wedding screen must show what they said yes to, not what their
    // tier allows.
    await page.getByRole("button", { name: /\d{1,2}:\d{2}/ }).first().click();

    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByLabel("Your full name").fill(GUEST_NAME);
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByRole("button", { name: "Send RSVP" }).click();

    await expect(page.getByRole("heading", { name: /See you in/ })).toBeVisible({
      timeout: 15_000,
    });

    await page.goto("/today?tier=f");

    // The name comes off the stored reply, not the link.
    await expect(page.getByText(`For ${GUEST_NAME}`)).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText("4 of 5 events")).toBeVisible();
    await expect(page.getByText("You're coming to")).toBeVisible();
    await expect(page.getByTestId("upcoming-event")).toHaveCount(4);
    await expect(
      page.getByRole("link", { name: "Change my reply" })
    ).toBeVisible();
  });
});

test.describe("memories before the wedding", () => {
  test("the composer is reachable, not locked behind the event window", async ({
    page,
  }) => {
    await page.goto("/today?tier=f");
    await page.getByRole("link", { name: "Write one" }).click();

    await expect(page).toHaveURL(/\/memories\?tier=f/);
    // The gate that used to stand here rendered EventModeLocked instead.
    await expect(page.getByRole("textbox")).toBeVisible({ timeout: 15_000 });
  });
});
