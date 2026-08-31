import type { OpenAPI3 } from "openapi-typescript";

/**
 * A small, hand-written OpenAPI 3.0 document covering: a path param
 * (getPetById), a JSON request body (addPet), and a hyphenated operationId
 * with a hyphenated query param and header param (get-by-status) to exercise
 * identifier sanitization.
 */
export const sampleDocument = {
  openapi: "3.0.0",
  info: { title: "Sample", version: "1.0.0" },
  paths: {
    "/pet/{petId}": {
      get: {
        operationId: "getPetById",
        parameters: [{ name: "petId", in: "path", required: true, schema: { type: "integer" } }],
        responses: {
          "200": {
            description: "ok",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Pet" } } },
          },
        },
      },
    },
    "/pet": {
      post: {
        operationId: "addPet",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/Pet" } } },
        },
        responses: {
          "200": {
            description: "ok",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Pet" } } },
          },
        },
      },
    },
    "/pet/findByStatus": {
      get: {
        operationId: "get-by-status",
        parameters: [
          { name: "status", in: "query", required: false, schema: { type: "string" } },
          { name: "x-api-key", in: "header", required: false, schema: { type: "string" } },
        ],
        responses: {
          "200": {
            description: "ok",
            content: {
              "application/json": {
                schema: { type: "array", items: { $ref: "#/components/schemas/Pet" } },
              },
            },
          },
        },
      },
    },
  },
  components: {
    schemas: {
      Pet: {
        type: "object",
        properties: { id: { type: "integer" }, name: { type: "string" } },
        required: ["id", "name"],
      },
    },
  },
} satisfies OpenAPI3;
