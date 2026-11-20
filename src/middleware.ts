import type { NextFunction, Request, RequestHandler, Response } from "express";
import { type AuthUser, loadActiveUserById, requireRole as hasRequiredRole } from "./auth";
import { parseCookieHeader, readSessionValue, SESSION_COOKIE } from "./session";

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser | null;
    }
  }
}

export async function attachUser(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const cookies = parseCookieHeader(req.headers.cookie);
    const payload = readSessionValue(cookies[SESSION_COOKIE]);
    if (!payload) {
      req.user = null;
      next();
      return;
    }
    req.user = await loadActiveUserById(payload.userId);
    next();
  } catch (err) {
    next(err);
  }
}

export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!req.user) {
    res.status(401).json({ error: "Authentication required. Please sign in." });
    return;
  }
  next();
}

export function requireRole(...allowed: string[]): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: "Authentication required. Please sign in." });
      return;
    }
    if (!hasRequiredRole(req.user, ...allowed)) {
      res.status(403).json({
        error: `Access denied for role '${req.user.role_name}'. Required: ${allowed.join(", ")}.`,
      });
      return;
    }
    next();
  };
}
