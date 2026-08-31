import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Writes an OpenAPI document to a real temp file and returns its absolute
 * path, since render() now hands openapi-typescript the spec's actual
 * source location (not the already-parsed object) so it can resolve
 * external $refs itself -- see render.ts for why.
 */
export async function writeTempSpec(
  document: unknown,
): Promise<{ file: string; cleanup: () => Promise<void> }> {
  const dir = await mkdtemp(join(tmpdir(), "apigen-test-"));
  const file = join(dir, "spec.json");
  await writeFile(file, JSON.stringify(document), "utf8");
  return { file, cleanup: () => rm(dir, { recursive: true, force: true }) };
}
