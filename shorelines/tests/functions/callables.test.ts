import { afterEach, describe, expect, it } from "vitest";
import {
  adminAuth,
  adminDb,
  callFunction,
  decodeJwtPayload,
  deleteExistingUser,
  forgedToken,
  freshUid,
} from "./env";

/**
 * Hostile-case coverage for functions/src/index.ts. Every case here is a
 * client the real app never ships — a forged role, a claimed tier, a private
 * event nobody named them for — because the rules deny these writes outright
 * and the callable is the only thing left standing between "the UI would never
 * send this" and "so nothing checks for it".
 *
 * Private events have no equivalent of the tier-stripping cases below, and
 * that absence is the design: they never travel in an RSVP payload at all, so
 * there is nothing for a lying client to claim. The reveal happens on the
 * server, in getMyPrivateEvents, off the caller's own document.
 */

async function cleanupUid(uid: string) {
  await adminDb().collection("rsvps").doc(uid).delete().catch(() => {});
}

async function cleanupPrivateEvents() {
  const docs = await adminDb().collection("privateEvents").get();
  await Promise.all(docs.docs.map((doc) => doc.ref.delete().catch(() => {})));
}

const createdAuthUids: string[] = [];
afterEach(async () => {
  while (createdAuthUids.length) {
    const uid = createdAuthUids.pop()!;
    await adminAuth()
      .deleteUser(uid)
      .catch(() => {});
  }
});

describe("submitRsvp", () => {
  it("refuses an unauthenticated caller", async () => {
    const res = await callFunction("submitRsvp", { tier: "full", party: [], perEventAttendance: {} });
    expect(res.status).toBe(401);
    expect(res.error?.status).toBe("UNAUTHENTICATED");
  });

  it("creates a document from a first submission and stores exactly the claimed tier", async () => {
    const uid = freshUid("guest");
    const res = await callFunction(
      "submitRsvp",
      {
        tier: "reception_only",
        party: [{ name: "Asha", ageGroup: "adult", dietary: "vegetarian" }],
        perEventAttendance: { reception: true },
      },
      forgedToken(uid)
    );
    expect(res.status).toBe(200);
    expect((res.result as { tier: string }).tier).toBe("reception_only");
    expect((res.result as { created: boolean }).created).toBe(true);

    const doc = await adminDb().collection("rsvps").doc(uid).get();
    expect(doc.get("tier")).toBe("reception_only");
    await cleanupUid(uid);
  });

  it("ignores a client trying to change tier on a returning submission", async () => {
    const uid = freshUid("guest");
    await callFunction(
      "submitRsvp",
      {
        tier: "reception_only",
        party: [{ name: "Asha", ageGroup: "adult", dietary: "vegetarian" }],
        perEventAttendance: { reception: true },
      },
      forgedToken(uid)
    );

    const res = await callFunction(
      "submitRsvp",
      {
        tier: "full",
        party: [{ name: "Asha", ageGroup: "adult", dietary: "vegetarian" }],
        perEventAttendance: { reception: true, wedding: true },
      },
      forgedToken(uid)
    );
    expect(res.status).toBe(200);
    expect((res.result as { tier: string }).tier).toBe("reception_only");

    const doc = await adminDb().collection("rsvps").doc(uid).get();
    expect(doc.get("tier")).toBe("reception_only");
    await cleanupUid(uid);
  });

  it("rejects a party over the soft cap", async () => {
    const uid = freshUid("guest");
    const party = Array.from({ length: 16 }, (_, i) => ({
      name: `Guest ${i}`,
      ageGroup: "adult",
      dietary: "vegetarian",
    }));
    const res = await callFunction(
      "submitRsvp",
      { tier: "full", party, perEventAttendance: { wedding: true } },
      forgedToken(uid)
    );
    expect(res.status).toBe(400);
    expect(res.error?.status).toBe("INVALID_ARGUMENT");
  });

  it("rejects a dietary id the client invented", async () => {
    const uid = freshUid("guest");
    const res = await callFunction(
      "submitRsvp",
      {
        tier: "full",
        party: [{ name: "Asha", ageGroup: "adult", dietary: "jain" }],
        perEventAttendance: { wedding: true },
      },
      forgedToken(uid)
    );
    expect(res.status).toBe(400);
    expect(res.error?.status).toBe("INVALID_ARGUMENT");
  });

  it("rejects a tier the client invented", async () => {
    const uid = freshUid("guest");
    const res = await callFunction(
      "submitRsvp",
      {
        tier: "vip_backstage",
        party: [{ name: "Asha", ageGroup: "adult", dietary: "vegetarian" }],
        perEventAttendance: {},
      },
      forgedToken(uid)
    );
    expect(res.status).toBe(400);
  });

  it("mirrors only names/ageGroup/partySize/attendance into invites/{shareCode} — never phone, travel or notes", async () => {
    const uid = freshUid("guest");
    const res = await callFunction(
      "submitRsvp",
      {
        tier: "full",
        party: [{ name: "Asha", ageGroup: "adult", dietary: "vegetarian" }],
        perEventAttendance: { wedding: true },
        phone: "+919876500000",
        notes: "vegetarian, allergic to peanuts",
        travel: { mode: "airplane", serviceNumber: "6E123", wantsPickup: true },
      },
      forgedToken(uid)
    );
    const { shareCode } = res.result as { shareCode: string };
    const invite = await adminDb().collection("invites").doc(shareCode).get();
    const data = invite.data()!;
    expect(data.party).toEqual([{ name: "Asha", ageGroup: "adult" }]);
    expect(data).not.toHaveProperty("submittedByPhone");
    expect(data).not.toHaveProperty("notes");
    expect(data).not.toHaveProperty("travel");

    await cleanupUid(uid);
    await adminDb().collection("invites").doc(shareCode).delete().catch(() => {});
  });
});

