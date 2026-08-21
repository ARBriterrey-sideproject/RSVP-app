import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import { assertFails, assertSucceeds, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, type Firestore } from "firebase/firestore";
import { makeFirestoreTestEnv } from "./env";

/**
 * firestore.rules, end to end. Every case here mirrors a comment in the rules
 * file itself — the goal is to catch the day someone "simplifies" a rule and
 * quietly reopens a write path that a Cloud Function is supposed to own.
 *
 * Seeding bypasses rules entirely (`withSecurityRulesDisabled`), since the
 * point is to test reads/writes against data that's already there, not to
 * test how it got there.
 */

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await makeFirestoreTestEnv();
});

afterAll(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

async function seed(fn: (db: Firestore) => Promise<void>) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    // @firebase/rules-unit-testing's own .d.ts types this as the legacy
    // compat Firestore, but at runtime it's the modular instance every
    // `collection`/`doc`/`setDoc` call in this file already assumes.
    await fn(ctx.firestore() as unknown as Firestore);
  });
}

describe("rsvps/{ownerUid}", () => {
  beforeEach(async () => {
    await seed(async (db) => {
      await setDoc(doc(db, "rsvps", "guest-1"), {
        ownerUid: "guest-1",
        tier: "full",
        party: [{ name: "Guest One", ageGroup: "adult", dietary: "vegetarian" }],
      });
    });
  });

  it("lets a guest read their own document", async () => {
    const db = testEnv.authenticatedContext("guest-1").firestore();
    await assertSucceeds(getDoc(doc(db, "rsvps", "guest-1")));
  });

  it("refuses a guest reading someone else's document", async () => {
    const db = testEnv.authenticatedContext("guest-2").firestore();
    await assertFails(getDoc(doc(db, "rsvps", "guest-1")));
  });

  it("refuses an unauthenticated read", async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, "rsvps", "guest-1")));
  });

  it("lets any staff rank read any guest's document", async () => {
    const db = testEnv
      .authenticatedContext("coordinator-1", { role: "coordinator" })
      .firestore();
    await assertSucceeds(getDoc(doc(db, "rsvps", "guest-1")));
  });

  it("lets staff list the collection but refuses a guest listing it", async () => {
    const staffDb = testEnv
      .authenticatedContext("coordinator-1", { role: "coordinator" })
      .firestore();
    await assertSucceeds(getDocs(collection(staffDb, "rsvps")));

    const guestDb = testEnv.authenticatedContext("guest-1").firestore();
    await assertFails(getDocs(collection(guestDb, "rsvps")));
  });

  it("refuses every direct client write, including from an admin account", async () => {
    const ownerDb = testEnv.authenticatedContext("guest-1").firestore();
    await assertFails(
      updateDoc(doc(ownerDb, "rsvps", "guest-1"), { tier: "full" })
    );

    const adminDb = testEnv
      .authenticatedContext("admin-1", { role: "admin" })
      .firestore();
    await assertFails(
      updateDoc(doc(adminDb, "rsvps", "guest-1"), { flagged: true })
    );
    await assertFails(
      setDoc(doc(adminDb, "rsvps", "guest-2"), { ownerUid: "guest-2", tier: "full" })
    );
    await assertFails(deleteDoc(doc(adminDb, "rsvps", "guest-1")));
  });
});

describe("invites/{shareCode} — the public QR mirror", () => {
  beforeEach(async () => {
    await seed(async (db) => {
      await setDoc(doc(db, "invites", "share1"), {
        ownerUid: "guest-1",
        tier: "full",
        party: [{ name: "Guest One", ageGroup: "adult" }],
      });
    });
  });

  it("is readable by anyone, signed in or not — the code is the credential", async () => {
    const anon = testEnv.unauthenticatedContext().firestore();
    await assertSucceeds(getDoc(doc(anon, "invites", "share1")));
  });

  it("cannot be listed, so codes can't be enumerated", async () => {
    const anon = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDocs(collection(anon, "invites")));
  });

  it("refuses every write, including from an admin", async () => {
    const adminDb = testEnv
      .authenticatedContext("admin-1", { role: "admin" })
      .firestore();
    await assertFails(
      updateDoc(doc(adminDb, "invites", "share1"), { tier: "reception_only" })
    );
  });
});

