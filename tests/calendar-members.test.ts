import { describe, it, expect } from "vitest";
import { eventCategoryIds } from "../src/api/endpoints/calendar.js";
import { formatEventMembers } from "../src/tools/calendar.js";
import type { CalendarEventResource } from "../src/api/types.js";

function event(relationships?: CalendarEventResource["relationships"]): CalendarEventResource {
  return { type: "calendar_event", id: "e1", attributes: { summary: "Dentist" }, relationships };
}

describe("eventCategoryIds", () => {
  it("returns every profile from the categories list (include=categories)", () => {
    const e = event({
      category: { data: { type: "category", id: "1" } },
      categories: { data: [{ type: "category", id: "1" }, { type: "category", id: "2" }] },
    });
    expect(eventCategoryIds(e)).toEqual(["1", "2"]);
  });

  it("falls back to the single category relationship", () => {
    expect(eventCategoryIds(event({ category: { data: { type: "category", id: "7" } } }))).toEqual(["7"]);
  });

  it("de-duplicates repeated IDs", () => {
    const e = event({ categories: { data: [{ type: "category", id: "3" }, { type: "category", id: "3" }] } });
    expect(eventCategoryIds(e)).toEqual(["3"]);
  });

  it("returns [] when the event has no profile", () => {
    expect(eventCategoryIds(event())).toEqual([]);
    expect(eventCategoryIds(event({ category: { data: null }, categories: { data: [] } }))).toEqual([]);
  });
});

describe("formatEventMembers", () => {
  const labels = new Map<string, string | null>([["1", "Alex"], ["2", "Sam"], ["9", null]]);

  it("names each member with its ID", () => {
    expect(formatEventMembers(["1", "2"], labels)).toBe("Family members: Alex (ID: 1), Sam (ID: 2)");
  });

  it("shows the bare ID when the name is unknown or blank", () => {
    expect(formatEventMembers(["1", "5", "9"], labels)).toBe("Family members: Alex (ID: 1), ID 5, ID 9");
  });

  it("flags profile-less events", () => {
    expect(formatEventMembers([], labels)).toMatch(/^Family members: none/);
  });
});
