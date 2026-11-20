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
