# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.3.0] - 2026-10-02

### Added

- **`get_calendar_events` now says who each event is for.** Every event gets a `Family members: Alex (ID: 123), Sam (ID: 456)` line, so an assistant can answer "who's going?" without guessing from titles. Events are requested with `include=categories`: without it the API returns only one `category` per event even when several profiles are attached. Events with no profile are flagged, since Skylight hides them. Reported in [rjhalvorson/skylight-mcp#12](https://github.com/rjhalvorson/skylight-mcp/issues/12) by @amitkoren, whose write-up documented the `include=categories` quirk.

### Fixed

- **Marking a chore done (or editing it) now actually changes it.** `update_chore` sent a JSON:API-wrapped PUT body that Skylight accepts with a 200 and ignores, so completions and edits silently did nothing. The body is now flat (like `create_chore`), the tool's `"completed"` maps to the API's `"complete"`, and a status change is sent separately from other edits (the API rejects both in one request with a 400). `get_chores` with `status: "completed"` now matches what the API returns. Found and verified live by @dperox ([rjhalvorson/skylight-mcp#11](https://github.com/rjhalvorson/skylight-mcp/pull/11)) and @bobbymarko ([#10](https://github.com/rjhalvorson/skylight-mcp/pull/10)); ported here with credit.

## [2.2.3] - 2026-08-22

### Fixed

- **All-day events are no longer invisible in the month view.** Skylight stores all-day events as start-midnight → next-day-midnight (exclusive end) and the month view draws the bar from that span, so the zero-duration all-day events the create tools produced from date-only input (start == end) showed in week/agenda views but rendered nowhere in the month grid. The server also silently floors any non-midnight end back to midnight, so end-of-day workarounds revert. Both create tools now expand a date-only `endsAt` on all-day events to the next day automatically; `endsAt` is documented as the last day of the event, inclusive (a one-day event has `startsAt == endsAt`).

## [2.2.2] - 2026-08-22

### Changed

- **Calendar creates now require at least one profile** (`categoryNames` or `categoryIds`), on both `create_calendar_event` and `create_calendar_events`. Skylight's calendar views hide any event that belongs to no profile — even with every profile selected in the filter — so a profile-less create produced an event that existed in the API but rendered nowhere in the app or on the frame (found live loading a 30-event school calendar that all landed invisible). Skylight's own web app refuses to create such events; the MCP now enforces the same rule with an explicit error instead of a silent no-show. Fix existing invisible events by adding profiles with `update_calendar_event`.

## [2.2.1] - 2026-08-21

Hardening release from an independent pre-publish review (Codex, cross-vendor). Six blocking findings, all fixed and regression-tested; v2.2.0 was never published to npm.

### Fixed

- **Name resolution can no longer guess on destructive or assignment writes.** Category (family member) and list name matching is now exact-over-partial with ambiguity rejection everywhere — previously "Dad" could resolve to "Daddy", and a partial list name could target the wrong list for update/delete. Ambiguous names return the candidates instead of acting. When an explicit ID is passed, confirmations no longer echo an unverified label alongside it.
- **DST transition-day offsets.** Offset detection treated the wall-clock time as a UTC instant, so times from 02:00–09:59 on spring-forward day got the standard-time offset (events one hour late). Now a two-pass fixed-point; only the nonexistent spring-forward hour itself remains approximate.
- **`timezone` parameter is respected for naive datetimes.** create/update/bulk normalized naive times with the frame timezone even when the caller passed a different `timezone`, producing an offset that contradicted the requested zone.
- **Bulk create stops on rate limiting.** A 429 mid-batch now aborts the remainder and reports it as retryable "skipped" instead of hammering the API with the rest of the batch.
- **OAuth session cookies are origin-locked.** The login flow's cookie jar now refuses to send Skylight session cookies to any origin other than app.ourskylight.com, closing a redirect-following path that could have replayed them cross-origin.
- **Empty GET responses raise instead of masquerading as empty data.** The empty-body tolerance added in 2.1.1 for DELETEs no longer applies to GETs, where an empty 200 is a server anomaly, not "no results".

### Changed

- Bulk create reports lead with "⚠ PARTIAL" when any event failed.
- The login log line masks the account email.

## [2.2.0] - 2026-08-21

### Added

- **`create_calendar_events` — bulk event creation.** Create up to 200 events in one call (a school year, a season schedule, a birthday list). Shared assignment options (`categoryNames`/`categoryIds`, source calendar, timezone, kind) apply to the whole batch. Events are created sequentially with a small delay; **one failure never aborts the rest** — the result reports every created event with its ID and every failure with its reason, so a partial batch is repairable instead of mysterious. Verified live: 3 created → 3 read back → 3 deleted.
- **`get_messages` — read the frame's message/photo feed.** First message support in any version of this MCP. Read-only: the send path has never been captured from a real client, and this project does not guess at write endpoints (see 2.1.1's `include_up_for_grabs` for why capture beats probing).

## [2.1.2] - 2026-08-21

### Fixed

- **Plus detection reported every account as Plus.** Subscription tier was inferred by substring-matching the `/api/plus_access` payload for patterns (`"subscription_status":"plus"`, `"plus":true`, `"has_access":true`) that do not appear in its actual response, then **defaulting to `"plus"` on no match** — so basic accounts were detected as Plus and the server registered rewards, meals, and photos tools that 403 at call time. Detection now reads `data.attributes.subscription_status` from `/api/user` (which states the tier outright, including the previously-unhandled value `"basic"`), falls back to the structured entitlement fields on `/api/plus_access` (`subscriptions`, `shares`, `bundle_entitlement.available`) rather than string matching, and **fails closed** — it never assumes Plus when uncertain. Verified against a live basic account; 9 regression tests added.

## [2.1.1] - 2026-08-21

### Fixed

- **`get_chores` now returns "Up For Grabs" chores.** 2.1.0 could create them but not read them back; the chores endpoint omits unassigned chores unless an opt-in `include_up_for_grabs=true` query parameter is sent — undocumented, absent from the OpenAPI spec, and not discoverable by probing (we tried `filter=up_for_grabs`, date windows, and version headers, all negative). Captured from the Skylight web app's own request. `get_chores` sends it by default and labels the results; opt out with `includeUpForGrabs: false`. Verified end-to-end on a live frame: create → visible with flag → absent without it → delete → gone.

## [2.1.0] - 2026-08-20

First release as `@drpottsy/skylight-mcp` — a maintained continuation of `@rjhalvorson/skylight-mcp` (see README note). Everything below plus the previously-unreleased fixes from the upstream PR queue.

### Added

- **"Up For Grabs" chore support** (upstream issue [#5](https://github.com/rjhalvorson/skylight-mcp/issues/5), implemented from the captured request in that issue — thanks to its author). `create_chore` accepts `upForGrabs: true` to create an unassigned chore any family member can claim; `assignee` is now optional (required unless `upForGrabs`). Verified live: the API stores and echoes `up_for_grabs: true` with no category. (The read-side limitation noted in 2.1.0 was solved in 2.1.1 — see below.)

### Fixed

- **Successful DELETEs no longer report failure.** The Skylight API returns HTTP 200 with an empty body on deletes; the client unconditionally parsed JSON and threw `Unexpected end of JSON input` *after* the delete had succeeded — so every `delete_chore`/`delete_calendar_event`/`delete_list_item` call looked failed while actually working. The client now treats an empty response body as an empty result. (Found live-testing Up For Grabs.)

- **IDs exposed and names accepted across calendar and list tools** (the "object identity" fix; addresses [#3](https://github.com/rjhalvorson/skylight-mcp/issues/3) and bug 1 of [#6](https://github.com/rjhalvorson/skylight-mcp/issues/6) via the hybrid approach). `get_family_members` now prints each member's category ID; `create_calendar_event`/`update_calendar_event` accept a `categoryNames` parameter resolved to IDs automatically. `get_lists` and `get_list_items` now print list and item IDs; `update_list_item`/`delete_list_item` accept `itemLabel` + `listName` as an alternative to `itemId` + `listId` (previously the only way to obtain an item ID was… nothing, making both write tools unreachable). Label matching is case-insensitive with exact matches preferred over partial; ambiguous matches return the candidates with their IDs.

### Fixed

- **Calendar datetime timezone handling.** `create_calendar_event` and `update_calendar_event` no longer treat naked ISO datetimes (e.g. `"2026-05-28T19:45:00"`) as UTC. When the input has no timezone designator, the configured frame timezone's offset is appended before sending to the Skylight API. Existing callers passing ISO strings with `Z` or explicit `±HH:MM` offsets are unaffected.

### Changed

- **Calendar create/update return verbose confirmations.** `create_calendar_event` and `update_calendar_event` now echo the resolved fields (title, start, end, all-day, location) instead of just the event ID, mirroring `chores.js`. Lets callers verify what the server actually stored without a follow-up `get_calendar_events` call.

### Added

- **Source calendar sync parameters on calendar event tools.** `create_calendar_event` and `update_calendar_event` now accept `calendarId`, `calendarAccountId`, `timezone`, `rrule`, `countdownEnabled`, and `kind` parameters. Events created with `calendarId` + `calendarAccountId` sync back to the underlying source calendar provider (Google, iCloud, etc.) instead of being Skylight-only. Required for events to appear in a connected Google Calendar after creation. (Ported from [upstream PR #23](https://github.com/TheEagleByte/skylight-mcp/pull/23) by [@avinashjoshi](https://github.com/avinashjoshi); upstream is unmaintained. Addresses [#1](https://github.com/rjhalvorson/skylight-mcp/issues/1); partially addresses [#3](https://github.com/rjhalvorson/skylight-mcp/issues/3).)

## [2.0.1] - 2026-04-19

Docs + metadata only. No runtime code changes.

### Added

- **`privacy_policies` field in manifest.json** pointing to Skylight's own privacy policy, since Skylight is the third party that processes your family data when this MCP server queries their API.
- **Security & Privacy section in README** explaining what this server actually accesses (narrow: env vars, own `package.json`, HTTPS to `app.ourskylight.com`), what it does not do (no arbitrary filesystem access, no shell execution, no other processes, no third-party telemetry), where credentials live (OS keychain via Claude Desktop; env vars otherwise), and how users can verify the bundle they installed (npm OIDC provenance + auditable source).

### Notes

- Does not remove the Claude Desktop "this extension can view everything on your computer" warning, which is architectural — the MCPB format has no capability-sandbox model and all locally-installed MCP servers trigger it. The new docs help users evaluate the trust decision with concrete information.
- First release using Trusted Publishing + OIDC-signed provenance end-to-end (v2.0.0 used a one-time NPM_TOKEN bootstrap because the package did not exist yet).

## [2.0.0] - 2026-04-19

First release under maintained continuation at [rjhalvorson/skylight-mcp](https://github.com/rjhalvorson/skylight-mcp). The original project at [TheEagleByte/skylight-mcp](https://github.com/TheEagleByte/skylight-mcp) appears unmaintained; this repo carries it forward.

### Breaking Changes

- **npm package renamed** from `@eaglebyte/skylight-mcp` to `@rjhalvorson/skylight-mcp`. Users installing via npm must update their `mcp.json` / `claude_desktop_config.json` / Claude Code config accordingly.
- **Minimum Node.js version bumped to 20.0.0.** Node 18 reached EOL in April 2025 and is no longer supported. Users on Node 18 should upgrade to Node 20 LTS or newer.

### Fixed

- **Authentication**: Updated email/password authentication to match Skylight's current web OAuth flow. The server now follows the browser login sequence (`/oauth/authorize` -> `/auth/session` -> `/oauth/token`) and uses the returned bearer token for API requests. Fixes "Invalid email or password" errors caused by the previous session-based auth no longer being accepted by the Skylight API. (Originally submitted as [upstream PR #39](https://github.com/TheEagleByte/skylight-mcp/pull/39) by Andrew Ferguson; integrated here.)
- **List item create/update**: Use flat JSON body instead of JSON:API nested envelope; previously silently mangled list-item writes. ([upstream PR #30](https://github.com/TheEagleByte/skylight-mcp/pull/30) by Adam Argo.)
- **Chore and reward API formats**: Chore creation, reward creation, and reward-points operations now send the flat JSON body shape the Skylight API expects. Also adds bulk chore creation via `/chores/create_multiple`. ([upstream PR #36](https://github.com/TheEagleByte/skylight-mcp/pull/36) by Caleb Howell.)
- **`update_chore` splitting recurring series**: Added an `applyToSeries` option that updates the recurring template via `updateChoreTemplate()` instead of splitting the series on every edit. The series-update path supports `summary`, `rewardPoints`, and `assignee`; unsupported fields (`status`, `date`, `time`) now error loudly instead of silently no-oping. ([upstream PR #33](https://github.com/TheEagleByte/skylight-mcp/pull/33) by Brandon Palm.)
- **Chore IDs in output**: `get_chores` now includes each chore's ID in its output so follow-up `update_chore` / `delete_chore` calls have something to reference. ([upstream PR #31](https://github.com/TheEagleByte/skylight-mcp/pull/31) by Brandon Palm.)
- **Reward points show family member names**: `get_reward_points` output now resolves `category_id` to the family member's name instead of showing raw numeric IDs. ([upstream PR #31](https://github.com/TheEagleByte/skylight-mcp/pull/31) by Brandon Palm.)

### Added

- **One-click Claude Desktop install**: Release workflow now builds and attaches an `.mcpb` bundle to each GitHub Release. Users can install with a double-click or via Claude Desktop's Settings → Extensions.
- **Automated OAuth tests**: New `tests/auth.test.ts` covers the OAuth login happy path and invalid-credential handling.
- **Shared API constants module** (`src/api/constants.ts`) centralizing the Skylight API version header and related URLs.
- **`add_reward_points` tool**: Add or subtract reward points for a family member. (From [upstream PR #36](https://github.com/TheEagleByte/skylight-mcp/pull/36) by Caleb Howell.)
- **Internal helper for `/chores/create_multiple`**: Used by `create_chore` for the bulk-create API call; not currently exposed as a separate MCP tool. (From [upstream PR #36](https://github.com/TheEagleByte/skylight-mcp/pull/36) by Caleb Howell.)

### Changed

- Runtime MCP server version is now read from `package.json` instead of being hardcoded.
- Release workflow reordered so `.mcpb` validation and packing run before `npm publish`; a failed pack no longer leaves an orphaned npm release.
- Release workflow verifies the git tag matches `package.json` version before doing anything destructive.
- Auth-related docs and error guidance updated to reflect OAuth-based login.

### Security

- **`@modelcontextprotocol/sdk` bumped 1.11 → 1.29** (patches ReDoS vulnerability [GHSA-8r9q-7v3j-jr4g](https://github.com/advisories/GHSA-8r9q-7v3j-jr4g) and cross-client transport data leak [GHSA-345p-7cg4-v4c7](https://github.com/advisories/GHSA-345p-7cg4-v4c7); minimum declared version is now `^1.29.0`).
- **Vitest upgraded 1.6 → 4.1** (patches esbuild dev-server vulnerability [GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99) and transitive advisories in ajv, minimatch, flatted, brace-expansion, picomatch, path-to-regexp, qs, and hono).
- `npm audit` now reports **0 vulnerabilities** (down from 15: 7 moderate, 8 high).

## [1.1.7] - 2025-12-30

### Fixed

- **Authentication**: Fixed email/password authentication to use correct `Basic base64(userId:token)` format instead of `Bearer token`. The Skylight API requires the user ID and token to be combined and base64-encoded for Basic auth.
- **Calendar Events**: Fixed `get_calendar_events` returning no events when querying a single day. The API treats `date_max` as exclusive, so we now add 1 day to ensure events on the end date are included.

### Changed

- Added debug logging for authentication flow to help troubleshoot login issues
- Added automatic retry on 401 errors for email/password auth (attempts re-login once before failing)

## [1.1.6] - 2025-12-29

- Initial public release
