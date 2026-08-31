import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { sampleDocument } from "./__fixtures__/sample-openapi.js";
import { extractOperations } from "./extract-operations.js";
import { render, type ApiMode } from "./render.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const tscBin = join(repoRoot, "node_modules", "typescript", "bin", "tsc");

/**
 * Type-checks generated client source against the library's real .ts
 * sources (not the compiled dist) via a "paths" mapping, so this doesn't
 * depend on `npm run build` having run -- `pretest` cleans any compiled
 * output before every test run specifically so a stale .js can't shadow the
 * current .ts source.
 *
 * The temp dir is created *inside* the repo (not the OS tmpdir) so that
 * resolving third-party packages like "@nestjs/common" finds this repo's
 * node_modules by walking up from the generated file, same as it would for
 * any real consumer project.
 */
async function typeCheck(mode: ApiMode) {
  const operations = extractOperations(sampleDocument);
  const source = await render({ name: "Sample", mode, document: sampleDocument, operations });

  const dir = await mkdtemp(join(repoRoot, ".smoke-"));
  try {
    const clientFile = join(dir, "client.ts");
    await writeFile(clientFile, source, "utf8");
    await writeFile(
      join(dir, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          target: "es2023",
          module: "nodenext",
          experimentalDecorators: true,
          emitDecoratorMetadata: true,
          strict: true,
          skipLibCheck: true,
          noEmit: true,
          baseUrl: repoRoot,
          paths: {
            "nestjs-api-registry/core": ["core/index.ts"],
            "nestjs-api-registry/nestjs": ["nestjs/index.ts"],
            "nestjs-api-registry/apigen": ["apigen/index.ts"],
          },
        },
        include: [clientFile],
      }),
      "utf8",
    );

    try {
      execFileSync("node", [tscBin, "-p", join(dir, "tsconfig.json")], { stdio: "pipe" });
    } catch (error) {
      const output = (error as { stdout?: Buffer }).stdout?.toString() ?? String(error);
      throw new Error(`Generated "${mode}" client failed to type-check:\n${output}`);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe("generated client type-checks against the library's real types", () => {
  it("named mode", async () => {
    await expect(typeCheck("named")).resolves.toBeUndefined();
  });

  it("feature mode", async () => {
    await expect(typeCheck("feature")).resolves.toBeUndefined();
  });
});
