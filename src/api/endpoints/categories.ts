import { getClient } from "../client.js";
import type { CategoriesResponse, CategoryResource } from "../types.js";

// Cache for categories (family members)
let categoriesCache: CategoryResource[] | null = null;

/**
 * Get all categories (family members/profiles)
 */
export async function getCategories(useCache = true): Promise<CategoryResource[]> {
  if (useCache && categoriesCache) {
    return categoriesCache;
  }

  const client = getClient();
  const response = await client.get<CategoriesResponse>("/api/frames/{frameId}/categories");
  categoriesCache = response.data;
  return response.data;
}

/**
 * Clear the categories cache
 */
export function clearCategoriesCache(): void {
  categoriesCache = null;
}

/**
 * Match categories by name, case-insensitively. Exact matches win over
 * partial matches so "Dad" never resolves to "Daddy" when both exist.
 * Pure function, exported for tests.
 */
export function matchCategoriesByName(categories: CategoryResource[], name: string): CategoryResource[] {
  const lower = name.toLowerCase();
  const exact = categories.filter((cat) => cat.attributes.label?.toLowerCase() === lower);
  if (exact.length > 0) {
    return exact;
  }
  return categories.filter((cat) => cat.attributes.label?.toLowerCase().includes(lower));
}

/**
 * Find a category by name (case-insensitive, exact-over-partial).
 * Categories represent family members like "Dad", "Mom", "Kids", etc.
 * Returns undefined when nothing matches OR when a partial match is
 * ambiguous — a destructive or assignment write must never guess.
 */
export async function findCategoryByName(name: string): Promise<CategoryResource | undefined> {
  const categories = await getCategories();
  const matches = matchCategoriesByName(categories, name);
  return matches.length === 1 ? matches[0] : undefined;
}

/**
 * Result of resolving category names to IDs
 */
export interface CategoryNameResolution {
  ids: string[];
  unresolved: string[];
  available: string[];
}

/**
 * Resolve a list of category (family member) names to category IDs.
 * Names that don't match are returned in `unresolved`; `available` lists
 * all category labels so callers can build a helpful error message.
 */
export async function resolveCategoryNames(names: string[]): Promise<CategoryNameResolution> {
  const ids: string[] = [];
  const unresolved: string[] = [];

  for (const name of names) {
    const match = await findCategoryByName(name);
    if (match) {
      ids.push(match.id);
    } else {
      unresolved.push(name);
    }
  }

  const categories = await getCategories();
  return {
    ids,
    unresolved,
    available: categories.map((c) => c.attributes.label ?? c.id),
  };
}

/**
 * Get categories that are linked to profiles (actual family members)
 */
export async function getFamilyMembers(): Promise<CategoryResource[]> {
  const categories = await getCategories();
  return categories.filter((cat) => cat.attributes.linked_to_profile);
}

/**
 * Get categories selected for the chore chart
 */
export async function getChoreChartCategories(): Promise<CategoryResource[]> {
  const categories = await getCategories();
  return categories.filter((cat) => cat.attributes.selected_for_chore_chart);
}
