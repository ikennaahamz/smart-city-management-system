import { Router } from "express";
import { requireRole } from "../middleware";
import {
  ANALYTICAL_QUERIES,
  runAnalyticalQuery,
  runAvgResolutionHours,
  runOverdueRequests,
} from "../queries/analytics";
import { parsePositiveId } from "../validators";

const router = Router();

router.use(requireRole("admin", "employee", "technical_staff"));

router.get("/", (_req, res) => {
  res.json({ queries: ANALYTICAL_QUERIES });
});

router.get("/fn/avg-resolution", async (req, res, next) => {
  try {
    const deptRaw =
      typeof req.query.department_id === "string" ? req.query.department_id.trim() : "";
    let deptId: number | undefined;
    if (deptRaw !== "") {
      const parsed = parsePositiveId(deptRaw);
      if (!parsed) {
        res.status(400).json({ error: "department_id must be a positive integer." });
        return;
      }
      deptId = parsed;
    }
    const avgResolutionHours = await runAvgResolutionHours(deptId);
    res.json({ department_id: deptId ?? null, avg_resolution_hours: avgResolutionHours });
  } catch (err) {
    next(err);
  }
});

router.get("/fn/overdue", async (req, res, next) => {
  try {
    const rawDays = typeof req.query.days === "string" ? req.query.days.trim() : "7";
    if (!/^\d+$/.test(rawDays)) {
      res.status(400).json({ error: "days must be a non-negative integer." });
      return;
    }
    const days = Number(rawDays);
    const rows = await runOverdueRequests(days);
    res.json({ days, rows });
  } catch (err) {
    next(err);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const id = parsePositiveId(req.params.id);
    if (!id) {
      res.status(400).json({ error: "Invalid analytical query ID." });
      return;
    }

    const result = await runAnalyticalQuery(id);
    if (!result) {
      res.status(404).json({ error: `Analytical query ${id} does not exist.` });
      return;
    }

    res.json({
      query: result.meta,
      rows: result.rows,
      rowCount: result.rows.length,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
