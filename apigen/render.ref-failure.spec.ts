import type { OpenAPI3 } from "openapi-typescript";
import { describe, expect, it, vi } from "vitest";
import { writeTempSpec } from "./__fixtures__/write-temp-spec.js";
import { extractOperations } from "./extract-operations.js";

// openapi-typescript resolves $refs itself when generating schema types, and
// hard-fails the whole generation if *it* can't resolve one -- so a document
// with a genuinely dangling/unreachable $ref never reaches our own
// resolveOperationParams fallback at all; the graceful "skip this one
// parameter" behavior only matters for a $ref openapi-typescript resolves
// fine but *our* simpler resolver fails on for some other reason (a network
// hiccup, a resolution edge case ours doesn't handle, ...). Mocking
// resolveRef is how we simulate that scenario in isolation, independent of
// whether the document itself is otherwise valid.
vi.mock("./resolve-ref.js", () => ({
  resolveRef: vi.fn().mockRejectedValue(new Error("simulated resolution failure")),
}));

describe("render: an unresolvable $ref parameter", () => {
  it("is skipped with a warning instead of failing the whole generation", async () => {
    const { render } = await import("./render.js");
    const document: OpenAPI3 = {
      openapi: "3.0.0",
      info: { title: "Test", version: "1.0.0" },
      paths: {
        "/x": {
          get: {
            operationId: "getX",
            parameters: [{ $ref: "#/components/parameters/PageParam" }],
            responses: { "200": { description: "ok" } },
          },
        },
      },
      components: {
        parameters: {
          PageParam: { name: "page", in: "query", schema: { type: "integer" } },
        },
      },
    };
    const operations = extractOperations(document);
    const { file: specLocation, cleanup } = await writeTempSpec(document);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      const source = await render({
        name: "Sample",
        mode: "feature",
        document,
        operations,
        specLocation,
      });

      expect(warnSpy).toHaveBeenCalledOnce();
      expect(warnSpy.mock.calls[0]![0]).toContain("could not resolve parameter ref");
      expect(source).toContain("query: never;");
    } finally {
      warnSpy.mockRestore();
      await cleanup();
    }
  });
});
