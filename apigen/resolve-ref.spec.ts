import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveRef } from "./resolve-ref.js";

describe("resolveRef: internal refs", () => {
  it("resolves against the root document, no I/O", async () => {
    const root = { components: { parameters: { Page: { name: "page", in: "query" } } } };

    const result = await resolveRef("#/components/parameters/Page", root, "irrelevant.json");

    expect(result).toEqual({ name: "page", in: "query" });
  });

  it("rejects a dangling pointer", async () => {
    const root = { components: {} };

    await expect(
      resolveRef("#/components/parameters/Missing", root, "irrelevant.json"),
    ).rejects.toThrow();
  });
});

describe("resolveRef: relative file refs", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "apigen-resolve-ref-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("resolves a relative JSON file, relative to baseLocation's directory", async () => {
    await writeFile(
      join(dir, "common.json"),
      JSON.stringify({ parameters: { Page: { name: "page", in: "query" } } }),
      "utf8",
    );
    const specFile = join(dir, "spec.json");

    const result = await resolveRef("./common.json#/parameters/Page", {}, specFile);

    expect(result).toEqual({ name: "page", in: "query" });
  });

  it("resolves a relative YAML file", async () => {
    await writeFile(
      join(dir, "common.yaml"),
      "parameters:\n  Page:\n    name: page\n    in: query\n",
      "utf8",
    );
    const specFile = join(dir, "spec.yaml");

    const result = await resolveRef("./common.yaml#/parameters/Page", {}, specFile);

    expect(result).toEqual({ name: "page", in: "query" });
  });

  it("rejects when the external file doesn't exist", async () => {
    const specFile = join(dir, "spec.json");

    await expect(resolveRef("./missing.json#/x", {}, specFile)).rejects.toThrow();
  });
});
