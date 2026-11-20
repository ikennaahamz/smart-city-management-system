import { z } from "zod";

export const USER_STATUSES = ["active", "pending", "suspended"] as const;
export const SERVICE_TYPES = ["Water", "Electricity", "Waste", "Gas"] as const;
export const ACCOUNT_STATUSES = ["Active", "Overdue", "Suspended"] as const;
export const DEVICE_TYPES = [
  "Air Quality",
  "Traffic",
  "Street Light",
  "Water Meter",
  "Noise",
] as const;
export const DEVICE_STATUSES = ["Active", "Maintenance", "Alert", "Offline"] as const;
export const REQUEST_CATEGORIES = [
  "Pothole",
  "Street Lighting",
  "Waste Collection",
  "Water Leak",
  "Traffic Signal",
  "Air Quality",
  "Utility Billing",
] as const;
export const REQUEST_PRIORITIES = ["Low", "Medium", "High", "Critical"] as const;
export const REQUEST_STATUSES = ["Open", "In Progress", "Resolved", "Closed"] as const;
export const WORK_ORDER_STATUSES = [
  "Assigned",
  "In Progress",
  "Completed",
  "Cancelled",
] as const;

export const loginSchema = z.object({
  username: z.string().trim().min(1, "Username is required."),
  password: z.string().min(1, "Password is required."),
});

export const registerSchema = z.object({
  username: z.string().trim().min(3, "Username must be at least 3 characters.").max(50),
  email: z.string().trim().email("Enter a valid email address.").max(120),
  full_name: z.string().trim().min(2, "Full name is required.").max(120),
  password: z.string().min(8, "Password must be at least 8 characters."),
  confirmation: z.string().min(1, "Password confirmation is required."),
  national_id: z.string().trim().min(4, "National ID is required.").max(30),
  district_name: z.string().trim().min(2, "District name is required.").max(80),
  address: z.string().trim().min(4, "Address is required.").max(300),
  phone: z.string().trim().min(5, "Phone number is required.").max(30),
});

export const roleCreateSchema = z.object({
  role_name: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z][a-z0-9_]{1,38}$/, "Role name must be lowercase letters, digits, or underscores."),
  access_level: z.coerce.number().int().min(1).max(100),
  description: z.string().trim().max(300).default(""),
});

export const roleUpdateSchema = roleCreateSchema.partial().refine(
  (d) => Object.keys(d).length > 0,
  "Provide at least one field to update.",
);