describe("config/live — the runtime overlay", () => {
  beforeEach(async () => {
    await seed(async (db) => {
      await setDoc(doc(db, "config", "live"), { emergencyContacts: [] });
    });
  });

  it("is world-readable, even signed out", async () => {
    const anon = testEnv.unauthenticatedContext().firestore();
    await assertSucceeds(getDoc(doc(anon, "config", "live")));
  });

  it("cannot be written by anyone, admin included — updateWeddingLive is the only path", async () => {
    const adminDb = testEnv
      .authenticatedContext("admin-1", { role: "admin" })
      .firestore();
    await assertFails(
      updateDoc(doc(adminDb, "config", "live"), { emergencyContacts: [] })
    );

    const coupleDb = testEnv
      .authenticatedContext("couple-1", { role: "couple" })
      .firestore();
    await assertFails(
      setDoc(doc(coupleDb, "config", "live"), { emergencyContacts: [] })
    );
  });
});

describe("privateEvents/{eventId}", () => {
  beforeEach(async () => {
    await seed(async (db) => {
      await setDoc(doc(db, "privateEvents", "e1"), {
        name: "Late dinner on the terrace",
        startsAt: "2026-12-29T22:00:00+05:30",
        endsAt: "2026-12-29T23:30:00+05:30",
      });
    });
  });

  it("is readable and listable by staff, down to a coordinator", async () => {
    const coordinatorDb = testEnv
      .authenticatedContext("coordinator-1", { role: "coordinator" })
      .firestore();
    await assertSucceeds(getDoc(doc(coordinatorDb, "privateEvents", "e1")));
    await assertSucceeds(getDocs(collection(coordinatorDb, "privateEvents")));
  });

  /**
   * The whole point of the collection. A guest never reads it — not even the
   * one who's been invited — because knowing an event exists is the thing
   * being kept private. getMyPrivateEvents is the only path in, and it reads
   * the guest's own document with the Admin SDK to decide what to hand back.
   */
  it("is invisible to a guest, invited or not, and to a signed-out visitor", async () => {
    const guestDb = testEnv.authenticatedContext("guest-1").firestore();
    await assertFails(getDoc(doc(guestDb, "privateEvents", "e1")));
    await assertFails(getDocs(collection(guestDb, "privateEvents")));

    const anon = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(anon, "privateEvents", "e1")));
  });

  it("is never client-writable, admin included — the callables are the only path", async () => {
    const adminDb = testEnv
      .authenticatedContext("admin-1", { role: "admin" })
      .firestore();
    await assertFails(setDoc(doc(adminDb, "privateEvents", "e2"), { name: "New" }));
    await assertFails(updateDoc(doc(adminDb, "privateEvents", "e1"), { name: "Edited" }));
    await assertFails(deleteDoc(doc(adminDb, "privateEvents", "e1")));

    const coupleDb = testEnv
      .authenticatedContext("couple-1", { role: "couple" })
      .firestore();
    await assertFails(updateDoc(doc(coupleDb, "privateEvents", "e1"), { name: "Edited" }));

    const guestDb = testEnv.authenticatedContext("guest-1").firestore();
    await assertFails(setDoc(doc(guestDb, "privateEvents", "e3"), { name: "Mine now" }));
  });
});

describe("polls/{pollId} (v2)", () => {
  it("is readable by any signed-in guest, not by a signed-out visitor", async () => {
    const guestDb = testEnv.authenticatedContext("guest-1").firestore();
    await assertSucceeds(getDoc(doc(guestDb, "polls", "p1")));

    const anon = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(anon, "polls", "p1")));
  });

  it("can only be written by the couple, not a coordinator", async () => {
    const coordinatorDb = testEnv
      .authenticatedContext("coordinator-1", { role: "coordinator" })
      .firestore();
    await assertFails(setDoc(doc(coordinatorDb, "polls", "p1"), { question: "?" }));

    const coupleDb = testEnv
      .authenticatedContext("couple-1", { role: "couple" })
      .firestore();
    await assertSucceeds(setDoc(doc(coupleDb, "polls", "p1"), { question: "?" }));
  });
});

