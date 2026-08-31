import { describe, expect, it } from "vitest";
import { sampleDocument } from "./__fixtures__/sample-openapi.js";
import { extractOperations } from "./extract-operations.js";

const info = { title: "Test", version: "1.0.0" };

describe("extractOperations", () => {
  const operations = extractOperations(sampleDocument);

  it("extracts one entry per operation, in document order", () => {
    expect(operations.map((op) => op.operationId)).toEqual([
      "getPetById",
      "addPet",
      "get-by-status",
    ]);
  });

  it("sanitizes a hyphenated operationId for use as an identifier", () => {
    const op = operations.find((o) => o.operationId === "get-by-status")!;
    expect(op.localOperationId).toBe("getByStatus");
  });

  it("carries the path, method and raw operation object through", () => {
    const op = operations.find((o) => o.operationId === "addPet")!;
    expect(op.path).toBe("/pet");
    expect(op.method).toBe("post");
    expect(op.operation.operationId).toBe("addPet");
  });

  it("throws when an operation has no operationId", () => {
    expect(() =>
      extractOperations({
        openapi: "3.0.0",
        info,
        paths: { "/x": { get: {} } },
      }),
    ).toThrow(/operationId/);
  });

  it("throws when two operationIds sanitize to the same identifier", () => {
    expect(() =>
      extractOperations({
        openapi: "3.0.0",
        info,
        paths: {
          "/a": { get: { operationId: "get-by-id" } },
          "/b": { get: { operationId: "getById" } },
        },
      }),
    ).toThrow(/collide/i);
  });
});
