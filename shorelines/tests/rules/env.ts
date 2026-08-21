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

/**
 * The emulator ports from firebase.json, overridable per-run. Someone else's
 * container on 8080 is common enough that hardcoding it makes the suite
 * unrunnable for reasons that have nothing to do with this app; export
 * FIRESTORE_EMULATOR_PORT / STORAGE_EMULATOR_PORT (and point
 * `emulators:exec --config` at a matching file) to move them.
 */
function emulatorPort(name: string, fallback: number): number {
  const raw = process.env[name];
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function makeFirestoreTestEnv(): Promise<RulesTestEnvironment> {
  return initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(path.join(REPO_ROOT, "firestore.rules"), "utf8"),
      host: "127.0.0.1",
      port: emulatorPort("FIRESTORE_EMULATOR_PORT", 8080),
    },
  });
}

export async function makeStorageTestEnv(): Promise<RulesTestEnvironment> {
  return initializeTestEnvironment({
    projectId: PROJECT_ID,
    storage: {
      rules: readFileSync(path.join(REPO_ROOT, "storage.rules"), "utf8"),
      host: "127.0.0.1",
      port: emulatorPort("STORAGE_EMULATOR_PORT", 9199),
    },
  });
}
