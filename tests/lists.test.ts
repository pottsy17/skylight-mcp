import { describe, expect, it } from "vitest";

import { matchItemsByLabel } from "../src/tools/lists.js";

function item(id: string, label: string | null) {
  return { id, attributes: { label } };
}

describe("matchItemsByLabel", () => {
  const items = [
    item("1", "Milk"),
    item("2", "2% Milk"),
    item("3", "Bread"),
    item("4", "Sourdough bread"),
    item("5", null),
  ];

  it("prefers an exact match over partial matches", () => {
    const matches = matchItemsByLabel(items, "milk");
    expect(matches).toHaveLength(1);
    expect(matches[0].id).toBe("1");
  });

  it("is case-insensitive", () => {
    const matches = matchItemsByLabel(items, "MILK");
    expect(matches).toHaveLength(1);
    expect(matches[0].id).toBe("1");
  });

  it("falls back to partial matches when no exact match exists", () => {
    const matches = matchItemsByLabel(items, "sourdough");
    expect(matches).toHaveLength(1);
    expect(matches[0].id).toBe("4");
  });

  it("returns all partial matches when ambiguous", () => {
    const matches = matchItemsByLabel(items, "read");
    expect(matches.map((m) => m.id)).toEqual(["3", "4"]);
  });

  it("returns empty for no match", () => {
    expect(matchItemsByLabel(items, "eggs")).toHaveLength(0);
  });

  it("ignores items with no label", () => {
    expect(matchItemsByLabel([item("9", null)], "milk")).toHaveLength(0);
  });

  it("returns multiple exact matches when the list has duplicates", () => {
    const dupes = [item("1", "Milk"), item("2", "milk")];
    const matches = matchItemsByLabel(dupes, "Milk");
    expect(matches.map((m) => m.id)).toEqual(["1", "2"]);
  });
});
