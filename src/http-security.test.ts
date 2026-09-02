import { describe, expect, it } from "vitest";

import { isAuthorized } from "./http-security.js";

describe("HTTP MCP authorization", () => {
  it("allows deployments without a configured token", () => {
    expect(isAuthorized(undefined, undefined)).toBe(true);
  });

  it("requires an exact bearer token when configured", () => {
    expect(isAuthorized(undefined, "server-secret")).toBe(false);
    expect(isAuthorized("Bearer wrong", "server-secret")).toBe(false);
    expect(isAuthorized("Bearer server-secret", "server-secret")).toBe(true);
  });
});
