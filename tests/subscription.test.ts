import { afterEach, describe, expect, it, vi } from "vitest";

import { detectSubscriptionStatus } from "../src/api/auth.js";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Real payload from a basic (non-Plus) account. */
const BASIC_PLUS_ACCESS = {
  data: {
    subscriptions: [],
    shares: [],
    bundle_entitlement: { available: false },
    self_serve_trial_eligibility: { assistant: false },
  },
};

function userResponse(status: string | null) {
  return {
    data: {
      id: "1",
      type: "user",
      attributes: status === null ? {} : { subscription_status: status },
    },
  };
}

function stubFetch(handler: (url: string) => Response) {
  const mock = vi.fn(async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    return handler(url);
  });
  vi.stubGlobal("fetch", mock);
  return mock;
}

describe("detectSubscriptionStatus", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("reports basic when /api/user says basic, even though plus_access looks ambiguous", async () => {
    // Regression: the old implementation substring-matched plus_access for
    // patterns absent from the real payload and defaulted to "plus".
    stubFetch((url) =>
      url.includes("/api/user") ? jsonResponse(200, userResponse("basic")) : jsonResponse(200, BASIC_PLUS_ACCESS)
    );

    await expect(detectSubscriptionStatus("t")).resolves.toBe("basic");
  });

  it("reports plus when /api/user says plus", async () => {
    stubFetch((url) =>
      url.includes("/api/user") ? jsonResponse(200, userResponse("plus")) : jsonResponse(200, BASIC_PLUS_ACCESS)
    );

    await expect(detectSubscriptionStatus("t")).resolves.toBe("plus");
  });

  it("normalizes case from the user record", async () => {
    stubFetch((url) =>
      url.includes("/api/user") ? jsonResponse(200, userResponse("PLUS")) : jsonResponse(200, BASIC_PLUS_ACCESS)
    );

    await expect(detectSubscriptionStatus("t")).resolves.toBe("plus");
  });

  it("falls back to entitlements when /api/user is unavailable — none means basic", async () => {
    stubFetch((url) =>
      url.includes("/api/user") ? jsonResponse(500, {}) : jsonResponse(200, BASIC_PLUS_ACCESS)
    );

    await expect(detectSubscriptionStatus("t")).resolves.toBe("basic");
  });

  it("falls back to entitlements — an active subscription means plus", async () => {
    stubFetch((url) =>
      url.includes("/api/user")
        ? jsonResponse(500, {})
        : jsonResponse(200, { data: { ...BASIC_PLUS_ACCESS.data, subscriptions: [{ id: "s1" }] } })
    );

    await expect(detectSubscriptionStatus("t")).resolves.toBe("plus");
  });

  it("falls back to entitlements — a share grants plus", async () => {
    stubFetch((url) =>
      url.includes("/api/user")
        ? jsonResponse(500, {})
        : jsonResponse(200, { data: { ...BASIC_PLUS_ACCESS.data, shares: [{ id: "sh1" }] } })
    );

    await expect(detectSubscriptionStatus("t")).resolves.toBe("plus");
  });

  it("falls back to entitlements — a bundle entitlement grants plus", async () => {
    stubFetch((url) =>
      url.includes("/api/user")
        ? jsonResponse(500, {})
        : jsonResponse(200, { data: { ...BASIC_PLUS_ACCESS.data, bundle_entitlement: { available: true } } })
    );

    await expect(detectSubscriptionStatus("t")).resolves.toBe("plus");
  });

  it("treats an unauthorized entitlement probe as basic, not plus", async () => {
    stubFetch((url) => (url.includes("/api/user") ? jsonResponse(500, {}) : jsonResponse(403, {})));

    await expect(detectSubscriptionStatus("t")).resolves.toBe("basic");
  });

  it("returns null (unknown) when both endpoints fail, and never guesses plus", async () => {
    stubFetch(() => jsonResponse(503, {}));

    await expect(detectSubscriptionStatus("t")).resolves.toBeNull();
  });
});