describe("recoverRsvp", () => {
  it("exchanges a valid recovery code for a custom token minted for the right uid", async () => {
    const uid = freshUid("guest");
    await callFunction(
      "submitRsvp",
      {
        tier: "full",
        party: [{ name: "Asha", ageGroup: "adult", dietary: "vegetarian" }],
        perEventAttendance: { wedding: true },
      },
      forgedToken(uid)
    );
    const doc = await adminDb().collection("rsvps").doc(uid).get();
    const recoveryCode = doc.get("recoveryCode") as string;

    const res = await callFunction<{ token: string }>("recoverRsvp", { code: recoveryCode });
    expect(res.status).toBe(200);
    const payload = decodeJwtPayload(res.result!.token);
    expect(payload.uid).toBe(uid);

    await cleanupUid(uid);
  });

  it("refuses an unknown recovery code", async () => {
    const res = await callFunction("recoverRsvp", { code: "not-a-real-code-00000000" });
    expect(res.status).toBe(404);
    expect(res.error?.status).toBe("NOT_FOUND");
  });
});

/**
 * Private events. The security question these answer is not "can a guest write
 * one" — the rules already deny every client write — but "can a guest who was
 * never named for one still get it back". Everything hangs off
 * `invitedPrivateEventIds` on the *caller's own* RSVP document, so the tests
 * that matter are the ones where a caller asks for something that isn't listed
 * there.
 */
const COUPLE = () => forgedToken(freshUid("staff"), { role: "couple" });
const COORDINATOR = () => forgedToken(freshUid("staff"), { role: "coordinator" });

/** A valid payload; individual tests override the field they're probing. */
function eventPayload(overrides: Record<string, unknown> = {}) {
  return {
    name: "Late dinner on the terrace",
    startsAt: "2026-12-29T22:00:00+05:30",
    endsAt: "2026-12-29T23:30:00+05:30",
    venue: "The old lighthouse",
    ...overrides,
  };
}

async function createEvent(overrides: Record<string, unknown> = {}): Promise<string> {
  const res = await callFunction<{ id: string }>(
    "savePrivateEvent",
    eventPayload(overrides),
    COUPLE()
  );
  expect(res.status).toBe(200);
  return res.result!.id;
}

