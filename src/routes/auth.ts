import { Router } from "express";
import { authenticate, registerCitizen } from "../auth";
import { clearSessionCookie, setSessionCookie } from "../session";
import { loginSchema, registerSchema } from "../validators";

const router = Router();

router.post("/login", async (req, res, next) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid login payload." });
      return;
    }

    const result = await authenticate(parsed.data.username, parsed.data.password);
    if (!result.user) {
      res.status(401).json({ error: result.message });
      return;
    }

    setSessionCookie(res, result.user.user_id);
    res.json({ user: result.user, message: result.message });
  } catch (err) {
    next(err);
  }
});

router.post("/register", async (req, res, next) => {
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid registration payload." });
      return;
    }

    const result = await registerCitizen(parsed.data);
    if (!result.ok) {
      res.status(400).json({ error: result.message });
      return;
    }

    setSessionCookie(res, result.user.user_id);
    res.status(201).json({
      user: result.user,
      message: `Citizen account '${result.user.username}' created and signed in.`,
    });
  } catch (err) {
    next(err);
  }
});

router.post("/logout", (_req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true, message: "Signed out." });
});

router.get("/me", (req, res) => {
  if (!req.user) {
    res.status(401).json({ error: "Not signed in." });
    return;
  }
  res.json({ user: req.user });
});

export default router;
