-- Smart City Management System (SCMS) - Complete Schema, PL/pgSQL & Seed Bundle
-- Run on a fresh PostgreSQL database.

-- =============================================================================
-- Smart City Management System (SCMS) - Data Definition Language (DDL)
-- PostgreSQL 15+ | Merged 9-Table Relational Schema
-- =============================================================================

-- 1. User Roles (Groups)
CREATE TABLE roles (
    role_id      SERIAL PRIMARY KEY,
    role_name    VARCHAR(40) NOT NULL UNIQUE,
    access_level INT NOT NULL CHECK (access_level BETWEEN 1 AND 100),
    description  TEXT NOT NULL DEFAULT ''
);

-- 2. System Users (Authentication & Authorization)
CREATE TABLE users (
    user_id       SERIAL PRIMARY KEY,
    username      VARCHAR(50) NOT NULL UNIQUE,
    email         VARCHAR(120) NOT NULL UNIQUE,
    password_hash VARCHAR(120) NOT NULL,
    full_name     VARCHAR(120) NOT NULL,
    role_id       INT NOT NULL REFERENCES roles(role_id) ON DELETE RESTRICT,
    status        VARCHAR(20) NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active', 'pending', 'suspended')),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Municipal Departments & Districts
CREATE TABLE municipal_departments (
    department_id   SERIAL PRIMARY KEY,
    department_name VARCHAR(100) NOT NULL UNIQUE,
    district_name   VARCHAR(80) NOT NULL,
    head_name       VARCHAR(120) NOT NULL,
    contact_phone   VARCHAR(30) NOT NULL,
    annual_budget   NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (annual_budget >= 0),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Citizens (Resident Profiles linked 1:1 with Users)
CREATE TABLE citizens (
    citizen_id    SERIAL PRIMARY KEY,
    user_id       INT NOT NULL UNIQUE REFERENCES users(user_id) ON DELETE CASCADE,
    national_id   VARCHAR(30) NOT NULL UNIQUE,
    district_name VARCHAR(80) NOT NULL,
    address       TEXT NOT NULL,
    phone         VARCHAR(30) NOT NULL,
    registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Utility Accounts (Water, Electricity, Waste, Gas Billing)
CREATE TABLE utility_accounts (
    account_id     SERIAL PRIMARY KEY,
    citizen_id     INT NOT NULL REFERENCES citizens(citizen_id) ON DELETE CASCADE,
    service_type   VARCHAR(30) NOT NULL
                   CHECK (service_type IN ('Water', 'Electricity', 'Waste', 'Gas')),
    meter_number   VARCHAR(40) NOT NULL UNIQUE,
    balance_due    NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (balance_due >= 0),
    status         VARCHAR(20) NOT NULL DEFAULT 'Active'
                   CHECK (status IN ('Active', 'Overdue', 'Suspended')),
    last_billed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Urban IoT Devices & Sensors
CREATE TABLE devices (
    device_id       SERIAL PRIMARY KEY,
    department_id   INT NOT NULL REFERENCES municipal_departments(department_id) ON DELETE RESTRICT,
    device_code     VARCHAR(40) NOT NULL UNIQUE,
    device_type     VARCHAR(40) NOT NULL
                    CHECK (device_type IN ('Air Quality', 'Traffic', 'Street Light', 'Water Meter', 'Noise')),
    district_name   VARCHAR(80) NOT NULL,
    location_label  VARCHAR(160) NOT NULL,
    threshold_value NUMERIC(10,2) NOT NULL CHECK (threshold_value > 0),
    status          VARCHAR(20) NOT NULL DEFAULT 'Active'
                    CHECK (status IN ('Active', 'Maintenance', 'Alert', 'Offline')),
    installed_at    DATE NOT NULL DEFAULT CURRENT_DATE
);

-- 7. IoT Sensor Readings (Time-Series Measurements)
CREATE TABLE sensor_readings (
    reading_id    SERIAL PRIMARY KEY,
    device_id     INT NOT NULL REFERENCES devices(device_id) ON DELETE CASCADE,
    reading_value NUMERIC(10,2) NOT NULL,
    unit          VARCHAR(20) NOT NULL,
    is_anomaly    BOOLEAN NOT NULL DEFAULT FALSE,
    recorded_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. Citizen Service Requests & Complaints
CREATE TABLE service_requests (
    request_id    SERIAL PRIMARY KEY,
    citizen_id    INT NOT NULL REFERENCES citizens(citizen_id) ON DELETE CASCADE,
    department_id INT NOT NULL REFERENCES municipal_departments(department_id) ON DELETE RESTRICT,
    category      VARCHAR(40) NOT NULL
                  CHECK (category IN (
                      'Pothole',
                      'Street Lighting',
                      'Waste Collection',
                      'Water Leak',
                      'Traffic Signal',
                      'Air Quality',
                      'Utility Billing'
                  )),
    title         VARCHAR(160) NOT NULL,
    description   TEXT NOT NULL,
    priority      VARCHAR(20) NOT NULL DEFAULT 'Medium'
                  CHECK (priority IN ('Low', 'Medium', 'High', 'Critical')),
    status        VARCHAR(20) NOT NULL DEFAULT 'Open'
                  CHECK (status IN ('Open', 'In Progress', 'Resolved', 'Closed')),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at   TIMESTAMPTZ,
    CHECK (resolved_at IS NULL OR resolved_at >= created_at)
);

-- 9. Maintenance Work Orders (Technician Dispatch & Cost Tracking)
CREATE TABLE work_orders (
    order_id       SERIAL PRIMARY KEY,
    request_id     INT NOT NULL REFERENCES service_requests(request_id) ON DELETE CASCADE,
    technician_id  INT NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
    status         VARCHAR(20) NOT NULL DEFAULT 'Assigned'
                   CHECK (status IN ('Assigned', 'In Progress', 'Completed', 'Cancelled')),
    estimated_cost NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (estimated_cost >= 0),
    actual_cost    NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (actual_cost >= 0),
    notes          TEXT NOT NULL DEFAULT '',
    assigned_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at   TIMESTAMPTZ,
    CHECK (completed_at IS NULL OR completed_at >= assigned_at)
);

-- Indexes on foreign keys and frequently filtered columns
CREATE INDEX idx_users_role_id ON users(role_id);
CREATE INDEX idx_utility_accounts_citizen_status ON utility_accounts(citizen_id, status);
CREATE INDEX idx_devices_dept_status ON devices(department_id, status);
CREATE INDEX idx_sensor_readings_device_time ON sensor_readings(device_id, recorded_at DESC);
CREATE INDEX idx_service_requests_citizen ON service_requests(citizen_id);
CREATE INDEX idx_service_requests_dept_status ON service_requests(department_id, status);
CREATE INDEX idx_work_orders_request ON work_orders(request_id);
CREATE INDEX idx_work_orders_tech_status ON work_orders(technician_id, status);

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

-- =============================================================================
-- Smart City Management System (SCMS) - Data Manipulation Language (DML)
-- Seed Data for all 9 Tables (Demo password for all seeded users: Passw0rd!)
-- =============================================================================

-- 1. Roles (User Groups)
INSERT INTO roles (role_name, access_level, description) VALUES
    ('admin', 100, 'Full system administration across departments, users, roles, and infrastructure.'),
    ('employee', 70, 'Municipal staff managing service requests, work orders, citizens, and utilities.'),
    ('technical_staff', 50, 'Field engineers executing assigned work orders and monitoring IoT sensors.'),
    ('citizen', 10, 'City residents submitting service requests and paying utility bills.');

-- 2. Users (Password hash corresponds to Passw0rd! at bcrypt cost 10)
INSERT INTO users (username, email, password_hash, full_name, role_id, status) VALUES
    (
        'admin',
        'admin@smartcity.gov',
        '$2b$10$yUAiTiCHZdbyFH6NiOGvDOc5hpIaNGDtKurYewFDbf0s21138BT4C',
        'Dr. Selin Aydin',
        (SELECT role_id FROM roles WHERE role_name = 'admin'),
        'active'
    ),
    (
        'staff.elena',
        'elena.markou@smartcity.gov',
        '$2b$10$yUAiTiCHZdbyFH6NiOGvDOc5hpIaNGDtKurYewFDbf0s21138BT4C',
        'Elena Markou',
        (SELECT role_id FROM roles WHERE role_name = 'employee'),
        'active'
    ),
    (
        'staff.murat',
        'murat.kaya@smartcity.gov',
        '$2b$10$yUAiTiCHZdbyFH6NiOGvDOc5hpIaNGDtKurYewFDbf0s21138BT4C',
        'Murat Kaya',
        (SELECT role_id FROM roles WHERE role_name = 'employee'),
        'active'
    ),
    (
        'tech.kemal',
        'kemal.demir@smartcity.gov',
        '$2b$10$yUAiTiCHZdbyFH6NiOGvDOc5hpIaNGDtKurYewFDbf0s21138BT4C',
        'Kemal Demir',
        (SELECT role_id FROM roles WHERE role_name = 'technical_staff'),
        'active'
    ),
    (
        'tech.leyla',
        'leyla.ozturk@smartcity.gov',
        '$2b$10$yUAiTiCHZdbyFH6NiOGvDOc5hpIaNGDtKurYewFDbf0s21138BT4C',
        'Leyla Ozturk',
        (SELECT role_id FROM roles WHERE role_name = 'technical_staff'),
        'active'
    ),
    (
        'citizen.ali',
        'ali.hassan@residents.org',
        '$2b$10$yUAiTiCHZdbyFH6NiOGvDOc5hpIaNGDtKurYewFDbf0s21138BT4C',
        'Ali Hassan',
        (SELECT role_id FROM roles WHERE role_name = 'citizen'),
        'active'
    ),
    (
        'citizen.zeynep',
        'zeynep.aksoy@residents.org',
        '$2b$10$yUAiTiCHZdbyFH6NiOGvDOc5hpIaNGDtKurYewFDbf0s21138BT4C',
        'Zeynep Aksoy',
        (SELECT role_id FROM roles WHERE role_name = 'citizen'),
        'active'
    ),
    (
        'citizen.omar',
        'omar.farouk@residents.org',
        '$2b$10$yUAiTiCHZdbyFH6NiOGvDOc5hpIaNGDtKurYewFDbf0s21138BT4C',
        'Omar Farouk',
        (SELECT role_id FROM roles WHERE role_name = 'citizen'),
        'active'
    ),
    (
        'citizen.sara',
        'sara.mansour@residents.org',
        '$2b$10$yUAiTiCHZdbyFH6NiOGvDOc5hpIaNGDtKurYewFDbf0s21138BT4C',
        'Sara Mansour',
        (SELECT role_id FROM roles WHERE role_name = 'citizen'),
        'pending'
    );

-- 3. Municipal Departments
INSERT INTO municipal_departments (department_name, district_name, head_name, contact_phone, annual_budget) VALUES
    ('Public Works & Roads', 'Central District', 'Hakan Yildirim', '+90 392 555 0101', 850000.00),
    ('Smart Lighting & Energy', 'North District', 'Deniz Arslan', '+90 392 555 0102', 520000.00),
    ('Water & Sanitation', 'Harbor District', 'Meral Sahin', '+90 392 555 0103', 940000.00),
    ('Environmental Monitoring', 'Greenbelt District', 'Caner Polat', '+90 392 555 0104', 410000.00),
    ('Urban Mobility & Traffic', 'University Quarter', 'Aylin Kurt', '+90 392 555 0105', 670000.00);

-- 4. Citizens
INSERT INTO citizens (user_id, national_id, district_name, address, phone) VALUES
    (
        (SELECT user_id FROM users WHERE username = 'citizen.ali'),
        'CIT-1001',
        'Central District',
        '14 Independence Boulevard, Block B',
        '+90 533 811 1001'
    ),
    (
        (SELECT user_id FROM users WHERE username = 'citizen.zeynep'),
        'CIT-1002',
        'Harbor District',
        '29 Marina Crescent, Apt 7',
        '+90 533 811 1002'
    ),
    (
        (SELECT user_id FROM users WHERE username = 'citizen.omar'),
        'CIT-1003',
        'University Quarter',
        '88 Campus Parkway, Suite 3',
        '+90 533 811 1003'
    ),
    (
        (SELECT user_id FROM users WHERE username = 'citizen.sara'),
        'CIT-1004',
        'North District',
        '5 Cedar Lane',
        '+90 533 811 1004'
    );

-- 5. Utility Accounts
INSERT INTO utility_accounts (citizen_id, service_type, meter_number, balance_due, status, last_billed_at) VALUES
    (
        (SELECT citizen_id FROM citizens WHERE national_id = 'CIT-1001'),
        'Water',
        'WTR-1001-A',
        64.50,
        'Active',
        NOW() - INTERVAL '10 days'
    ),
    (
        (SELECT citizen_id FROM citizens WHERE national_id = 'CIT-1001'),
        'Electricity',
        'ELC-1001-B',
        185.00,
        'Overdue',
        NOW() - INTERVAL '38 days'
    ),
    (
        (SELECT citizen_id FROM citizens WHERE national_id = 'CIT-1001'),
        'Waste',
        'WST-1001-C',
        0.00,
        'Active',
        NOW() - INTERVAL '5 days'
    ),
    (
        (SELECT citizen_id FROM citizens WHERE national_id = 'CIT-1002'),
        'Water',
        'WTR-1002-A',
        210.75,
        'Overdue',
        NOW() - INTERVAL '42 days'
    ),
    (
        (SELECT citizen_id FROM citizens WHERE national_id = 'CIT-1002'),
        'Gas',
        'GAS-1002-B',
        92.40,
        'Active',
        NOW() - INTERVAL '12 days'
    ),
    (
        (SELECT citizen_id FROM citizens WHERE national_id = 'CIT-1003'),
        'Electricity',
        'ELC-1003-A',
        142.00,
        'Overdue',
        NOW() - INTERVAL '29 days'
    ),
    (
        (SELECT citizen_id FROM citizens WHERE national_id = 'CIT-1003'),
        'Waste',
        'WST-1003-B',
        28.00,
        'Active',
        NOW() - INTERVAL '8 days'
    ),
    (
        (SELECT citizen_id FROM citizens WHERE national_id = 'CIT-1004'),
        'Water',
        'WTR-1004-A',
        310.00,
        'Suspended',
        NOW() - INTERVAL '65 days'
    );

-- 6. IoT Devices
INSERT INTO devices (department_id, device_code, device_type, district_name, location_label, threshold_value, status, installed_at) VALUES
    (
        (SELECT department_id FROM municipal_departments WHERE department_name = 'Environmental Monitoring'),
        'AQ-CENT-01',
        'Air Quality',
        'Central District',
        'Ataturk Square North',
        100.00,
        'Active',
        CURRENT_DATE - 320
    ),
    (
        (SELECT department_id FROM municipal_departments WHERE department_name = 'Environmental Monitoring'),
        'AQ-GREEN-02',
        'Air Quality',
        'Greenbelt District',
        'Botanical Park Gate',
        90.00,
        'Active',
        CURRENT_DATE - 280
    ),
    (
        (SELECT department_id FROM municipal_departments WHERE department_name = 'Urban Mobility & Traffic'),
        'TRF-UNIV-01',
        'Traffic',
        'University Quarter',
        'Campus Ring Junction',
        120.00,
        'Active',
        CURRENT_DATE - 210
    ),
    (
        (SELECT department_id FROM municipal_departments WHERE department_name = 'Urban Mobility & Traffic'),
        'TRF-CENT-02',
        'Traffic',
        'Central District',
        'City Hall Crossing',
        140.00,
        'Active',
        CURRENT_DATE - 190
    ),
    (
        (SELECT department_id FROM municipal_departments WHERE department_name = 'Smart Lighting & Energy'),
        'SL-NORTH-01',
        'Street Light',
        'North District',
        'Cedar Avenue Pole 18',
        240.00,
        'Maintenance',
        CURRENT_DATE - 400
    ),
    (
        (SELECT department_id FROM municipal_departments WHERE department_name = 'Water & Sanitation'),
        'WM-HARB-01',
        'Water Meter',
        'Harbor District',
        'Port Main Trunk Pipe',
        80.00,
        'Active',
        CURRENT_DATE - 150
    ),
    (
        (SELECT department_id FROM municipal_departments WHERE department_name = 'Water & Sanitation'),
        'WM-HARB-02',
        'Water Meter',
        'Harbor District',
        'Marina Pumping Station',
        85.00,
        'Active',
        CURRENT_DATE - 140
    ),
    (
        (SELECT department_id FROM municipal_departments WHERE department_name = 'Environmental Monitoring'),
        'NS-UNIV-01',
        'Noise',
        'University Quarter',
        'Library Plaza Corner',
        75.00,
        'Active',
        CURRENT_DATE - 95
    );

-- 7. IoT Sensor Readings (Values above device threshold automatically fire trg_sensor_reading_anomaly)
INSERT INTO sensor_readings (device_id, reading_value, unit, recorded_at) VALUES
    ((SELECT device_id FROM devices WHERE device_code = 'AQ-CENT-01'), 78.50, 'AQI', NOW() - INTERVAL '3 days'),
    ((SELECT device_id FROM devices WHERE device_code = 'AQ-CENT-01'), 132.40, 'AQI', NOW() - INTERVAL '2 hours'),
    ((SELECT device_id FROM devices WHERE device_code = 'AQ-GREEN-02'), 54.00, 'AQI', NOW() - INTERVAL '1 day'),
    ((SELECT device_id FROM devices WHERE device_code = 'AQ-GREEN-02'), 61.20, 'AQI', NOW() - INTERVAL '3 hours'),
    ((SELECT device_id FROM devices WHERE device_code = 'TRF-UNIV-01'), 108.00, 'veh/min', NOW() - INTERVAL '2 days'),
    ((SELECT device_id FROM devices WHERE device_code = 'TRF-UNIV-01'), 156.00, 'veh/min', NOW() - INTERVAL '1 hour'),
    ((SELECT device_id FROM devices WHERE device_code = 'TRF-CENT-02'), 112.00, 'veh/min', NOW() - INTERVAL '4 hours'),
    ((SELECT device_id FROM devices WHERE device_code = 'SL-NORTH-01'), 228.50, 'V', NOW() - INTERVAL '6 hours'),
    ((SELECT device_id FROM devices WHERE device_code = 'SL-NORTH-01'), 231.00, 'V', NOW() - INTERVAL '2 hours'),
    ((SELECT device_id FROM devices WHERE device_code = 'WM-HARB-01'), 62.00, 'PSI', NOW() - INTERVAL '5 days'),
    ((SELECT device_id FROM devices WHERE device_code = 'WM-HARB-01'), 94.80, 'PSI', NOW() - INTERVAL '45 minutes'),
    ((SELECT device_id FROM devices WHERE device_code = 'WM-HARB-02'), 71.30, 'PSI', NOW() - INTERVAL '3 hours'),
    ((SELECT device_id FROM devices WHERE device_code = 'NS-UNIV-01'), 66.00, 'dBA', NOW() - INTERVAL '2 days'),
    ((SELECT device_id FROM devices WHERE device_code = 'NS-UNIV-01'), 84.50, 'dBA', NOW() - INTERVAL '20 minutes');

-- 8. Citizen Service Requests
INSERT INTO service_requests (citizen_id, department_id, category, title, description, priority, status, created_at, resolved_at) VALUES
    (
        (SELECT citizen_id FROM citizens WHERE national_id = 'CIT-1001'),
        (SELECT department_id FROM municipal_departments WHERE department_name = 'Public Works & Roads'),
        'Pothole',
        'Deep pothole on Independence Blvd',
        'Large asphalt crater near crosswalk causing sudden braking.',
        'Critical',
        'Open',
        NOW() - INTERVAL '16 days',
        NULL
    ),
    (
        (SELECT citizen_id FROM citizens WHERE national_id = 'CIT-1002'),
        (SELECT department_id FROM municipal_departments WHERE department_name = 'Public Works & Roads'),
        'Pothole',
        'Cracked pavement beside Harbor Clinic',
        'Multiple fractures along bus stop bay.',
        'High',
        'In Progress',
        NOW() - INTERVAL '12 days',
        NULL
    ),
    (
        (SELECT citizen_id FROM citizens WHERE national_id = 'CIT-1003'),
        (SELECT department_id FROM municipal_departments WHERE department_name = 'Public Works & Roads'),
        'Waste Collection',
        'Overflowing recycling bins at Campus Gate',
        'Weekend collection appears skipped; bins overflowing onto walkway.',
        'Medium',
        'Open',
        NOW() - INTERVAL '9 days',
        NULL
    ),
    (
        (SELECT citizen_id FROM citizens WHERE national_id = 'CIT-1001'),
        (SELECT department_id FROM municipal_departments WHERE department_name = 'Smart Lighting & Energy'),
        'Street Lighting',
        'Blackout along Cedar Avenue poles 15-20',
        'Six consecutive street lamps stay off after sunset.',
        'High',
        'In Progress',
        NOW() - INTERVAL '11 days',
        NULL
    ),
    (
        (SELECT citizen_id FROM citizens WHERE national_id = 'CIT-1002'),
        (SELECT department_id FROM municipal_departments WHERE department_name = 'Water & Sanitation'),
        'Water Leak',
        'Subsurface water leak on Marina Crescent',
        'Continuous clean water seepage beside meter vault.',
        'Critical',
        'Open',
        NOW() - INTERVAL '14 days',
        NULL
    ),
    (
        (SELECT citizen_id FROM citizens WHERE national_id = 'CIT-1003'),
        (SELECT department_id FROM municipal_departments WHERE department_name = 'Urban Mobility & Traffic'),
        'Traffic Signal',
        'Stuck pedestrian phase at Campus Ring',
        'Crosswalk signal holds red for 3+ minutes during peak traffic.',
        'High',
        'Open',
        NOW() - INTERVAL '3 days',
        NULL
    ),
    (
        (SELECT citizen_id FROM citizens WHERE national_id = 'CIT-1001'),
        (SELECT department_id FROM municipal_departments WHERE department_name = 'Environmental Monitoring'),
        'Air Quality',
        'Diesel fume spike near Central Bus Depot',
        'Idling coaches raising particulate levels during morning rush.',
        'Medium',
        'Open',
        NOW() - INTERVAL '2 days',
        NULL
    ),
    (
        (SELECT citizen_id FROM citizens WHERE national_id = 'CIT-1002'),
        (SELECT department_id FROM municipal_departments WHERE department_name = 'Public Works & Roads'),
        'Pothole',
        'Repaved stormwater trench sinking',
        'Trench patch settled 6 cm after heavy rain.',
        'High',
        'Resolved',
        NOW() - INTERVAL '52 days',
        NOW() - INTERVAL '49 days'
    ),
    (
        (SELECT citizen_id FROM citizens WHERE national_id = 'CIT-1003'),
        (SELECT department_id FROM municipal_departments WHERE department_name = 'Smart Lighting & Energy'),
        'Street Lighting',
        'Flickering LED head on Library Plaza',
        'Fixture cycles every 15 seconds overnight.',
        'Low',
        'Resolved',
        NOW() - INTERVAL '38 days',
        NOW() - INTERVAL '36 days'
    ),
    (
        (SELECT citizen_id FROM citizens WHERE national_id = 'CIT-1001'),
        (SELECT department_id FROM municipal_departments WHERE department_name = 'Water & Sanitation'),
        'Water Leak',
        'Hydrant valve drip at Central Market',
        'Slow continuous drip from main hydrant flange.',
        'Medium',
        'Closed',
        NOW() - INTERVAL '26 days',
        NOW() - INTERVAL '24 days'
    ),
    (
        (SELECT citizen_id FROM citizens WHERE national_id = 'CIT-1002'),
        (SELECT department_id FROM municipal_departments WHERE department_name = 'Water & Sanitation'),
        'Utility Billing',
        'Water meter reading discrepancy review',
        'Requested physical inspection of meter WTR-1002-A.',
        'Low',
        'Resolved',
        NOW() - INTERVAL '19 days',
        NOW() - INTERVAL '17 days'
    ),
    (
        (SELECT citizen_id FROM citizens WHERE national_id = 'CIT-1003'),
        (SELECT department_id FROM municipal_departments WHERE department_name = 'Urban Mobility & Traffic'),
        'Traffic Signal',
        'Damaged cycle lane bollard at Gate 2',
        'Reflective post knocked down by delivery van.',
        'Medium',
        'Resolved',
        NOW() - INTERVAL '8 days',
        NOW() - INTERVAL '6 days'
    );

-- 9. Maintenance Work Orders (All technician_id references hold technical_staff or admin role)
INSERT INTO work_orders (request_id, technician_id, status, estimated_cost, actual_cost, notes, assigned_at, completed_at) VALUES
    (
        (SELECT request_id FROM service_requests WHERE title = 'Repaved stormwater trench sinking'),
        (SELECT user_id FROM users WHERE username = 'tech.kemal'),
        'Completed',
        450.00,
        485.00,
        'Milled 12 sqm and compacted hot-mix asphalt.',
        NOW() - INTERVAL '51 days',
        NOW() - INTERVAL '49 days'
    ),
    (
        (SELECT request_id FROM service_requests WHERE title = 'Flickering LED head on Library Plaza'),
        (SELECT user_id FROM users WHERE username = 'tech.leyla'),
        'Completed',
        180.00,
        165.00,
        'Replaced faulty ballast driver module.',
        NOW() - INTERVAL '37 days',
        NOW() - INTERVAL '36 days'
    ),
    (
        (SELECT request_id FROM service_requests WHERE title = 'Hydrant valve drip at Central Market'),
        (SELECT user_id FROM users WHERE username = 'tech.kemal'),
        'Completed',
        210.00,
        195.00,
        'Installed new EPDM gasket and pressure-tested line.',
        NOW() - INTERVAL '25 days',
        NOW() - INTERVAL '24 days'
    ),
    (
        (SELECT request_id FROM service_requests WHERE title = 'Water meter reading discrepancy review'),
        (SELECT user_id FROM users WHERE username = 'tech.leyla'),
        'Completed',
        75.00,
        75.00,
        'Calibrated flow sensor and logged reading.',
        NOW() - INTERVAL '18 days',
        NOW() - INTERVAL '17 days'
    ),
    (
        (SELECT request_id FROM service_requests WHERE title = 'Damaged cycle lane bollard at Gate 2'),
        (SELECT user_id FROM users WHERE username = 'tech.kemal'),
        'Completed',
        130.00,
        140.00,
        'Anchored replacement flexible bollard.',
        NOW() - INTERVAL '7 days',
        NOW() - INTERVAL '6 days'
    ),
    (
        (SELECT request_id FROM service_requests WHERE title = 'Cracked pavement beside Harbor Clinic'),
        (SELECT user_id FROM users WHERE username = 'tech.kemal'),
        'In Progress',
        620.00,
        240.00,
        'Site cordoned; base aggregate delivered.',
        NOW() - INTERVAL '10 days',
        NULL
    ),
    (
        (SELECT request_id FROM service_requests WHERE title = 'Blackout along Cedar Avenue poles 15-20'),
        (SELECT user_id FROM users WHERE username = 'tech.leyla'),
        'In Progress',
        340.00,
        120.00,
        'Isolating underground feeder relay fault.',
        NOW() - INTERVAL '9 days',
        NULL
    ),
    (
        (SELECT request_id FROM service_requests WHERE title = 'Deep pothole on Independence Blvd'),
        (SELECT user_id FROM users WHERE username = 'admin'),
        'Assigned',
        500.00,
        0.00,
        'Emergency road crew scheduled for morning shift.',
        NOW() - INTERVAL '1 day',
        NULL
    );

-- =============================================================================
-- Sample UPDATE & DELETE statements (commented out to preserve initial seed)
-- =============================================================================
-- UPDATE service_requests SET priority = 'Critical' WHERE title = 'Stuck pedestrian phase at Campus Ring';
-- UPDATE work_orders SET status = 'Completed', actual_cost = 510.00 WHERE notes LIKE 'Emergency road crew%';
-- DELETE FROM sensor_readings WHERE reading_value < 0;