describe("savePrivateEvent", () => {
  afterEach(cleanupPrivateEvents);

  it("refuses a coordinator — a coordinator arranging cars has no business knowing it exists", async () => {
    const res = await callFunction("savePrivateEvent", eventPayload(), COORDINATOR());
    expect(res.status).toBe(403);
    expect(res.error?.status).toBe("PERMISSION_DENIED");
  });

  it("refuses an unauthenticated caller", async () => {
    const res = await callFunction("savePrivateEvent", eventPayload());
    expect(res.status).toBe(403);
  });

  it("creates one for the couple, and edits it in place when given its id", async () => {
    const id = await createEvent();

    const edit = await callFunction<{ id: string }>(
      "savePrivateEvent",
      eventPayload({ id, name: "Late dinner, moved indoors" }),
      COUPLE()
    );
    expect(edit.status).toBe(200);
    expect(edit.result?.id).toBe(id);

    const docs = await adminDb().collection("privateEvents").get();
    expect(docs.size).toBe(1);
    expect(docs.docs[0].get("name")).toBe("Late dinner, moved indoors");
  });

  it("rejects a window that ends before it starts", async () => {
    const res = await callFunction(
      "savePrivateEvent",
      eventPayload({
        startsAt: "2026-12-29T23:30:00+05:30",
        endsAt: "2026-12-29T22:00:00+05:30",
      }),
      COUPLE()
    );
    expect(res.status).toBe(400);
    expect(res.error?.status).toBe("INVALID_ARGUMENT");
    // Asserted on the message, not just the code: half the payload's fields are
    // validated with the same code, so a typo'd field name would otherwise give
    // a green test for entirely the wrong reason.
    expect(res.error?.message).toContain("end time");
  });

  it("refuses an edit naming an event that no longer exists", async () => {
    const res = await callFunction(
      "savePrivateEvent",
      eventPayload({ id: "never-existed" }),
      COUPLE()
    );
    expect(res.status).toBe(400);
    expect(res.error?.message).toContain("no longer exists");
  });

  it("enforces the 20-event cap on creation but still allows edits at the cap", async () => {
    // Seeded straight in rather than through 20 round trips — the cap check
    // counts documents, and how they got there isn't what's under test.
    const batch = adminDb().batch();
    for (let i = 0; i < 20; i += 1) {
      batch.set(adminDb().collection("privateEvents").doc(`seeded-${i}`), {
        name: `Seeded ${i}`,
        startsAt: "2026-12-29T22:00:00+05:30",
        endsAt: "2026-12-29T23:00:00+05:30",
      });
    }
    await batch.commit();

    const created = await callFunction("savePrivateEvent", eventPayload(), COUPLE());
    expect(created.status).toBe(400);
    expect(created.error?.message).toContain("at most 20");

    const edited = await callFunction(
      "savePrivateEvent",
      eventPayload({ id: "seeded-0", name: "Still editable" }),
      COUPLE()
    );
    expect(edited.status).toBe(200);
  });
});

describe("setPrivateEventInvite", () => {
  afterEach(cleanupPrivateEvents);

  it("refuses a coordinator", async () => {
    const id = await createEvent();
    const guestUid = freshUid("guest");
    await adminDb().collection("rsvps").doc(guestUid).set({ tier: "full" });

    const res = await callFunction(
      "setPrivateEventInvite",
      { eventId: id, ownerUid: guestUid, invited: true },
      COORDINATOR()
    );
    expect(res.status).toBe(403);

    await cleanupUid(guestUid);
  });

  it("names a guest and takes them off again", async () => {
    const id = await createEvent();
    const guestUid = freshUid("guest");
    await adminDb().collection("rsvps").doc(guestUid).set({ tier: "full" });

    const invite = await callFunction(
      "setPrivateEventInvite",
      { eventId: id, ownerUid: guestUid, invited: true },
      COUPLE()
    );
    expect(invite.status).toBe(200);
    let doc = await adminDb().collection("rsvps").doc(guestUid).get();
    expect(doc.get("invitedPrivateEventIds")).toEqual([id]);

    const revoke = await callFunction(
      "setPrivateEventInvite",
      { eventId: id, ownerUid: guestUid, invited: false },
      COUPLE()
    );
    expect(revoke.status).toBe(200);
    doc = await adminDb().collection("rsvps").doc(guestUid).get();
    expect(doc.get("invitedPrivateEventIds")).toEqual([]);

    await cleanupUid(guestUid);
  });

  it("refuses an event or a guest that doesn't exist", async () => {
    const id = await createEvent();
    const guestUid = freshUid("guest");
    await adminDb().collection("rsvps").doc(guestUid).set({ tier: "full" });

    const noEvent = await callFunction(
      "setPrivateEventInvite",
      { eventId: "never-existed", ownerUid: guestUid, invited: true },
      COUPLE()
    );
    expect(noEvent.status).toBe(400);
    expect(noEvent.error?.message).toContain("no longer exists");

    const noGuest = await callFunction(
      "setPrivateEventInvite",
      { eventId: id, ownerUid: freshUid("never-replied"), invited: true },
      COUPLE()
    );
    expect(noGuest.status).toBe(400);
    expect(noGuest.error?.message).toContain("not replied");

    await cleanupUid(guestUid);
  });
});

