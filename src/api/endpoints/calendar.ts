import { getClient } from "../client.js";
import type {
  CalendarEventsResponse,
  CalendarEventResource,
  CategoryResource,
  CalendarEventResponse,
  SourceCalendarsResponse,
  SourceCalendarResource,
  CreateCalendarEventRequest,
  UpdateCalendarEventRequest,
} from "../types.js";

export interface GetCalendarEventsOptions {
  dateMin: string;
  dateMax: string;
  timezone?: string;
  include?: string;
}

/**
 * Add days to a date string in YYYY-MM-DD format
 */
function addDays(dateStr: string, days: number): string {
  const date = new Date(dateStr + "T00:00:00");
  date.setDate(date.getDate() + days);
  return date.toISOString().split("T")[0];
}

/**
 * Get calendar events for a date range
 * Note: The API treats date_max as exclusive, so we add 1 day to include events on the end date
 */
export async function getCalendarEvents(
  options: GetCalendarEventsOptions
): Promise<CalendarEventResource[]> {
  const client = getClient();

  // API treats date_max as exclusive, so add 1 day to include events on the end date
  const adjustedDateMax = addDays(options.dateMax, 1);

  const response = await client.get<CalendarEventsResponse>(
    "/api/frames/{frameId}/calendar_events",
    {
      date_min: options.dateMin,
      date_max: adjustedDateMax,
      timezone: options.timezone ?? client.timezone,
      include: options.include,
    }
  );
  return response.data;
}

export interface GetCalendarEventsWithCategoriesResult {
  events: CalendarEventResource[];
  categories: CategoryResource[];
}

/**
 * Get calendar events plus the family member categories attached to them.
 * Requests include=categories so multi-profile events return every profile
 * (same pattern as getChores).
 */
export async function getCalendarEventsWithCategories(
  options: Omit<GetCalendarEventsOptions, "include">
): Promise<GetCalendarEventsWithCategoriesResult> {
  const client = getClient();

  // API treats date_max as exclusive, so add 1 day to include events on the end date
  const adjustedDateMax = addDays(options.dateMax, 1);

  const response = await client.get<CalendarEventsResponse>(
    "/api/frames/{frameId}/calendar_events",
    {
      date_min: options.dateMin,
      date_max: adjustedDateMax,
      timezone: options.timezone ?? client.timezone,
      include: "categories",
    }
  );
  return {
    events: response.data,
    categories: (response.included ?? []).filter(
      (r): r is CategoryResource => r.type === "category"
    ),
  };
}

/**
 * Category IDs attached to an event. Prefers the full `categories` list and
 * falls back to the single `category` relationship. Pure, exported for tests.
 */
export function eventCategoryIds(event: CalendarEventResource): string[] {
  const many = event.relationships?.categories?.data;
  if (many && many.length > 0) {
    return [...new Set(many.map((r) => r.id))];
  }
  const one = event.relationships?.category?.data;
  return one ? [one.id] : [];
}

/**
 * Get source calendars (connected calendar accounts)
 */
export async function getSourceCalendars(): Promise<SourceCalendarResource[]> {
  const client = getClient();
  const response = await client.get<SourceCalendarsResponse>(
    "/api/frames/{frameId}/source_calendars"
  );
  return response.data;
}

/**
 * Create a calendar event
 */
export async function createCalendarEvent(
  data: CreateCalendarEventRequest
): Promise<CalendarEventResource> {
  const client = getClient();
  const response = await client.post<CalendarEventResponse>(
    "/api/frames/{frameId}/calendar_events",
    data
  );
  return response.data;
}

/**
 * Update a calendar event
 */
export async function updateCalendarEvent(
  eventId: string,
  data: UpdateCalendarEventRequest
): Promise<CalendarEventResource> {
  const client = getClient();
  const response = await client.request<CalendarEventResponse>(
    `/api/frames/{frameId}/calendar_events/${eventId}`,
    { method: "PUT", body: data }
  );
  return response.data;
}

/**
 * Delete a calendar event
 */
export async function deleteCalendarEvent(eventId: string): Promise<void> {
  const client = getClient();
  await client.request(`/api/frames/{frameId}/calendar_events/${eventId}`, {
    method: "DELETE",
  });
}
