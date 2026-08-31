import { readFile } from "node:fs/promises";
import { parse as parseYaml } from "yaml";
import { OpenAPI3 } from "openapi-typescript";

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

export async function loadOpenApiDocument(specUrlOrPath: string): Promise<OpenAPI3> {
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

  const document = parseSpecText(text, specUrlOrPath) as OpenAPI3;

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
