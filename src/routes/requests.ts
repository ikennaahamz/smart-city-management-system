import { Router } from "express";
import { callProcedure, exec, query, queryRow } from "../db";
import { requireAuth, requireRole } from "../middleware";
import {
  assignTechnicianSchema,
  parsePositiveId,
  serviceRequestCreateSchema,
  serviceRequestUpdateSchema,
} from "../validators";

const router = Router();

router.use(requireAuth);

const REQUEST_SELECT = `
  SELECT sr.request_id, sr.citizen_id, sr.department_id, sr.category,
         sr.title, sr.description, sr.priority, sr.status,
         sr.created_at, sr.resolved_at,
         md.department_name, md.district_name,
         u.full_name AS citizen_name, c.national_id
    FROM service_requests sr
    JOIN municipal_departments md ON md.department_id = sr.department_id
    JOIN citizens c ON c.citizen_id = sr.citizen_id
    JOIN users u ON u.user_id = c.user_id
`;

router.get("/", async (req, res, next) => {
  try {
    const user = req.user!;
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (user.role_name === "citizen") {
      if (!user.citizen_id) {
        res.json({ requests: [] });
        return;
      }
      params.push(user.citizen_id);
      conditions.push(`sr.citizen_id = $${params.length}`);
    }

    const status = typeof req.query.status === "string" ? req.query.status.trim() : "";
    if (status) {
      params.push(status);
      conditions.push(`sr.status = $${params.length}`);
    }

    const priority = typeof req.query.priority === "string" ? req.query.priority.trim() : "";
    if (priority) {
      params.push(priority);
      conditions.push(`sr.priority = $${params.length}`);
    }

    const deptRaw = typeof req.query.department_id === "string" ? req.query.department_id : undefined;
    const deptId = parsePositiveId(deptRaw);
    if (deptId) {
      params.push(deptId);
      conditions.push(`sr.department_id = $${params.length}`);
    }

    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
    if (search) {
      params.push(`%${search}%`);
      conditions.push(
        `(sr.title ILIKE $${params.length} OR sr.description ILIKE $${params.length} OR u.full_name ILIKE $${params.length})`,
      );
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const requests = await query(
      `${REQUEST_SELECT} ${whereClause} ORDER BY sr.created_at DESC, sr.request_id DESC`,
      params,
    );
    res.json({ requests });
  } catch (err) {
    next(err);
  }
});

router.post("/", requireRole("citizen", "employee", "admin"), async (req, res, next) => {
  try {
    const parsed = serviceRequestCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid service request." });
      return;
    }

    const user = req.user!;
    let citizenId: number | undefined;
    if (user.role_name === "citizen") {
      if (!user.citizen_id) {
        res.status(400).json({ error: "No citizen profile is linked to your account." });
        return;
      }
      citizenId = user.citizen_id;
    } else {
      citizenId = parsed.data.citizen_id;
      if (!citizenId) {
        res.status(400).json({ error: "citizen_id is required when staff creates a request." });
        return;
      }
    }

    const inserted = (await exec(
      `INSERT INTO service_requests (citizen_id, department_id, category, title, description, priority)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING request_id`,
      [
        citizenId,
        parsed.data.department_id,
        parsed.data.category,
        parsed.data.title,
        parsed.data.description,
        parsed.data.priority,
      ],
      "request_id",
    )) as { request_id: number };

    const created = await queryRow(`${REQUEST_SELECT} WHERE sr.request_id = $1`, [
      inserted.request_id,
    ]);
    res.status(201).json({ request: created, message: "Service request submitted." });
  } catch (err) {
    next(err);
  }
});

router.patch("/:id", requireRole("citizen", "employee", "admin"), async (req, res, next) => {
  try {
    const id = parsePositiveId(req.params.id);
    if (!id) {
      res.status(400).json({ error: "Invalid request ID." });
      return;
    }

    const existing = await queryRow<{
      request_id: number;
      citizen_id: number;
      status: string;
    }>("SELECT request_id, citizen_id, status FROM service_requests WHERE request_id = $1", [id]);
    if (!existing) {
      res.status(404).json({ error: "Service request not found." });
      return;
    }

    const parsed = serviceRequestUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid update payload." });
      return;
    }

    const user = req.user!;
    if (user.role_name === "citizen") {
      if (existing.citizen_id !== user.citizen_id) {
        res.status(403).json({ error: "You can only edit your own service requests." });
        return;
      }
      if (parsed.data.status !== undefined) {
        res.status(403).json({ error: "Citizens cannot override workflow status directly." });
        return;
      }
      if (existing.status !== "Open") {
        res.status(403).json({ error: "Only Open requests can be edited by citizens." });
        return;
      }
    }

    const fields: string[] = [];
    const params: unknown[] = [];
    const entries = Object.entries(parsed.data) as Array<[string, unknown]>;
    for (const [col, val] of entries) {
      if (val !== undefined) {
        params.push(val);
        fields.push(`${col} = $${params.length}`);
      }
    }
    params.push(id);

    await exec(
      `UPDATE service_requests SET ${fields.join(", ")} WHERE request_id = $${params.length}`,
      params,
    );

    const updated = await queryRow(`${REQUEST_SELECT} WHERE sr.request_id = $1`, [id]);
    res.json({ request: updated, message: "Service request updated." });
  } catch (err) {
    next(err);
  }
});

router.delete("/:id", requireRole("citizen", "employee", "admin"), async (req, res, next) => {
  try {
    const id = parsePositiveId(req.params.id);
    if (!id) {
      res.status(400).json({ error: "Invalid request ID." });
      return;
    }

    const existing = await queryRow<{
      request_id: number;
      citizen_id: number;
      status: string;
    }>("SELECT request_id, citizen_id, status FROM service_requests WHERE request_id = $1", [id]);
    if (!existing) {
      res.status(404).json({ error: "Service request not found." });
      return;
    }

    const user = req.user!;
    if (user.role_name === "citizen") {
      if (existing.citizen_id !== user.citizen_id) {
        res.status(403).json({ error: "You can only delete your own service requests." });
        return;
      }
      if (existing.status !== "Open") {
        res.status(403).json({ error: "Only Open requests can be withdrawn by citizens." });
        return;
      }
    }

    await exec("DELETE FROM service_requests WHERE request_id = $1", [id]);
    res.json({ deletedId: id, message: "Service request deleted." });
  } catch (err) {
    next(err);
  }
});

router.post("/:id/assign", requireRole("employee", "admin"), async (req, res, next) => {
  try {
    const id = parsePositiveId(req.params.id);
    if (!id) {
      res.status(400).json({ error: "Invalid request ID." });
      return;
    }

    const parsed = assignTechnicianSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid technician assignment." });
      return;
    }

    await callProcedure("assign_technician", [
      id,
      parsed.data.technician_id,
      parsed.data.estimated_cost,
      parsed.data.notes,
    ]);

    const requestRow = await queryRow(`${REQUEST_SELECT} WHERE sr.request_id = $1`, [id]);
    const workOrder = await queryRow(
      `SELECT wo.*, u.full_name AS technician_name
         FROM work_orders wo
         JOIN users u ON u.user_id = wo.technician_id
        WHERE wo.request_id = $1
        ORDER BY wo.order_id DESC
        LIMIT 1`,
      [id],
    );

    res.status(201).json({
      message: "Technician assigned via PL/pgSQL procedure assign_technician().",
      request: requestRow,
      workOrder,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
