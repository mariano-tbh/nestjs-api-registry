import { readFile } from "node:fs/promises";
import { dirname, resolve as resolvePath } from "node:path";
import { isUrl, parseSpecText } from "./spec-location.js";

const documentCache = new Map<string, unknown>();

async function loadRawDocument(location: string): Promise<unknown> {
  const cached = documentCache.get(location);
  if (cached !== undefined) return cached;

  const text = isUrl(location)
    ? await fetch(location).then((res) => {
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        return res.text();
      })
    : await readFile(location, "utf8");

  const parsed = parseSpecText(text, location);
  documentCache.set(location, parsed);
  return parsed;
}

function followPointer(document: unknown, pointer: string): unknown {
  const path = pointer.replace(/^#\/?/, "");
  let current: unknown = document;
  if (path !== "") {
    for (const rawSegment of path.split("/")) {
      const segment = decodeURIComponent(rawSegment).replace(/~1/g, "/").replace(/~0/g, "~");
      if (current === null || typeof current !== "object") {
        throw new Error(`cannot resolve pointer segment "${segment}"`);
      }
      current = (current as Record<string, unknown>)[segment];
    }
  }
  if (current === undefined) {
    throw new Error(`pointer "${pointer}" did not resolve to anything`);
  }
  return current;
}

/**
 * Resolves a `$ref` value against `rootDocument` (the already-loaded spec
 * containing it) and `baseLocation` (the URL or file path that spec itself
 * was loaded from, used to resolve relative/external refs). Supports:
 *
 * - internal refs, e.g. "#/components/parameters/PageParam" -- resolved
 *   against `rootDocument`, no I/O
 * - relative file refs, e.g. "./common.yaml#/parameters/Foo" -- resolved
 *   relative to `baseLocation`'s directory (or URL, if `baseLocation` is one)
 * - absolute http(s) URL refs, e.g. "https://example.com/schemas.yaml#/..."
 */
export async function resolveRef<T>(
  ref: string,
  rootDocument: unknown,
  baseLocation: string,
): Promise<T> {
  const hashIndex = ref.indexOf("#");
  const location = hashIndex === -1 ? ref : ref.slice(0, hashIndex);
  const pointer = hashIndex === -1 ? "" : ref.slice(hashIndex);

  if (!location) {
    return followPointer(rootDocument, pointer) as T;
  }

  const targetLocation = isUrl(location)
    ? location
    : isUrl(baseLocation)
      ? new URL(location, baseLocation).toString()
      : resolvePath(dirname(baseLocation), location);

  const externalDocument = await loadRawDocument(targetLocation);
  return followPointer(externalDocument, pointer) as T;
}
