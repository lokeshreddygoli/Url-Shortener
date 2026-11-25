import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { getEnv, resetEnvCache } from "@/lib/env";

describe("env validation", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    resetEnvCache();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    resetEnvCache();
  });

  it("parses valid environment variables", () => {
    process.env.DATABASE_URL = "postgresql://shortly:pass@localhost:5432/shortly";
    process.env.AUTH_SECRET = "a".repeat(32);
    process.env.ANALYTICS_HASH_SECRET = "b".repeat(32);
    process.env.GUEST_CLAIM_SECRET = "c".repeat(32);

    const env = getEnv();
    expect(env.APP_URL).toBe("http://localhost:3000");
    expect(env.GUEST_LINK_EXPIRY_DAYS).toBe(30);
  });

  it("fails fast when required secrets are too short", () => {
    process.env.DATABASE_URL = "postgresql://shortly:pass@localhost:5432/shortly";
    process.env.AUTH_SECRET = "short";
    process.env.ANALYTICS_HASH_SECRET = "b".repeat(32);
    process.env.GUEST_CLAIM_SECRET = "c".repeat(32);

    expect(() => getEnv()).toThrow(/Invalid environment configuration/);
  });
});