describe("deletePrivateEvent", () => {
  afterEach(cleanupPrivateEvents);

  it("refuses a coordinator", async () => {
    const id = await createEvent();
    const res = await callFunction("deletePrivateEvent", { id }, COORDINATOR());
    expect(res.status).toBe(403);
  });

  it("removes the event and strips the id off every guest who was named for it", async () => {
    const id = await createEvent();
    const uids = [freshUid("guest"), freshUid("guest")];
    for (const uid of uids) {
      await adminDb().collection("rsvps").doc(uid).set({ tier: "full" });
      await callFunction(
        "setPrivateEventInvite",
        { eventId: id, ownerUid: uid, invited: true },
        COUPLE()
      );
    }

    const res = await callFunction<{ revoked: number }>(
      "deletePrivateEvent",
      { id },
      COUPLE()
    );
    expect(res.status).toBe(200);
    expect(res.result?.revoked).toBe(2);

    expect((await adminDb().collection("privateEvents").doc(id).get()).exists).toBe(false);
    for (const uid of uids) {
      const doc = await adminDb().collection("rsvps").doc(uid).get();
      expect(doc.get("invitedPrivateEventIds")).toEqual([]);
      await cleanupUid(uid);
    }
  });
});

describe("getMyPrivateEvents", () => {
  afterEach(cleanupPrivateEvents);

  it("refuses an unauthenticated caller", async () => {
    const res = await callFunction("getMyPrivateEvents", {});
    expect(res.status).toBe(401);
    expect(res.error?.status).toBe("UNAUTHENTICATED");
  });

  it("returns only the events this caller was named for, never the others", async () => {
    const mine = await createEvent({ name: "Mine" });
    await createEvent({ name: "Not mine" });

    const uid = freshUid("guest");
    await adminDb().collection("rsvps").doc(uid).set({ tier: "full" });
    await callFunction(
      "setPrivateEventInvite",
      { eventId: mine, ownerUid: uid, invited: true },
      COUPLE()
    );

    const res = await callFunction<{ events: { id: string; name: string }[] }>(
      "getMyPrivateEvents",
      {},
      forgedToken(uid)
    );
    expect(res.status).toBe(200);
    expect(res.result?.events.map((e) => e.name)).toEqual(["Mine"]);

    await cleanupUid(uid);
  });

  it("gives a guest who was never named — and one who never replied — an empty list, not an error", async () => {
    await createEvent();

    const replied = freshUid("guest");
    await adminDb().collection("rsvps").doc(replied).set({ tier: "full" });
    const named = await callFunction<{ events: unknown[] }>(
      "getMyPrivateEvents",
      {},
      forgedToken(replied)
    );
    expect(named.status).toBe(200);
    expect(named.result?.events).toEqual([]);

    const stranger = await callFunction<{ events: unknown[] }>(
      "getMyPrivateEvents",
      {},
      forgedToken(freshUid("never-replied"))
    );
    expect(stranger.status).toBe(200);
    expect(stranger.result?.events).toEqual([]);

    await cleanupUid(replied);
  });

  it("ignores an id left on a guest document whose event has since been deleted", async () => {
    const uid = freshUid("guest");
    await adminDb()
      .collection("rsvps")
      .doc(uid)
      .set({ tier: "full", invitedPrivateEventIds: ["deleted-long-ago"] });

    const res = await callFunction<{ events: unknown[] }>(
      "getMyPrivateEvents",
      {},
      forgedToken(uid)
    );
    expect(res.status).toBe(200);
    expect(res.result?.events).toEqual([]);

    await cleanupUid(uid);
  });
});

