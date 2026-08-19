import { readFileSync } from "node:fs";
import path from "node:path";
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";

/**
 * Shared emulator wiring for the rules suites. `firebase emulators:exec`
 * (see package.json's test:emulators) starts firestore/storage on the ports
 * declared in firebase.json before this ever runs — there is no real project
 * involved and nothing here can reach one, since rules-unit-testing only
 * talks to the emulator host/port it's given.
 */
export const PROJECT_ID = "demo-shorelines";

const REPO_ROOT = path.join(__dirname, "..", "..");

export async function makeFirestoreTestEnv(): Promise<RulesTestEnvironment> {
  return initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(path.join(REPO_ROOT, "firestore.rules"), "utf8"),
      host: "127.0.0.1",
      port: 8080,
    },
  });
}

export async function makeStorageTestEnv(): Promise<RulesTestEnvironment> {
  return initializeTestEnvironment({
    projectId: PROJECT_ID,
    storage: {
      rules: readFileSync(path.join(REPO_ROOT, "storage.rules"), "utf8"),
      host: "127.0.0.1",
      port: 9199,
    },
  });
}
