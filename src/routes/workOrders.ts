import { Router } from "express";
import { exec, query, queryRow } from "../db";
import { requireRole } from "../middleware";
import {
  parsePositiveId,
  workOrderCreateSchema,
  workOrderUpdateSchema,
} from "../validators";

const router = Router();

router.use(requireRole("admin", "employee", "technical_staff"));

const WORK_ORDER_SELECT = `
  SELECT wo.order_id, wo.request_id, wo.technician_id, wo.status,
         wo.estimated_cost, wo.actual_cost, wo.notes,
         wo.assigned_at, wo.completed_at,
         sr.title AS request_title, sr.priority AS request_priority,
         sr.status AS request_status, sr.category,
         md.department_name,
         u.full_name AS technician_name, u.username AS technician_username
    FROM work_orders wo
    JOIN service_requests sr ON sr.request_id = wo.request_id
    JOIN municipal_departments md ON md.department_id = sr.department_id
    JOIN users u ON u.user_id = wo.technician_id
`;

router.get("/technicians", async (_req, res, next) => {
  try {
    const technicians = await query(
      `SELECT u.user_id, u.username, u.full_name, r.role_name
         FROM users u
         JOIN roles r ON r.role_id = u.role_id
        WHERE u.status = 'active'
          AND r.role_name IN ('technical_staff', 'admin')
        ORDER BY u.full_name ASC`,
    );
    res.json({ technicians });
  } catch (err) {
    next(err);
  }
});

router.get("/", async (req, res, next) => {
  try {
    const conditions: string[] = [];
    const params: unknown[] = [];

    const status = typeof req.query.status === "string" ? req.query.status.trim() : "";
    if (status) {
      params.push(status);
      conditions.push(`wo.status = $${params.length}`);
    }

    const techRaw = typeof req.query.technician_id === "string" ? req.query.technician_id : undefined;
    const techId = parsePositiveId(techRaw);
    if (techId) {
      params.push(techId);
      conditions.push(`wo.technician_id = $${params.length}`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const workOrders = await query(
      `${WORK_ORDER_SELECT} ${whereClause} ORDER BY wo.assigned_at DESC, wo.order_id DESC`,
      params,
    );
    res.json({ workOrders });
  } catch (err) {
    next(err);
  }
});

router.post("/", requireRole("admin", "employee"), async (req, res, next) => {
  try {
    const parsed = workOrderCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid work order payload." });
      return;
    }

    const inserted = (await exec(
      `INSERT INTO work_orders (request_id, technician_id, status, estimated_cost, actual_cost, notes)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING order_id`,
      [
        parsed.data.request_id,
        parsed.data.technician_id,
        parsed.data.status,
        parsed.data.estimated_cost,
        parsed.data.actual_cost,
        parsed.data.notes,
      ],
      "order_id",
    )) as { order_id: number };

    const workOrder = await queryRow(`${WORK_ORDER_SELECT} WHERE wo.order_id = $1`, [
      inserted.order_id,
    ]);
    res.status(201).json({ workOrder, message: "Work order created." });
  } catch (err) {
    next(err);
  }
});

router.patch("/:id", async (req, res, next) => {
  try {
    const id = parsePositiveId(req.params.id);
    if (!id) {
      res.status(400).json({ error: "Invalid work order ID." });
      return;
    }

    const existing = await queryRow<{ order_id: number; technician_id: number }>(
      "SELECT order_id, technician_id FROM work_orders WHERE order_id = $1",
      [id],
    );
    if (!existing) {
      res.status(404).json({ error: "Work order not found." });
      return;
    }

    const parsed = workOrderUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid work order update." });
      return;
    }

    const user = req.user!;
    if (user.role_name === "technical_staff") {
      if (existing.technician_id !== user.user_id) {
        res.status(403).json({ error: "Technical staff can only update work orders assigned to themselves." });
        return;
      }
      if (parsed.data.technician_id !== undefined && parsed.data.technician_id !== user.user_id) {
        res.status(403).json({ error: "Only administrators or employees can reassign a work order." });
        return;
      }
    }

    const fields: string[] = [];
    const params: unknown[] = [];
    for (const [col, val] of Object.entries(parsed.data)) {
      if (val !== undefined) {
        params.push(val);
        fields.push(`${col} = $${params.length}`);
      }
    }
    params.push(id);

    await exec(
      `UPDATE work_orders SET ${fields.join(", ")} WHERE order_id = $${params.length}`,
      params,
    );

    const workOrder = await queryRow<{ request_status: string } & Record<string, unknown>>(
      `${WORK_ORDER_SELECT} WHERE wo.order_id = $1`,
      [id],
    );
    res.json({
      workOrder,
      parentRequestStatus: workOrder?.request_status ?? null,
      message: "Work order updated.",
    });
  } catch (err) {
    next(err);
  }
});

router.delete("/:id", requireRole("admin", "employee"), async (req, res, next) => {
  try {
    const id = parsePositiveId(req.params.id);
    if (!id) {
      res.status(400).json({ error: "Invalid work order ID." });
      return;
    }

    const count = (await exec("DELETE FROM work_orders WHERE order_id = $1", [id])) as number;
    if (count === 0) {
      res.status(404).json({ error: "Work order not found." });
      return;
    }

    res.json({ deletedId: id, message: "Work order deleted." });
  } catch (err) {
    next(err);
  }
});

export default router;
