/**
 * Authentication, bcrypt password hashing, and role-based authorization.
 */

import bcrypt from "bcryptjs";
import { DatabaseError, queryRow, withTransaction } from "./db";

export const BCRYPT_ROUNDS = 10;
export const MIN_PASSWORD_LENGTH = 8;

// Precomputed cost-10 digest used when username does not exist so response timing
// remains indistinguishable from wrong-password failures.
const DECOY_DIGEST =
  "$2b$10$.DYpiIG7oB1SeEyhAgdWwuglD9iy7DpSrvn.gtJf23FQNcCJjdTtO";

export type AuthUser = {
  user_id: number;
  username: string;
  email: string;
  full_name: string;
  status: string;
  role_id: number;
  role_name: string;
  access_level: number;
  citizen_id: number | null;
};

type AuthUserDbRow = AuthUser & {
  password_hash?: string;
};

export async function hashPassword(plaintext: string): Promise<string> {
  return bcrypt.hash(plaintext, BCRYPT_ROUNDS);
}

export async function verifyPassword(
  plaintext: string,
  digest: string,
): Promise<boolean> {
  try {
    return await bcrypt.compare(plaintext, digest);
  } catch {
    return false;
  }
}

export function passwordProblems(
  password: string,
  confirmation: string,
): string[] {
  const problems: string[] = [];
  if (password.length < MIN_PASSWORD_LENGTH) {
    problems.push(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
  if (password !== confirmation) {
    problems.push("Password confirmation does not match.");
  }
  if (!/[a-z]/i.test(password)) {
    problems.push("Password must contain at least one letter.");
  }
  if (!/[0-9]/.test(password)) {
    problems.push("Password must contain at least one digit.");
  }
  return problems;
}

export function requireRole(
  user: AuthUser | null,
  ...allowed: string[]
): boolean {
  if (!user) return false;
  if (user.role_name === "admin") return true;
  return allowed.includes(user.role_name);
}

export async function loadActiveUserById(
  userId: number,
): Promise<AuthUser | null> {
  const row = await queryRow<AuthUser>(
    `SELECT u.user_id, u.username, u.email, u.full_name, u.status,
            u.role_id, r.role_name, r.access_level,
            c.citizen_id
       FROM users u
       JOIN roles r ON r.role_id = u.role_id
       LEFT JOIN citizens c ON c.user_id = u.user_id
      WHERE u.user_id = $1`,
    [userId],
  );
  if (!row || row.status !== "active") return null;
  return row;
}

export async function authenticate(
  username: string,
  password: string,
): Promise<{ user: AuthUser | null; message: string }> {
  const cleanName = username.trim().toLowerCase();
  if (!cleanName || !password) {
    return { user: null, message: "Enter both a username and a password." };
  }

  const row = await queryRow<AuthUserDbRow>(
    `SELECT u.user_id, u.username, u.email, u.password_hash, u.full_name,
            u.status, u.role_id, r.role_name, r.access_level,
            c.citizen_id
       FROM users u
       JOIN roles r ON r.role_id = u.role_id
       LEFT JOIN citizens c ON c.user_id = u.user_id
      WHERE u.username = $1`,
    [cleanName],
  );

  if (!row || !row.password_hash) {
    await verifyPassword(password, DECOY_DIGEST);
    return { user: null, message: "Incorrect username or password." };
  }

  const valid = await verifyPassword(password, row.password_hash);
  if (!valid) {
    return { user: null, message: "Incorrect username or password." };
  }

  if (row.status !== "active") {
    return {
      user: null,
      message: `Account is '${row.status}'. Contact an administrator to activate it.`,
    };
  }

  const user: AuthUser = {
    user_id: row.user_id,
    username: row.username,
    email: row.email,
    full_name: row.full_name,
    status: row.status,
    role_id: row.role_id,
    role_name: row.role_name,
    access_level: row.access_level,
    citizen_id: row.citizen_id ?? null,
  };

  return { user, message: `Signed in as ${user.full_name} (${user.role_name}).` };
}

export type RegisterCitizenInput = {
  username: string;
  email: string;
  full_name: string;
  password: string;
  confirmation: string;
  national_id: string;
  district_name: string;
  address: string;
  phone: string;
};

export async function registerCitizen(
  input: RegisterCitizenInput,
): Promise<{ ok: true; user: AuthUser } | { ok: false; message: string }> {
  const problems = passwordProblems(input.password, input.confirmation);
  if (problems.length > 0) {
    return { ok: false, message: problems.join(" ") };
  }

  const passwordHash = await hashPassword(input.password);

  const user = await withTransaction(async (client) => {
    const roleRes = await client.query<{
      role_id: number;
      role_name: string;
      access_level: number;
    }>("SELECT role_id, role_name, access_level FROM roles WHERE role_name = 'citizen'");
    const role = roleRes.rows[0];
    if (!role) {
      throw new DatabaseError(
        "The default 'citizen' role is missing in the roles table.",
        { sqlstate: "P0001" },
      );
    }

    const userRes = await client.query<{
      user_id: number;
      username: string;
      email: string;
      full_name: string;
      status: string;
      role_id: number;
    }>(
      `INSERT INTO users (username, email, password_hash, full_name, role_id, status)
       VALUES ($1, $2, $3, $4, $5, 'active')
       RETURNING user_id, username, email, full_name, status, role_id`,
      [
        input.username.trim().toLowerCase(),
        input.email.trim().toLowerCase(),
        passwordHash,
        input.full_name.trim(),
        role.role_id,
      ],
    );
    const createdUser = userRes.rows[0];

    const citizenRes = await client.query<{ citizen_id: number }>(
      `INSERT INTO citizens (user_id, national_id, district_name, address, phone)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING citizen_id`,
      [
        createdUser.user_id,
        input.national_id.trim(),
        input.district_name.trim(),
        input.address.trim(),
        input.phone.trim(),
      ],
    );

    return {
      user_id: createdUser.user_id,
      username: createdUser.username,
      email: createdUser.email,
      full_name: createdUser.full_name,
      status: createdUser.status,
      role_id: createdUser.role_id,
      role_name: role.role_name,
      access_level: role.access_level,
      citizen_id: citizenRes.rows[0].citizen_id,
    } satisfies AuthUser;
  });

  return { ok: true, user };
}
