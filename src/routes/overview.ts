import { Router } from "express";
import { ping, query, queryRow } from "../db";
import { requireAuth } from "../middleware";

const router = Router();

router.use(requireAuth);

router.get("/", async (req, res, next) => {
  try {
    const user = req.user!;
    const [dbConnected, dbDetail] = await ping();

    if (user.role_name === "citizen") {
      if (!user.citizen_id) {
        res.json({
          roleScope: "citizen",
          dbStatus: { connected: dbConnected, detail: dbDetail },
          kpis: {
            openRequests: 0,
            resolvedRequests: 0,
            utilityAccounts: 0,
            totalBalanceDue: "0.00",
          },
          recentRequests: [],
          recentAlerts: [],
        });
        return;
      }

      const kpis = await queryRow<{
        open_requests: string;
        resolved_requests: string;
        utility_accounts: string;
        total_balance_due: string;
      }>(
        `SELECT
            (SELECT COUNT(*) FROM service_requests
              WHERE citizen_id = $1 AND status IN ('Open', 'In Progress')) AS open_requests,
            (SELECT COUNT(*) FROM service_requests
              WHERE citizen_id = $1 AND status IN ('Resolved', 'Closed')) AS resolved_requests,
            (SELECT COUNT(*) FROM utility_accounts
              WHERE citizen_id = $1) AS utility_accounts,
            (SELECT COALESCE(SUM(balance_due), 0.00)::NUMERIC(10,2) FROM utility_accounts
              WHERE citizen_id = $1) AS total_balance_due`,
        [user.citizen_id],
      );

      const recentRequests = await query(
        `SELECT sr.request_id, sr.title, sr.category, sr.priority, sr.status,
                sr.created_at, sr.resolved_at, md.department_name
           FROM service_requests sr
           JOIN municipal_departments md ON md.department_id = sr.department_id
          WHERE sr.citizen_id = $1
          ORDER BY sr.created_at DESC
          LIMIT 6`,
        [user.citizen_id],
      );

      res.json({
        roleScope: "citizen",
        dbStatus: { connected: dbConnected, detail: dbDetail },
        kpis: {
          openRequests: Number(kpis?.open_requests ?? 0),
          resolvedRequests: Number(kpis?.resolved_requests ?? 0),
          utilityAccounts: Number(kpis?.utility_accounts ?? 0),
          totalBalanceDue: String(kpis?.total_balance_due ?? "0.00"),
        },
        recentRequests,
        recentAlerts: [],
      });
      return;
    }

    const kpis = await queryRow<{
      open_requests: string;
      active_work_orders: string;
      alert_devices: string;
      overdue_balance: string;
      avg_resolution_hours: string;
      total_citizens: string;
      total_departments: string;
    }>(
      `SELECT
          (SELECT COUNT(*) FROM service_requests WHERE status IN ('Open', 'In Progress')) AS open_requests,
          (SELECT COUNT(*) FROM work_orders WHERE status IN ('Assigned', 'In Progress')) AS active_work_orders,
          (SELECT COUNT(*) FROM devices WHERE status IN ('Alert', 'Maintenance')) AS alert_devices,
          (SELECT COALESCE(SUM(balance_due), 0.00)::NUMERIC(12,2) FROM utility_accounts WHERE status = 'Overdue') AS overdue_balance,
          avg_resolution_hours(NULL) AS avg_resolution_hours,
          (SELECT COUNT(*) FROM citizens) AS total_citizens,
          (SELECT COUNT(*) FROM municipal_departments) AS total_departments`,
    );

    const recentRequests = await query(
      `SELECT sr.request_id, sr.title, sr.category, sr.priority, sr.status,
              sr.created_at, md.department_name, u.full_name AS citizen_name
         FROM service_requests sr
         JOIN municipal_departments md ON md.department_id = sr.department_id
         JOIN citizens c ON c.citizen_id = sr.citizen_id
         JOIN users u ON u.user_id = c.user_id
        WHERE sr.status IN ('Open', 'In Progress')
        ORDER BY CASE sr.priority
                     WHEN 'Critical' THEN 1
                     WHEN 'High' THEN 2
                     WHEN 'Medium' THEN 3
                     ELSE 4
                 END,
                 sr.created_at ASC
        LIMIT 6`,
    );

    const recentAlerts = await query(
      `SELECT r.reading_id, r.device_id, d.device_code, d.device_type,
              d.district_name, d.location_label, d.threshold_value, d.status AS device_status,
              r.reading_value, r.unit, r.recorded_at
         FROM sensor_readings r
         JOIN devices d ON d.device_id = r.device_id
        WHERE r.is_anomaly = TRUE
        ORDER BY r.recorded_at DESC
        LIMIT 6`,
    );

    res.json({
      roleScope: "staff",
      dbStatus: { connected: dbConnected, detail: dbDetail },
      kpis: {
        openRequests: Number(kpis?.open_requests ?? 0),
        activeWorkOrders: Number(kpis?.active_work_orders ?? 0),
        alertDevices: Number(kpis?.alert_devices ?? 0),
        overdueBalance: String(kpis?.overdue_balance ?? "0.00"),
        avgResolutionHours: Number(kpis?.avg_resolution_hours ?? 0),
        totalCitizens: Number(kpis?.total_citizens ?? 0),
        totalDepartments: Number(kpis?.total_departments ?? 0),
      },
      recentRequests,
      recentAlerts,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
