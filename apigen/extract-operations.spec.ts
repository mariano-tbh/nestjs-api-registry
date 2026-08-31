import { describe, expect, it } from "vitest";
import { sampleDocument } from "./__fixtures__/sample-openapi.js";
import { extractOperations } from "./extract-operations.js";

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

  it("classifies path/query/header params by location", () => {
    const getPetById = operations.find((o) => o.operationId === "getPetById")!;
    expect(getPetById.pathParams).toEqual([{ wireName: "petId", localName: "petId" }]);
    expect(getPetById.queryParams).toEqual([]);
    expect(getPetById.headerParams).toEqual([]);

    const getByStatus = operations.find((o) => o.operationId === "get-by-status")!;
    expect(getByStatus.queryParams).toEqual([{ wireName: "status", localName: "status" }]);
    expect(getByStatus.headerParams).toEqual([{ wireName: "x-api-key", localName: "xApiKey" }]);
  });

  it("sets hasRequestBody based on the presence of requestBody", () => {
    expect(operations.find((o) => o.operationId === "getPetById")!.hasRequestBody).toBe(false);
    expect(operations.find((o) => o.operationId === "addPet")!.hasRequestBody).toBe(true);
  });

  it("throws when an operation has no operationId", () => {
    expect(() =>
      extractOperations({
        openapi: "3.0.0",
        paths: { "/x": { get: {} } },
      }),
    ).toThrow(/operationId/);
  });

  it("throws when two operationIds sanitize to the same identifier", () => {
    expect(() =>
      extractOperations({
        openapi: "3.0.0",
        paths: {
          "/a": { get: { operationId: "get-by-id" } },
          "/b": { get: { operationId: "getById" } },
        },
      }),
    ).toThrow(/collide/i);
  });

  it("throws when a path param and a query param collide once merged", () => {
    expect(() =>
      extractOperations({
        openapi: "3.0.0",
        paths: {
          "/a/{id}": {
            get: {
              operationId: "op",
              parameters: [
                { name: "id", in: "path", required: true },
                { name: "id", in: "query", required: false },
              ],
            },
          },
        },
      }),
    ).toThrow(/merged into a single params object/);
  });
});
