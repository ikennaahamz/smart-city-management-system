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
