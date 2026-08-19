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
 * client the real app never ships — a forged role, a claimed tier, a
 * speakeasy RSVP nobody invited them to — because the rules deny these
 * writes outright and the callable is the only thing left standing between
 * "the UI would never send this" and "so nothing checks for it".
 */

async function cleanupUid(uid: string) {
  await adminDb().collection("rsvps").doc(uid).delete().catch(() => {});
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

  it("strips a speakeasy claim from an uninvited guest, server-side, from both the doc and the public mirror", async () => {
    const uid = freshUid("guest");
    const res = await callFunction(
      "submitRsvp",
      {
        tier: "full",
        party: [{ name: "Rohan", ageGroup: "adult", dietary: "vegetarian" }],
        perEventAttendance: { wedding: true, speakeasy: true },
      },
      forgedToken(uid)
    );
    expect(res.status).toBe(200);
    const { shareCode } = res.result as { shareCode: string };

    const doc = await adminDb().collection("rsvps").doc(uid).get();
    expect(doc.get("perEventAttendance.speakeasy")).toBeUndefined();
    expect(doc.get("perEventAttendance.wedding")).toBe(true);

    const invite = await adminDb().collection("invites").doc(shareCode).get();
    expect(invite.get("perEventAttendance.speakeasy")).toBeUndefined();

    await cleanupUid(uid);
    await adminDb().collection("invites").doc(shareCode).delete().catch(() => {});
  });

  it("honours the speakeasy claim once the couple has flagged the guest for it", async () => {
    const uid = freshUid("guest");
    // Seed the flag the way setSpeakeasyInvite would have written it — the
    // callable is what re-checks this, not the client, so seeding directly is
    // the right way to set up the precondition without also testing that path.
    // A tier must come along with it: submitRsvp treats an existing doc's
    // "tier" as authoritative and would otherwise try to write `undefined`.
    await adminDb().collection("rsvps").doc(uid).set({ tier: "full", speakeasyInvited: true });

    const res = await callFunction(
      "submitRsvp",
      {
        tier: "full",
        party: [{ name: "Rohan", ageGroup: "adult", dietary: "vegetarian" }],
        perEventAttendance: { wedding: true, speakeasy: true },
      },
      forgedToken(uid)
    );
    expect(res.status).toBe(200);

    const doc = await adminDb().collection("rsvps").doc(uid).get();
    expect(doc.get("perEventAttendance.speakeasy")).toBe(true);
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

describe("setSpeakeasyInvite", () => {
  it("refuses a coordinator, even one claiming a role for itself", async () => {
    const targetUid = freshUid("guest");
    await adminDb().collection("rsvps").doc(targetUid).set({ tier: "full" });

    const res = await callFunction(
      "setSpeakeasyInvite",
      { ownerUid: targetUid, invited: true },
      forgedToken(freshUid("staff"), { role: "coordinator" })
    );
    expect(res.status).toBe(403);
    expect(res.error?.status).toBe("PERMISSION_DENIED");

    await cleanupUid(targetUid);
  });

  it("lets the couple invite a guest, and revoking clears their acceptance", async () => {
    const targetUid = freshUid("guest");
    await adminDb()
      .collection("rsvps")
      .doc(targetUid)
      .set({ tier: "full", perEventAttendance: { speakeasy: true } });

    const invite = await callFunction(
      "setSpeakeasyInvite",
      { ownerUid: targetUid, invited: true },
      forgedToken(freshUid("staff"), { role: "couple" })
    );
    expect(invite.status).toBe(200);
    let doc = await adminDb().collection("rsvps").doc(targetUid).get();
    expect(doc.get("speakeasyInvited")).toBe(true);

    const revoke = await callFunction(
      "setSpeakeasyInvite",
      { ownerUid: targetUid, invited: false },
      forgedToken(freshUid("staff"), { role: "couple" })
    );
    expect(revoke.status).toBe(200);
    doc = await adminDb().collection("rsvps").doc(targetUid).get();
    expect(doc.get("speakeasyInvited")).toBe(false);
    expect(doc.get("perEventAttendance.speakeasy")).toBeUndefined();

    await cleanupUid(targetUid);
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
