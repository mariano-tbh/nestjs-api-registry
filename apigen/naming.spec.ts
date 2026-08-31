import { describe, expect, it } from "vitest";
import {
  sanitizeIdentifier,
  sanitizeIdentifiers,
  toKebabCase,
  toScreamingSnakeCase,
} from "./naming.js";

describe("sanitizeIdentifier", () => {
  it("passes an already-camelCase identifier through unchanged", () => {
    expect(sanitizeIdentifier("getPetById")).toBe("getPetById");
  });

  it("camelCases a hyphenated operationId", () => {
    expect(sanitizeIdentifier("get-by-id")).toBe("getById");
  });

  it("camelCases a hyphenated header param name", () => {
    expect(sanitizeIdentifier("x-api-key")).toBe("xApiKey");
  });

  it("camelCases snake_case", () => {
    expect(sanitizeIdentifier("get_pet_by_id")).toBe("getPetById");
  });

  it("lowercases a leading capital", () => {
    expect(sanitizeIdentifier("GetPetById")).toBe("getPetById");
  });

  it("prefixes a leading digit", () => {
    expect(sanitizeIdentifier("123abc")).toBe("_123abc");
  });

  it("throws when nothing alphanumeric remains", () => {
    expect(() => sanitizeIdentifier("---")).toThrow();
  });
});

describe("sanitizeIdentifiers", () => {
  it("maps each raw name to its sanitized identifier", () => {
    const result = sanitizeIdentifiers(["getPetById", "get-by-status"], "operationId");
    expect(result.get("getPetById")).toBe("getPetById");
    expect(result.get("get-by-status")).toBe("getByStatus");
  });

  it("throws when two different raw names collide on the same identifier", () => {
    expect(() => sanitizeIdentifiers(["get-by-id", "getById"], "operationId")).toThrow(/collide/i);
  });

  it("does not throw when the same raw name repeats", () => {
    expect(() => sanitizeIdentifiers(["status", "status"], "operationId")).not.toThrow();
  });
});

describe("toScreamingSnakeCase", () => {
  it("splits PascalCase", () => {
    expect(toScreamingSnakeCase("PetStore")).toBe("PET_STORE");
  });

  it("splits camelCase", () => {
    expect(toScreamingSnakeCase("petStore")).toBe("PET_STORE");
  });

  it("splits kebab-case", () => {
    expect(toScreamingSnakeCase("pet-store")).toBe("PET_STORE");
  });
});

describe("toKebabCase", () => {
  it("splits PascalCase", () => {
    expect(toKebabCase("PetStore")).toBe("pet-store");
  });

  it("splits camelCase", () => {
    expect(toKebabCase("petStore")).toBe("pet-store");
  });

  it("splits SCREAMING_SNAKE_CASE", () => {
    expect(toKebabCase("PET_STORE")).toBe("pet-store");
  });

  it("passes already-kebab-case input through unchanged", () => {
    expect(toKebabCase("pet-store")).toBe("pet-store");
  });

  it("throws when nothing alphanumeric remains", () => {
    expect(() => toKebabCase("---")).toThrow();
  });
});
