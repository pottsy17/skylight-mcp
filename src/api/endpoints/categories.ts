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
 * Find a category by name (case-insensitive partial match)
 * Categories represent family members like "Dad", "Mom", "Kids", etc.
 */
export async function findCategoryByName(name: string): Promise<CategoryResource | undefined> {
  const categories = await getCategories();
  const lowerName = name.toLowerCase();

  return categories.find((cat) => {
    const label = cat.attributes.label?.toLowerCase();
    return label && (label === lowerName || label.includes(lowerName));
  });
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
