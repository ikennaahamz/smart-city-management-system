-- =============================================================================
-- Smart City Management System (SCMS) - PL/pgSQL Procedural Layer
-- 3 Triggers, 2 Stored Procedures, 2 Stored Functions (7 PL/pgSQL Blocks)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Block 1 (Trigger): Auto-stamp resolved_at on service_requests status change
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_set_request_resolved_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.status IN ('Resolved', 'Closed') AND NEW.resolved_at IS NULL THEN
            NEW.resolved_at := GREATEST(NOW(), NEW.created_at);
        END IF;
        RETURN NEW;
    END IF;

    IF NEW.status IN ('Resolved', 'Closed') AND OLD.status NOT IN ('Resolved', 'Closed') THEN
        NEW.resolved_at := COALESCE(NEW.resolved_at, GREATEST(NOW(), NEW.created_at));
    ELSIF NEW.status IN ('Open', 'In Progress') THEN
        NEW.resolved_at := NULL;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_service_request_resolved_at
BEFORE INSERT OR UPDATE ON service_requests
FOR EACH ROW
EXECUTE FUNCTION fn_set_request_resolved_at();

-- -----------------------------------------------------------------------------
-- Block 2 (Trigger): Flag anomaly and set device Alert when threshold exceeded
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_flag_sensor_anomaly()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_threshold     NUMERIC(10,2);
    v_device_status VARCHAR(20);
BEGIN
    SELECT threshold_value, status
      INTO v_threshold, v_device_status
      FROM devices
     WHERE device_id = NEW.device_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Device % does not exist', NEW.device_id;
    END IF;

    IF NEW.reading_value > v_threshold THEN
        NEW.is_anomaly := TRUE;
        IF v_device_status = 'Active' THEN
            UPDATE devices
               SET status = 'Alert'
             WHERE device_id = NEW.device_id;
        END IF;
    ELSE
        NEW.is_anomaly := FALSE;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sensor_reading_anomaly
BEFORE INSERT ON sensor_readings
FOR EACH ROW
EXECUTE FUNCTION fn_flag_sensor_anomaly();

-- -----------------------------------------------------------------------------
-- Block 3 (Trigger): Enforce technician role & cascade completion to request
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_sync_work_order_completion()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_role_name VARCHAR(40);
BEGIN
    SELECT r.role_name
      INTO v_role_name
      FROM users u
      JOIN roles r ON r.role_id = u.role_id
     WHERE u.user_id = NEW.technician_id;

    IF v_role_name IS NULL OR v_role_name NOT IN ('technical_staff', 'admin') THEN
        RAISE EXCEPTION 'Technician user % must hold role technical_staff or admin (found %)',
            NEW.technician_id, COALESCE(v_role_name, 'none');
    END IF;

    IF NEW.status = 'Completed' THEN
        IF TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'Completed' THEN
            NEW.completed_at := COALESCE(NEW.completed_at, GREATEST(NOW(), NEW.assigned_at));
        END IF;

        UPDATE service_requests
           SET status = 'Resolved'
         WHERE request_id = NEW.request_id
           AND status IN ('Open', 'In Progress');
    ELSIF NEW.status IN ('Assigned', 'In Progress') THEN
        NEW.completed_at := NULL;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_work_order_completion
BEFORE INSERT OR UPDATE ON work_orders
FOR EACH ROW
EXECUTE FUNCTION fn_sync_work_order_completion();

