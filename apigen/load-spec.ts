import { readFile } from "node:fs/promises";
import { parse as parseYaml } from "yaml";

/**
 * Minimal shape of an OpenAPI 3.x document -- only what extract-operations.ts
 * and render.ts actually need to walk. Schema *shapes* are never touched
 * here; those are handled entirely by openapi-typescript in render.ts.
 */
export interface OpenApiParameter {
  name: string;
  in: "path" | "query" | "header" | "cookie";
  required?: boolean;
  // Real specs carry a lot more (schema, description, style, ...) that we
  // never read here -- schema conversion is entirely openapi-typescript's job.
  [key: string]: unknown;
}

export interface OpenApiOperation {
  operationId?: string;
  parameters?: OpenApiParameter[];
  requestBody?: unknown;
  responses?: Record<string, unknown>;
  [key: string]: unknown;
}

export type OpenApiPathItem = Partial<
  Record<
    "get" | "put" | "post" | "delete" | "options" | "head" | "patch" | "trace",
    OpenApiOperation
  >
>;

export interface OpenApiDocument {
  openapi: string;
  paths: Record<string, OpenApiPathItem>;
  // info, components, servers, etc. are all real, commonly-present fields we
  // don't need to read ourselves -- openapi-typescript gets the whole raw
  // object regardless of this type.
  [key: string]: unknown;
}

function isUrl(specUrlOrPath: string): boolean {
  try {
    return ["http:", "https:"].includes(new URL(specUrlOrPath).protocol);
  } catch {
    return false;
  }
}

function parseSpecText(text: string, specUrlOrPath: string): unknown {
  if (specUrlOrPath.endsWith(".yaml") || specUrlOrPath.endsWith(".yml")) {
    return parseYaml(text);
  }
  if (specUrlOrPath.endsWith(".json")) {
    return JSON.parse(text);
  }
  try {
    return JSON.parse(text);
  } catch {
    return parseYaml(text);
  }
}

export async function loadOpenApiDocument(specUrlOrPath: string): Promise<OpenApiDocument> {
  const text = isUrl(specUrlOrPath)
    ? await fetch(specUrlOrPath).then((res) => {
        if (!res.ok) {
          throw new Error(
            `Failed to fetch OpenAPI spec from ${specUrlOrPath}: ${res.status} ${res.statusText}`,
          );
        }
        return res.text();
      })
    : await readFile(specUrlOrPath, "utf8");

  const document = parseSpecText(text, specUrlOrPath) as OpenApiDocument;

  if (!document.openapi || !document.openapi.startsWith("3.")) {
    throw new Error(
      `Unsupported or missing "openapi" version in spec (got "${document.openapi}"). Only OpenAPI 3.x documents are supported.`,
    );
  }
  if (!document.paths) {
    throw new Error('OpenAPI document has no "paths" object.');
  }

  return document;
}
