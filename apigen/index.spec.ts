import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { sampleDocument } from "./__fixtures__/sample-openapi.js";
import { generateApiClient, generateApiClientSource } from "./index.js";

describe("generateApiClientSource / generateApiClient", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "apigen-index-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("generateApiClientSource loads a local spec and renders it, without touching the filesystem", async () => {
    const specFile = join(dir, "spec.json");
    await writeFile(specFile, JSON.stringify(sampleDocument), "utf8");

    const source = await generateApiClientSource({ spec: specFile, name: "Sample", mode: "named" });

    expect(source).toContain("export class SampleClient {");
  });

  it("generateApiClient writes the generated source to outFile, creating parent dirs", async () => {
    const specFile = join(dir, "spec.json");
    await writeFile(specFile, JSON.stringify(sampleDocument), "utf8");
    const outFile = join(dir, "nested", "sample.client.ts");

    await generateApiClient({ spec: specFile, name: "Sample", mode: "feature", outFile });

    const written = await readFile(outFile, "utf8");
    expect(written).toContain("export class SampleModule {");
  });
});