describe("pollVotes/{voteId} (v2)", () => {
  it("is readable by any signed-in guest but never client-writable", async () => {
    const guestDb = testEnv.authenticatedContext("guest-1").firestore();
    await assertSucceeds(getDoc(doc(guestDb, "pollVotes", "v1")));
    await assertFails(setDoc(doc(guestDb, "pollVotes", "v1"), { pollId: "p1" }));
  });
});

describe("songRequests/{requestId} (v2)", () => {
  it("is readable by staff (coordinator included), not by a guest", async () => {
    const coordinatorDb = testEnv
      .authenticatedContext("coordinator-1", { role: "coordinator" })
      .firestore();
    await assertSucceeds(getDoc(doc(coordinatorDb, "songRequests", "r1")));

    const guestDb = testEnv.authenticatedContext("guest-1").firestore();
    await assertFails(getDoc(doc(guestDb, "songRequests", "r1")));
  });

  it("is never client-writable, even by staff", async () => {
    const coordinatorDb = testEnv
      .authenticatedContext("coordinator-1", { role: "coordinator" })
      .firestore();
    await assertFails(
      setDoc(doc(coordinatorDb, "songRequests", "r1"), { title: "x" })
    );
  });
});

describe("memories/{memoryId} — the couple's private inbox", () => {
  it("lets a signed-in guest create only under their own uid", async () => {
    const guestDb = testEnv.authenticatedContext("guest-1").firestore();
    await assertSucceeds(
      setDoc(doc(guestDb, "memories", "m1"), {
        ownerUid: "guest-1",
        type: "text",
        content: "congrats!",
      })
    );

    await assertFails(
      setDoc(doc(guestDb, "memories", "m2"), {
        ownerUid: "someone-else",
        type: "text",
        content: "spoofed",
      })
    );
  });

  it("is unreadable by the guest who wrote it and by a coordinator, but readable by the couple", async () => {
    await seed(async (db) => {
      await setDoc(doc(db, "memories", "m1"), {
        ownerUid: "guest-1",
        type: "text",
        content: "congrats!",
      });
    });

    const guestDb = testEnv.authenticatedContext("guest-1").firestore();
    await assertFails(getDoc(doc(guestDb, "memories", "m1")));

    const coordinatorDb = testEnv
      .authenticatedContext("coordinator-1", { role: "coordinator" })
      .firestore();
    await assertFails(getDoc(doc(coordinatorDb, "memories", "m1")));

    const coupleDb = testEnv
      .authenticatedContext("couple-1", { role: "couple" })
      .firestore();
    await assertSucceeds(getDoc(doc(coupleDb, "memories", "m1")));
  });

  it("can only be updated or deleted by the couple, not a coordinator", async () => {
    await seed(async (db) => {
      await setDoc(doc(db, "memories", "m1"), {
        ownerUid: "guest-1",
        type: "text",
        content: "congrats!",
      });
    });

    const coordinatorDb = testEnv
      .authenticatedContext("coordinator-1", { role: "coordinator" })
      .firestore();
    await assertFails(deleteDoc(doc(coordinatorDb, "memories", "m1")));

    const coupleDb = testEnv
      .authenticatedContext("couple-1", { role: "couple" })
      .firestore();
    await assertSucceeds(deleteDoc(doc(coupleDb, "memories", "m1")));
  });
});

describe("aggregates/{docId}", () => {
  it("is readable by staff, not by a guest, and never client-writable", async () => {
    await seed(async (db) => {
      await setDoc(doc(db, "aggregates", "a1"), { count: 1 });
    });

    const coordinatorDb = testEnv
      .authenticatedContext("coordinator-1", { role: "coordinator" })
      .firestore();
    await assertSucceeds(getDoc(doc(coordinatorDb, "aggregates", "a1")));
    await assertFails(updateDoc(doc(coordinatorDb, "aggregates", "a1"), { count: 2 }));

    const guestDb = testEnv.authenticatedContext("guest-1").firestore();
    await assertFails(getDoc(doc(guestDb, "aggregates", "a1")));
  });
});

describe("catch-all", () => {
  it("denies read and write on any unmatched collection, even for admin", async () => {
    const adminDb = testEnv
      .authenticatedContext("admin-1", { role: "admin" })
      .firestore();
    await assertFails(getDoc(doc(adminDb, "somethingElse", "x")));
    await assertFails(setDoc(doc(adminDb, "somethingElse", "x"), { a: 1 }));
  });
});
