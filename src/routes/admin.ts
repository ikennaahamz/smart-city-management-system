import { Router } from "express";
import { hashPassword } from "../auth";
import { exec, query, queryRow } from "../db";
import { requireAuth, requireRole } from "../middleware";
import {
  departmentCreateSchema,
  departmentUpdateSchema,
  parsePositiveId,
  roleCreateSchema,
  roleUpdateSchema,
  userCreateSchema,
  userUpdateSchema,
} from "../validators";

// -----------------------------------------------------------------------------
// Municipal Departments Router
// -----------------------------------------------------------------------------
export const departmentsRouter = Router();
departmentsRouter.use(requireAuth);

departmentsRouter.get("/", async (_req, res, next) => {
  try {
    const departments = await query(
      `SELECT department_id, department_name, district_name, head_name,
              contact_phone, annual_budget, created_at
         FROM municipal_departments
        ORDER BY department_id ASC`,
    );
    res.json({ departments });
  } catch (err) {
    next(err);
  }
});

departmentsRouter.post("/", requireRole("admin"), async (req, res, next) => {
  try {
    const parsed = departmentCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid department payload." });
      return;
    }

    const inserted = (await exec(
      `INSERT INTO municipal_departments (
          department_name, district_name, head_name, contact_phone, annual_budget
       )
       VALUES ($1, $2, $3, $4, $5)
       RETURNING department_id`,
      [
        parsed.data.department_name,
        parsed.data.district_name,
        parsed.data.head_name,
        parsed.data.contact_phone,
        parsed.data.annual_budget,
      ],
      "department_id",
    )) as { department_id: number };

    const department = await queryRow(
      "SELECT * FROM municipal_departments WHERE department_id = $1",
      [inserted.department_id],
    );
    res.status(201).json({ department, message: "Department created." });
  } catch (err) {
    next(err);
  }
});

departmentsRouter.patch("/:id", requireRole("admin"), async (req, res, next) => {
  try {
    const id = parsePositiveId(req.params.id);
    if (!id) {
      res.status(400).json({ error: "Invalid department ID." });
      return;
    }

    const parsed = departmentUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid department update." });
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
      `UPDATE municipal_departments SET ${fields.join(", ")} WHERE department_id = $${params.length}`,
      params,
    )) as number;

    if (count === 0) {
      res.status(404).json({ error: "Department not found." });
      return;
    }

    const department = await queryRow(
      "SELECT * FROM municipal_departments WHERE department_id = $1",
      [id],
    );
    res.json({ department, message: "Department updated." });
  } catch (err) {
    next(err);
  }
});

departmentsRouter.delete("/:id", requireRole("admin"), async (req, res, next) => {
  try {
    const id = parsePositiveId(req.params.id);
    if (!id) {
      res.status(400).json({ error: "Invalid department ID." });
      return;
    }

    const count = (await exec(
      "DELETE FROM municipal_departments WHERE department_id = $1",
      [id],
    )) as number;
    if (count === 0) {
      res.status(404).json({ error: "Department not found." });
      return;
    }

    res.json({ deletedId: id, message: "Department deleted." });
  } catch (err) {
    next(err);
  }
});

// -----------------------------------------------------------------------------
// Users Router (Admin only)
// -----------------------------------------------------------------------------
export const usersRouter = Router();
usersRouter.use(requireRole("admin"));

const USER_SELECT = `
  SELECT u.user_id, u.username, u.email, u.full_name, u.role_id,
         u.status, u.created_at, r.role_name, r.access_level
    FROM users u
    JOIN roles r ON r.role_id = u.role_id
`;

usersRouter.get("/", async (_req, res, next) => {
  try {
    const users = await query(`${USER_SELECT} ORDER BY u.user_id ASC`);
    res.json({ users });
  } catch (err) {
    next(err);
  }
});

usersRouter.post("/", async (req, res, next) => {
  try {
    const parsed = userCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid user payload." });
      return;
    }

    const passwordHash = await hashPassword(parsed.data.password);
    const inserted = (await exec(
      `INSERT INTO users (username, email, password_hash, full_name, role_id, status)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING user_id`,
      [
        parsed.data.username,
        parsed.data.email,
        passwordHash,
        parsed.data.full_name,
        parsed.data.role_id,
        parsed.data.status,
      ],
      "user_id",
    )) as { user_id: number };

    const user = await queryRow(`${USER_SELECT} WHERE u.user_id = $1`, [inserted.user_id]);
    res.status(201).json({ user, message: "User created." });
  } catch (err) {
    next(err);
  }
});

