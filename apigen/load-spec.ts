import { readFile } from "node:fs/promises";
import type { OpenAPI3 } from "openapi-typescript";
import { isUrl, parseSpecText } from "./spec-location.js";

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
