/**
 * HMAC-SHA256 signed HTTP-only session cookie.
 *
 * Stores only `{ userId, issuedAt, expiresAt }`. User roles and account status
 * are re-read from PostgreSQL on each request so role changes and suspensions
 * take effect immediately.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import type { Response } from "express";

export const SESSION_COOKIE = "scms_session";
export const SESSION_TTL_SECONDS = 8 * 60 * 60;

export type SessionPayload = {
  userId: number;
  issuedAt: number;
  expiresAt: number;
};

function getSessionSecret(): string {
  const value = process.env.SESSION_SECRET;
  if (!value || value.trim().length < 8) {
    throw new Error(
      "SESSION_SECRET is not set (or shorter than 8 characters). Set it in .env or deployment environment settings.",
    );
  }
  return value;
}

function sign(data: string): string {
  return createHmac("sha256", getSessionSecret())
    .update(data)
    .digest("base64url");
}

export function createSessionValue(userId: number, now = Date.now()): string {
  const payload: SessionPayload = {
    userId,
    issuedAt: now,
    expiresAt: now + SESSION_TTL_SECONDS * 1000,
  };
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${body}.${sign(body)}`;
}

export function readSessionValue(
  value: string | undefined,
  now = Date.now(),
): SessionPayload | null {
  if (!value) return null;

  const dot = value.lastIndexOf(".");
  if (dot <= 0) return null;

  const body = value.slice(0, dot);
  const provided = value.slice(dot + 1);

  let expected: string;
  try {
    expected = sign(body);
  } catch {
    return null;
  }

  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  let payload: SessionPayload;
  try {
    payload = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8"),
    ) as SessionPayload;
  } catch {
    return null;
  }

  if (
    typeof payload?.userId !== "number" ||
    typeof payload?.expiresAt !== "number"
  ) {
    return null;
  }
  if (payload.expiresAt <= now) return null;

  return payload;
}

export function parseCookieHeader(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const pair of header.split(";")) {
    const idx = pair.indexOf("=");
    if (idx <= 0) continue;
    const key = pair.slice(0, idx).trim();
    const rawVal = pair.slice(idx + 1).trim();
    try {
      out[key] = decodeURIComponent(rawVal);
    } catch {
      out[key] = rawVal;
    }
  }
  return out;
}

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS * 1000,
  };
}

export function setSessionCookie(res: Response, userId: number): void {
  res.cookie(SESSION_COOKIE, createSessionValue(userId), cookieOptions());
}

export function clearSessionCookie(res: Response): void {
  res.cookie(SESSION_COOKIE, "", { ...cookieOptions(), maxAge: 0 });
}