usersRouter.patch("/:id", async (req, res, next) => {
  try {
    const id = parsePositiveId(req.params.id);
    if (!id) {
      res.status(400).json({ error: "Invalid user ID." });
      return;
    }

    const parsed = userUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid user update." });
      return;
    }

    const fields: string[] = [];
    const params: unknown[] = [];

    const { password, ...rest } = parsed.data;
    for (const [col, val] of Object.entries(rest)) {
      if (val !== undefined) {
        params.push(val);
        fields.push(`${col} = $${params.length}`);
      }
    }
    if (password !== undefined) {
      params.push(await hashPassword(password));
      fields.push(`password_hash = $${params.length}`);
    }
    params.push(id);

    const count = (await exec(
      `UPDATE users SET ${fields.join(", ")} WHERE user_id = $${params.length}`,
      params,
    )) as number;

    if (count === 0) {
      res.status(404).json({ error: "User not found." });
      return;
    }

    const user = await queryRow(`${USER_SELECT} WHERE u.user_id = $1`, [id]);
    res.json({ user, message: "User updated." });
  } catch (err) {
    next(err);
  }
});

usersRouter.delete("/:id", async (req, res, next) => {
  try {
    const id = parsePositiveId(req.params.id);
    if (!id) {
      res.status(400).json({ error: "Invalid user ID." });
      return;
    }

    if (id === req.user!.user_id) {
      res.status(400).json({ error: "You cannot delete your own active administrator account." });
      return;
    }

    const count = (await exec("DELETE FROM users WHERE user_id = $1", [id])) as number;
    if (count === 0) {
      res.status(404).json({ error: "User not found." });
      return;
    }

    res.json({ deletedId: id, message: "User deleted." });
  } catch (err) {
    next(err);
  }
});

// -----------------------------------------------------------------------------
// Roles Router (Admin only)
// -----------------------------------------------------------------------------
export const rolesRouter = Router();
rolesRouter.use(requireRole("admin"));

rolesRouter.get("/", async (_req, res, next) => {
  try {
    const roles = await query(
      `SELECT r.role_id, r.role_name, r.access_level, r.description,
              COUNT(u.user_id)::INT AS user_count
         FROM roles r
         LEFT JOIN users u ON u.role_id = r.role_id
        GROUP BY r.role_id, r.role_name, r.access_level, r.description
        ORDER BY r.access_level DESC, r.role_name ASC`,
    );
    res.json({ roles });
  } catch (err) {
    next(err);
  }
});

rolesRouter.post("/", async (req, res, next) => {
  try {
    const parsed = roleCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid role payload." });
      return;
    }

    const inserted = (await exec(
      `INSERT INTO roles (role_name, access_level, description)
       VALUES ($1, $2, $3)
       RETURNING role_id`,
      [parsed.data.role_name, parsed.data.access_level, parsed.data.description],
      "role_id",
    )) as { role_id: number };

    const role = await queryRow("SELECT * FROM roles WHERE role_id = $1", [inserted.role_id]);
    res.status(201).json({ role, message: "User group (role) created." });
  } catch (err) {
    next(err);
  }
});

rolesRouter.patch("/:id", async (req, res, next) => {
  try {
    const id = parsePositiveId(req.params.id);
    if (!id) {
      res.status(400).json({ error: "Invalid role ID." });
      return;
    }

    const parsed = roleUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid role update." });
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
      `UPDATE roles SET ${fields.join(", ")} WHERE role_id = $${params.length}`,
      params,
    )) as number;

    if (count === 0) {
      res.status(404).json({ error: "Role not found." });
      return;
    }

    const role = await queryRow("SELECT * FROM roles WHERE role_id = $1", [id]);
    res.json({ role, message: "User group (role) updated." });
  } catch (err) {
    next(err);
  }
});

rolesRouter.delete("/:id", async (req, res, next) => {
  try {
    const id = parsePositiveId(req.params.id);
    if (!id) {
      res.status(400).json({ error: "Invalid role ID." });
      return;
    }

    const count = (await exec("DELETE FROM roles WHERE role_id = $1", [id])) as number;
    if (count === 0) {
      res.status(404).json({ error: "Role not found." });
      return;
    }

    res.json({ deletedId: id, message: "User group (role) deleted." });
  } catch (err) {
    next(err);
  }
});
