import { getClient } from "../client.js";
import type {
  ChoresResponse,
  ChoreResponse,
  ChoreResource,
  CategoryResource,
} from "../types.js";

export interface GetChoresOptions {
  after?: string;
  before?: string;
  includeLate?: boolean;
  filterLinkedToProfile?: boolean;
  /**
   * Include unassigned "Up For Grabs" chores. The API omits them unless this
   * opt-in flag is sent (captured from the Skylight web app).
   */
  includeUpForGrabs?: boolean;
}

export interface GetChoresResult {
  chores: ChoreResource[];
  categories: CategoryResource[];
}

/**
 * Get chores for a date range
 */
export async function getChores(options: GetChoresOptions = {}): Promise<GetChoresResult> {
  const client = getClient();
  const params: Record<string, string | boolean | undefined> = {
    after: options.after,
    before: options.before,
    include_late: options.includeLate,
    include_up_for_grabs: options.includeUpForGrabs,
  };

  if (options.filterLinkedToProfile) {
    params.filter = "linked_to_profile";
  }

  const response = await client.get<ChoresResponse>(
    "/api/frames/{frameId}/chores",
    params
  );

  return {
    chores: response.data,
    categories: response.included ?? [],
  };
}

export interface CreateChoreOptions {
  summary: string;
  start: string;
  startTime?: string;
  status?: string;
  recurring?: boolean;
  recurrenceSet?: string;
  categoryId?: string;
  /** When true, create the chore in the shared "Up For Grabs" pool (unassigned). */
  upForGrabs?: boolean;
  rewardPoints?: number;
  emojiIcon?: string;
}

/**
 * Create a new chore
 */
export async function createChore(options: CreateChoreOptions): Promise<ChoreResource> {
  const client = getClient();

  // The Skylight API uses a flat request body (not JSON:API format)
  const body: Record<string, unknown> = {
    summary: options.summary,
    start: options.start,
    start_time: options.startTime ?? null,
    recurring: options.recurring ?? false,
    reward_points: options.rewardPoints ?? null,
    emoji_icon: options.emojiIcon ?? null,
  };

  if (options.upForGrabs) {
    // "Up For Grabs" chores are unassigned: send the flag and omit any category.
    body.up_for_grabs = true;
  } else if (options.categoryId) {
    body.category_id = options.categoryId;
    body.category_ids = [options.categoryId];
  }

  if (options.recurrenceSet) {
    body.recurrence_set = [options.recurrenceSet];
  }

  // create_multiple returns { data: ChoreResource[] }
  const response = await client.post<{ data: ChoreResource[] }>(
    "/api/frames/{frameId}/chores/create_multiple",
    body
  );

  return response.data[0];
}

export interface UpdateChoreOptions {
  summary?: string;
  start?: string;
  startTime?: string | null;
  status?: string;
  recurring?: boolean;
  recurrenceSet?: string | null;
  categoryId?: string | null;
  rewardPoints?: number | null;
  emojiIcon?: string | null;
}

/**
 * Update an existing chore
 */
export async function updateChore(
  choreId: string,
  options: UpdateChoreOptions
): Promise<ChoreResource> {
  const client = getClient();

  // The Skylight PUT endpoint expects a FLAT request body (not JSON:API
  // format). A wrapped { data: { type, attributes } } body is accepted with a
  // 200 but silently applies nothing. (Found and verified live by @dperox in
  // rjhalvorson/skylight-mcp#11 and @bobbymarko in #10.)
  const body: Record<string, unknown> = {};

  if (options.summary !== undefined) body.summary = options.summary;
  if (options.start !== undefined) body.start = options.start;
  if (options.startTime !== undefined) body.start_time = options.startTime;
  // The API's completed value is "complete", not "completed".
  if (options.status !== undefined) {
    body.status = options.status === "completed" ? "complete" : options.status;
  }
  if (options.recurring !== undefined) body.recurring = options.recurring;
  if (options.recurrenceSet !== undefined) body.recurrence_set = options.recurrenceSet;
  if (options.rewardPoints !== undefined) body.reward_points = options.rewardPoints;
  if (options.emojiIcon !== undefined) body.emoji_icon = options.emojiIcon;

  // Reassignment: the flat body takes category_id / category_ids directly.
  if (options.categoryId !== undefined) {
    body.category_id = options.categoryId;
    body.category_ids = options.categoryId === null ? [] : [options.categoryId];
  }

  const url = `/api/frames/{frameId}/chores/${choreId}`;

  // The API rejects (400) a PUT that changes the completion status AND other
  // attributes in the same request, so split into two sequential requests.
  const { status, ...rest } = body;
  let response: ChoreResponse | undefined;

  if (Object.keys(rest).length > 0) {
    response = await client.request<ChoreResponse>(url, { method: "PUT", body: rest });
  }
  if (status !== undefined) {
    response = await client.request<ChoreResponse>(url, { method: "PUT", body: { status } });
  }
  // No fields provided: a no-op PUT still returns the current chore.
  if (!response) {
    response = await client.request<ChoreResponse>(url, { method: "PUT", body: {} });
  }

  return response.data;
}

export interface UpdateChoreTemplateOptions {
  summary?: string;
  reward_points?: number | null;
  emoji_icon?: string | null;
  recurrence_set?: string | null;
  category_id?: string | null;
}

/**
 * Update a recurring chore template without splitting the series.
 *
 * Uses PATCH with a flat body on the base template ID (no date suffix).
 * This updates all future instances of the recurring series, unlike PUT
 * on an instance ID which splits the series.
 */
export async function updateChoreTemplate(
  templateId: string,
  attrs: UpdateChoreTemplateOptions
): Promise<ChoreResource> {
  const client = getClient();
  const body: Record<string, unknown> = {};

  if (attrs.summary !== undefined) body.summary = attrs.summary;
  if (attrs.reward_points !== undefined) body.reward_points = attrs.reward_points;
  if (attrs.emoji_icon !== undefined) body.emoji_icon = attrs.emoji_icon;
  if (attrs.recurrence_set !== undefined) body.recurrence_set = attrs.recurrence_set;
  if (attrs.category_id !== undefined) body.category_id = attrs.category_id;

  const response = await client.request<ChoreResponse>(
    `/api/frames/{frameId}/chores/${templateId}`,
    { method: "PATCH", body }
  );

  return response.data;
}

/**
 * Delete a chore
 */
export async function deleteChore(choreId: string, applyTo?: string): Promise<void> {
  const client = getClient();
  const url = applyTo
    ? `/api/frames/{frameId}/chores/${choreId}?apply_to=${encodeURIComponent(applyTo)}`
    : `/api/frames/{frameId}/chores/${choreId}`;
  await client.request(url, { method: "DELETE" });
}
