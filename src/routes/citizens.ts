import { Router } from "express";
import { callProcedure, exec, query, queryRow } from "../db";
import { requireRole } from "../middleware";
import {
  citizenCreateSchema,
  citizenUpdateSchema,
  parsePositiveId,
  utilityAccountCreateSchema,
  utilityAccountUpdateSchema,
  utilityPaymentSchema,
} from "../validators";

const CITIZEN_SELECT = `
  SELECT c.citizen_id, c.user_id, c.national_id, c.district_name,
         c.address, c.phone, c.registered_at,
         u.username, u.full_name, u.email, u.status AS user_status
    FROM citizens c
    JOIN users u ON u.user_id = c.user_id
`;

const ACCOUNT_SELECT = `
  SELECT ua.account_id, ua.citizen_id, ua.service_type, ua.meter_number,
         ua.balance_due, ua.status, ua.last_billed_at,
         c.national_id, c.district_name, u.full_name AS citizen_name
    FROM utility_accounts ua
    JOIN citizens c ON c.citizen_id = ua.citizen_id
    JOIN users u ON u.user_id = c.user_id
`;

export const citizensRouter = Router();
citizensRouter.use(requireRole("admin", "employee", "citizen"));

citizensRouter.get("/available-users", requireRole("admin", "employee"), async (_req, res, next) => {
  try {
    const users = await query(
      `SELECT u.user_id, u.username, u.full_name, u.email
         FROM users u
         JOIN roles r ON r.role_id = u.role_id
         LEFT JOIN citizens c ON c.user_id = u.user_id
        WHERE r.role_name = 'citizen' AND c.citizen_id IS NULL
        ORDER BY u.full_name ASC`,
    );
    res.json({ users });
  } catch (err) {
    next(err);
  }
});

citizensRouter.get("/", async (req, res, next) => {
  try {
    const user = req.user!;
    if (user.role_name === "citizen") {
      const rows = await query(`${CITIZEN_SELECT} WHERE c.user_id = $1`, [user.user_id]);
      res.json({ citizens: rows });
      return;
    }

    const citizens = await query(`${CITIZEN_SELECT} ORDER BY c.citizen_id ASC`);
    res.json({ citizens });
  } catch (err) {
    next(err);
  }
});

citizensRouter.post("/", requireRole("admin", "employee"), async (req, res, next) => {
  try {
    const parsed = citizenCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid citizen payload." });
      return;
    }

    const inserted = (await exec(
      `INSERT INTO citizens (user_id, national_id, district_name, address, phone)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING citizen_id`,
      [
        parsed.data.user_id,
        parsed.data.national_id,
        parsed.data.district_name,
        parsed.data.address,
        parsed.data.phone,
      ],
      "citizen_id",
    )) as { citizen_id: number };

    const citizen = await queryRow(`${CITIZEN_SELECT} WHERE c.citizen_id = $1`, [
      inserted.citizen_id,
    ]);
    res.status(201).json({ citizen, message: "Citizen profile created." });
  } catch (err) {
    next(err);
  }
});

citizensRouter.patch("/:id", async (req, res, next) => {
  try {
    const id = parsePositiveId(req.params.id);
    if (!id) {
      res.status(400).json({ error: "Invalid citizen ID." });
      return;
    }

    const user = req.user!;
    if (user.role_name === "citizen" && user.citizen_id !== id) {
      res.status(403).json({ error: "You can only update your own citizen profile." });
      return;
    }

    const parsed = citizenUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid citizen update." });
      return;
    }

    if (user.role_name === "citizen" && parsed.data.national_id !== undefined) {
      res.status(403).json({ error: "Citizens cannot alter their registered national ID." });
      return;
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

    const count = (await exec(
      `UPDATE citizens SET ${fields.join(", ")} WHERE citizen_id = $${params.length}`,
      params,
    )) as number;

    if (count === 0) {
      res.status(404).json({ error: "Citizen profile not found." });
      return;
    }

    const citizen = await queryRow(`${CITIZEN_SELECT} WHERE c.citizen_id = $1`, [id]);
    res.json({ citizen, message: "Citizen profile updated." });
  } catch (err) {
    next(err);
  }
});

citizensRouter.delete("/:id", requireRole("admin", "employee"), async (req, res, next) => {
  try {
    const id = parsePositiveId(req.params.id);
    if (!id) {
      res.status(400).json({ error: "Invalid citizen ID." });
      return;
    }

    const count = (await exec("DELETE FROM citizens WHERE citizen_id = $1", [id])) as number;
    if (count === 0) {
      res.status(404).json({ error: "Citizen profile not found." });
      return;
    }

    res.json({ deletedId: id, message: "Citizen profile deleted." });
  } catch (err) {
    next(err);
  }
});

