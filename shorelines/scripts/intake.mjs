#!/usr/bin/env node
/**
 * The studio's "intake" stage, scoped to this one instance (Core_and_Studio.md:
 * "This is the artifact the studio's intake form produces: fill the form, emit
 * one of these, build an app around it."). Not the five-stage pipeline — there's
 * one couple today, so provisioning/build/deploy automation would be built for
 * zero repeat customers. This just walks the open-items list from CLAUDE.md,
 * shows the current placeholder as a default, and writes straight into
 * wedding.config.ts (and the duplicated party cap in functions/src/index.ts —
 * see Core_and_Studio.md's "Seams still to cut" #1).
 *
 * Run: npm run intake
 * Enter keeps the current value. Nothing is written until you confirm the diff.
 */

import { createInterface } from "node:readline/promises";
import { readFile, writeFile, appendFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const configPath = path.join(root, "src/content/wedding.config.ts");
const functionsPath = path.join(root, "functions/src/index.ts");
const logPath = path.join(root, "docs/intake-log.md");

const EVENTS = [
  { id: "mehendi", label: "Mehendi" },
  { id: "haldi", label: "Haldi" },
  { id: "sangeet", label: "Sangeet" },
  { id: "wedding", label: "Wedding" },
  { id: "reception", label: "Reception" },
];

const EVENT_FIELDS = [
  { field: "venue", label: "venue (full name)" },
  { field: "venueShort", label: "venue (short, for the landing page)" },
  { field: "mapsQuery", label: "Google Maps search text" },
  { field: "dressCode", label: "dress code" },
];

const SPEAKEASY_FIELDS = [
  { field: "name", label: "what it's called" },
  { field: "venue", label: "venue (full name)" },
  { field: "venueShort", label: "venue (short)" },
  { field: "mapsQuery", label: "Google Maps search text" },
  { field: "dressCode", label: "dress code" },
];

export function findBlock(text, idLine) {
  const start = text.indexOf(idLine);
  if (start === -1) throw new Error(`Could not find ${idLine.trim()} in wedding.config.ts`);
  const closeMatch = /\n {4}},/.exec(text.slice(start));
  if (!closeMatch) throw new Error(`Could not find the closing brace after ${idLine.trim()}`);
  const end = start + closeMatch.index + closeMatch[0].length;
  return { start, end, slice: text.slice(start, end) };
}

export function readField(slice, field) {
  const match = new RegExp(`${field}: "([^"]*)"`).exec(slice);
  if (!match) throw new Error(`Could not find field "${field}" in block:\n${slice}`);
  return match[1];
}

export function writeField(slice, field, value) {
  return slice.replace(
    new RegExp(`(${field}: )"[^"]*"`),
    (_, prefix) => `${prefix}${JSON.stringify(value)}`
  );
}

export function applyBlock(text, idLine, updates) {
  const { start, end, slice } = findBlock(text, idLine);
  let patched = slice;
  for (const [field, value] of Object.entries(updates)) {
    patched = writeField(patched, field, value);
  }
  return text.slice(0, start) + patched + text.slice(end);
}

