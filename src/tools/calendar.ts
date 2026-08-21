import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import {
  getCalendarEvents,
  getSourceCalendars,
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
} from "../api/endpoints/calendar.js";
import { getTodayDate, parseDate, formatDateForDisplay, normalizeDateTime } from "../utils/dates.js";
import { formatErrorForMcp } from "../utils/errors.js";
import { getConfig } from "../config.js";

/**
 * Render a multi-line confirmation message for a created or updated event.
 * Echoes the resolved fields (including normalized datetimes) so callers can
 * verify what the server actually stored without a follow-up read.
 */
function formatEventConfirmation(
  verb: "Created" | "Updated",
  event: { id: string; attributes?: Record<string, unknown> }
): string {
  const attrs = (event.attributes ?? {}) as Record<string, unknown>;
  const lines = [`${verb} calendar event (ID: ${event.id})`];
  const summary = attrs.summary as string | undefined;
  if (summary) lines.push(`  Title: ${summary}`);
  const startsAt = attrs.starts_at as string | undefined;
  if (startsAt) lines.push(`  Starts: ${startsAt}`);
  const endsAt = attrs.ends_at as string | undefined;
  if (endsAt) lines.push(`  Ends: ${endsAt}`);
  if (attrs.all_day === true) lines.push(`  All-day: yes`);
  const location = attrs.location as string | undefined;
  if (location) lines.push(`  Location: ${location}`);
  return lines.join("\n");
}