export const utilityAccountsRouter = Router();
utilityAccountsRouter.use(requireRole("admin", "employee", "citizen"));

utilityAccountsRouter.get("/", async (req, res, next) => {
  try {
    const user = req.user!;
    if (user.role_name === "citizen") {
      if (!user.citizen_id) {
        res.json({ accounts: [] });
        return;
      }
      const accounts = await query(
        `${ACCOUNT_SELECT} WHERE ua.citizen_id = $1 ORDER BY ua.account_id ASC`,
        [user.citizen_id],
      );
      res.json({ accounts });
      return;
    }

    const conditions: string[] = [];
    const params: unknown[] = [];

    const status = typeof req.query.status === "string" ? req.query.status.trim() : "";
    if (status) {
      params.push(status);
      conditions.push(`ua.status = $${params.length}`);
    }

    const serviceType =
      typeof req.query.service_type === "string" ? req.query.service_type.trim() : "";
    if (serviceType) {
      params.push(serviceType);
      conditions.push(`ua.service_type = $${params.length}`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const accounts = await query(
      `${ACCOUNT_SELECT} ${whereClause} ORDER BY ua.account_id ASC`,
      params,
    );
    res.json({ accounts });
  } catch (err) {
    next(err);
  }
});

utilityAccountsRouter.post("/", requireRole("admin", "employee"), async (req, res, next) => {
  try {
    const parsed = utilityAccountCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid utility account payload." });
      return;
    }

    const inserted = (await exec(
      `INSERT INTO utility_accounts (citizen_id, service_type, meter_number, balance_due, status)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING account_id`,
      [
        parsed.data.citizen_id,
        parsed.data.service_type,
        parsed.data.meter_number,
        parsed.data.balance_due,
        parsed.data.status,
      ],
      "account_id",
    )) as { account_id: number };

    const account = await queryRow(`${ACCOUNT_SELECT} WHERE ua.account_id = $1`, [
      inserted.account_id,
    ]);
    res.status(201).json({ account, message: "Utility account created." });
  } catch (err) {
    next(err);
  }
});

utilityAccountsRouter.patch("/:id", requireRole("admin", "employee"), async (req, res, next) => {
  try {
    const id = parsePositiveId(req.params.id);
    if (!id) {
      res.status(400).json({ error: "Invalid utility account ID." });
      return;
    }

    const parsed = utilityAccountUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid utility account update." });
      return;
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

    const count = (await exec(
      `UPDATE utility_accounts SET ${fields.join(", ")} WHERE account_id = $${params.length}`,
      params,
    )) as number;

    if (count === 0) {
      res.status(404).json({ error: "Utility account not found." });
      return;
    }

    const account = await queryRow(`${ACCOUNT_SELECT} WHERE ua.account_id = $1`, [id]);
    res.json({ account, message: "Utility account updated." });
  } catch (err) {
    next(err);
  }
});

utilityAccountsRouter.delete("/:id", requireRole("admin", "employee"), async (req, res, next) => {
  try {
    const id = parsePositiveId(req.params.id);
    if (!id) {
      res.status(400).json({ error: "Invalid utility account ID." });
      return;
    }

    const count = (await exec("DELETE FROM utility_accounts WHERE account_id = $1", [id])) as number;
    if (count === 0) {
      res.status(404).json({ error: "Utility account not found." });
      return;
    }

    res.json({ deletedId: id, message: "Utility account deleted." });
  } catch (err) {
    next(err);
  }
});

utilityAccountsRouter.post("/:id/pay", async (req, res, next) => {
  try {
    const id = parsePositiveId(req.params.id);
    if (!id) {
      res.status(400).json({ error: "Invalid utility account ID." });
      return;
    }

    const existing = await queryRow<{ account_id: number; citizen_id: number }>(
      "SELECT account_id, citizen_id FROM utility_accounts WHERE account_id = $1",
      [id],
    );
    if (!existing) {
      res.status(404).json({ error: "Utility account not found." });
      return;
    }

    const user = req.user!;
    if (user.role_name === "citizen" && existing.citizen_id !== user.citizen_id) {
      res.status(403).json({ error: "You can only pay your own utility accounts." });
      return;
    }

    const parsed = utilityPaymentSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid payment amount." });
      return;
    }

    await callProcedure("record_utility_payment", [id, parsed.data.amount]);

    const account = await queryRow(`${ACCOUNT_SELECT} WHERE ua.account_id = $1`, [id]);
    res.json({
      account,
      message: "Payment recorded via PL/pgSQL procedure record_utility_payment().",
    });
  } catch (err) {
    next(err);
  }
});