describe("flagResponse / deleteResponse", () => {
  it("refuses a coordinator on both", async () => {
    const targetUid = freshUid("guest");
    await adminDb().collection("rsvps").doc(targetUid).set({ tier: "full" });
    const coordinatorToken = forgedToken(freshUid("staff"), { role: "coordinator" });

    const flag = await callFunction("flagResponse", { ownerUid: targetUid, flagged: true }, coordinatorToken);
    expect(flag.status).toBe(403);

    const del = await callFunction("deleteResponse", { ownerUid: targetUid }, coordinatorToken);
    expect(del.status).toBe(403);

    await cleanupUid(targetUid);
  });

  it("lets the couple flag a reply, and delete removes both the rsvp and its invite mirror", async () => {
    const uid = freshUid("guest");
    const submit = await callFunction(
      "submitRsvp",
      {
        tier: "full",
        party: [{ name: "Asha", ageGroup: "adult", dietary: "vegetarian" }],
        perEventAttendance: { wedding: true },
      },
      forgedToken(uid)
    );
    const { shareCode } = submit.result as { shareCode: string };
    const coupleToken = forgedToken(freshUid("staff"), { role: "couple" });

    const flag = await callFunction("flagResponse", { ownerUid: uid, flagged: true }, coupleToken);
    expect(flag.status).toBe(200);
    expect((await adminDb().collection("rsvps").doc(uid).get()).get("flagged")).toBe(true);

    const del = await callFunction("deleteResponse", { ownerUid: uid }, coupleToken);
    expect(del.status).toBe(200);
    expect((await adminDb().collection("rsvps").doc(uid).get()).exists).toBe(false);
    expect((await adminDb().collection("invites").doc(shareCode).get()).exists).toBe(false);
  });
});

describe("syncRole", () => {
  it("downgrades a forged admin claim to whatever the roster actually says for that email", async () => {
    // coordinator@example.com is listed as "coordinator" in functions/.env.local's
    // STAFF_ROSTER. setCustomUserClaims needs a real Auth-emulator uid, so this
    // seeds one rather than forging an unregistered uid (see env.ts's note).
    await deleteExistingUser({ email: "coordinator@example.com" });
    const user = await adminAuth().createUser({
      email: "coordinator@example.com",
      emailVerified: true,
      password: "not-used-goes-through-forged-token",
    });
    createdAuthUids.push(user.uid);

    const res = await callFunction<{ role: string | null; changed: boolean }>(
      "syncRole",
      {},
      forgedToken(user.uid, {
        email: "coordinator@example.com",
        email_verified: true,
        role: "admin", // the forged, self-granted claim
      })
    );
    expect(res.status).toBe(200);
    expect(res.result?.role).toBe("coordinator");
    expect(res.result?.changed).toBe(true);

    const record = await adminAuth().getUser(user.uid);
    expect(record.customClaims?.role).toBe("coordinator");
  });

  it("wipes a forged admin claim entirely for an address that isn't on the roster", async () => {
    await deleteExistingUser({ email: "not-on-any-roster@example.com" });
    const user = await adminAuth().createUser({
      email: "not-on-any-roster@example.com",
      emailVerified: true,
      password: "not-used-goes-through-forged-token",
    });
    createdAuthUids.push(user.uid);

    const res = await callFunction<{ role: string | null; changed: boolean }>(
      "syncRole",
      {},
      forgedToken(user.uid, {
        email: "not-on-any-roster@example.com",
        email_verified: true,
        role: "admin",
      })
    );
    expect(res.status).toBe(200);
    expect(res.result?.role).toBeNull();

    const record = await adminAuth().getUser(user.uid);
    expect(record.customClaims?.role ?? null).toBeNull();
  });

  it("refuses a rostered address that hasn't verified its email", async () => {
    await deleteExistingUser({ email: "coordinator@example.com" });
    const user = await adminAuth().createUser({
      email: "coordinator@example.com",
      emailVerified: false,
      password: "not-used-goes-through-forged-token",
    });
    createdAuthUids.push(user.uid);

    const res = await callFunction(
      "syncRole",
      {},
      forgedToken(user.uid, { email: "coordinator@example.com", email_verified: false })
    );
    expect(res.status).toBe(400);
    expect(res.error?.status).toBe("FAILED_PRECONDITION");

    const record = await adminAuth().getUser(user.uid);
    expect(record.customClaims?.role ?? null).toBeNull();
  });

  it("checks the phone roster before the email branch, and needs no email-verified equivalent", async () => {
    await deleteExistingUser({ phoneNumber: "+919876543210" });
    const user = await adminAuth().createUser({
      phoneNumber: "+919876543210", // listed as "admin" in STAFF_PHONE_ROSTER
    });
    createdAuthUids.push(user.uid);

    const res = await callFunction<{ role: string | null }>(
      "syncRole",
      {},
      forgedToken(user.uid, { phone_number: "+919876543210", role: "coordinator" })
    );
    expect(res.status).toBe(200);
    expect(res.result?.role).toBe("admin");
  });
});

