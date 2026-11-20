import { describe, expect, it } from "vitest";
import {
  type AuthUser,
  hashPassword,
  passwordProblems,
  requireRole,
  verifyPassword,
} from "../src/auth";

function makeUser(role_name: string): AuthUser {
  return {
    user_id: 1,
    username: "tester",
    email: "tester@example.org",
    full_name: "Test User",
    status: "active",
    role_id: 1,
    role_name,
    access_level: 50,
    citizen_id: null,
  };
}

describe("auth utilities", () => {
  it("hashes and verifies passwords and fails closed on invalid digests", async () => {
    const hash = await hashPassword("Passw0rd!");
    expect(hash.startsWith("$2")).toBe(true);
    expect(await verifyPassword("Passw0rd!", hash)).toBe(true);
    expect(await verifyPassword("WrongPass1!", hash)).toBe(false);
    expect(await verifyPassword("Passw0rd!", "not-a-valid-bcrypt-digest")).toBe(false);
  });

  it("passwordProblems validates length, match, letters, and digits", () => {
    expect(passwordProblems("Passw0rd!", "Passw0rd!")).toEqual([]);
    expect(passwordProblems("short1", "short1").length).toBeGreaterThan(0);
    expect(passwordProblems("Passw0rd!", "Different1!")).toContain(
      "Password confirmation does not match.",
    );
    expect(passwordProblems("12345678", "12345678")).toContain(
      "Password must contain at least one letter.",
    );
    expect(passwordProblems("OnlyLetters", "OnlyLetters")).toContain(
      "Password must contain at least one digit.",
    );
  });

  it("requireRole denies null users, lets admin pass any gate, and checks exact roles", () => {
    expect(requireRole(null, "citizen")).toBe(false);
    expect(requireRole(makeUser("admin"), "technical_staff")).toBe(true);
    expect(requireRole(makeUser("employee"), "employee", "admin")).toBe(true);
    expect(requireRole(makeUser("citizen"), "employee", "technical_staff")).toBe(false);
  });
});
