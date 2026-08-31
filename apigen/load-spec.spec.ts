import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadOpenApiDocument } from "./load-spec.js";

describe("loadOpenApiDocument", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "apigen-load-spec-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("reads and parses a local JSON spec", async () => {
    const file = join(dir, "spec.json");
    await writeFile(file, JSON.stringify({ openapi: "3.0.0", paths: { "/x": {} } }), "utf8");

    const document = await loadOpenApiDocument(file);

    expect(document.openapi).toBe("3.0.0");
    expect(document.paths).toEqual({ "/x": {} });
  });

  it("reads and parses a local YAML spec", async () => {
    const file = join(dir, "spec.yaml");
    await writeFile(file, "openapi: 3.0.0\npaths:\n  /x: {}\n", "utf8");

    const document = await loadOpenApiDocument(file);

    expect(document.openapi).toBe("3.0.0");
    expect(document.paths).toEqual({ "/x": {} });
  });

  it("falls back from JSON to YAML for an extension-less path", async () => {
    const file = join(dir, "spec");
    await writeFile(file, "openapi: 3.0.0\npaths:\n  /x: {}\n", "utf8");

    const document = await loadOpenApiDocument(file);

    expect(document.openapi).toBe("3.0.0");
  });

  it("rejects a document with an unsupported openapi version", async () => {
    const file = join(dir, "spec.json");
    await writeFile(file, JSON.stringify({ openapi: "2.0", paths: {} }), "utf8");

    await expect(loadOpenApiDocument(file)).rejects.toThrow(/OpenAPI 3\.x/);
  });

  it("rejects a document with no paths", async () => {
    const file = join(dir, "spec.json");
    await writeFile(file, JSON.stringify({ openapi: "3.0.0" }), "utf8");

    await expect(loadOpenApiDocument(file)).rejects.toThrow(/paths/);
  });
});
