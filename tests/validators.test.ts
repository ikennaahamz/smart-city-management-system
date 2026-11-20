import { describe, expect, it } from "vitest";
import {
  assignTechnicianSchema,
  departmentCreateSchema,
  deviceCreateSchema,
  parsePositiveId,
  roleCreateSchema,
  serviceRequestCreateSchema,
  utilityPaymentSchema,
  workOrderCreateSchema,
} from "../src/validators";

describe("Zod payload validators", () => {
  it("validates department payloads and rejects negative budgets", () => {
    expect(
      departmentCreateSchema.safeParse({
        department_name: "Public Works",
        district_name: "Central",
        head_name: "A. Demir",
        contact_phone: "+90 533 000 0000",
        annual_budget: "250000",
      }).success,
    ).toBe(true);

    expect(
      departmentCreateSchema.safeParse({
        department_name: "Public Works",
        district_name: "Central",
        head_name: "A. Demir",
        contact_phone: "+90 533 000 0000",
        annual_budget: -10,
      }).success,
    ).toBe(false);
  });

  it("validates device types and positive thresholds", () => {
    expect(
      deviceCreateSchema.safeParse({
        department_id: 1,
        device_code: "AQ-01",
        device_type: "Air Quality",
        district_name: "Central",
        location_label: "Main Square",
        threshold_value: 75,
      }).success,
    ).toBe(true);

    expect(
      deviceCreateSchema.safeParse({
        department_id: 1,
        device_code: "AQ-01",
        device_type: "Quantum Radar",
        district_name: "Central",
        location_label: "Main Square",
        threshold_value: 0,
      }).success,
    ).toBe(false);
  });

  it("rejects zero or negative utility payments", () => {
    expect(utilityPaymentSchema.safeParse({ amount: 50 }).success).toBe(true);
    expect(utilityPaymentSchema.safeParse({ amount: 0 }).success).toBe(false);
    expect(utilityPaymentSchema.safeParse({ amount: -15 }).success).toBe(false);
  });

  it("validates service requests, work orders, roles, and technician assignments", () => {
    expect(
      serviceRequestCreateSchema.safeParse({
        department_id: 1,
        category: "Pothole",
        title: "Deep pothole near school",
        description: "Damaged asphalt right outside the north gate.",
        priority: "High",
      }).success,
    ).toBe(true);

    expect(
      roleCreateSchema.safeParse({
        role_name: "field_inspector",
        access_level: 45,
        description: "Inspects urban sites",
      }).success,
    ).toBe(true);

    expect(
      roleCreateSchema.safeParse({
        role_name: "Bad Role Name!",
        access_level: 101,
      }).success,
    ).toBe(false);

    expect(
      assignTechnicianSchema.safeParse({
        technician_id: 4,
        estimated_cost: 120,
      }).success,
    ).toBe(true);

    expect(
      workOrderCreateSchema.safeParse({
        request_id: 1,
        technician_id: 4,
        status: "Assigned",
      }).success,
    ).toBe(true);
  });

  it("parsePositiveId accepts positive integers only", () => {
    expect(parsePositiveId("12")).toBe(12);
    expect(parsePositiveId("0")).toBeNull();
    expect(parsePositiveId("-3")).toBeNull();
    expect(parsePositiveId("12abc")).toBeNull();
    expect(parsePositiveId(undefined)).toBeNull();
  });
});