export function registerCalendarTools(server: McpServer): void {
  // get_calendar_events tool
  server.tool(
    "get_calendar_events",
    `Get calendar events from Skylight.

Use this to answer questions like:
- "What's on my calendar today?"
- "What do we have scheduled this weekend?"
- "Are there any events on Friday?"

Returns a list of events with their titles, times, and details.`,
    {
      date: z
        .string()
        .optional()
        .describe("Start date (YYYY-MM-DD or 'today', 'tomorrow', day name). Defaults to today."),
      dateEnd: z
        .string()
        .optional()
        .describe("End date (YYYY-MM-DD). Defaults to same as start date."),
    },
    async ({ date, dateEnd }) => {
      try {
        const config = getConfig();
        const startDate = date ? parseDate(date, config.timezone) : getTodayDate(config.timezone);
        const endDate = dateEnd ? parseDate(dateEnd, config.timezone) : startDate;

        const events = await getCalendarEvents({
          dateMin: startDate,
          dateMax: endDate,
          timezone: config.timezone,
        });

        if (events.length === 0) {
          const dateRange =
            startDate === endDate
              ? formatDateForDisplay(startDate)
              : `${formatDateForDisplay(startDate)} to ${formatDateForDisplay(endDate)}`;
          return {
            content: [
              {
                type: "text" as const,
                text: `No calendar events found for ${dateRange}.`,
              },
            ],
          };
        }

        // Format events for display
        const eventList = events
          .map((event) => {
            const attrs = event.attributes;
            const parts: string[] = [];

            // Add all available attributes
            for (const [key, value] of Object.entries(attrs)) {
              if (value !== null && value !== undefined) {
                parts.push(`  ${key}: ${value}`);
              }
            }

            return `- Event (ID: ${event.id})\n${parts.join("\n")}`;
          })
          .join("\n\n");

        const dateRange =
          startDate === endDate
            ? formatDateForDisplay(startDate)
            : `${formatDateForDisplay(startDate)} to ${formatDateForDisplay(endDate)}`;

        return {
          content: [
            {
              type: "text" as const,
              text: `Calendar events for ${dateRange}:\n\n${eventList}`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: formatErrorForMcp(error),
            },
          ],
          isError: true,
        };
      }
    }
  );

  // get_source_calendars tool
  server.tool(
    "get_source_calendars",
    `Get connected calendar sources synced to Skylight.

Use this to answer:
- "Which calendars are synced to Skylight?"
- "What calendar accounts are connected?"

Returns a list of connected calendar sources (Google, iCloud, etc.).`,
    {},
    async () => {
      try {
        const calendars = await getSourceCalendars();

        if (calendars.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: "No calendar sources are connected to Skylight.",
              },
            ],
          };
        }

        const calendarList = calendars
          .map((cal) => {
            const attrs = cal.attributes;
            const parts: string[] = [`- Calendar (ID: ${cal.id})`];

            for (const [key, value] of Object.entries(attrs)) {
              if (value !== null && value !== undefined) {
                parts.push(`  ${key}: ${value}`);
              }
            }

            return parts.join("\n");
          })
          .join("\n\n");

        return {
          content: [
            {
              type: "text" as const,
              text: `Connected calendar sources:\n\n${calendarList}`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: formatErrorForMcp(error),
            },
          ],
          isError: true,
        };
      }
    }
  );

  // create_calendar_event tool
  server.tool(
    "create_calendar_event",
    `Create a new calendar event in Skylight.

Use this when:
- Scheduling a new event: "Add a dentist appointment on Friday at 2pm"
- Creating family activities: "Schedule soccer practice every Saturday at 10am"
- Adding reminders: "Put Mom's birthday on the calendar"

Parameters:
- summary (required): Event title (e.g., "Dentist Appointment")
- startsAt (required): Start time in ISO format or natural language
- endsAt (required): End time in ISO format or natural language
- allDay: Set to true for all-day events
- description: Additional notes for the event
- location: Where the event takes place
- categoryIds: Family member IDs to associate with the event

Returns: The created event details.

Notes:
- Datetime values without a timezone designator (e.g. "2026-05-28T19:45:00")
  are interpreted in the frame's configured timezone. Pass an explicit offset
  (e.g. "...T19:45:00-07:00") to override.
- To sync events to a connected Google/iCloud calendar, pass both calendarId
  and calendarAccountId. Use get_source_calendars to discover valid IDs.
  Without these, events are stored on Skylight only and do not sync back to
  the source calendar provider.

Related: Use get_family_members to get category IDs for assignments.`,
    {
      summary: z.string().describe("Event title (e.g., 'Dentist Appointment')"),
      startsAt: z
        .string()
        .describe(
          "Start time (ISO format like '2025-01-15T14:00:00'; without an offset, interpreted in the frame timezone)"
        ),
      endsAt: z
        .string()
        .describe(
          "End time (ISO format like '2025-01-15T15:00:00'; without an offset, interpreted in the frame timezone)"
        ),
      allDay: z.boolean().optional().default(false).describe("True for all-day events"),
      description: z.string().optional().describe("Additional notes for the event"),
      location: z.string().optional().describe("Event location"),
      categoryIds: z.array(z.string()).optional().describe("Family member IDs to assign"),
      calendarId: z
        .string()
        .optional()
        .describe(
          "Source calendar ID to sync the event to (e.g., a Google Calendar ID). Use get_source_calendars to discover. Required together with calendarAccountId for two-way sync."
        ),
      calendarAccountId: z
        .string()
        .optional()
        .describe(
          "Skylight calendar account ID associated with the source calendar. Use get_source_calendars to discover. Required together with calendarId for two-way sync."
        ),
      timezone: z
        .string()
        .optional()
        .describe(
          "Event timezone (e.g., 'America/Los_Angeles'). Defaults to the frame's configured timezone."
        ),
      rrule: z
        .array(z.string())
        .nullable()
        .optional()
        .describe("Recurrence rules in RRULE format (e.g., ['FREQ=WEEKLY;BYDAY=MO,WE,FR'])."),
      countdownEnabled: z
        .boolean()
        .optional()
        .describe("Show a countdown for this event on the frame."),
      kind: z
        .string()
        .optional()
        .describe("Event kind (e.g., 'standard', 'birthday'). Defaults to 'standard'."),
    },
    async ({
      summary,
      startsAt,
      endsAt,
      allDay,
      description,
      location,
      categoryIds,
      calendarId,
      calendarAccountId,
      timezone,
      rrule,
      countdownEnabled,
      kind,
    }) => {
      try {
        const config = getConfig();
        const event = await createCalendarEvent({
          summary,
          starts_at: normalizeDateTime(startsAt, config.timezone),
          ends_at: normalizeDateTime(endsAt, config.timezone),
          all_day: allDay,
          description,
          location,
          category_ids: categoryIds,
          calendar_id: calendarId,
          calendar_account_id: calendarAccountId,
          timezone: timezone ?? config.timezone,
          rrule,
          countdown_enabled: countdownEnabled,
          kind: kind ?? "standard",
        });

        return {
          content: [
            {
              type: "text" as const,
              text: formatEventConfirmation("Created", event),
            },
          ],
        };
      } catch (error) {
        return {
          content: [{ type: "text" as const, text: formatErrorForMcp(error) }],
          isError: true,
        };
      }
    }
  );

  // update_calendar_event tool
  server.tool(
    "update_calendar_event",
    `Update an existing calendar event.

Use this when:
- Changing event time: "Move the dentist appointment to 3pm"
- Updating event details: "Add location to the meeting"
- Renaming an event: "Change 'Doctor' to 'Dr. Smith checkup'"

Parameters:
- eventId (required): ID of the event to update (from get_calendar_events)
- summary: New title for the event
- startsAt: New start time (ISO format)
- endsAt: New end time (ISO format)
- description: Updated notes
- location: Updated location
- categoryIds: Updated family member assignments

Returns: The updated event details.

Notes:
- Datetime values without a timezone designator are interpreted in the frame's
  configured timezone. Pass an explicit offset to override.
- To move an event between source calendars, update both calendarId and
  calendarAccountId together (use get_source_calendars to discover valid
  IDs).`,
    {
      eventId: z.string().describe("ID of the event to update"),
      summary: z.string().optional().describe("New event title"),
      startsAt: z
        .string()
        .optional()
        .describe("New start time (ISO format; without an offset, interpreted in the frame timezone)"),
      endsAt: z
        .string()
        .optional()
        .describe("New end time (ISO format; without an offset, interpreted in the frame timezone)"),
      allDay: z.boolean().optional().describe("Change to all-day event"),
      description: z.string().optional().describe("Updated notes"),
      location: z.string().optional().describe("Updated location"),
      categoryIds: z.array(z.string()).optional().describe("Updated family member assignments"),
      calendarId: z
        .string()
        .optional()
        .describe(
          "Source calendar ID to associate the event with (from get_source_calendars). Pair with calendarAccountId."
        ),
      calendarAccountId: z
        .string()
        .optional()
        .describe(
          "Skylight calendar account ID associated with the source calendar (from get_source_calendars). Pair with calendarId."
        ),
      timezone: z.string().optional().describe("Updated event timezone (e.g., 'America/Los_Angeles')."),
      rrule: z
        .array(z.string())
        .nullable()
        .optional()
        .describe("Updated recurrence rules in RRULE format (or null to clear)."),
      countdownEnabled: z
        .boolean()
        .optional()
        .describe("Toggle the countdown display for this event."),
      kind: z.string().optional().describe("Updated event kind (e.g., 'standard', 'birthday')."),
    },
    async ({
      eventId,
      summary,
      startsAt,
      endsAt,
      allDay,
      description,
      location,
      categoryIds,
      calendarId,
      calendarAccountId,
      timezone,
      rrule,
      countdownEnabled,
      kind,
    }) => {
      try {
        const config = getConfig();
        const updates: Record<string, unknown> = {};
        if (summary !== undefined) updates.summary = summary;
        if (startsAt !== undefined) updates.starts_at = normalizeDateTime(startsAt, config.timezone);
        if (endsAt !== undefined) updates.ends_at = normalizeDateTime(endsAt, config.timezone);
        if (allDay !== undefined) updates.all_day = allDay;
        if (description !== undefined) updates.description = description;
        if (location !== undefined) updates.location = location;
        if (categoryIds !== undefined) updates.category_ids = categoryIds;
        if (calendarId !== undefined) updates.calendar_id = calendarId;
        if (calendarAccountId !== undefined) updates.calendar_account_id = calendarAccountId;
        if (timezone !== undefined) updates.timezone = timezone;
        if (rrule !== undefined) updates.rrule = rrule;
        if (countdownEnabled !== undefined) updates.countdown_enabled = countdownEnabled;
        if (kind !== undefined) updates.kind = kind;

        const event = await updateCalendarEvent(eventId, updates);

        return {
          content: [
            {
              type: "text" as const,
              text: formatEventConfirmation("Updated", event),
            },
          ],
        };
      } catch (error) {
        return {
          content: [{ type: "text" as const, text: formatErrorForMcp(error) }],
          isError: true,
        };
      }
    }
  );

  // delete_calendar_event tool
  server.tool(
    "delete_calendar_event",
    `Delete a calendar event from Skylight.

Use this when:
- Canceling an event: "Remove the dentist appointment"
- Deleting old events: "Delete the meeting from yesterday"

Parameters:
- eventId (required): ID of the event to delete (from get_calendar_events)

Note: This permanently removes the event. For recurring events, this may only delete one instance.`,
    {
      eventId: z.string().describe("ID of the event to delete"),
    },
    async ({ eventId }) => {
      try {
        await deleteCalendarEvent(eventId);
        return {
          content: [
            {
              type: "text" as const,
              text: `Deleted calendar event (ID: ${eventId})`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [{ type: "text" as const, text: formatErrorForMcp(error) }],
          isError: true,
        };
      }
    }
  );
}