-- -----------------------------------------------------------------------------
-- Block 4 (Procedure): Assign a technician and transition request to In Progress
-- -----------------------------------------------------------------------------
CREATE OR REPLACE PROCEDURE assign_technician(
    p_request_id     INT,
    p_technician_id  INT,
    p_estimated_cost NUMERIC DEFAULT 0,
    p_notes          TEXT DEFAULT ''
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_req_status  VARCHAR(20);
    v_tech_role   VARCHAR(40);
    v_tech_status VARCHAR(20);
BEGIN
    IF p_estimated_cost < 0 THEN
        RAISE EXCEPTION 'Estimated cost cannot be negative';
    END IF;

    SELECT status
      INTO v_req_status
      FROM service_requests
     WHERE request_id = p_request_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Service request % not found', p_request_id;
    END IF;

    IF v_req_status NOT IN ('Open', 'In Progress') THEN
        RAISE EXCEPTION 'Service request % is already % and cannot be assigned', p_request_id, v_req_status;
    END IF;

    SELECT r.role_name, u.status
      INTO v_tech_role, v_tech_status
      FROM users u
      JOIN roles r ON r.role_id = u.role_id
     WHERE u.user_id = p_technician_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Technician user % not found', p_technician_id;
    END IF;

    IF v_tech_status <> 'active' THEN
        RAISE EXCEPTION 'Technician user % is not active (status: %)', p_technician_id, v_tech_status;
    END IF;

    IF v_tech_role NOT IN ('technical_staff', 'admin') THEN
        RAISE EXCEPTION 'User % holds role % and cannot be assigned work orders', p_technician_id, v_tech_role;
    END IF;

    INSERT INTO work_orders (request_id, technician_id, status, estimated_cost, notes)
    VALUES (p_request_id, p_technician_id, 'Assigned', p_estimated_cost, COALESCE(p_notes, ''));

    UPDATE service_requests
       SET status = 'In Progress'
     WHERE request_id = p_request_id
       AND status = 'Open';
END;
$$;

-- -----------------------------------------------------------------------------
-- Block 5 (Procedure): Record utility bill payment and clear Overdue status
-- -----------------------------------------------------------------------------
CREATE OR REPLACE PROCEDURE record_utility_payment(
    p_account_id INT,
    p_amount     NUMERIC
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_balance     NUMERIC(10,2);
    v_status      VARCHAR(20);
    v_new_balance NUMERIC(10,2);
BEGIN
    IF p_amount IS NULL OR p_amount <= 0 THEN
        RAISE EXCEPTION 'Payment amount must be greater than zero';
    END IF;

    SELECT balance_due, status
      INTO v_balance, v_status
      FROM utility_accounts
     WHERE account_id = p_account_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Utility account % not found', p_account_id;
    END IF;

    IF p_amount > v_balance THEN
        RAISE EXCEPTION 'Payment amount % exceeds current balance due %', p_amount, v_balance;
    END IF;

    v_new_balance := v_balance - p_amount;

    UPDATE utility_accounts
       SET balance_due = v_new_balance,
           last_billed_at = NOW(),
           status = CASE
               WHEN v_new_balance = 0 AND v_status = 'Overdue' THEN 'Active'
               ELSE v_status
           END
     WHERE account_id = p_account_id;
END;
$$;

-- -----------------------------------------------------------------------------
-- Block 6 (Function): Average resolution time in hours (department or city-wide)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION avg_resolution_hours(p_department_id INT DEFAULT NULL)
RETURNS NUMERIC(10,2)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_avg NUMERIC(10,2);
BEGIN
    SELECT ROUND(
        COALESCE(
            AVG(EXTRACT(EPOCH FROM (resolved_at - created_at)) / 3600.0),
            0
        )::NUMERIC,
        2
    )
      INTO v_avg
      FROM service_requests
     WHERE resolved_at IS NOT NULL
       AND (p_department_id IS NULL OR department_id = p_department_id);

    RETURN v_avg;
END;
$$;

-- -----------------------------------------------------------------------------
-- Block 7 (Function): Count overdue open/in-progress requests per department
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION count_overdue_requests(p_days INT DEFAULT 7)
RETURNS TABLE (
    department_id   INT,
    department_name VARCHAR,
    overdue_count   BIGINT
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
    IF p_days < 0 THEN
        RAISE EXCEPTION 'Overdue threshold days cannot be negative';
    END IF;

    RETURN QUERY
    SELECT md.department_id,
           md.department_name,
           COUNT(sr.request_id)::BIGINT AS overdue_count
      FROM municipal_departments md
      JOIN service_requests sr ON sr.department_id = md.department_id
     WHERE sr.status IN ('Open', 'In Progress')
       AND sr.created_at < NOW() - MAKE_INTERVAL(days => p_days)
     GROUP BY md.department_id, md.department_name
     ORDER BY overdue_count DESC, md.department_name ASC;
END;
$$;
