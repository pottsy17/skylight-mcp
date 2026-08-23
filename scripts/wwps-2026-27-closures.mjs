#!/usr/bin/env node
// One-off: load WWPS 2026-27 school closures onto the family Skylight frame.
// Source: /Users/pottsy/Desktop/WWPS26-27CalendarAPPROVED121625.pdf (approved 12/16/25).
// Dry-run by default; pass --live to write. Idempotency guard: aborts if any
// "No School" events already exist in the school year unless --force.
//
// Creds: reads the skylight env block from the pre-repoint ~/.claude.json backup
// (the one home those secrets currently live in). Never prints them.

import { readFileSync } from "node:fs";
import { homedir } from "node:os";

const BACKUP = `${homedir()}/.claude.json.bak.before-skylight-repoint`;
const backup = JSON.parse(readFileSync(BACKUP, "utf8"));
const env = backup?.mcpServers?.skylight?.env;
if (!env?.SKYLIGHT_FRAME_ID) {
  console.error(`No skylight env block found in ${BACKUP}`);
  process.exit(1);
}
Object.assign(process.env, env);

const { getCalendarEvents, createCalendarEvent } = await import(
  "../dist/api/endpoints/calendar.js"
);

const DESC = "WWPS 2026-27 calendar (approved 12/16/25)";
const day = (date, reason) => ({ date, title: `No School - ${reason}` });

const CLOSURES = [
  day("2026-09-04", "WWPS (All Students)"),
  day("2026-09-07", "Labor Day"),
  day("2026-10-02", "Professional Day"),
  day("2026-10-08", "Conferences"),
  day("2026-10-09", "Conferences"),
  day("2026-11-11", "Veterans Day"),
  day("2026-11-26", "Thanksgiving Break"),
  day("2026-11-27", "Thanksgiving Break"),
  ...["2026-12-21", "2026-12-22", "2026-12-23", "2026-12-24", "2026-12-25",
      "2026-12-28", "2026-12-29", "2026-12-30", "2026-12-31", "2027-01-01",
  ].map((d) => day(d, "Winter Break")),
  day("2027-01-18", "MLK Jr. Day"),
  day("2027-02-11", "Conferences"),
  day("2027-02-12", "Conferences"),
  day("2027-02-15", "Presidents Day"),
  day("2027-03-19", "Possible Snow Make-up Day"),
  ...["2027-04-05", "2027-04-06", "2027-04-07", "2027-04-08", "2027-04-09",
  ].map((d) => day(d, "Spring Break")),
  day("2027-05-17", "Possible Snow Make-up Day"),
  day("2027-05-31", "Memorial Day"),
];

const live = process.argv.includes("--live");
const force = process.argv.includes("--force");

console.log(`Planned: ${CLOSURES.length} all-day closure events (Sep 2026 - May 2027)`);

// Idempotency guard: look for existing No School events across the school year.
const existing = await getCalendarEvents({
  dateMin: "2026-08-01",
  dateMax: "2027-06-30",
});
const collisions = existing.filter((e) =>
  /no school/i.test(e.attributes?.summary ?? "")
);
if (collisions.length > 0) {
  console.log(`Found ${collisions.length} existing "No School" events:`);
  for (const e of collisions) {
    console.log(`  - ${e.attributes?.starts_at} ${e.attributes?.summary} (ID ${e.id})`);
  }
  if (!force) {
    console.error("Aborting (pass --force to create anyway).");
    process.exit(2);
  }
}
console.log(`Existing events in window: ${existing.length} total, ${collisions.length} No-School collisions.`);

if (!live) {
  for (const c of CLOSURES) console.log(`  ${c.date}  ${c.title}`);
  console.log("\nDry run only. Re-run with --live to create.");
  process.exit(0);
}

const created = [];
const failed = [];
for (const [i, c] of CLOSURES.entries()) {
  try {
    const result = await createCalendarEvent({
      summary: c.title,
      starts_at: c.date,
      ends_at: c.date,
      all_day: true,
      description: DESC,
      timezone: process.env.SKYLIGHT_TIMEZONE,
      kind: "standard",
    });
    created.push(`${c.date}  ${c.title}  ID ${result.id}`);
  } catch (err) {
    failed.push(`${c.date}  ${c.title}  FAILED: ${err?.message ?? err}`);
  }
  if (i < CLOSURES.length - 1) await new Promise((r) => setTimeout(r, 150));
}

console.log(`\nCreated ${created.length}/${CLOSURES.length}.`);
for (const line of failed) console.log("  " + line);

// Read-back verification: the deterministic check.
const after = await getCalendarEvents({ dateMin: "2026-08-01", dateMax: "2027-06-30" });
const noSchool = after.filter((e) => /no school/i.test(e.attributes?.summary ?? ""));
console.log(`Read-back: ${noSchool.length} "No School" events now on the frame (expected ${CLOSURES.length + collisions.length}).`);
process.exit(failed.length > 0 ? 1 : 0);
