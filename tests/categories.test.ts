import { describe, expect, it } from "vitest";

import { matchCategoriesByName } from "../src/api/endpoints/categories.js";
import type { CategoryResource } from "../src/api/types.js";

function cat(id: string, label: string): CategoryResource {
  return { id, type: "category", attributes: { label } } as unknown as CategoryResource;
}

describe("matchCategoriesByName", () => {
  // Regression: "Dad" used to resolve to "Daddy" when Daddy appeared first,
  // assigning events to the wrong family member.
  it("prefers an exact match over an earlier partial match", () => {
    const categories = [cat("1", "Daddy"), cat("2", "Dad")];
    const matches = matchCategoriesByName(categories, "Dad");
    expect(matches).toHaveLength(1);
    expect(matches[0].id).toBe("2");
  });

  it("is case-insensitive on exact matches", () => {
    const categories = [cat("1", "Mom")];
    expect(matchCategoriesByName(categories, "mom")).toHaveLength(1);
  });

  it("returns all partial matches when ambiguous (caller must not guess)", () => {
    const categories = [cat("1", "Kid A"), cat("2", "Kid B")];
    const matches = matchCategoriesByName(categories, "kid");
    expect(matches.map((m) => m.id)).toEqual(["1", "2"]);
  });

  it("falls back to a unique partial match", () => {
    const categories = [cat("1", "Grandma Rose")];
    const matches = matchCategoriesByName(categories, "grandma");
    expect(matches).toHaveLength(1);
  });

  it("returns empty when nothing matches", () => {
    expect(matchCategoriesByName([cat("1", "Mom")], "dad")).toHaveLength(0);
  });
});
