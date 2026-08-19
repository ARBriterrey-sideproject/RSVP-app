import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { ref, uploadBytes, getBytes, deleteObject } from "firebase/storage";
import { makeStorageTestEnv } from "./env";

/**
 * storage.rules, end to end — mirrors firestore.test.ts. `roleRank()` here is
 * a duplicate of the Firestore one (see the rules file's own comment), so
 * these cases exist to catch the day the two copies drift.
 */

let testEnv: RulesTestEnvironment;

const SMALL_IMAGE = new Uint8Array([1, 2, 3, 4]);
const SMALL_AUDIO = new Uint8Array([5, 6, 7, 8]);
const OVER_15MB = new Uint8Array(15 * 1024 * 1024 + 1);
const OVER_25MB = new Uint8Array(25 * 1024 * 1024 + 1);

beforeAll(async () => {
  testEnv = await makeStorageTestEnv();
});

afterAll(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearStorage();
});

describe("photos/{eventId}/{ownerUid}/{fileId}", () => {
  it("lets any signed-in user read, refuses a signed-out visitor", async () => {
    const ownerStorage = testEnv.authenticatedContext("guest-1").storage();
    await assertSucceeds(
      uploadBytes(ref(ownerStorage, "photos/wedding/guest-1/f1.jpg"), SMALL_IMAGE, {
        contentType: "image/jpeg",
      })
    );

    const otherStorage = testEnv.authenticatedContext("guest-2").storage();
    await assertSucceeds(getBytes(ref(otherStorage, "photos/wedding/guest-1/f1.jpg")));

    const anon = testEnv.unauthenticatedContext().storage();
    await assertFails(getBytes(ref(anon, "photos/wedding/guest-1/f1.jpg")));
  });

  it("lets a guest write only under their own uid segment", async () => {
    const ownerStorage = testEnv.authenticatedContext("guest-1").storage();
    await assertSucceeds(
      uploadBytes(ref(ownerStorage, "photos/wedding/guest-1/f1.jpg"), SMALL_IMAGE, {
        contentType: "image/jpeg",
      })
    );

    await assertFails(
      uploadBytes(ref(ownerStorage, "photos/wedding/guest-2/f2.jpg"), SMALL_IMAGE, {
        contentType: "image/jpeg",
      })
    );
  });

  it("refuses an oversized upload", async () => {
    const ownerStorage = testEnv.authenticatedContext("guest-1").storage();
    await assertFails(
      uploadBytes(ref(ownerStorage, "photos/wedding/guest-1/big.jpg"), OVER_15MB, {
        contentType: "image/jpeg",
      })
    );
  });

  it("refuses a non-image content type", async () => {
    const ownerStorage = testEnv.authenticatedContext("guest-1").storage();
    await assertFails(
      uploadBytes(ref(ownerStorage, "photos/wedding/guest-1/f1.pdf"), SMALL_IMAGE, {
        contentType: "application/pdf",
      })
    );
  });

  it("can only be deleted by the couple, not the uploader or a coordinator", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await uploadBytes(
        ref(ctx.storage(), "photos/wedding/guest-1/f1.jpg"),
        SMALL_IMAGE,
        { contentType: "image/jpeg" }
      );
    });

    const ownerStorage = testEnv.authenticatedContext("guest-1").storage();
    await assertFails(deleteObject(ref(ownerStorage, "photos/wedding/guest-1/f1.jpg")));

    const coordinatorStorage = testEnv
      .authenticatedContext("coordinator-1", { role: "coordinator" })
      .storage();
    await assertFails(deleteObject(ref(coordinatorStorage, "photos/wedding/guest-1/f1.jpg")));

    const coupleStorage = testEnv
      .authenticatedContext("couple-1", { role: "couple" })
      .storage();
    await assertSucceeds(deleteObject(ref(coupleStorage, "photos/wedding/guest-1/f1.jpg")));
  });
});

describe("memories/{ownerUid}/{fileId} — voice notes", () => {
  it("lets a guest write only under their own uid, and refuses read-back", async () => {
    const ownerStorage = testEnv.authenticatedContext("guest-1").storage();
    await assertSucceeds(
      uploadBytes(ref(ownerStorage, "memories/guest-1/note.m4a"), SMALL_AUDIO, {
        contentType: "audio/mp4",
      })
    );

    await assertFails(
      uploadBytes(ref(ownerStorage, "memories/guest-2/note.m4a"), SMALL_AUDIO, {
        contentType: "audio/mp4",
      })
    );

    await assertFails(getBytes(ref(ownerStorage, "memories/guest-1/note.m4a")));
  });

  it("refuses an oversized or non-audio upload", async () => {
    const ownerStorage = testEnv.authenticatedContext("guest-1").storage();
    await assertFails(
      uploadBytes(ref(ownerStorage, "memories/guest-1/big.m4a"), OVER_25MB, {
        contentType: "audio/mp4",
      })
    );
    await assertFails(
      uploadBytes(ref(ownerStorage, "memories/guest-1/note.txt"), SMALL_AUDIO, {
        contentType: "text/plain",
      })
    );
  });

  it("is readable only by the couple, not by a coordinator or the guest who wrote it", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await uploadBytes(
        ref(ctx.storage(), "memories/guest-1/note.m4a"),
        SMALL_AUDIO,
        { contentType: "audio/mp4" }
      );
    });

    const guestStorage = testEnv.authenticatedContext("guest-1").storage();
    await assertFails(getBytes(ref(guestStorage, "memories/guest-1/note.m4a")));

    const coordinatorStorage = testEnv
      .authenticatedContext("coordinator-1", { role: "coordinator" })
      .storage();
    await assertFails(getBytes(ref(coordinatorStorage, "memories/guest-1/note.m4a")));

    const coupleStorage = testEnv
      .authenticatedContext("couple-1", { role: "couple" })
      .storage();
    await assertSucceeds(getBytes(ref(coupleStorage, "memories/guest-1/note.m4a")));
  });
});

describe("catch-all", () => {
  it("denies read and write on any unmatched path, even for the couple", async () => {
    const coupleStorage = testEnv
      .authenticatedContext("couple-1", { role: "couple" })
      .storage();
    await assertFails(getBytes(ref(coupleStorage, "somewhere/else.txt")));
    await assertFails(
      uploadBytes(ref(coupleStorage, "somewhere/else.txt"), SMALL_IMAGE)
    );
  });
});