export const userCreateSchema = z.object({
  username: z.string().trim().toLowerCase().min(3).max(50),
  email: z.string().trim().toLowerCase().email().max(120),
  full_name: z.string().trim().min(2).max(120),
  role_id: z.coerce.number().int().positive(),
  status: z.enum(USER_STATUSES).default("active"),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

export const userUpdateSchema = z
  .object({
    username: z.string().trim().toLowerCase().min(3).max(50).optional(),
    email: z.string().trim().toLowerCase().email().max(120).optional(),
    full_name: z.string().trim().min(2).max(120).optional(),
    role_id: z.coerce.number().int().positive().optional(),
    status: z.enum(USER_STATUSES).optional(),
    password: z.string().min(8).optional(),
  })
  .refine((d) => Object.keys(d).length > 0, "Provide at least one field to update.");

export const departmentCreateSchema = z.object({
  department_name: z.string().trim().min(2).max(100),
  district_name: z.string().trim().min(2).max(80),
  head_name: z.string().trim().min(2).max(120),
  contact_phone: z.string().trim().min(5).max(30),
  annual_budget: z.coerce.number().finite().min(0, "Annual budget cannot be negative."),
});

export const departmentUpdateSchema = departmentCreateSchema
  .partial()
  .refine((d) => Object.keys(d).length > 0, "Provide at least one field to update.");

export const citizenCreateSchema = z.object({
  user_id: z.coerce.number().int().positive(),
  national_id: z.string().trim().min(4).max(30),
  district_name: z.string().trim().min(2).max(80),
  address: z.string().trim().min(4).max(300),
  phone: z.string().trim().min(5).max(30),
});

export const citizenUpdateSchema = z
  .object({
    national_id: z.string().trim().min(4).max(30).optional(),
    district_name: z.string().trim().min(2).max(80).optional(),
    address: z.string().trim().min(4).max(300).optional(),
    phone: z.string().trim().min(5).max(30).optional(),
  })
  .refine((d) => Object.keys(d).length > 0, "Provide at least one field to update.");

export const utilityAccountCreateSchema = z.object({
  citizen_id: z.coerce.number().int().positive(),
  service_type: z.enum(SERVICE_TYPES),
  meter_number: z.string().trim().min(3).max(40),
  balance_due: z.coerce.number().finite().min(0, "Balance due cannot be negative.").default(0),
  status: z.enum(ACCOUNT_STATUSES).default("Active"),
});

export const utilityAccountUpdateSchema = utilityAccountCreateSchema
  .partial()
  .refine((d) => Object.keys(d).length > 0, "Provide at least one field to update.");

export const utilityPaymentSchema = z.object({
  amount: z.coerce.number().finite().positive("Payment amount must be greater than zero."),
});

export const deviceCreateSchema = z.object({
  department_id: z.coerce.number().int().positive(),
  device_code: z.string().trim().min(2).max(40),
  device_type: z.enum(DEVICE_TYPES),
  district_name: z.string().trim().min(2).max(80),
  location_label: z.string().trim().min(2).max(160),
  threshold_value: z.coerce
    .number()
    .finite()
    .positive("Threshold value must be greater than zero."),
  status: z.enum(DEVICE_STATUSES).default("Active"),
  installed_at: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "installed_at must use YYYY-MM-DD format.")
    .optional(),
});

export const deviceUpdateSchema = deviceCreateSchema
  .partial()
  .refine((d) => Object.keys(d).length > 0, "Provide at least one field to update.");

export const sensorReadingCreateSchema = z.object({
  reading_value: z.coerce.number().finite("Reading value must be numeric."),
  unit: z.string().trim().min(1, "Unit is required.").max(20),
});

export const serviceRequestCreateSchema = z.object({
  citizen_id: z.coerce.number().int().positive().optional(),
  department_id: z.coerce.number().int().positive(),
  category: z.enum(REQUEST_CATEGORIES),
  title: z.string().trim().min(3, "Title must be at least 3 characters.").max(160),
  description: z.string().trim().min(5, "Description must be at least 5 characters.").max(2000),
  priority: z.enum(REQUEST_PRIORITIES).default("Medium"),
});

export const serviceRequestUpdateSchema = z
  .object({
    department_id: z.coerce.number().int().positive().optional(),
    category: z.enum(REQUEST_CATEGORIES).optional(),
    title: z.string().trim().min(3).max(160).optional(),
    description: z.string().trim().min(5).max(2000).optional(),
    priority: z.enum(REQUEST_PRIORITIES).optional(),
    status: z.enum(REQUEST_STATUSES).optional(),
  })
  .refine((d) => Object.keys(d).length > 0, "Provide at least one field to update.");

export const assignTechnicianSchema = z.object({
  technician_id: z.coerce.number().int().positive(),
  estimated_cost: z.coerce.number().finite().min(0, "Estimated cost cannot be negative.").default(0),
  notes: z.string().trim().max(1000).default(""),
});

export const workOrderCreateSchema = z.object({
  request_id: z.coerce.number().int().positive(),
  technician_id: z.coerce.number().int().positive(),
  status: z.enum(WORK_ORDER_STATUSES).default("Assigned"),
  estimated_cost: z.coerce.number().finite().min(0).default(0),
  actual_cost: z.coerce.number().finite().min(0).default(0),
  notes: z.string().trim().max(1000).default(""),
});

export const workOrderUpdateSchema = z
  .object({
    technician_id: z.coerce.number().int().positive().optional(),
    status: z.enum(WORK_ORDER_STATUSES).optional(),
    estimated_cost: z.coerce.number().finite().min(0).optional(),
    actual_cost: z.coerce.number().finite().min(0).optional(),
    notes: z.string().trim().max(1000).optional(),
  })
  .refine((d) => Object.keys(d).length > 0, "Provide at least one field to update.");

export function parsePositiveId(raw: string | string[] | undefined, _label = "ID"): number | null {
  if (typeof raw !== "string" || !/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}