describe("getStaffRoster", () => {
  it("refuses anyone below admin", async () => {
    const res = await callFunction("getStaffRoster", {}, forgedToken(freshUid("staff"), { role: "couple" }));
    expect(res.status).toBe(403);
  });

  it("returns both rosters for an admin", async () => {
    const res = await callFunction<{ email: unknown[]; phone: unknown[] }>(
      "getStaffRoster",
      {},
      forgedToken(freshUid("staff"), { role: "admin" })
    );
    expect(res.status).toBe(200);
    expect(res.result?.email.length).toBeGreaterThan(0);
    expect(res.result?.phone.length).toBeGreaterThan(0);
  });
});

describe("requestStaffAccess / decideStaffAccess", () => {
  const REQUESTER = "wants-in@example.com";
  const IDENTITY = `email:${REQUESTER}`;

  async function cleanupAccess() {
    const docs = await adminDb().collection("staffAccess").get();
    await Promise.all(docs.docs.map((doc) => doc.ref.delete().catch(() => {})));
  }
  afterEach(cleanupAccess);

  async function seedRequester(emailVerified = true) {
    await deleteExistingUser({ email: REQUESTER });
    const user = await adminAuth().createUser({
      email: REQUESTER,
      emailVerified,
      password: "not-used-goes-through-forged-token",
    });
    createdAuthUids.push(user.uid);
    return user;
  }

  it("refuses to queue a request from an unverified address", async () => {
    const user = await seedRequester(false);
    const res = await callFunction(
      "requestStaffAccess",
      {},
      forgedToken(user.uid, { email: REQUESTER, email_verified: false })
    );
    expect(res.status).toBe(400);
    expect(res.error?.status).toBe("FAILED_PRECONDITION");

    const doc = await adminDb().collection("staffAccess").doc(IDENTITY).get();
    expect(doc.exists).toBe(false);
  });

  it("queues a pending request that grants nothing on its own", async () => {
    const user = await seedRequester();
    const res = await callFunction<{ status: string }>(
      "requestStaffAccess",
      {},
      forgedToken(user.uid, { email: REQUESTER, email_verified: true })
    );
    expect(res.status).toBe(200);
    expect(res.result?.status).toBe("pending");

    // The row exists, but syncRole still hands back no role — pending is not
    // a lesser role, it is the absence of one.
    const synced = await callFunction<{ role: string | null; access: string | null }>(
      "syncRole",
      {},
      forgedToken(user.uid, { email: REQUESTER, email_verified: true })
    );
    expect(synced.result?.role).toBeNull();
    expect(synced.result?.access).toBe("pending");
    expect((await adminAuth().getUser(user.uid)).customClaims?.role ?? null).toBeNull();
  });

  it("refuses a decision from anyone below admin", async () => {
    const user = await seedRequester();
    await callFunction("requestStaffAccess", {}, forgedToken(user.uid, { email: REQUESTER, email_verified: true }));

    const res = await callFunction(
      "decideStaffAccess",
      { identity: IDENTITY, role: "admin" },
      forgedToken(freshUid("staff"), { role: "couple" })
    );
    expect(res.status).toBe(403);

    const doc = await adminDb().collection("staffAccess").doc(IDENTITY).get();
    expect(doc.get("status")).toBe("pending");
  });

  it("grants the approved role on the requester's next sync, and revokes it again", async () => {
    const user = await seedRequester();
    await callFunction("requestStaffAccess", {}, forgedToken(user.uid, { email: REQUESTER, email_verified: true }));

    const approve = await callFunction<{ applied: boolean }>(
      "decideStaffAccess",
      { identity: IDENTITY, role: "coordinator" },
      forgedToken(freshUid("admin"), { role: "admin", email: "someone-else@example.com" })
    );
    expect(approve.status).toBe(200);
    expect(approve.result?.applied).toBe(true);
    expect((await adminAuth().getUser(user.uid)).customClaims?.role).toBe("coordinator");

    const synced = await callFunction<{ role: string | null; access: string | null }>(
      "syncRole",
      {},
      forgedToken(user.uid, { email: REQUESTER, email_verified: true })
    );
    expect(synced.result?.role).toBe("coordinator");
    expect(synced.result?.access).toBe("approved");

    // Revoking is the same endpoint with a null role, and it must actually
    // strip the claim rather than leave a stale one in the token.
    const revoke = await callFunction(
      "decideStaffAccess",
      { identity: IDENTITY, role: null },
      forgedToken(freshUid("admin"), { role: "admin", email: "someone-else@example.com" })
    );
    expect(revoke.status).toBe(200);
    expect((await adminAuth().getUser(user.uid)).customClaims?.role ?? null).toBeNull();

    const after = await callFunction<{ role: string | null; access: string | null }>(
      "syncRole",
      {},
      forgedToken(user.uid, { email: REQUESTER, email_verified: true })
    );
    expect(after.result?.role).toBeNull();
    expect(after.result?.access).toBe("denied");
  });

  it("refuses to approve an identity the env roster already pins", async () => {
    // A row here would be written and then never read — syncRole returns on
    // the roster hit — so a refusal beats a decision that silently does nothing.
    const res = await callFunction(
      "decideStaffAccess",
      { identity: "email:coordinator@example.com", role: "admin" },
      forgedToken(freshUid("admin"), { role: "admin", email: "someone-else@example.com" })
    );
    expect(res.status).toBe(400);
    expect(res.error?.status).toBe("FAILED_PRECONDITION");
  });

  it("refuses an admin deciding their own access", async () => {
    const user = await seedRequester();
    await callFunction("requestStaffAccess", {}, forgedToken(user.uid, { email: REQUESTER, email_verified: true }));

    const res = await callFunction(
      "decideStaffAccess",
      { identity: IDENTITY, role: "admin" },
      forgedToken(user.uid, { role: "admin", email: REQUESTER, email_verified: true })
    );
    expect(res.status).toBe(400);
    expect(res.error?.status).toBe("FAILED_PRECONDITION");
  });

  it("rejects a malformed identity rather than creating a row for it", async () => {
    const res = await callFunction(
      "decideStaffAccess",
      { identity: "wants-in@example.com", role: "coordinator" },
      forgedToken(freshUid("admin"), { role: "admin", email: "someone-else@example.com" })
    );
    expect(res.status).toBe(400);
    expect(res.error?.status).toBe("INVALID_ARGUMENT");
  });

  it("refuses a role the roster vocabulary doesn't contain", async () => {
    const user = await seedRequester();
    await callFunction("requestStaffAccess", {}, forgedToken(user.uid, { email: REQUESTER, email_verified: true }));

    const res = await callFunction(
      "decideStaffAccess",
      { identity: IDENTITY, role: "superadmin" },
      forgedToken(freshUid("admin"), { role: "admin", email: "someone-else@example.com" })
    );
    expect(res.status).toBe(400);
    expect(res.error?.status).toBe("INVALID_ARGUMENT");
  });

  it("never lets the collection outrank the env roster", async () => {
    // Even if a row for a rostered address somehow exists — a bad migration,
    // a direct Admin SDK write — syncRole must still answer with the roster.
    await deleteExistingUser({ email: "coordinator@example.com" });
    const user = await adminAuth().createUser({
      email: "coordinator@example.com",
      emailVerified: true,
      password: "not-used-goes-through-forged-token",
    });
    createdAuthUids.push(user.uid);
    await adminDb().collection("staffAccess").doc("email:coordinator@example.com").set({
      kind: "email",
      value: "coordinator@example.com",
      status: "approved",
      role: "admin",
    });

    const res = await callFunction<{ role: string | null }>(
      "syncRole",
      {},
      forgedToken(user.uid, { email: "coordinator@example.com", email_verified: true })
    );
    expect(res.result?.role).toBe("coordinator");
  });
});

