#!/usr/bin/env node
// Pre-release live check for 2.3.0: (1) get_calendar_events family members,
// (2) update_chore actually persists. Run from the repo after `npm run build`:
//   node scripts/live-check.mjs
// Prompts for login (password hidden, nothing saved). The chore test marks one
// pending chore done, reads it back, then sets it back to pending.
import { createInterface } from "node:readline";

function ask(question, { hidden = false } = {}) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      rl._writeToOutput = (s) => {
        if (s.startsWith(question)) rl.output.write(question);
      };
    }
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write("\n");
      resolve(answer.trim());
    });
  });
}

const ymd = (d) => d.toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });

console.log("Skylight live check (nothing you type is saved)\n");
process.env.SKYLIGHT_EMAIL = await ask("Skylight email: ");
process.env.SKYLIGHT_PASSWORD = await ask("Skylight password (hidden): ", { hidden: true });
process.env.SKYLIGHT_FRAME_ID = await ask(
  "Frame ID (the number after /frames/ in the app.ourskylight.com address): "
);
process.env.SKYLIGHT_TIMEZONE = "America/Los_Angeles";

const D = new URL("../dist/", import.meta.url).href;
const { getCalendarEventsWithCategories, eventCategoryIds } = await import(`${D}api/endpoints/calendar.js`);
const { getCategories } = await import(`${D}api/endpoints/categories.js`);
const { getChores, updateChore } = await import(`${D}api/endpoints/chores.js`);
const { formatEventMembers } = await import(`${D}tools/calendar.js`);

let ok = true;

// 1. Calendar: who's on each event, next 7 days
const today = ymd(new Date());
const weekOut = ymd(new Date(Date.now() + 6 * 864e5));
const { events, categories } = await getCalendarEventsWithCategories({ dateMin: today, dateMax: weekOut });
const labels = new Map(categories.map((c) => [c.id, c.attributes.label]));
for (const c of await getCategories()) if (!labels.has(c.id)) labels.set(c.id, c.attributes.label);

console.log(`\n=== 1. Calendar, ${today} to ${weekOut}: ${events.length} events ===`);
let multi = 0;
for (const e of events) {
  const ids = eventCategoryIds(e);
  if (ids.length > 1) multi++;
  const when = String(e.attributes.starts_at ?? "").slice(0, 16).replace("T", " ");
  console.log(`- ${when}  ${e.attributes.summary}\n    ${formatEventMembers(ids, labels)}`);
}
console.log(`\n${multi} event(s) with 2+ people. Compare these names to the frame.`);
if (events.length === 0) console.log("(No events this week, so nothing to compare. Not a failure.)");

// 2. Chores: mark one done, read back, put it back
console.log("\n=== 2. Chore update ===");
const { chores } = await getChores({ after: today, before: weekOut, includeLate: true, includeUpForGrabs: true });
// Up For Grabs chores can't change status until claimed (API 422), so skip them.
const pending = chores.find((c) => c.attributes.status === "pending" && !c.attributes.up_for_grabs);
if (!pending) {
  console.log("No assigned, not-done chores this week to test with (Up For Grabs can't be). Skipped.");
} else {
  const name = pending.attributes.summary;
  const go = await ask(`Test on "${name}" (${pending.attributes.start})? It gets set back after. [y/N] `);
  if (go.toLowerCase() === "y") {
    const statusNow = async () => {
      const r = await getChores({ after: today, before: weekOut, includeLate: true, includeUpForGrabs: true });
      return r.chores.find((c) => c.id === pending.id)?.attributes.status;
    };
    await updateChore(pending.id, { status: "completed" });
    const after = await statusNow();
    const pass = after === "complete";
    ok &&= pass;
    console.log(`Marked done -> API now says "${after}": ${pass ? "PASS" : "FAIL"}`);
    await updateChore(pending.id, { status: "pending" });
    const back = await statusNow();
    ok &&= back === "pending";
    console.log(`Set back -> API now says "${back}": ${back === "pending" ? "PASS" : "FAIL (fix it on the frame)"}`);
  } else {
    console.log("Skipped.");
  }
}

console.log(ok ? "\nALL GOOD. Tell Claude: ready to publish." : "\nSomething FAILED. Paste this output to Claude.");
