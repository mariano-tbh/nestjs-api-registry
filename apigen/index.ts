import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { extractOperations } from "./extract-operations.js";
import { loadOpenApiDocument } from "./load-spec.js";
import { render, type ApiMode } from "./render.js";

export type { ApiMode } from "./render.js";
export * from "./types/method-types.js";

export interface GenerateOptions {
  /** A URL to a remote OpenAPI 3.x document, or a path to a local one (JSON or YAML). */
  spec: string;
  /** PascalCase base name used to derive `<Name>Api`, `<Name>Client`, etc. */
  name: string;
  mode: ApiMode;
}

export interface GenerateApiClientOptions extends GenerateOptions {
  /** Where to write the generated .ts file. */
  outFile: string;
}

/** Loads and renders the client source, without touching the filesystem. */
export async function generateApiClientSource(options: GenerateOptions): Promise<string> {
  const document = await loadOpenApiDocument(options.spec);
  const operations = extractOperations(document);
  return render({ name: options.name, mode: options.mode, document, operations });
}

/** Generates the client source and writes it to `options.outFile`. */
export async function generateApiClient(options: GenerateApiClientOptions): Promise<void> {
  const source = await generateApiClientSource(options);
  await mkdir(dirname(options.outFile), { recursive: true });
  await writeFile(options.outFile, source, "utf8");
}
