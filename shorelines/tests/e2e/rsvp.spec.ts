import { test, expect } from "@playwright/test";
import { freshPhone, verifyPhone } from "./helpers";

/**
 * The golden path through screen 1c end to end, against the real emulators
 * (see playwright.config.ts) — no mocking, because there is nothing safe to
 * mock: phone sign-in, the `submitRsvp`/`recoverRsvp` callables and the
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
    const phone = freshPhone();

    await page.goto("/?tier=f");

    await page.getByRole("link", { name: "RSVP for your family" }).click();
    await expect(page).toHaveURL(/\/rsvp\?tier=f/);

    await verifyPhone(page, phone);

    // Verifying resolves into "days" — this number has no stored reply.
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
    // Seeded from the number they just verified, rather than asked for twice.
    await expect(page.getByLabel("Contact number")).toHaveValue(phone);
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
    // The date fields are a Popover + react-day-picker Calendar, not native
    // inputs (see DateCard in StepTravel.tsx) — open each popover and click
    // the day cell rather than `.fill()`. react-day-picker labels every day
    // button with the full formatted date ("EEEE, MMMM do, yyyy"), which is
    // unique within a single visible month and doesn't depend on the
    // (untranslated-here) weekday name, so matching on just month/day/year
    // is enough.
    await page.getByLabel("Arrival date").click();
    await page.getByRole("button", { name: /December 28th, 2026/ }).click();
    await page.getByLabel("Departure date").click();
    await page.getByRole("button", { name: /December 31st, 2026/ }).click();
    await page.getByRole("button", { name: /^Airplane\b/ }).click();
    // Dates and mode are the whole step now: the couple withdrew the airport
    // pickup and asked for the flight/train number to go with it, so the
    // service-number field and the pickup switch this used to fill are gone.
    await page.getByRole("button", { name: "Send RSVP" }).click();

    // --- done ------------------------------------------------------------
    await expect(
      page.getByRole("heading", { name: /See you in/ })
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("You’re on the list")).toBeVisible();
    await expect(page.getByText("1 guest")).toBeVisible();
    await expect(page.getByText("Airplane")).toBeVisible();

    await expect(page.getByText("Share with your family")).toBeVisible();
    await expect(page.getByText("Your way back in")).toBeVisible();
  });

  test("a guest who is attending nothing can decline in one step", async ({
    page,
  }) => {
    await page.goto("/rsvp?tier=w");
    await verifyPhone(page, freshPhone());

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

test.describe("one number, one reply", () => {
  test("verifying the same number on another device reopens the same reply", async ({
    page,
    browser,
  }) => {
    const phone = freshPhone();

    await page.goto("/rsvp?tier=f");
    await verifyPhone(page, phone);
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByLabel("Your full name").fill(GUEST_NAME);
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByRole("button", { name: "Send RSVP" }).click();
    await expect(
      page.getByRole("heading", { name: /See you in/ })
    ).toBeVisible({ timeout: 15_000 });

    // No session, no localStorage, no recovery link — the number is the only
    // thing carried across. Firebase resolves it to the same uid, and the doc
    // is keyed by uid, so there is nothing here that could produce a second
    // reply.
    const other = await browser.newContext();
    const otherPage = await other.newPage();

    try {
      await otherPage.goto("/rsvp?tier=f");
      await verifyPhone(otherPage, phone);

      await expect(
        otherPage.getByRole("heading", { name: /See you in/ })
      ).toBeVisible({ timeout: 15_000 });

      await otherPage.getByRole("button", { name: "Change my reply" }).click();
      await otherPage
        .getByRole("button", { name: "Next", exact: true })
        .click();
      await expect(otherPage.getByLabel("Your full name")).toHaveValue(
        GUEST_NAME
      );
    } finally {
      await other.close();
    }
  });
});

test.describe("the landing remembers", () => {
  test("a guest who has replied is told so instead of being asked again", async ({
    page,
  }) => {
    // The couple's own report: they RSVPed, closed the tab, reopened the link,
    // and were shown the invitation with "RSVP for your family" on it, with no
    // sign the app had kept their reply. It had — `/rsvp` puts them straight on
    // their confirmation — but the landing is a server component and had no
    // session to read. `InviteCta` is the client island that closes that gap.
    await page.goto("/rsvp?tier=f");
    await verifyPhone(page, freshPhone());
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByLabel("Your full name").fill(GUEST_NAME);
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByRole("button", { name: "Send RSVP" }).click();
    await expect(
      page.getByRole("heading", { name: /See you in/ })
    ).toBeVisible({ timeout: 15_000 });

    // Same session, same origin — exactly what reopening the link does. The
    // couple then asked for more than a card: a guest who has replied should
    // land on Today, not on the invitation. `/` redirects them there off the
    // `shorelines_replied` cookie, server-side, so there's no flash of the
    // invitation first.
    await page.goto("/?tier=f");
    await expect(page).toHaveURL(/\/today\?tier=f/);
    await expect(page.getByText("Your reply")).toBeVisible({ timeout: 15_000 });

    // `?invite=1` is the one-visit escape hatch — the link UpcomingScreen
    // renders, and the only way back to the invitation once they've replied.
    await page.getByRole("link", { name: "See the invitation" }).click();
    await expect(page).toHaveURL(/\/\?tier=f&invite=1/);

    await expect(page.getByText(`You’re on the list, ${GUEST_NAME}`)).toBeVisible(
      { timeout: 15_000 }
    );
    await expect(page.getByText("saved for one guest")).toBeVisible();
    await expect(
      page.getByRole("link", { name: "RSVP for your family" })
    ).not.toBeAttached();

    await page.getByRole("link", { name: "View or change your reply" }).click();
    await expect(page).toHaveURL(/\/rsvp\?tier=f/);
    await expect(
      page.getByRole("heading", { name: /See you in/ })
    ).toBeVisible({ timeout: 15_000 });
  });
});

test.describe("the gate holds", () => {
  test("an anonymous session from /polls does not let a guest past the phone step", async ({
    page,
  }) => {
    // /polls, /memories and /photos each sign in anonymously on mount so a
    // guest can take part without replying first. That session persists for
    // the whole origin, so /rsvp sees a signed-in user before anyone has
    // verified anything — the gate has to reject it (RsvpFlow's isVerified),
    // or the RSVP identity model is bypassable by visiting a page first.
    await page.goto("/polls");

    // Waiting on the persisted session itself, not on anything the page
    // renders: the point of the test is that a real anonymous user exists
    // before /rsvp is opened, so if this never resolves the test fails rather
    // than passing for the trivial reason that nobody was signed in at all.
    // Firebase persists to IndexedDB under a fixed database and store name.
    await page.waitForFunction(
      async () => {
        const db = await new Promise<IDBDatabase | null>((resolve) => {
          const req = indexedDB.open("firebaseLocalStorageDb");
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => resolve(null);
        });
        if (!db?.objectStoreNames.contains("firebaseLocalStorage")) return false;
        const records = await new Promise<{ value?: unknown }[]>((resolve) => {
          const r = db
            .transaction("firebaseLocalStorage")
            .objectStore("firebaseLocalStorage")
            .getAll();
          r.onsuccess = () => resolve(r.result ?? []);
          r.onerror = () => resolve([]);
        });
        return records.some(
          (record) =>
            (record.value as { isAnonymous?: boolean } | undefined)
              ?.isAnonymous === true
        );
      },
      null,
      { timeout: 15_000 }
    );

    await page.goto("/rsvp?tier=f");

    await expect(
      page.getByRole("heading", { name: "Your mobile number" })
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByRole("heading", { name: "Which days?" })
    ).not.toBeAttached();
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
    await verifyPhone(page, freshPhone());
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
