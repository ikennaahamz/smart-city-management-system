-- =============================================================================
-- Smart City Management System (SCMS) - Management Analytical SQL Queries
-- 7 Queries covering JOINs, Subqueries, GROUP BY, ORDER BY, SUM, AVG, COUNT
-- =============================================================================

-- Query 1: Service Requests by Department and Category
SELECT md.department_name,
       md.district_name,
       sr.category,
       COUNT(sr.request_id) AS total_requests,
       COUNT(*) FILTER (WHERE sr.status IN ('Open', 'In Progress')) AS active_backlog,
       COUNT(*) FILTER (WHERE sr.status IN ('Resolved', 'Closed')) AS completed_requests
  FROM service_requests sr
  JOIN municipal_departments md ON md.department_id = sr.department_id
 GROUP BY md.department_name, md.district_name, sr.category
 ORDER BY total_requests DESC, md.department_name ASC;

-- Query 2: Department Resolution Performance & Budget Utilization
SELECT md.department_id,
       md.department_name,
       md.district_name,
       md.annual_budget,
       COUNT(DISTINCT sr.request_id) AS request_count,
       avg_resolution_hours(md.department_id) AS avg_resolution_hours,
       COALESCE(SUM(wo.actual_cost), 0.00)::NUMERIC(12,2) AS total_maintenance_spend,
       ROUND(
           CASE
               WHEN md.annual_budget > 0
               THEN (COALESCE(SUM(wo.actual_cost), 0) / md.annual_budget) * 100
               ELSE 0
           END,
           2
       ) AS budget_used_pct
  FROM municipal_departments md
  LEFT JOIN service_requests sr ON sr.department_id = md.department_id
  LEFT JOIN work_orders wo ON wo.request_id = sr.request_id
 GROUP BY md.department_id, md.department_name, md.district_name, md.annual_budget
 ORDER BY total_maintenance_spend DESC, request_count DESC;

-- Query 3: Departments with Above-Average Active Backlog (Scalar Subquery + HAVING)
SELECT md.department_name,
       md.district_name,
       COUNT(sr.request_id) AS open_requests
  FROM municipal_departments md
  JOIN service_requests sr ON sr.department_id = md.department_id
 WHERE sr.status IN ('Open', 'In Progress')
 GROUP BY md.department_id, md.department_name, md.district_name
HAVING COUNT(sr.request_id) > (
    SELECT COALESCE(AVG(dept_open), 0)
      FROM (
          SELECT COUNT(*) AS dept_open
            FROM service_requests
           WHERE status IN ('Open', 'In Progress')
           GROUP BY department_id
      ) dept_counts
)
 ORDER BY open_requests DESC, md.department_name ASC;

-- Query 4: Top 5 Technicians by Completed Work Orders & Cost Accuracy
SELECT u.user_id,
       u.full_name AS technician_name,
       u.username,
       COUNT(wo.order_id) FILTER (WHERE wo.status = 'Completed') AS completed_orders,
       COUNT(wo.order_id) AS total_assigned_orders,
       COALESCE(SUM(wo.actual_cost) FILTER (WHERE wo.status = 'Completed'), 0.00)::NUMERIC(12,2) AS total_actual_cost,
       ROUND(
           COALESCE(AVG(wo.actual_cost - wo.estimated_cost) FILTER (WHERE wo.status = 'Completed'), 0),
           2
       ) AS avg_cost_variance
  FROM users u
  JOIN roles r ON r.role_id = u.role_id
  LEFT JOIN work_orders wo ON wo.technician_id = u.user_id
 WHERE r.role_name IN ('technical_staff', 'admin')
 GROUP BY u.user_id, u.full_name, u.username
 ORDER BY completed_orders DESC, total_actual_cost DESC
 LIMIT 5;

-- Query 5: Monthly Maintenance Cost Breakdown (Estimated vs. Actual Spend)
SELECT TO_CHAR(DATE_TRUNC('month', wo.assigned_at), 'YYYY-MM') AS billing_month,
       COUNT(wo.order_id) AS work_order_count,
       COALESCE(SUM(wo.estimated_cost), 0.00)::NUMERIC(12,2) AS total_estimated_cost,
       COALESCE(SUM(wo.actual_cost), 0.00)::NUMERIC(12,2) AS total_actual_cost,
       ROUND(COALESCE(AVG(wo.actual_cost), 0), 2) AS avg_actual_cost
  FROM work_orders wo
 GROUP BY DATE_TRUNC('month', wo.assigned_at)
 ORDER BY billing_month DESC;

-- Query 6: IoT Devices Whose Latest Sensor Reading Exceeds Threshold
SELECT d.device_code,
       d.device_type,
       d.district_name,
       md.department_name,
       d.threshold_value,
       latest.reading_value AS latest_reading,
       latest.unit,
       ROUND(latest.reading_value - d.threshold_value, 2) AS excess_amount,
       d.status AS device_status,
       latest.recorded_at
  FROM devices d
  JOIN municipal_departments md ON md.department_id = d.department_id
  JOIN LATERAL (
      SELECT sr.reading_value, sr.unit, sr.recorded_at
        FROM sensor_readings sr
       WHERE sr.device_id = d.device_id
       ORDER BY sr.recorded_at DESC, sr.reading_id DESC
       LIMIT 1
  ) latest ON TRUE
 WHERE latest.reading_value > d.threshold_value
 ORDER BY excess_amount DESC, latest.recorded_at DESC;

-- Query 7: Utility Billing Arrears Summary by District & Service Type
SELECT c.district_name,
       ua.service_type,
       COUNT(ua.account_id) AS account_count,
       COUNT(*) FILTER (WHERE ua.status = 'Overdue') AS overdue_accounts,
       COALESCE(SUM(ua.balance_due), 0.00)::NUMERIC(12,2) AS total_balance_due,
       ROUND(COALESCE(AVG(ua.balance_due), 0), 2) AS avg_balance_due
  FROM utility_accounts ua
  JOIN citizens c ON c.citizen_id = ua.citizen_id
 GROUP BY c.district_name, ua.service_type
 ORDER BY total_balance_due DESC, c.district_name ASC;