describe("updateWeddingLive", () => {
  afterEach(async () => {
    await adminDb().collection("config").doc("live").delete().catch(() => {});
  });

  it("refuses a signed-out or unrostered caller entirely", async () => {
    // assertSignedInStaff only distinguishes "below coordinator rank", so a
    // missing auth header and a signed-in-but-unrostered caller both come
    // back permission-denied — there's no separate unauthenticated branch here.
    const noAuth = await callFunction("updateWeddingLive", { emergencyContacts: [] });
    expect(noAuth.status).toBe(403);

    const noRole = await callFunction("updateWeddingLive", { emergencyContacts: [] }, forgedToken(freshUid("staff")));
    expect(noRole.status).toBe(403);
  });

  it("lets a coordinator edit emergency contacts but refuses the same coordinator changing times", async () => {
    const coordinatorToken = forgedToken(freshUid("staff"), { role: "coordinator" });

    const contacts = await callFunction(
      "updateWeddingLive",
      {
        emergencyContacts: [
          { id: "front-desk", name: "Hotel Front Desk", role: "Venue", phone: "+911234567890" },
        ],
      },
      coordinatorToken
    );
    expect(contacts.status).toBe(200);

    const times = await callFunction(
      "updateWeddingLive",
      { events: { wedding: { startsAt: "2026-12-29T11:28:00+05:30", endsAt: "2026-12-29T13:00:00+05:30" } } },
      coordinatorToken
    );
    expect(times.status).toBe(403);
  });

  it("lets the couple change times but rejects an end before the start", async () => {
    const coupleToken = forgedToken(freshUid("staff"), { role: "couple" });

    const ok = await callFunction(
      "updateWeddingLive",
      { events: { wedding: { startsAt: "2026-12-29T11:28:00+05:30", endsAt: "2026-12-29T13:00:00+05:30" } } },
      coupleToken
    );
    expect(ok.status).toBe(200);

    const inverted = await callFunction(
      "updateWeddingLive",
      { events: { wedding: { startsAt: "2026-12-29T13:00:00+05:30", endsAt: "2026-12-29T11:28:00+05:30" } } },
      coupleToken
    );
    expect(inverted.status).toBe(400);
  });

  it("merges one event's override without disturbing another's (nested-map merge, not a dotted-key overwrite)", async () => {
    const coupleToken = forgedToken(freshUid("staff"), { role: "couple" });

    await callFunction(
      "updateWeddingLive",
      { events: { wedding: { startsAt: "2026-12-29T11:28:00+05:30", endsAt: "2026-12-29T13:00:00+05:30" } } },
      coupleToken
    );
    await callFunction(
      "updateWeddingLive",
      { events: { haldi: { startsAt: "2026-12-28T10:00:00+05:30", endsAt: "2026-12-28T12:00:00+05:30" } } },
      coupleToken
    );

    const doc = await adminDb().collection("config").doc("live").get();
    expect(doc.get("events.wedding.startsAt")).toBe("2026-12-29T11:28:00+05:30");
    expect(doc.get("events.haldi.startsAt")).toBe("2026-12-28T10:00:00+05:30");
  });
});