async function main() {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const ask = async (prompt, current) => {
    const answer = (await rl.question(`${prompt}\n  [${current}] > `)).trim();
    return answer === "" ? current : answer;
  };

  let configText = await readFile(configPath, "utf8");
  let functionsText = await readFile(functionsPath, "utf8");

  const changes = []; // { description, apply: (configText) => configText }

  console.log("\n— RSVP deadline —\n");
  {
    const current = /rsvpDeadline: "([^"]*)"/.exec(configText)[1];
    const value = await ask("RSVP deadline (YYYY-MM-DD)", current);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new Error(`"${value}" isn't a YYYY-MM-DD date`);
    }
    if (value !== current) {
      changes.push({
        description: `RSVP deadline: ${current} → ${value}`,
        applyConfig: (t) => t.replace(/rsvpDeadline: "[^"]*"/, `rsvpDeadline: "${value}"`),
      });
    }
  }

  console.log("\n— Party size soft cap —\n");
  {
    const current = /party: \{ softCap: (\d+) \}/.exec(configText)[1];
    const value = await ask("Soft cap on party size per RSVP", current);
    if (!/^\d+$/.test(value) || Number(value) < 1) {
      throw new Error(`"${value}" isn't a positive integer`);
    }
    if (value !== current) {
      changes.push({
        description: `Party size soft cap: ${current} → ${value}`,
        applyConfig: (t) => t.replace(/party: \{ softCap: \d+ \}/, `party: { softCap: ${value} }`),
        applyFunctions: (t) =>
          t.replace(/const PARTY_SIZE_SOFT_CAP = \d+;/, `const PARTY_SIZE_SOFT_CAP = ${value};`),
      });
    }
  }

  for (const event of EVENTS) {
    console.log(`\n— ${event.label} —\n`);
    const idLine = `id: "${event.id}",`;
    const updates = {};
    for (const { field, label } of EVENT_FIELDS) {
      const { slice } = findBlock(configText, idLine);
      const current = readField(slice, field);
      const value = await ask(`${event.label} — ${label}`, current);
      if (value.trim() === "") throw new Error(`${event.label}'s ${field} can't be blank`);
      if (value !== current) updates[field] = value;
    }
    if (Object.keys(updates).length > 0) {
      changes.push({
        description: `${event.label}: ${Object.entries(updates)
          .map(([f, v]) => `${f} → ${v}`)
          .join(", ")}`,
        applyConfig: (t) => applyBlock(t, idLine, updates),
      });
    }
  }

  console.log("\n— The speakeasy (where it is, what it's called) —\n");
  {
    const idLine = `id: "speakeasy",`;
    const updates = {};
    for (const { field, label } of SPEAKEASY_FIELDS) {
      const { slice } = findBlock(configText, idLine);
      const current = readField(slice, field);
      const value = await ask(`Speakeasy — ${label}`, current);
      if (value.trim() === "") throw new Error(`Speakeasy's ${field} can't be blank`);
      if (value !== current) updates[field] = value;
    }
    if (Object.keys(updates).length > 0) {
      changes.push({
        description: `Speakeasy: ${Object.entries(updates)
          .map(([f, v]) => `${f} → ${v}`)
          .join(", ")}`,
        applyConfig: (t) => applyBlock(t, idLine, updates),
      });
    }
  }

  console.log(
    "\n— Domain for the invite link —\n\n(No field for this yet — hosting isn't configured. Recorded in docs/intake-log.md so it isn't lost.)\n"
  );
  let domain = "";
  {
    domain = (await ask("Domain (blank to skip)", "none yet")).trim();
    if (domain === "none yet") domain = "";
  }

  rl.close();

  if (changes.length === 0 && !domain) {
    console.log("\nNo changes.\n");
    return;
  }

  console.log("\n— Summary —\n");
  for (const c of changes) console.log(`  • ${c.description}`);
  if (domain) console.log(`  • Domain noted: ${domain} (not written into code)`);

  const confirmRl = createInterface({ input: process.stdin, output: process.stdout });
  const confirm = (await confirmRl.question("\nWrite these changes? [y/N] ")).trim().toLowerCase();
  confirmRl.close();
  if (confirm !== "y" && confirm !== "yes") {
    console.log("\nNot written.\n");
    return;
  }

  for (const c of changes) {
    if (c.applyConfig) configText = c.applyConfig(configText);
    if (c.applyFunctions) functionsText = c.applyFunctions(functionsText);
  }

  await writeFile(configPath, configText, "utf8");
  await writeFile(functionsPath, functionsText, "utf8");

  await mkdir(path.dirname(logPath), { recursive: true });
  const entry = [
    `## ${new Date().toISOString().slice(0, 10)}`,
    ...changes.map((c) => `- ${c.description}`),
    ...(domain ? [`- Domain noted (not yet wired into code): ${domain}`] : []),
    "",
  ].join("\n");
  await appendFile(logPath, `${entry}\n`, "utf8");

  console.log(
    `\nWritten to wedding.config.ts${changes.some((c) => c.applyFunctions) ? " and functions/src/index.ts" : ""}, logged to docs/intake-log.md.\n` +
      "Rebuild required — this is compiled-in config, not the runtime overlay. If you changed the party cap, remember `cd functions && npm run build`.\n"
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(`\n${err.message}\n`);
    process.exitCode = 1;
  });
}
