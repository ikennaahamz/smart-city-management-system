import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createSessionValue,
  parseCookieHeader,
  readSessionValue,
  SESSION_TTL_SECONDS,
} from "../src/session";

describe("signed session cookies", () => {
  const prevSecret = process.env.SESSION_SECRET;

  beforeEach(() => {
    process.env.SESSION_SECRET = "unit-test-secret-key-with-plenty-of-length";
  });

  afterEach(() => {
    if (prevSecret === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = prevSecret;
  });

  it("creates and verifies valid session tokens", () => {
    const now = 1_700_000_000_000;
    const token = createSessionValue(42, now);
    const decoded = readSessionValue(token, now + 60_000);
    expect(decoded).toEqual({
      userId: 42,
      issuedAt: now,
      expiresAt: now + SESSION_TTL_SECONDS * 1000,
    });
  });

  it("rejects expired, tampered, or malformed tokens", () => {
    const now = 1_700_000_000_000;
    const token = createSessionValue(7, now);

    // Expired
    expect(readSessionValue(token, now + SESSION_TTL_SECONDS * 1000 + 1)).toBeNull();

    // Tampered signature
    const [body, sig] = token.split(".");
    const flipped = `${sig.slice(0, -1)}${sig.endsWith("A") ? "B" : "A"}`;
    expect(readSessionValue(`${body}.${flipped}`, now)).toBeNull();

    // Tampered payload
    const forgedBody = Buffer.from(
      JSON.stringify({ userId: 1, issuedAt: now, expiresAt: now + 999999 }),
    ).toString("base64url");
    expect(readSessionValue(`${forgedBody}.${sig}`, now)).toBeNull();

    expect(readSessionValue(undefined, now)).toBeNull();
    expect(readSessionValue("no-dot-here", now)).toBeNull();
  });

  it("parses cookie headers safely", () => {
    const parsed = parseCookieHeader("foo=bar; scms_session=abc.123; note=hello%20world");
    expect(parsed).toEqual({
      foo: "bar",
      scms_session: "abc.123",
      note: "hello world",
    });
  });
});
