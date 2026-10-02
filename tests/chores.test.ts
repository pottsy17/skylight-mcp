import { afterEach, describe, expect, it, vi } from "vitest";

// Token auth avoids the OAuth login flow; fetch is stubbed per test.
// Test shapes adapted from @dperox's rjhalvorson/skylight-mcp#11.
process.env.SKYLIGHT_TOKEN = "test-token";
process.env.SKYLIGHT_FRAME_ID = "123";

import { updateChore } from "../src/api/endpoints/chores.js";

interface Captured {
  method: string;
  body: Record<string, unknown> | null;
}

function stubFetch(attrs: Record<string, unknown>, sink: Captured[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      sink.push({
        method: init?.method ?? "GET",
        body: init?.body ? JSON.parse(String(init.body)) : null,
      });
      return new Response(JSON.stringify({ data: { id: "c1", type: "chore", attributes: attrs } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    })
  );
}

describe("updateChore", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("sends a flat body, not a JSON:API wrapper", async () => {
    const calls: Captured[] = [];
    stubFetch({ summary: "New" }, calls);

    await updateChore("c1", { summary: "New" });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("PUT");
    expect(calls[0].body).toEqual({ summary: "New" });
  });

  it("maps 'completed' to the API's 'complete'", async () => {
    const calls: Captured[] = [];
    stubFetch({ status: "complete" }, calls);

    await updateChore("c1", { status: "completed" });

    expect(calls).toHaveLength(1);
    expect(calls[0].body).toEqual({ status: "complete" });
  });

  it("splits a status change from other attribute changes", async () => {
    const calls: Captured[] = [];
    stubFetch({ summary: "Edited", status: "complete" }, calls);

    await updateChore("c1", { summary: "Edited", status: "completed" });

    expect(calls).toHaveLength(2);
    expect(calls[0].body).toEqual({ summary: "Edited" });
    expect(calls[1].body).toEqual({ status: "complete" });
  });

  it("sends reassignment as flat category_id / category_ids", async () => {
    const calls: Captured[] = [];
    stubFetch({}, calls);

    await updateChore("c1", { categoryId: "42" });
    await updateChore("c1", { categoryId: null });

    expect(calls[0].body).toEqual({ category_id: "42", category_ids: ["42"] });
    expect(calls[1].body).toEqual({ category_id: null, category_ids: [] });
  });

  it("still returns the chore for an update with no fields", async () => {
    const calls: Captured[] = [];
    stubFetch({ summary: "Unchanged" }, calls);

    const chore = await updateChore("c1", {});

    expect(calls).toHaveLength(1);
    expect(calls[0].body).toEqual({});
    expect(chore.attributes.summary).toBe("Unchanged");
  });
});
