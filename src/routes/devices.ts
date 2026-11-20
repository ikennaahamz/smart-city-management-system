import { Router } from "express";
import { exec, query, queryRow, withTransaction } from "../db";
import { requireRole } from "../middleware";
import {
  deviceCreateSchema,
  deviceUpdateSchema,
  parsePositiveId,
  sensorReadingCreateSchema,
} from "../validators";

const router = Router();

router.use(requireRole("admin", "employee", "technical_staff"));

const DEVICE_SELECT = `
  SELECT d.device_id, d.department_id, d.device_code, d.device_type,
         d.district_name, d.location_label, d.threshold_value, d.status,
         d.installed_at, md.department_name,
         latest.reading_value AS latest_reading,
         latest.unit AS latest_unit,
         latest.is_anomaly AS latest_is_anomaly,
         latest.recorded_at AS latest_recorded_at
    FROM devices d
    JOIN municipal_departments md ON md.department_id = d.department_id
    LEFT JOIN LATERAL (
        SELECT sr.reading_value, sr.unit, sr.is_anomaly, sr.recorded_at
          FROM sensor_readings sr
         WHERE sr.device_id = d.device_id
         ORDER BY sr.recorded_at DESC, sr.reading_id DESC
         LIMIT 1
    ) latest ON TRUE
`;

router.get("/", async (req, res, next) => {
  try {
    const conditions: string[] = [];
    const params: unknown[] = [];

    const status = typeof req.query.status === "string" ? req.query.status.trim() : "";
    if (status) {
      params.push(status);
      conditions.push(`d.status = $${params.length}`);
    }

    const type = typeof req.query.device_type === "string" ? req.query.device_type.trim() : "";
    if (type) {
      params.push(type);
      conditions.push(`d.device_type = $${params.length}`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const devices = await query(
      `${DEVICE_SELECT} ${whereClause} ORDER BY d.device_id ASC`,
      params,
    );
    res.json({ devices });
  } catch (err) {
    next(err);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const parsed = deviceCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid device payload." });
      return;
    }

    const inserted = (await exec(
      `INSERT INTO devices (
          department_id, device_code, device_type, district_name,
          location_label, threshold_value, status, installed_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8::DATE, CURRENT_DATE))
       RETURNING device_id`,
      [
        parsed.data.department_id,
        parsed.data.device_code,
        parsed.data.device_type,
        parsed.data.district_name,
        parsed.data.location_label,
        parsed.data.threshold_value,
        parsed.data.status,
        parsed.data.installed_at ?? null,
      ],
      "device_id",
    )) as { device_id: number };

    const device = await queryRow(`${DEVICE_SELECT} WHERE d.device_id = $1`, [
      inserted.device_id,
    ]);
    res.status(201).json({ device, message: "IoT device registered." });
  } catch (err) {
    next(err);
  }
});

router.delete("/readings/:readingId", async (req, res, next) => {
  try {
    const readingId = parsePositiveId(req.params.readingId);
    if (!readingId) {
      res.status(400).json({ error: "Invalid reading ID." });
      return;
    }
    const count = (await exec("DELETE FROM sensor_readings WHERE reading_id = $1", [
      readingId,
    ])) as number;
    if (count === 0) {
      res.status(404).json({ error: "Sensor reading not found." });
      return;
    }
    res.json({ deletedId: readingId, message: "Sensor reading deleted." });
  } catch (err) {
    next(err);
  }
});

router.get("/:id/readings", async (req, res, next) => {
  try {
    const deviceId = parsePositiveId(req.params.id);
    if (!deviceId) {
      res.status(400).json({ error: "Invalid device ID." });
      return;
    }

    const device = await queryRow(`${DEVICE_SELECT} WHERE d.device_id = $1`, [deviceId]);
    if (!device) {
      res.status(404).json({ error: "Device not found." });
      return;
    }

    const readings = await query(
      `SELECT reading_id, device_id, reading_value, unit, is_anomaly, recorded_at
         FROM sensor_readings
        WHERE device_id = $1
        ORDER BY recorded_at DESC, reading_id DESC
        LIMIT 50`,
      [deviceId],
    );
    res.json({ device, readings });
  } catch (err) {
    next(err);
  }
});

router.post("/:id/readings", async (req, res, next) => {
  try {
    const deviceId = parsePositiveId(req.params.id);
    if (!deviceId) {
      res.status(400).json({ error: "Invalid device ID." });
      return;
    }

    const parsed = sensorReadingCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid sensor reading." });
      return;
    }

    const result = await withTransaction(async (client) => {
      const inserted = await client.query<{
        reading_id: number;
        device_id: number;
        reading_value: string;
        unit: string;
        is_anomaly: boolean;
        recorded_at: string;
      }>(
        `INSERT INTO sensor_readings (device_id, reading_value, unit)
         VALUES ($1, $2, $3)
         RETURNING reading_id, device_id, reading_value, unit, is_anomaly, recorded_at`,
        [deviceId, parsed.data.reading_value, parsed.data.unit],
      );

      const deviceRes = await client.query(
        `${DEVICE_SELECT} WHERE d.device_id = $1`,
        [deviceId],
      );
      return { reading: inserted.rows[0], device: deviceRes.rows[0] ?? null };
    });

    res.status(201).json({
      ...result,
      message: result.reading.is_anomaly
        ? "Reading logged — threshold exceeded; trigger flagged anomaly and set device Alert."
        : "Reading logged normally.",
    });
  } catch (err) {
    next(err);
  }
});

router.patch("/:id", async (req, res, next) => {
  try {
    const deviceId = parsePositiveId(req.params.id);
    if (!deviceId) {
      res.status(400).json({ error: "Invalid device ID." });
      return;
    }

    const parsed = deviceUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid device update." });
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
    params.push(deviceId);

    const updatedCount = (await exec(
      `UPDATE devices SET ${fields.join(", ")} WHERE device_id = $${params.length}`,
      params,
    )) as number;

    if (updatedCount === 0) {
      res.status(404).json({ error: "Device not found." });
      return;
    }

    const device = await queryRow(`${DEVICE_SELECT} WHERE d.device_id = $1`, [deviceId]);
    res.json({ device, message: "Device updated." });
  } catch (err) {
    next(err);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const deviceId = parsePositiveId(req.params.id);
    if (!deviceId) {
      res.status(400).json({ error: "Invalid device ID." });
      return;
    }

    const count = (await exec("DELETE FROM devices WHERE device_id = $1", [deviceId])) as number;
    if (count === 0) {
      res.status(404).json({ error: "Device not found." });
      return;
    }
    res.json({ deletedId: deviceId, message: "Device deleted." });
  } catch (err) {
    next(err);
  }
});

export default router;
